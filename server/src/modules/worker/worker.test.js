import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { backoffMs, createWorker, INTERVAL_MS } from './worker.js';

function createMockClient(responses) {
  let index = 0;
  const queries = [];

  return {
    queries,
    query: async (sql, params) => {
      queries.push({ sql: sql.trim(), params });
      const entry = responses[index++];
      if (entry instanceof Error) throw entry;
      if (typeof entry === 'function') return entry(sql, params);
      return entry ?? { rows: [] };
    },
    release: mock.fn(),
  };
}

function createMockPool(...clients) {
  let index = 0;
  return {
    connect: async () => clients[index++] ?? clients[clients.length - 1],
  };
}

function findQuery(client, pattern) {
  return client.queries.find(q => pattern.test(q.sql));
}

const baseJob = {
  id: 'job-1',
  type: 'test_handler',
  status: 'pending',
  payload: { foo: 'bar' },
  priority: 5,
  max_retries: 3,
  retry_count: 0,
};

describe('backoffMs', () => {
  it('scales exponentially with attempt number', () => {
    assert.equal(backoffMs(1, 0), 1000);
    assert.equal(backoffMs(2, 0), 5000);
    assert.equal(backoffMs(3, 0), 25000);
  });

  it('adds up to 500ms jitter from random', () => {
    assert.equal(backoffMs(1, 1), 1500);
    assert.equal(backoffMs(2, 0.5), 5250);
  });
});

describe('INTERVAL_MS', () => {
  it('defines known recurring intervals', () => {
    assert.equal(INTERVAL_MS.every_1_minute, 60_000);
    assert.equal(INTERVAL_MS.every_5_minutes, 300_000);
    assert.equal(INTERVAL_MS.every_1_hour, 3_600_000);
  });
});

describe('claimJob', () => {
  it('returns null when job is not pending or locked', async () => {
    const client = createMockClient([
      {},
      { rows: [] },
      {},
    ]);
    const { claimJob } = createWorker({ pool: createMockPool(client) });

    const result = await claimJob('job-1');

    assert.equal(result, null);
    assert.match(client.queries[1].sql, /FOR UPDATE SKIP LOCKED/);
    assert.equal(client.queries[2].sql, 'ROLLBACK');
    assert.equal(client.release.mock.calls.length, 1);
  });

  it('returns null when dependencies are unmet', async () => {
    const claimClient = createMockClient([
      {},
      { rows: [{ ...baseJob, id: 'job-1' }] },
      { rows: [{ id: 'dep-1', status: 'pending' }] },
      {},
    ]);
    const logClient = createMockClient([{}, {}]);
    const logEvent = mock.fn(async () => {});
    const { claimJob } = createWorker({
      pool: createMockPool(claimClient, logClient),
      logEvent,
    });

    const result = await claimJob('job-1');

    assert.equal(result, null);
    assert.equal(claimClient.queries[3].sql, 'ROLLBACK');
    assert.equal(logEvent.mock.calls.length, 1);
    assert.equal(logEvent.mock.calls[0].arguments[1].event, 'job.held');
    assert.deepEqual(logEvent.mock.calls[0].arguments[1].metadata.waiting_on, ['dep-1']);
    assert.equal(logClient.queries[0].sql, 'BEGIN');
    assert.equal(logClient.queries[1].sql, 'COMMIT');
  });

  it('claims job and marks it processing when ready', async () => {
    const locked = { ...baseJob, id: 'job-1', type: 'send_email', retry_count: 1 };
    const client = createMockClient([
      {},
      { rows: [locked] },
      { rows: [{ id: 'dep-1', status: 'completed' }] },
      {},
      {},
    ]);
    const logEvent = mock.fn(async () => {});
    const { claimJob } = createWorker({ pool: createMockPool(client), logEvent });

    const result = await claimJob('job-1');

    assert.deepEqual(result, locked);
    assert.match(findQuery(client, /status\s*=\s*'processing'/).sql, /processing/);
    assert.equal(logEvent.mock.calls.length, 1);
    assert.equal(logEvent.mock.calls[0].arguments[1].event, 'job.started');
    assert.equal(findQuery(client, /^COMMIT$/).sql, 'COMMIT');
  });
});

describe('recordSuccess', () => {
  it('completes job, resolves DLQ, and publishes event', async () => {
    const client = createMockClient([{}, { rows: [{ status: 'processing' }] }, {}, {}, {}, {}]);
    const logEvent = mock.fn(async () => {});
    const resolveDlqForJob = mock.fn(async () => {});
    const publishJobEvent = mock.fn(async () => {});
    const locked = { ...baseJob, id: 'job-1', type: 'send_email' };
    const result = { ok: true };

    const { recordSuccess } = createWorker({
      pool: createMockPool(client),
      logEvent,
      resolveDlqForJob,
      publishJobEvent,
    });

    await recordSuccess(locked, result);

    assert.match(findQuery(client, /status\s*=\s*'completed'/).sql, /completed/);
    assert.equal(logEvent.mock.calls[0].arguments[1].event, 'job.completed');
    assert.equal(resolveDlqForJob.mock.calls.length, 1);
    assert.equal(resolveDlqForJob.mock.calls[0].arguments[1], 'job-1');
    assert.deepEqual(publishJobEvent.mock.calls[0].arguments[0], {
      status: 'completed',
      job_id: 'job-1',
      type: 'send_email',
    });
    assert.equal(findQuery(client, /^COMMIT$/).sql, 'COMMIT');
  });

  it('keeps cancelled status and discards result when job was cancelled while running', async () => {
    const client = createMockClient([{}, { rows: [{ status: 'cancelled' }] }, {}]);
    const logEvent = mock.fn(async () => {});
    const resolveDlqForJob = mock.fn(async () => {});
    const publishJobEvent = mock.fn(async () => {});
    const locked = {
      ...baseJob,
      id: 'job-1',
      type: 'send_email',
      recurring_interval: 'every_1_minute',
    };

    const { recordSuccess } = createWorker({
      pool: createMockPool(client),
      logEvent,
      resolveDlqForJob,
      publishJobEvent,
    });

    await recordSuccess(locked, { ok: true });

    assert.equal(findQuery(client, /status\s*=\s*'completed'/), undefined);
    assert.equal(findQuery(client, /INSERT INTO jobs/), undefined);
    assert.equal(resolveDlqForJob.mock.calls.length, 0);
    assert.equal(logEvent.mock.calls[0].arguments[1].event, 'job.cancelled');
    assert.equal(logEvent.mock.calls[0].arguments[1].metadata.result_discarded, true);
    assert.deepEqual(publishJobEvent.mock.calls[0].arguments[0], {
      status: 'cancelled',
      job_id: 'job-1',
      type: 'send_email',
    });
    assert.equal(findQuery(client, /^COMMIT$/).sql, 'COMMIT');
  });

  it('schedules next run for recurring jobs', async () => {
    const client = createMockClient([{}, { rows: [{ status: 'processing' }] }, {}, {}, {}, {}]);
    const locked = {
      ...baseJob,
      id: 'job-1',
      type: 'send_email',
      recurring_interval: 'every_1_minute',
    };

    const { recordSuccess } = createWorker({
      pool: createMockPool(client),
      logEvent: mock.fn(async () => {}),
      resolveDlqForJob: mock.fn(async () => {}),
    });

    await recordSuccess(locked, { ok: true });

    const insert = findQuery(client, /INSERT INTO jobs/);
    assert.ok(insert);
    const insertParams = insert.params;
    assert.equal(insertParams[0], 'send_email');
    assert.equal(insertParams[6], 'every_1_minute');
    assert.equal(insertParams[7], 3);
  });
});

describe('recordFailure', () => {
  it('schedules retry when attempts remain', async () => {
    const client = createMockClient([{}, { rows: [{ status: 'processing' }] }, {}, {}, {}]);
    const logEvent = mock.fn(async () => {});
    const publishJobEvent = mock.fn(async () => {});
    const job = { ...baseJob, max_retries: 3, retry_count: 0 };
    const err = new Error('transient failure');

    const { recordFailure } = createWorker({
      pool: createMockPool(client),
      logEvent,
      publishJobEvent,
      backoffMs: () => 2000,
    });

    await recordFailure(job, err);

    const retryUpdate = findQuery(client, /status\s*=\s*'pending'/);
    const [retryCount, retryAt, errorMessage, jobId] = retryUpdate.params;
    assert.equal(retryCount, 1);
    assert.equal(errorMessage, 'transient failure');
    assert.equal(jobId, 'job-1');
    assert.ok(Math.abs(new Date(retryAt).getTime() - (Date.now() + 2000)) < 50);
    assert.equal(logEvent.mock.calls[0].arguments[1].event, 'job.retry');
    assert.equal(publishJobEvent.mock.calls[0].arguments[0].status, 'pending');
    assert.equal(publishJobEvent.mock.calls[0].arguments[0].retry_count, 1);
    assert.equal(findQuery(client, /^COMMIT$/).sql, 'COMMIT');
  });

  it('does not retry when job was cancelled while handler was running', async () => {
    const client = createMockClient([{}, { rows: [{ status: 'cancelled' }] }, {}]);
    const logEvent = mock.fn(async () => {});
    const publishJobEvent = mock.fn(async () => {});
    const job = { ...baseJob, max_retries: 3, retry_count: 0 };
    const err = new Error('handler blew up');

    const { recordFailure } = createWorker({
      pool: createMockPool(client),
      logEvent,
      publishJobEvent,
    });

    await recordFailure(job, err);

    assert.equal(findQuery(client, /status\s*=\s*'pending'/), undefined);
    assert.equal(findQuery(client, /INSERT INTO dead_letter_queue/), undefined);
    assert.equal(logEvent.mock.calls[0].arguments[1].event, 'job.cancelled');
    assert.equal(publishJobEvent.mock.calls.length, 0);
    assert.equal(findQuery(client, /^COMMIT$/).sql, 'COMMIT');
  });

  it('still retries when retry_count is below max_retries', async () => {
    const client = createMockClient([{}, { rows: [{ status: 'processing' }] }, {}, {}, {}]);
    const logEvent = mock.fn(async () => {});
    const publishJobEvent = mock.fn(async () => {});
    const job = { ...baseJob, max_retries: 3, retry_count: 2 };
    const err = new Error('still failing');

    const { recordFailure } = createWorker({
      pool: createMockPool(client),
      logEvent,
      publishJobEvent,
      backoffMs: () => 25_000,
    });

    await recordFailure(job, err);

    const retryUpdate = findQuery(client, /status\s*=\s*'pending'/);
    assert.equal(retryUpdate.params[0], 3);
    assert.equal(findQuery(client, /INSERT INTO dead_letter_queue/), undefined);
  });

  it('sends job to DLQ when failure count exceeds max_retries', async () => {
    const client = createMockClient([{}, { rows: [{ status: 'processing' }] }, { rowCount: 0 }, {}, {}, {}]);
    const logEvent = mock.fn(async () => {});
    const publishJobEvent = mock.fn(async () => {});
    const checkDlqThreshold = mock.fn(async () => {});
    // max_retries=3 → DLQ after the 3rd retry fails (retry_count 3 → newCount 4)
    const job = { ...baseJob, max_retries: 3, retry_count: 3 };
    const err = new Error('still failing');

    const { recordFailure } = createWorker({
      pool: createMockPool(client),
      logEvent,
      publishJobEvent,
      checkDlqThreshold,
    });

    await recordFailure(job, err);

    assert.equal(findQuery(client, /status\s*=\s*'pending'/), undefined);
    assert.match(findQuery(client, /UPDATE dead_letter_queue/).sql, /job_snapshot/);
    assert.match(findQuery(client, /INSERT INTO dead_letter_queue/).sql, /dead_letter_queue/);
    assert.equal(logEvent.mock.calls[0].arguments[1].event, 'job.failed');
    assert.equal(checkDlqThreshold.mock.calls.length, 1);
  });

  it('updates existing DLQ entry instead of inserting a duplicate', async () => {
    const client = createMockClient([{}, { rows: [{ status: 'processing' }] }, { rowCount: 1 }, {}, {}]);
    const logEvent = mock.fn(async () => {});
    const publishJobEvent = mock.fn(async () => {});
    const checkDlqThreshold = mock.fn(async () => {});
    const job = { ...baseJob, max_retries: 2, retry_count: 2 };
    const err = new Error('still failing');

    const { recordFailure } = createWorker({
      pool: createMockPool(client),
      logEvent,
      publishJobEvent,
      checkDlqThreshold,
    });

    await recordFailure(job, err);

    assert.match(findQuery(client, /UPDATE dead_letter_queue/).sql, /job_snapshot/);
    assert.equal(findQuery(client, /INSERT INTO dead_letter_queue/), undefined);
    assert.equal(logEvent.mock.calls[0].arguments[1].metadata.dlq_updated, true);
    assert.equal(checkDlqThreshold.mock.calls.length, 0);
  });

  it('sends job to DLQ when max retries are exhausted', async () => {
    const client = createMockClient([{}, { rows: [{ status: 'processing' }] }, { rowCount: 0 }, {}, {}, {}]);
    const logEvent = mock.fn(async () => {});
    const publishJobEvent = mock.fn(async () => {});
    const checkDlqThreshold = mock.fn(async () => {});
    const job = { ...baseJob, max_retries: 2, retry_count: 2 };
    const err = new Error('permanent failure');

    const { recordFailure } = createWorker({
      pool: createMockPool(client),
      logEvent,
      publishJobEvent,
      checkDlqThreshold,
    });

    await recordFailure(job, err);

    assert.equal(findQuery(client, /status\s*=\s*'pending'/), undefined);
    assert.match(findQuery(client, /INSERT INTO dead_letter_queue/).sql, /dead_letter_queue/);
    assert.deepEqual(findQuery(client, /INSERT INTO dead_letter_queue/).params, [job.id, job, 'permanent failure']);
    assert.match(findQuery(client, /status = 'failed'/).sql, /failed/);
    assert.equal(logEvent.mock.calls[0].arguments[1].event, 'job.failed');
    assert.equal(checkDlqThreshold.mock.calls.length, 1);
    assert.deepEqual(publishJobEvent.mock.calls[0].arguments[0], {
      status: 'failed',
      job_id: 'job-1',
      type: 'test_handler',
    });
  });
});

describe('processJob', () => {
  it('does nothing when claimJob returns null', async () => {
    const client = createMockClient([{}, { rows: [] }, {}]);
    const publishJobEvent = mock.fn(async () => {});
    const handler = mock.fn(async () => ({}));

    const { processJob } = createWorker({
      pool: createMockPool(client),
      handlers: { test_handler: handler },
      publishJobEvent,
    });

    await processJob(baseJob);

    assert.equal(handler.mock.calls.length, 0);
    assert.equal(publishJobEvent.mock.calls.length, 0);
  });

  it('runs handler and records success', async () => {
    const claimClient = createMockClient([
      {},
      { rows: [{ ...baseJob, type: 'test_handler' }] },
      { rows: [] },
      {},
      {},
      {},
    ]);
    const successClient = createMockClient([{}, { rows: [{ status: 'processing' }] }, {}, {}, {}, {}]);
    const handler = mock.fn(async () => ({ delivered: true }));
    const publishJobEvent = mock.fn(async () => {});

    const { processJob } = createWorker({
      pool: createMockPool(claimClient, successClient),
      handlers: { test_handler: handler },
      publishJobEvent,
      logEvent: mock.fn(async () => {}),
      resolveDlqForJob: mock.fn(async () => {}),
    });

    await processJob(baseJob);

    assert.equal(handler.mock.calls.length, 1);
    assert.equal(publishJobEvent.mock.calls[0].arguments[0].status, 'processing');
    assert.equal(publishJobEvent.mock.calls[1].arguments[0].status, 'completed');
    assert.match(findQuery(successClient, /status\s*=\s*'completed'/).sql, /completed/);
  });

  it('records failure when handler throws', async () => {
    const claimClient = createMockClient([
      {},
      { rows: [{ ...baseJob, type: 'test_handler' }] },
      { rows: [] },
      {},
      {},
      {},
    ]);
    const failureClient = createMockClient([{}, { rows: [{ status: 'processing' }] }, {}, {}, {}]);
    const handler = mock.fn(async () => {
      throw new Error('handler blew up');
    });
    const publishJobEvent = mock.fn(async () => {});

    const { processJob } = createWorker({
      pool: createMockPool(claimClient, failureClient),
      handlers: { test_handler: handler },
      publishJobEvent,
      logEvent: mock.fn(async () => {}),
      backoffMs: () => 1500,
    });

    await processJob(baseJob);

    const retryUpdate = findQuery(failureClient, /status\s*=\s*'pending'/);
    assert.equal(retryUpdate.params[0], 1);
    assert.equal(publishJobEvent.mock.calls[1].arguments[0].status, 'pending');
  });

  it('records failure when handler is missing', async () => {
    const claimClient = createMockClient([
      {},
      { rows: [{ ...baseJob, type: 'unknown_type' }] },
      { rows: [] },
      {},
      {},
      {},
    ]);
    const failureClient = createMockClient([{}, { rows: [{ status: 'processing' }] }, {}, {}, {}]);
    const publishJobEvent = mock.fn(async () => {});

    const { processJob } = createWorker({
      pool: createMockPool(claimClient, failureClient),
      handlers: {},
      publishJobEvent,
      logEvent: mock.fn(async () => {}),
      backoffMs: () => 1000,
    });

    await processJob(baseJob);

    const retryUpdate = findQuery(failureClient, /status\s*=\s*'pending'/);
    assert.match(retryUpdate.params[2], /No handler registered/);
  });

  it('preserves cancelled status when handler succeeds after cancel', async () => {
    const claimClient = createMockClient([
      {},
      { rows: [{ ...baseJob, type: 'test_handler' }] },
      { rows: [] },
      {},
      {},
      {},
    ]);
    const successClient = createMockClient([{}, { rows: [{ status: 'cancelled' }] }, {}]);
    const handler = mock.fn(async () => ({ delivered: true }));
    const publishJobEvent = mock.fn(async () => {});
    const logEvent = mock.fn(async () => {});

    const { processJob } = createWorker({
      pool: createMockPool(claimClient, successClient),
      handlers: { test_handler: handler },
      publishJobEvent,
      logEvent,
      resolveDlqForJob: mock.fn(async () => {}),
    });

    await processJob(baseJob);

    assert.equal(handler.mock.calls.length, 1);
    assert.equal(findQuery(successClient, /status\s*=\s*'completed'/), undefined);
    assert.equal(publishJobEvent.mock.calls[1].arguments[0].status, 'cancelled');
    const cancelledLog = logEvent.mock.calls.find(
      call => call.arguments[1].metadata?.result_discarded === true
    );
    assert.ok(cancelledLog);
  });
});

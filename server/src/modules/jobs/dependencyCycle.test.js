import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findDependencyCycle } from './dependencyCycle.js';

const JOB_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const JOB_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const JOB_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const JOB_D = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function createMockClient(edges) {
  return {
    query: async (sql, params) => {
      if (!sql.includes('job_dependencies')) {
        throw new Error(`Unexpected query: ${sql}`);
      }
      const jobId = params[0];
      return { rows: (edges[jobId] ?? []).map(depends_on => ({ depends_on })) };
    },
  };
}

describe('findDependencyCycle', () => {
  it('returns null when there are no dependencies', async () => {
    const client = createMockClient({});
    assert.equal(await findDependencyCycle(client, JOB_D, []), null);
  });

  it('returns null for a valid dependency chain', async () => {
    const client = createMockClient({
      [JOB_B]: [JOB_A],
      [JOB_C]: [JOB_B],
    });

    assert.equal(await findDependencyCycle(client, JOB_D, [JOB_C]), null);
  });

  it('detects a direct two-job cycle', async () => {
    const client = createMockClient({
      [JOB_B]: [JOB_A],
    });

    assert.equal(await findDependencyCycle(client, JOB_A, [JOB_B]), JOB_B);
  });

  it('detects an indirect cycle', async () => {
    const client = createMockClient({
      [JOB_B]: [JOB_A],
      [JOB_C]: [JOB_B],
    });

    assert.equal(await findDependencyCycle(client, JOB_A, [JOB_C]), JOB_C);
  });

  it('detects self-dependency', async () => {
    const client = createMockClient({});
    assert.equal(await findDependencyCycle(client, JOB_A, [JOB_A]), JOB_A);
  });
});

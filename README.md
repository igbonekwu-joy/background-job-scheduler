# Background Job Scheduler

A background job scheduler built at Dilamme. Jobs are created via a REST API, queued in a heap-based priority queue, processed by an independent worker process, and tracked through a React dashboard with live updates.

---

## Repository layout

```
/
├── client/               React frontend (Vite)
├── server/               Node.js API + worker
│   ├── docs/             Swagger docs
│   └── src/
│       ├── config/       Database pool, Winston logger
│       ├── middleware/   Async handler, and error handler
│       ├── migrations/   Migrations file for the database
│       ├── modules/      All module folders
|       |   ├── dlq/      Dead-Letter Queue resource
│       |   ├── handlers/ Job type implementations (email simulation)
|       |   ├── jobs/     Jobs resource
|       |   ├── scheduler/ Min-heap, timing wheel, scheduler loop
|       |   ├── scripts/   Time Wheel Benchmark
|       |   ├── sse/      Server Side Events resource
|       |   └── worker/   Background Worker process
|       |
│       ├── utils/        Shared event emitter
│       ├── app.js    
│       ├── routes.js     All route entry point
|       ├── package.json       
|       └── server.js
├── .gitignore
└── README.md
```

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+

---

## Setup

### 1. Clone and install

```bash
# Server
cd server
npm install

# Client
cd ../client
npm install
```

### 2. Configure environment

```bash
cd server
cp .env.example .env
```

Edit `.env` with your PostgreSQL credentials:

```env
DATABASE_URL=
# Neon: use the pooler URL here; use the direct URL (no -pooler) below for LISTEN/NOTIFY
DATABASE_URL_DIRECT=

PORT=5000
NODE_ENV=development

DLQ_ALERT_THRESHOLD=10
STARVATION_THRESHOLD_MINUTES=5
WORKER_POLL_INTERVAL_MS=2000
```

Create a `.env` in `client/`:

```env
VITE_API_BASE_URL=http://localhost:5173
```

### 3. Create the database

```bash
psql -U postgres -c "CREATE DATABASE job_scheduler;"
```

### 4. Run migrations

```bash
cd server
npm run migrate
```

To roll back:

```bash
npm run migrate:down
```

---

## Running the app

The API server and the worker are two separate processes. Open two terminals.

**Terminal 1 — API server**

```bash
cd server
npm start
# or in development:
npm run dev
```

**Terminal 2 — Worker**

```bash
cd server
npm run worker
# or in development:
npm run dev:worker
```

**Terminal 3 — Frontend**

```bash
cd client
npm run dev
```

| Service | Default URL |
|---|---|
| API server | http://localhost:5000 |
| Frontend | http://localhost:5173 |
| Health check | http://localhost:5000/health |

---

## API reference

All responses follow the shape `{ success: boolean, data: ... }`.

### Jobs

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/jobs` | Create a job |
| `GET` | `/api/jobs` | List jobs |
| `GET` | `/api/jobs/:id` | Get a single job with its dependencies |
| `GET` | `/api/jobs/:id/logs` | Get structured event logs for a job |
| `PATCH` | `/api/jobs/:id/cancel` | Cancel a pending or processing job (see [Cancellation](#cancellation)) |
| `GET` | `/api/jobs/stats` | Job counts by status + unresolved DLQ count |

#### POST /api/jobs

```json
{
  "type": "send_email",
  "priority": 1,
  "payload": {
    "to": "user@example.com",
    "subject": "Welcome"
  },
  "scheduled_at": "2026-06-15T10:00:00Z",
  "recurring_interval": "every_5_minutes",
  "max_retries": 3,
  "dependencies": ["<job-uuid>"]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | ✓ | Must match a registered handler. Currently: `send_email` |
| `priority` | integer | | `1` = High, `2` = Medium (default), `3` = Low |
| `payload` | object | | Passed as-is to the handler |
| `scheduled_at` | ISO string | | Job will not run before this time |
| `recurring_interval` | string | | `every_1_minute`, `every_5_minutes`, `every_1_hour` |
| `max_retries` | integer | | Max **automatic retries** after the first run (default `3`) |
| `dependencies` | UUID[] | | Job will not run until all listed jobs are `completed` |

#### GET /api/jobs

Query params: `?status=pending&limit=100&offset=0`

`status` accepts: `pending`, `processing`, `completed`, `failed`, `cancelled`

### Dead-Letter Queue

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/dlq` | List unresolved DLQ entries |
| `GET` | `/api/dlq/:id` | Get a single DLQ entry with full error details |
| `POST` | `/api/dlq/:id/retry` | Manually retry a DLQ job |

`GET /api/dlq` accepts `?include_resolved=true` to include already-resolved entries.

`POST /api/dlq/:id/retry` accepts an optional body `{ "retried_by": "your@email.com" }`.

### Live updates (SSE)

```
GET /api/events
```

Job status changes are bridged across processes via PostgreSQL `LISTEN`/`NOTIFY`. On Neon, set `DATABASE_URL` to the **pooler** URL and `DATABASE_URL_DIRECT` to the **direct** URL (no `-pooler` in the host).

Opens a persistent Server-Sent Events stream. The client receives a `job.event` frame every time a job changes status. Connect once on page load — no polling needed.

```js
const es = new EventSource('http://localhost:5000/api/events');

es.addEventListener('job.event', (e) => {
  const { job_id, status, retry_count } = JSON.parse(e.data);
  // update UI
});
```

Event payload:

```json
{
  "job_id": "uuid",
  "type": "send_email",
  "status": "completed | processing | pending | failed",
  "retry_count": 1,
  "retry_at": "ISO string — only present on retry events"
}
```

---

## Job lifecycle

```
pending → processing → completed
                     → failed (→ dead-letter queue after max retries)
                     → cancelled
```

A job enters `processing` when the worker locks it. From `processing` it moves to `completed`, `failed`, or stays `cancelled`. It is never moved back to `pending`.

### Cancellation

`PATCH /api/jobs/:id/cancel` is allowed while a job is `pending` or `processing`. Jobs that are already `completed`, `failed`, or `cancelled` cannot be cancelled again.

**Cancelled jobs are not processed.** The worker only claims rows with `status = 'pending'`. Once a job is `cancelled`, it is removed from the dispatch path: it will not be picked up by the scheduler, will not retry, and will not schedule a next recurring run.

**If a job is already `processing` when it is cancelled**, the worker does not attempt to interrupt the in-flight handler. That is a deliberate choice:

| Option | Decision | Reason |
|---|---|---|
| Interrupt the handler mid-execution | **Rejected** | An async handler cannot be stopped cleanly; aborting would leave external side-effects (e.g. a sent email) in an unknown state |
| Let the handler finish, then re-check status | **Chosen** | The handler may already have done its work; what matters is the final job record reflects the cancel intent |

What happens after cancel while `processing`:

1. The API sets `status = 'cancelled'` immediately and logs `job.cancelled`.
2. The handler keeps running until it returns or throws.
3. Before writing any outcome, the worker locks the row and reads the current status.
4. If still `cancelled`:
   - **On success** — the handler result is discarded; status stays `cancelled` (not overwritten with `completed`); no recurring follow-up is scheduled; no DLQ resolution runs; a `job.cancelled` log notes that the result was discarded.
   - **On failure** — no retry and no DLQ; status stays `cancelled`; a `job.cancelled` log notes that the error was ignored.

The handler may have already performed its side-effect (e.g. simulated email delivery). That is acceptable: the job is recorded as `cancelled`, not `completed`, and the job chain does not continue.

---

## Retry behaviour

Failed jobs retry automatically up to **3 times** (default `max_retries: 3`). The initial run keeps `retry_count` at `0`; `retry_count` is set to `1`–`3` as each retry is scheduled. After the third retry fails (`retry_count > max_retries`), the job is marked `failed` and moves to the dead-letter queue.

Backoff with jitter before each retry:

| Retry | Wait before retry runs |
|---|---|
| 1 | ~1 s |
| 2 | ~5 s |
| 3 | ~25 s |

The initial run starts immediately (or at `scheduled_at`) with no backoff delay.

---

## Dead-Letter Queue

The DLQ threshold is **10 unresolved entries**. When crossed, a `DLQ ALERT` is written to the error log (and in production would trigger an email via the `send_email` handler).

When an engineer retries a DLQ entry:
1. The original job is reset to `pending` with `retry_count = 0`
2. The DLQ entry is stamped with `retried_at` and `retried_by`
3. If the retry fails again, a new DLQ entry is created

---

## Priority and starvation prevention

Priority levels: `1` = High, `2` = Medium, `3` = Low.

Jobs are ordered in the heap by:
1. `effective_priority` ASC
2. `run_at` ASC
3. `created_at` ASC

Every 30 seconds the scheduler checks for pending jobs that have been waiting longer than **5 minutes**. Their `effective_priority` is decremented by 1 (e.g. `3 → 2`, `2 → 1`), both in the database and in the in-memory heap. This prevents low-priority jobs from waiting indefinitely behind a continuous stream of high-priority work.

---

## DAG workflow

Jobs can declare dependencies on other jobs. A job will not enter the heap — and will not run — until every job it depends on has status `completed`.

Example: create three jobs where each depends on the previous one:

```bash
# Step 1 — no dependencies
POST /api/jobs  { "type": "send_email", "payload": { "to": "a@b.com", "subject": "Report" } }
# → returns id: "job-1"

# Step 2 — depends on job-1
POST /api/jobs  { "type": "send_email", "payload": { "to": "a@b.com", "subject": "Upload" }, "dependencies": ["job-1"] }
# → returns id: "job-2"

# Step 3 — depends on job-2
POST /api/jobs  { "type": "send_email", "payload": { "to": "a@b.com", "subject": "Notify" }, "dependencies": ["job-2"] }
```

Jobs 2 and 3 will stay `pending` until their dependency chain resolves.

Circular dependencies are rejected at create time (HTTP 422). For example, if job B already depends on job A, creating job A with `dependencies: ["B"]` returns `Dependency cycle detected` — those jobs would otherwise wait on each other forever.

---

## Scheduling algorithms

Two algorithms run in parallel. The heap drives actual dispatch; the timing wheel runs alongside it for benchmarking.

### Min-heap

The primary dispatch algorithm. Jobs are pushed when their `run_at` arrives. The most urgent job is always at index 0.

- Insert: O(log n)
- Pop: O(log n)

### Timing wheel

Alternative algorithm. A circular buffer of 3 600 slots (1 slot = 1 second). A job is placed into the slot corresponding to its `run_at` delay. Each tick drains one slot.

- Insert: O(1)
- Tick advance: O(1)

### Benchmark

```bash
cd server
npm run benchmark
```

Results are printed to stdout and saved to `server/logs/benchmark.json`.

Sample results (your machine may differ):

| n | Heap insert | Wheel insert | Winner |
|---|---|---|---|
| 1,000 | 6.93 ms | 2.91 ms | Timing Wheel |
| 10,000 | 36.16 ms | 11.73 ms | Timing Wheel |
| 100,000 | 142.49 ms | 47.84 ms | Timing Wheel |

The timing wheel wins on raw insert speed at every size because inserting is a single modulo + array push (O(1)). The heap wins on ordering: it guarantees the highest-priority job is always dispatched first, which the timing wheel cannot do.

---

## Database schema

| Table | Purpose |
|---|---|
| `jobs` | Every job, from creation to completion |
| `job_dependencies` | DAG edges — which jobs must complete before another can run |
| `dead_letter_queue` | Jobs that exhausted all retries, with full snapshot and failure reason |
| `job_logs` | Structured event log — one row per lifecycle event per job |
| `schema_migrations` | Tracks which migrations have been applied |

---

## Logging

All logs are structured JSON via Winston. Every significant event writes a row to both the `job_logs` table and the Winston transports (console + `logfile.log`).

Logged events: `job.created`, `job.started`, `job.retry`, `job.failed`, `job.cancelled`, `job.completed`

---

## Scripts

| Command | Description |
|---|---|
| `npm start` | Start the API server |
| `npm run worker` | Start the background worker |
| `npm run migrate` | Run all pending migrations |
| `npm run migrate:down` | Roll back all migrations |
| `npm run benchmark` | Run heap vs timing wheel benchmark |
| `npm run dev:api` | Start API server with nodemon |
| `npm run dev:worker` | Start worker with nodemon |
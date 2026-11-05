# MySQL -> PostgreSQL migrator

## Run
1. `cp .env.example .env` and fill it in. Use a MySQL user with SELECT only.
2. `docker compose up --build` (or `npm install && npm start`)
3. All calls need header `x-api-key: <ADMIN_API_KEY>` except `/api/health`.

## Flow
- `GET  /api/source/tables`, `/api/source/tables/:t/schema`  look at the real schema first
- `POST /api/migration/start {"tables":["parent","child"],"batchSize":5000}`  full copy, resumable
- `POST /api/migration/cancel` then `start` again = pause / resume (continues from checkpoint)
- `GET  /api/migration/status`, `/api/target/checkpoints`
- `POST /api/validate`  row-by-row compare of every row (not just counts)
- `POST /api/sync/start`  incremental, needs `SYNC_COLUMNS=table:updated_at`

## Limits (real, not hidden)
- Source = direct MySQL only. No API-endpoint adapter (endpoints unknown).
- Single-column primary key required per table. Others are rejected.
- Incremental sync cannot see deletes. Sync column must be NOT NULL and change on every update.
- Secondary indexes, triggers, sequences and auto-increment defaults are not copied. Primary keys and foreign keys are.
- MySQL zero-dates become NULL. Invalid TIME values (over 24h) will fail the batch.
- Validation compares char(n) padding literally, so CHAR columns may show false mismatches.
- No frontend, no Swagger, no 1M-row load test script. Only unit tests exist: `npm test`.
- Not yet run against a real MySQL/Postgres.

# How the Migrator Application Works
### A Complete Step-by-Step Guide with Flowchart

---

## The Big Picture

This application moves data from a **MySQL database** (the source) to a **PostgreSQL database** (the target). Along the way it **encrypts sensitive data** so it is protected in the new database. You control everything through a simple web API.

Think of it like a secure moving truck — it picks up your furniture (data) from the old house (MySQL), wraps the valuable items in protective packaging (encryption), and delivers everything safely to the new house (PostgreSQL).

---

## Full Application Flowchart

```
                        ┌─────────────────────────┐
                        │       npm start          │
                        │   Server boots up on     │
                        │       port 3000          │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │   Load .env settings     │
                        │  - MySQL credentials     │
                        │  - Postgres URL          │
                        │  - Encryption key        │
                        │  - API key               │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │  Open connection pools   │
                        │  MySQL pool (max 5)      │
                        │  Postgres pool (max 5)   │
                        └────────────┬────────────┘
                                     │
                        ┌────────────▼────────────┐
                        │   GET /api/health        │
                        │   Ping both databases    │
                        │   with SELECT 1          │
                        └────────────┬────────────┘
                                     │
                         ┌───────────┴───────────┐
                         │  Both alive?           │
                    ┌────▼────┐             ┌─────▼────┐
                    │   YES   │             │    NO    │
                    └────┬────┘             └─────┬────┘
                         │                        │
                         │                  Return 503
                         │                  { mysql: false }
                         │                  or
                         │                  { postgres: false }
                         ▼
                        ┌─────────────────────────┐
                        │  POST /api/migration/    │
                        │        start             │
                        │  You send the request    │
                        │  with x-api-key header   │
                        └────────────┬────────────┘
                                     │
                         ┌───────────┴───────────┐
                         │  API key correct?      │
                    ┌────▼────┐             ┌─────▼────┐
                    │   YES   │             │    NO    │
                    └────┬────┘             └─────┬────┘
                         │                        │
                         │                   Return 401
                         │                   Unauthorized
                         ▼
                        ┌─────────────────────────┐
                        │  Job already running?    │
                        │  Check state.status      │
                        └────────────┬────────────┘
                                     │
                         ┌───────────┴───────────┐
                         │  Running?              │
                    ┌────▼────┐             ┌─────▼────┐
                    │   YES   │             │    NO    │
                    └────┬────┘             └─────┬────┘
                         │                        │
                    Return 409              Return 202
                    Conflict                Job Started
                                                 │
                                                 ▼
                        ┌─────────────────────────┐
                        │  Enable pgcrypto         │
                        │  extension in Postgres   │
                        │  (needed for encryption) │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │  Create checkpoint table │
                        │  _migration_checkpoint   │
                        │  (tracks progress)       │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │  For each table in list  │◄──────────────┐
                        │  (users, documents)      │               │
                        └────────────┬────────────┘               │
                                     │                             │
                                     ▼                             │
                        ┌─────────────────────────┐               │
                        │  Read MySQL schema       │               │
                        │  - Column names & types  │               │
                        │  - Primary key column    │               │
                        │  - Foreign keys          │               │
                        └────────────┬────────────┘               │
                                     │                             │
                                     ▼                             │
                        ┌─────────────────────────┐               │
                        │  Already done?           │               │
                        │  Check checkpoint table  │               │
                        └────────────┬────────────┘               │
                                     │                             │
                         ┌───────────┴───────────┐                │
                         │  status = done?        │                │
                    ┌────▼────┐             ┌─────▼────┐          │
                    │   YES   │             │    NO    │           │
                    └────┬────┘             └─────┬────┘           │
                         │                        │                │
                    Skip table              Create table           │
                    (unless reset=true)     in Postgres            │
                                                 │                 │
                                                 ▼                 │
                        ┌─────────────────────────┐               │
                        │  CREATE TABLE IF NOT     │               │
                        │  EXISTS in Postgres      │               │
                        │  (type-mapped + encrypt  │               │
                        │   cols stored as bytea)  │               │
                        └────────────┬────────────┘               │
                                     │                             │
                                     ▼                             │
                        ┌─────────────────────────┐               │
                        │  Read checkpoint cursor  │               │
                        │  (resume point if any)   │               │
                        └────────────┬────────────┘               │
                                     │                             │
                                     ▼                             │
              ┌──────────────────────────────────────────┐        │
              │           BATCH COPY LOOP                 │        │
              │                                           │        │
              │  SELECT * FROM table                      │        │
              │  WHERE id > last_cursor_id                │        │
              │  ORDER BY id LIMIT 5000                   │        │
              └────────────────────┬─────────────────────┘        │
                                   │                               │
                                   ▼                               │
                        ┌─────────────────────────┐               │
                        │  Any rows returned?      │               │
                        └────────────┬────────────┘               │
                                     │                             │
                         ┌───────────┴───────────┐                │
                    ┌────▼────┐             ┌─────▼────┐          │
                    │   NO    │             │   YES    │           │
                    └────┬────┘             └─────┬────┘           │
                         │                        │                │
                    Table done              Apply transforms       │
                    Mark as                      │                 │
                    "done" in                    ▼                 │
                    checkpoint         ┌──────────────────┐        │
                         │             │  toPg() on each  │        │
                         │             │  value:          │        │
                         │             │  - NULL zero     │        │
                         │             │    dates         │        │
                         │             │  - Objects to    │        │
                         │             │    JSON strings  │        │
                         │             └────────┬─────────┘        │
                         │                      │                  │
                         │                      ▼                  │
                         │             ┌──────────────────┐        │
                         │             │  Encrypt columns │        │
                         │             │  users.email     │        │
                         │             │  docs.payload    │        │
                         │             │  pgp_sym_encrypt │        │
                         │             │  ($value, $key)  │        │
                         │             └────────┬─────────┘        │
                         │                      │                  │
                         │                      ▼                  │
                         │             ┌──────────────────┐        │
                         │             │  BEGIN transaction│        │
                         │             │                  │        │
                         │             │  INSERT ... ON   │        │
                         │             │  CONFLICT DO     │        │
                         │             │  UPDATE (upsert) │        │
                         │             │                  │        │
                         │             │  Save checkpoint │        │
                         │             │  (same txn!)     │        │
                         │             │                  │        │
                         │             │  COMMIT          │        │
                         │             └────────┬─────────┘        │
                         │                      │                  │
                         │                      ▼                  │
                         │             ┌──────────────────┐        │
                         │             │  Batch failed?   │        │
                         │             └────────┬─────────┘        │
                         │                      │                  │
                         │          ┌───────────┴──────────┐       │
                         │     ┌────▼────┐           ┌─────▼──┐    │
                         │     │  YES    │           │   NO   │    │
                         │     └────┬────┘           └─────┬──┘    │
                         │          │                      │       │
                         │     Retry up to             Update      │
                         │     4 times with            cursor,     │
                         │     exponential             fetch next  │
                         │     backoff                 batch ──────┘
                         │     (500ms, 1s,
                         │      2s, 4s)
                         │
                         ▼
                        ┌─────────────────────────┐
                        │  All tables done?        │
                        └────────────┬────────────┘
                                     │
                         ┌───────────┴───────────┐
                    ┌────▼────┐             ┌─────▼────┐
                    │   NO    │             │   YES    │
                    └────┬────┘             └─────┬────┘
                         │                        │
                  Next table ──────────►          ▼
                  (loop back up)       ┌─────────────────────────┐
                                       │  Add Foreign Keys        │
                                       │  in Postgres             │
                                       │  (e.g. documents.        │
                                       │   owner_id → users.id)   │
                                       └────────────┬────────────┘
                                                    │
                                                    ▼
                                       ┌─────────────────────────┐
                                       │  status = "finished"     │
                                       │  GET /api/migration/     │
                                       │  status shows results    │
                                       └────────────┬────────────┘
                                                    │
                                                    ▼
                                       ┌─────────────────────────┐
                                       │  POST /api/validate      │
                                       │  Compare MySQL vs PG     │
                                       │  row by row              │
                                       └────────────┬────────────┘
                                                    │
                                                    ▼
                                       ┌─────────────────────────┐
                                       │  MIGRATION COMPLETE ✅   │
                                       │  Data secured in Postgres│
                                       └─────────────────────────┘
```

---

## Step-by-Step Detailed Explanation

---

### Step 1 — Server Starts (`npm start`)

When you type `npm start`, Node.js runs `src/server.js`. The very first thing it does is load the `.env` file. This file contains all the secrets and settings the app needs:

- Your MySQL username and password so it can connect to the source database
- The PostgreSQL connection URL so it can connect to the target database
- The encryption key — a secret passphrase used to lock sensitive data
- The API key — a password that protects the web API from unauthorized access
- The batch size (how many rows to process at a time)
- Which tables to migrate and which columns to encrypt

If any required setting is missing or too short, the app **refuses to start** and tells you exactly what is wrong. This is called fail-fast validation — better to crash immediately than to run halfway and corrupt data.

Once settings are loaded, it opens two **connection pools** — a pool of 5 reusable connections to MySQL and a pool of 5 to PostgreSQL. Using pools means the app does not open and close a new connection for every single database query, which would be very slow.

Finally it starts listening on **port 3000**, ready to accept requests.

---

### Step 2 — Health Check (`GET /api/health`)

Before doing anything else, you should call this endpoint. It sends a tiny `SELECT 1` query to both MySQL and PostgreSQL — this is the database equivalent of knocking on a door to see if someone is home.

**Response if everything is fine:**
```json
{ "mysql": true, "postgres": true }
```

**Response if Postgres is down:**
```json
{ "mysql": true, "postgres": false }
```
HTTP status 503 is returned so you know something is wrong.

This step catches problems early — wrong password, database not running, wrong hostname — before you even attempt to move data.

---

### Step 3 — API Key Authentication

Every request to the migrator (except `/api/health`) must include a secret key in the request header:
```
x-api-key: xuHs2ZpIEqUaAY1imokC0Mvw3yO5nDK8
```

The server compares the provided key against the one in `.env` using a **timing-safe comparison**. A normal string comparison stops checking as soon as it finds a difference — a hacker could time these responses to guess the key one character at a time. Timing-safe comparison always takes the same amount of time regardless of how many characters match, making this attack impossible.

Wrong key → **401 Unauthorized**. Request is rejected immediately.

---

### Step 4 — Start Migration (`POST /api/migration/start`)

When you call this endpoint, the server first checks if a job is already running. Only one migration can run at a time. If one is already in progress, it returns **409 Conflict**.

Otherwise it returns **202 Accepted** immediately and starts the migration in the background. You do not have to wait — you can check progress at any time using `GET /api/migration/status`.

**Why 202 and not 200?**
202 means "I received your request and I am working on it." 200 means "I already finished." Since the migration takes time, 202 is the honest response.

---

### Step 5 — Enable pgcrypto and Create Checkpoint Table

Two things happen before any data is touched:

**pgcrypto** is a built-in PostgreSQL extension that provides encryption functions. The app runs `CREATE EXTENSION IF NOT EXISTS pgcrypto` to make sure it is available. Without this, the encryption step would fail.

**_migration_checkpoint** is a special table created in PostgreSQL that acts like a bookmark. Every time a batch of rows is saved, the app writes the last primary key it processed into this table. If the migration crashes or is cancelled, the next run checks this table and picks up from exactly where it left off — not from the beginning.

---

### Step 6 — Read MySQL Table Structure (Schema Introspection)

For each table, the app queries MySQL's `information_schema` — a special built-in database that describes the structure of all your tables. It retrieves:

- **Column names** — `id`, `username`, `email`, `age`, `country`
- **Data types** — `INT`, `VARCHAR(255)`, `BLOB`
- **Primary key** — which column uniquely identifies each row (e.g. `id`)
- **Foreign keys** — relationships to other tables (e.g. `documents.owner_id` links to `users.id`)

This information is used to recreate the same table structure in PostgreSQL automatically — you do not have to write any PostgreSQL SQL by hand.

---

### Step 7 — Create Tables in PostgreSQL (Type Mapping)

MySQL and PostgreSQL use slightly different names for data types. The app translates them automatically:

| MySQL Type | PostgreSQL Type | Reason |
|---|---|---|
| `INT` | `integer` | Direct equivalent |
| `VARCHAR(255)` | `varchar(255)` | Direct equivalent |
| `BLOB` | `bytea` | Postgres stores binary data as bytea |
| `JSON` | `jsonb` | jsonb is faster and indexed in Postgres |
| `BIGINT UNSIGNED` | `numeric(20,0)` | Unsigned bigint can exceed Postgres bigint range |
| Encrypted columns | `bytea` | Ciphertext is binary data regardless of source type |

The app runs `CREATE TABLE IF NOT EXISTS` — so if the table already exists (from a previous run), it is not recreated or wiped.

---

### Step 8 — Read Data in Batches

Reading all rows at once would use enormous amounts of memory for large tables. Instead, the app reads **5,000 rows at a time** using cursor-based pagination:

**First batch:**
```sql
SELECT * FROM users ORDER BY id LIMIT 5000
```

**Second batch (cursor = 5000):**
```sql
SELECT * FROM users WHERE id > 5000 ORDER BY id LIMIT 5000
```

**Third batch (cursor = 10000):**
```sql
SELECT * FROM users WHERE id > 10000 ORDER BY id LIMIT 5000
```

This continues until a batch comes back empty — meaning all rows have been read.

The cursor (last `id` value) is saved in the checkpoint table after every batch. So if the app crashes after batch 3, it restarts from batch 4 — not from batch 1.

---

### Step 9 — Transform Values (`toPg`)

Before writing to PostgreSQL, each value goes through a transformation step to handle MySQL quirks:

- **MySQL zero dates** (`0000-00-00 00:00:00`) are invalid in PostgreSQL. They are converted to `NULL`.
- **JavaScript objects** are converted to JSON strings.
- **NULL values** stay as NULL.
- **Binary buffers** (BLOB data) are passed through as-is.
- **Numbers and strings** are passed through as-is.

---

### Step 10 — Encrypt Sensitive Columns

This is the security step. For columns listed in `ENCRYPT_COLUMNS`, the app wraps the value in a PostgreSQL function call before writing:

```sql
pgp_sym_encrypt('alice@example.com', 'your-secret-key')
```

PostgreSQL runs this function and stores the result — a block of encrypted binary data — instead of the original text. The encryption key is passed as a bind parameter, which means it travels from the app to the database over an encrypted connection and is never written to disk anywhere.

**What gets encrypted in this project:**
- `users.email` — email addresses are personal data, must be protected
- `documents.payload` — BLOB file contents are confidential

**What stays as plain text:**
- `users.username`, `users.age`, `users.country` — not sensitive
- `documents.title` — not sensitive

---

### Step 11 — Write to PostgreSQL (Upsert + Transactional Checkpoint)

Each batch is written using an **upsert** operation:
```sql
INSERT INTO users (...) VALUES (...)
ON CONFLICT (id) DO UPDATE SET ...
```

This means:
- If the row does not exist → insert it
- If the row already exists → update it with the new values

This makes the migration **idempotent** — you can run it multiple times and the result is always the same. No duplicates, no errors.

The critical design decision here is that **the data write and the checkpoint update happen in the same database transaction**:

```
BEGIN;
  INSERT 5000 rows into users...
  UPDATE _migration_checkpoint SET cursor = 5000...
COMMIT;
```

If the app crashes between the INSERT and the checkpoint update, **both are rolled back**. On restart, the checkpoint still shows the old position, so those rows are re-inserted on the next run (safely, because of upsert). There is no way for data to land without a checkpoint or for a checkpoint to advance without data.

---

### Step 12 — Retry on Failure

If a batch fails (network blip, database timeout, etc.), the app does not give up immediately. It retries up to **4 times** with exponential backoff:

- Wait 500ms → retry
- Wait 1 second → retry
- Wait 2 seconds → retry
- Wait 4 seconds → if still failing, throw the error and mark the job as failed

This handles temporary problems automatically without any manual intervention.

---

### Step 13 — Add Foreign Keys

After all tables are migrated, the app adds **foreign key constraints** in PostgreSQL. For example:
```sql
ALTER TABLE documents
ADD CONSTRAINT documents_fk
FOREIGN KEY (owner_id) REFERENCES users(id);
```

This is done last — after all tables exist — because PostgreSQL requires the parent table (`users`) to already exist before the child table (`documents`) can reference it. Adding foreign keys during table creation would fail if the tables were created in the wrong order.

The app also checks if the constraint already exists before adding it, so re-running the migration never causes duplicate constraint errors.

---

### Step 14 — Check Migration Status (`GET /api/migration/status`)

At any point during or after the migration, you can call this endpoint to see exactly what is happening:

```json
{
  "status": "finished",
  "kind": "full",
  "progress": {
    "users":     { "processed": 109, "total": 109 },
    "documents": { "processed": 110, "total": 110 }
  },
  "results": [
    { "table": "users",     "result": "ok" },
    { "table": "documents", "result": "ok" }
  ],
  "startedAt":  "2026-11-07T11:04:39.914Z",
  "finishedAt": "2026-11-07T11:04:40.176Z"
}
```

Possible status values:

| Status | Meaning |
|---|---|
| `idle` | No migration has run yet |
| `running` | Migration is in progress right now |
| `finished` | Completed successfully |
| `cancelled` | Was paused by calling `/api/migration/cancel` |
| `failed` | An error occurred — check the `error` field |

---

### Step 15 — Validate (`POST /api/validate`)

After the migration finishes, this endpoint does a full row-by-row verification:

1. Counts rows in MySQL and Postgres — they should match
2. Fetches each batch from MySQL
3. Finds those exact rows in Postgres by primary key
4. Compares every column value

Results are classified as:
- **matched** — row exists in both and values are identical
- **missing** — row exists in MySQL but not in Postgres
- **mismatched** — row exists in both but values differ

**Why do encrypted columns show as mismatched?**
The validator compares the raw MySQL value (`alice@example.com`) against the raw Postgres value (encrypted binary). They will never match — and that is correct. It proves the encryption is working. The row count (109 in both) is the real proof that all data arrived safely.

---

## Summary Table

| Step | What Happens | Why It Matters |
|---|---|---|
| 1 | Server starts, loads config | Validates all settings before running |
| 2 | Health check | Catches DB connection problems early |
| 3 | API key check | Prevents unauthorized access |
| 4 | Migration triggered | Returns 202, runs in background |
| 5 | pgcrypto + checkpoint setup | Enables encryption and resumability |
| 6 | Schema read from MySQL | Knows exact table structure to recreate |
| 7 | Tables created in Postgres | Correct types, encrypted cols as bytea |
| 8 | Rows read in batches of 5000 | Memory-safe for large datasets |
| 9 | Values transformed | Handles MySQL quirks (zero dates etc.) |
| 10 | Sensitive cols encrypted | email and BLOB payload locked at rest |
| 11 | Upsert + checkpoint in one txn | Crash-safe, no duplicates, resumable |
| 12 | Retry on failure | Handles network blips automatically |
| 13 | Foreign keys added | Relationships preserved in Postgres |
| 14 | Status checked | Full visibility into progress |
| 15 | Validation run | Confirms every row landed correctly |

---

## What Happens If Something Goes Wrong

| Problem | What the App Does |
|---|---|
| App crashes mid-migration | Restarts from the last checkpoint — no data lost |
| A batch fails to write | Retries up to 4 times with exponential backoff |
| Wrong API key sent | Returns 401 immediately, request ignored |
| Table has no primary key | Skips that table with an error message |
| MySQL zero date found | Converts to NULL before writing to Postgres |
| Encryption key is lost | Encrypted data cannot be recovered — back up the key |
| Migration called twice | Returns 409 Conflict, second job is rejected |

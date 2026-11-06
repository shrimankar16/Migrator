# MySQL to PostgreSQL Migrator — System Explanation

---

## What is this system?

This is a tool that **copies data from a MySQL database into a PostgreSQL database**. Think of it like moving your files from one hard drive to another — but for database tables, and with extra security added along the way.

It runs as a small web server on your computer. You control it by sending simple web requests (like pressing a button on a website), and it does all the heavy lifting in the background.

---

## Why does it exist?

MySQL and PostgreSQL are two different types of databases. Companies often want to switch from one to the other — maybe PostgreSQL is faster for their needs, or cheaper, or more powerful. But moving millions of rows of data manually is risky and time-consuming. This tool automates that entire process safely.

---

## The two databases involved

| Role | Database | What it holds |
|---|---|---|
| **Source** | MySQL (port 3306) | The original data — unprotected |
| **Target** | PostgreSQL (port 5432) | The copied data — secured |

---

## The two tables being migrated

### Table 1 — `users`
Stores information about people.

| Column | Type | Example |
|---|---|---|
| id | Number | 1, 2, 3 … |
| username | Text | alice, bob |
| email | Text (sensitive) | alice@example.com |
| age | Number | 30 |
| country | Text | USA |

### Table 2 — `documents`
Stores files and records attached to users.

| Column | Type | Example |
|---|---|---|
| id | Number | 1, 2, 3 … |
| owner_id | Number | 1 (links to a user) |
| title | Text | Alice contract |
| payload | **BLOB** (binary file) | Raw file contents |

> A **BLOB** (Binary Large Object) is just a way to store a raw file — like a PDF, image, or document — directly inside a database.

---

## The security problem this system solves

In MySQL, all the data is stored **in plain text**. That means if anyone gets access to the MySQL database, they can read every email address and every document payload directly — no password needed to read the actual values.

When the data is moved to PostgreSQL, this system **encrypts the sensitive columns** before saving them. This means even if someone breaks into the PostgreSQL database, they see only scrambled, unreadable data instead of the real values.

---

## What gets encrypted and why

| Column | Why it's encrypted |
|---|---|
| `users.email` | Email addresses are personal information (PII). Nobody should be able to read them from the database directly. |
| `documents.payload` | The file contents could be contracts, medical records, or confidential reports. They must be protected at rest. |

Everything else (names, ages, countries, titles) stays readable because it is not considered sensitive.

---

## How the encryption works

The system uses a technology called **pgcrypto**, which is built into PostgreSQL. Here is what happens step by step:

1. The migrator reads a row from MySQL — for example: `email = "alice@example.com"`
2. Before saving it to PostgreSQL, it locks the value using an **encryption key** (a long secret password stored in the `.env` file)
3. PostgreSQL stores the locked version — a scrambled block of bytes that looks like: `c30d04070302457fdfa552...`
4. Nobody can read the original value without the encryption key

This is called **encryption at rest** — the data is protected while it is sitting in the database, not just while it is being sent over the network.

> The encryption key is stored in the `.env` file as `PG_ENCRYPTION_KEY`. **If this key is lost, the encrypted data cannot be recovered.** Keep it backed up somewhere safe.

---

## How the migration works step by step

```
MySQL Database
      │
      │  1. Read rows in batches (5,000 at a time)
      ▼
  Migrator Tool
      │
      │  2. Encrypt sensitive columns (email, payload)
      │  3. Save progress as a checkpoint
      ▼
PostgreSQL Database
      │
      │  4. Store encrypted data safely
```

**Batches** — Instead of reading all rows at once (which would use too much memory), it reads 5,000 rows at a time, saves them, then reads the next 5,000.

**Checkpoints** — After each batch is saved, the tool writes a bookmark into PostgreSQL. If the migration crashes halfway through, it can restart from where it stopped — it will never copy the same row twice.

**Upserts** — When saving a row, the tool uses a special "insert or update" operation. If the row already exists, it updates it. If it does not, it inserts it. This makes re-running the migration completely safe.

---

## The web API — how you control it

The migrator runs as a web server on **port 3000**. You talk to it using web requests. Every request (except the health check) requires an API key in the header for security.

| Action | Request | What it does |
|---|---|---|
| Check if everything is working | `GET /api/health` | Pings both databases |
| See tables in MySQL | `GET /api/source/tables` | Lists all available tables |
| Start the migration | `POST /api/migration/start` | Begins copying all data |
| Check progress | `GET /api/migration/status` | Shows how many rows are done |
| Pause the migration | `POST /api/migration/cancel` | Stops it safely (resumable) |
| Verify the data | `POST /api/validate` | Compares MySQL vs PostgreSQL row by row |
| Sync new changes | `POST /api/sync/start` | Copies only rows that changed recently |

---

## The configuration file (.env)

All settings live in a single file called `.env`. Here is what each setting means in plain English:

```
MYSQL_HOST        → Where MySQL is running (localhost = this computer)
MYSQL_PORT        → Which door MySQL listens on (3306 is the default)
MYSQL_USER        → The MySQL username
MYSQL_PASSWORD    → The MySQL password
MYSQL_DATABASE    → Which database to migrate from (migrator_db)

PG_URL            → Full address of the PostgreSQL database

ADMIN_API_KEY     → A secret password to protect the migrator's web API
BATCH_SIZE        → How many rows to process at a time (5000)
TABLES            → Which tables to migrate (users, documents)

PG_ENCRYPTION_KEY → The secret key used to encrypt sensitive columns
ENCRYPT_COLUMNS   → Which columns to encrypt (users:email, documents:payload)
```

---

## What the migration result looks like

### Before (MySQL — plain text, anyone can read it)

| id | username | email | age |
|---|---|---|---|
| 1 | alice | alice@example.com | 30 |
| 2 | bob | bob@example.com | 25 |

### After (PostgreSQL — email is locked)

| id | username | email | age |
|---|---|---|---|
| 1 | alice | c30d04070302457f… (83 bytes of scrambled data) | 30 |
| 2 | bob | c30d040703022225… (81 bytes of scrambled data) | 25 |

The email is completely unreadable without the encryption key. The rest of the data is normal.

---

## What happens if something goes wrong?

- **Migration crashes halfway** → No problem. Restart it. It picks up from the last checkpoint automatically.
- **A batch fails** → The tool retries it up to 4 times automatically before giving up.
- **Wrong row is written** → The upsert approach means re-running is always safe — no duplicates.
- **Encryption key is lost** → The encrypted data cannot be recovered. This is why backing up the key is critical.

---

## Summary in one paragraph

This system takes data from a MySQL database, copies it into a PostgreSQL database, and automatically encrypts the sensitive parts (email addresses and document payloads) so they are protected at rest. It works in batches, saves its progress as it goes, and can be paused and resumed at any time. You control it through a simple web API. The only thing you must keep safe is the encryption key — everything else the system handles on its own.

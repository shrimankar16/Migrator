-- =============================================================================
-- MySQL seed data
-- =============================================================================
-- Table 1: users
--   Columns: integers (id, age) and strings (username, email, country)
-- Table 2: documents
--   Columns: integers (id, owner_id) and strings (title), plus a BLOB (payload)
--
-- Usage:
--   mysql -h <host> -u <user> -p <database> < seed/mysql_seed.sql
-- =============================================================================

-- ── Table 1: users ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`       INT          NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(80)  NOT NULL,
  `email`    VARCHAR(255) NOT NULL,
  `age`      INT          NOT NULL,
  `country`  VARCHAR(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `users` (`username`, `email`, `age`, `country`) VALUES
  ('alice',    'alice@example.com',   30, 'USA'),
  ('bob',      'bob@example.com',     25, 'UK'),
  ('carol',    'carol@example.com',   35, 'Canada'),
  ('dave',     'dave@example.com',    28, 'Australia'),
  ('eve',      'eve@example.com',     22, 'Germany'),
  ('frank',    'frank@example.com',   45, 'France'),
  ('grace',    'grace@example.com',   31, 'Japan'),
  ('heidi',    'heidi@example.com',   27, 'Brazil'),
  ('ivan',     'ivan@example.com',    38, 'India'),
  ('judy',     'judy@example.com',    29, 'Mexico');

-- ── Table 2: documents ────────────────────────────────────────────────────────
-- `payload` is a BLOB (binary large object) — stored as raw bytes in MySQL.
-- During migration it will be encrypted at rest in Postgres using pgcrypto.
CREATE TABLE IF NOT EXISTS `documents` (
  `id`       INT         NOT NULL AUTO_INCREMENT,
  `owner_id` INT         NOT NULL,
  `title`    VARCHAR(255) NOT NULL,
  `payload`  BLOB,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `documents` (`owner_id`, `title`, `payload`) VALUES
  (1, 'Alice contract',    _binary 'Contract terms for Alice: confidential.'),
  (1, 'Alice NDA',         _binary 'Non-disclosure agreement — Alice.'),
  (2, 'Bob report',        _binary 'Quarterly performance report for Bob.'),
  (3, 'Carol invoice',     _binary 'Invoice #1042 issued to Carol.'),
  (4, 'Dave proposal',     _binary 'Project proposal submitted by Dave.'),
  (5, 'Eve medical',       _binary 'Medical assessment record — Eve.'),
  (6, 'Frank compliance',  _binary 'Compliance audit findings — Frank.'),
  (7, 'Grace research',    _binary 'Research data set owned by Grace.'),
  (8, 'Heidi blueprint',   _binary 'Engineering blueprint — Heidi.'),
  (9, 'Ivan patent',       _binary 'Patent application draft — Ivan.');

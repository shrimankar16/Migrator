import mysql from 'mysql2/promise';
import pg from 'pg';
import { cfg } from './config.js';
// Return dates and big integers as strings so nothing is rounded or shifted by timezone.
for (const oid of [1114, 1082, 20, 1700]) pg.types.setTypeParser(oid, v => v);
export const my = mysql.createPool({
  host: cfg.MYSQL_HOST, port: cfg.MYSQL_PORT, user: cfg.MYSQL_USER, password: cfg.MYSQL_PASSWORD,
  database: cfg.MYSQL_DATABASE, connectionLimit: 5, dateStrings: true,
  supportBigNumbers: true, bigNumberStrings: true, enableKeepAlive: true,
});
my.pool.on('connection', c => c.query("SET time_zone='+00:00'"));
export const pgp = new pg.Pool({ connectionString: cfg.PG_URL, max: 5 });

/**
 * Ensure the pgcrypto extension exists in the target database.
 * Must be called once at startup when PG_ENCRYPTION_KEY is configured.
 * Requires superuser or a role with CREATE privilege on the database.
 */
export async function ensurePgCrypto() {
  if (cfg.PG_ENCRYPTION_KEY) {
    await pgp.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  }
}

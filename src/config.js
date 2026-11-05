import 'dotenv/config';
import { z } from 'zod';
export const cfg = z.object({
  MYSQL_HOST: z.string(), MYSQL_PORT: z.coerce.number().default(3306),
  MYSQL_USER: z.string(), MYSQL_PASSWORD: z.string(), MYSQL_DATABASE: z.string(),
  PG_URL: z.string(), ADMIN_API_KEY: z.string().min(16),
  BATCH_SIZE: z.coerce.number().int().min(100).max(50000).default(5000),
  TABLES: z.string().default(''), SYNC_COLUMNS: z.string().default(''),
  SYNC_INTERVAL_MIN: z.coerce.number().default(0), PORT: z.coerce.number().default(3000),
  // Encryption: a strong passphrase used by pgcrypto pgp_sym_encrypt.
  // Must be ≥ 16 chars. Leave empty to disable column encryption (not recommended).
  PG_ENCRYPTION_KEY: z.string().min(16).optional(),
  // Which columns to encrypt, per table. Format: table:col,table:col
  // Example: users:email,documents:payload
  ENCRYPT_COLUMNS: z.string().default(''),
}).parse(process.env);
export const syncCols = Object.fromEntries(cfg.SYNC_COLUMNS.split(',').filter(Boolean).map(s => s.trim().split(':')));
// Map of { tableName: Set<columnName> } for columns that must be encrypted at rest.
export const encryptCols = cfg.ENCRYPT_COLUMNS.split(',').filter(Boolean).reduce((acc, s) => {
  const [table, col] = s.trim().split(':');
  if (table && col) { (acc[table] ??= new Set()).add(col); }
  return acc;
}, {});

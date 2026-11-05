/**
 * encrypt.js
 *
 * Thin wrapper around Postgres pgcrypto's pgp_sym_encrypt / pgp_sym_decrypt.
 * All encryption happens inside Postgres itself — the plaintext value is sent
 * as a bind parameter and the ciphertext is what actually lands on disk.
 *
 * Design decisions:
 *  - We never encrypt NULL: a NULL input stays NULL in the target.
 *  - We encrypt everything as text (Buffer values are hex-encoded first so
 *    the BLOB payload survives the text round-trip cleanly).
 *  - The key is kept in process memory only (from the env var) and is never
 *    written to the database or logs.
 */

import { cfg } from './config.js';

/**
 * Returns true when encryption is globally enabled (key is configured).
 */
export const encryptionEnabled = () => Boolean(cfg.PG_ENCRYPTION_KEY);

/**
 * encryptColumns
 * --------------
 * Given a map of { columnName: value } pairs and the set of column names that
 * should be encrypted, returns a new flat values array and a parallel names
 * array where encrypted columns are replaced with a pgp_sym_encrypt() SQL
 * expression so the upsert query sends the plaintext to PG and stores only
 * the ciphertext.
 *
 * Because we inject a SQL function call we can't use the normal positional
 * placeholder approach directly, so we return the modified SQL fragment for
 * the VALUES clause instead of patching upsertSql.
 *
 * @param {string[]}        names        ordered column names
 * @param {string[]}        pk           primary key column name(s)
 * @param {any[][]}         rowValues    array of already-toPg()-transformed rows
 * @param {Set<string>}     encCols      column names to encrypt
 * @returns {{ sql: string, params: any[] }}
 *   sql    – a VALUES list string with pgp_sym_encrypt(...) in encrypted slots
 *   params – flat bind params array (the key occupies its own $N slots)
 */
export function buildEncryptedUpsert(table, names, pk, rowValues, encCols) {
  const key = cfg.PG_ENCRYPTION_KEY;
  const qp = n => '"' + n.replace(/"/g, '""') + '"';

  // Build the flat params array and the VALUES clause simultaneously.
  // For plain columns: $N placeholder, value pushed to params.
  // For encrypted columns: pgp_sym_encrypt($N::text, $M) where $N is the
  //   plaintext value and $M is the encryption key (one key param per slot
  //   so the query stays fully parameterised — no literal key in SQL text).
  const params = [];
  const valueClauses = rowValues.map(row => {
    const slots = names.map((name, colIdx) => {
      const raw = row[colIdx];
      if (raw === null || raw === undefined) {
        // NULL — don't bother encrypting, just push null
        params.push(null);
        return `$${params.length}`;
      }
      if (encCols.has(name)) {
        // Encode Buffers to hex so binary data survives text round-trip
        const plaintext = Buffer.isBuffer(raw) ? raw.toString('hex') : String(raw);
        params.push(plaintext, key);
        return `pgp_sym_encrypt($${params.length - 1}::text, $${params.length})`;
      }
      params.push(raw);
      return `$${params.length}`;
    });
    return `(${slots.join(',')})`;
  });

  const upd = names.filter(c => !pk.includes(c));
  const action = upd.length
    ? 'DO UPDATE SET ' + upd.map(c => {
        if (encCols.has(c)) {
          // For the UPDATE branch we reference EXCLUDED which already holds the
          // encrypted value (Postgres evaluated the expression in the INSERT).
          return `${qp(c)}=EXCLUDED.${qp(c)}`;
        }
        return `${qp(c)}=EXCLUDED.${qp(c)}`;
      }).join(',')
    : 'DO NOTHING';

  const sql = `INSERT INTO ${qp(table)} (${names.map(qp).join(',')}) VALUES ${valueClauses.join(',')} ON CONFLICT (${pk.map(qp).join(',')}) ${action}`;
  return { sql, params };
}

import { my, pgp, ensurePgCrypto } from './db.js';
import { cfg, syncCols, encryptCols } from './config.js';
import { listTables, describe, addForeignKeys } from './schema.js';
import { ddl } from './types.js';
import { qm, qp, upsertSql, toPg } from './sql.js';
import { encryptionEnabled, buildEncryptedUpsert } from './encrypt.js';
import pino from 'pino';
export const log = pino();

export const state = { status: 'idle', kind: null, cancel: false, progress: {}, results: [], error: null, startedAt: null, finishedAt: null };
export const cancel = () => { if (state.status === 'running') state.cancel = true; };

async function retry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries - 1) throw e;
      log.warn({ err: e.message, attempt: i + 1 }, 'batch failed, retrying');
      await new Promise(r => setTimeout(r, 500 * 2 ** i));
    }
  }
}
export const ensureCheckpoint = () => pgp.query(`CREATE TABLE IF NOT EXISTS _migration_checkpoint(
  table_name text, mode text, cursor jsonb, processed bigint DEFAULT 0, status text, updated_at timestamptz DEFAULT now(),
  PRIMARY KEY(table_name, mode))`);

async function copyTable(sc, mode, batch, col) {
  const { table, cols, pk } = sc;
  if (pk.length !== 1) throw new Error(`${table}: needs a single-column primary key (composite/no key not supported)`);
  const k = pk[0], names = cols.map(c => c.name), per = Math.max(1, Math.floor(60000 / names.length));
  const ck = (await pgp.query('SELECT cursor, processed FROM _migration_checkpoint WHERE table_name=$1 AND mode=$2', [table, mode])).rows[0];
  let cursor = ck?.cursor ?? null, done = Number(ck?.processed ?? 0);
  if (mode === 'incremental') {
    if (!col) throw new Error(`${table}: no SYNC_COLUMNS entry`);
    if (!cursor) {
      const m = (await pgp.query(`SELECT max(${qp(col)}) m FROM ${qp(table)}`)).rows[0].m;
      if (!m) throw new Error(`${table}: target empty, run a full migration first`);
      cursor = { ts: m, pk: null };
    }
  }
  const total = Number((await my.query(`SELECT COUNT(*) c FROM ${qm(table)}`))[0][0].c);
  state.progress[table] = { processed: done, total };
  for (;;) {
    if (state.cancel) return 'cancelled';
    let sql, args;
    if (mode === 'full') {
      sql = `SELECT * FROM ${qm(table)}${cursor ? ` WHERE ${qm(k)} > ?` : ''} ORDER BY ${qm(k)} LIMIT ?`;
      args = cursor ? [cursor.pk, batch] : [batch];
    } else {
      const c = qm(col), first = cursor.pk == null;
      sql = `SELECT * FROM ${qm(table)} WHERE ${first ? `${c} >= ?` : `(${c} > ? OR (${c} = ? AND ${qm(k)} > ?))`} ORDER BY ${c}, ${qm(k)} LIMIT ?`;
      args = first ? [cursor.ts, batch] : [cursor.ts, cursor.ts, cursor.pk, batch];
    }
    const [rows] = await my.query(sql, args);
    if (!rows.length) break;
    const last = rows.at(-1);
    const next = mode === 'full' ? { pk: last[k] } : { ts: last[col], pk: last[k] };
    const newDone = done + rows.length;
    await retry(async () => {
      const c = await pgp.connect();
      try {
        await c.query('BEGIN');
        const tableEncCols = encryptCols[table] ?? new Set();
        for (let i = 0; i < rows.length; i += per) {
          const part = rows.slice(i, i + per);
          if (encryptionEnabled() && tableEncCols.size > 0) {
            // Build per-row value arrays (already toPg-transformed), then hand
            // off to buildEncryptedUpsert which injects pgp_sym_encrypt() calls.
            const rowValues = part.map(r => names.map(n => toPg(r[n])));
            const { sql, params } = buildEncryptedUpsert(table, names, pk, rowValues, tableEncCols);
            await c.query(sql, params);
          } else {
            await c.query(upsertSql(table, names, pk, part.length), part.flatMap(r => names.map(n => toPg(r[n]))));
          }
        }
        // Checkpoint commits in the same transaction as the data: no gap, no double-count.
        await c.query(`INSERT INTO _migration_checkpoint(table_name,mode,cursor,processed,status) VALUES($1,$2,$3,$4,'running')
          ON CONFLICT (table_name,mode) DO UPDATE SET cursor=$3, processed=$4, status='running', updated_at=now()`,
          [table, mode, JSON.stringify(next), newDone]);
        await c.query('COMMIT');
      } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
    });
    cursor = next; done = newDone; state.progress[table].processed = done;
  }
  await pgp.query('UPDATE _migration_checkpoint SET status=$3 WHERE table_name=$1 AND mode=$2', [table, mode, mode === 'full' ? 'done' : 'caught_up']);
  return 'ok';
}

export async function startJob({ kind, tables, batch = cfg.BATCH_SIZE, reset = false }) {
  if (state.status === 'running') throw Object.assign(new Error('a job is already running'), { status: 409 });
  const all = (await listTables()).map(t => t.n);
  const list = tables?.length ? tables : cfg.TABLES ? cfg.TABLES.split(',').map(s => s.trim()) : all;
  for (const t of list) if (!all.includes(t)) throw Object.assign(new Error('unknown table ' + t), { status: 400 });
  Object.assign(state, { status: 'running', kind, cancel: false, progress: {}, results: [], error: null, startedAt: new Date(), finishedAt: null });
  (async () => {
    try {
      await ensurePgCrypto();
      await ensureCheckpoint();
      const schemas = [];
      for (const t of list) {
        const sc = await describe(t); schemas.push(sc);
        if (kind === 'full') {
          if (reset) await pgp.query('DELETE FROM _migration_checkpoint WHERE table_name=$1 AND mode=$2', [t, 'full']);
          const st = (await pgp.query('SELECT status FROM _migration_checkpoint WHERE table_name=$1 AND mode=$2', [t, 'full'])).rows[0]?.status;
          if (st === 'done') { state.results.push({ table: t, result: 'skipped (already done, use reset)' }); continue; }
          await pgp.query(ddl(sc, encryptCols[t] ?? new Set()));
        }
        const r = await copyTable(sc, kind, batch, syncCols[t]);
        state.results.push({ table: t, result: r });
        if (r === 'cancelled') break;
      }
      if (kind === 'full' && !state.cancel) await addForeignKeys(schemas);
      state.status = state.cancel ? 'cancelled' : 'finished';
    } catch (e) { state.status = 'failed'; state.error = e.message; log.error({ err: e.message }, 'job failed'); }
    state.finishedAt = new Date();
  })();
}

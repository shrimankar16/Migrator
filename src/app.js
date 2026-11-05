import express from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { cfg } from './config.js';
import { my, pgp } from './db.js';
import { listTables, describe } from './schema.js';
import { startJob, state, cancel } from './migrate.js';
import { validateTable } from './validate.js';

export const app = express();
app.use(express.json());
const h = f => (req, res) => f(req, res).catch(e => res.status(e.status || (e.name === 'ZodError' ? 400 : 500)).json({ error: e.message }));

app.get('/api/health', h(async (_, res) => {
  const o = { mysql: false, postgres: false };
  try { await my.query('SELECT 1'); o.mysql = true; } catch {}
  try { await pgp.query('SELECT 1'); o.postgres = true; } catch {}
  res.status(o.mysql && o.postgres ? 200 : 503).json(o);
}));

app.use('/api', (req, res, next) => {
  const a = Buffer.from(req.get('x-api-key') || ''), b = Buffer.from(cfg.ADMIN_API_KEY);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  res.status(401).json({ error: 'unauthorized' });
});

const body = z.object({ tables: z.array(z.string()).optional(), batchSize: z.number().int().min(100).max(50000).optional(), reset: z.boolean().optional() });
const run = kind => h(async (req, res) => {
  const b = body.parse(req.body || {});
  await startJob({ kind, tables: b.tables, batch: b.batchSize, reset: b.reset });
  res.status(202).json({ started: kind });
});
app.get('/api/source/tables', h(async (_, res) => res.json(await listTables())));
app.get('/api/source/tables/:t/schema', h(async (req, res) => res.json(await describe(req.params.t))));
app.get('/api/target/checkpoints', h(async (_, res) => res.json((await pgp.query('SELECT * FROM _migration_checkpoint ORDER BY table_name, mode').catch(() => ({ rows: [] }))).rows)));
app.post('/api/migration/start', run('full'));      // also "resume": same call continues from checkpoint
app.post('/api/sync/start', run('incremental'));
app.post('/api/migration/cancel', h(async (_, res) => { cancel(); res.json({ cancelling: true }); })); // = pause
app.get('/api/migration/status', h(async (_, res) => res.json(state)));
app.post('/api/validate', h(async (req, res) => {
  const b = body.parse(req.body || {});
  const tables = b.tables?.length ? b.tables : (await listTables()).map(t => t.n);
  const out = []; for (const t of tables) out.push(await validateTable(t));
  res.json(out);
}));

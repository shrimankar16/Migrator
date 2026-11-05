import { my, pgp } from './db.js';
import { describe } from './schema.js';
import { mapType } from './types.js';
import { qm, qp, norm } from './sql.js';

export async function validateTable(table, batch = 5000) {
  const sc = await describe(table);
  if (sc.pk.length !== 1) throw new Error(`${table}: single-column primary key required`);
  const k = sc.pk[0], names = sc.cols.map(c => c.name), kt = mapType(sc.cols.find(c => c.name === k));
  const src = Number((await my.query(`SELECT COUNT(*) c FROM ${qm(table)}`))[0][0].c);
  const dst = Number((await pgp.query(`SELECT count(*) c FROM ${qp(table)}`)).rows[0].c);
  let cursor = null, matched = 0, missing = 0, mismatched = 0; const samples = [];
  for (;;) {
    const [rows] = await my.query(`SELECT * FROM ${qm(table)}${cursor !== null ? ` WHERE ${qm(k)} > ?` : ''} ORDER BY ${qm(k)} LIMIT ?`, cursor !== null ? [cursor, batch] : [batch]);
    if (!rows.length) break;
    cursor = rows.at(-1)[k];
    const { rows: d } = await pgp.query(`SELECT * FROM ${qp(table)} WHERE ${qp(k)} = ANY($1::${kt}[])`, [rows.map(r => String(r[k]))]);
    const byKey = new Map(d.map(r => [String(r[k]), r]));
    for (const r of rows) {
      const p = byKey.get(String(r[k]));
      if (!p) { missing++; if (samples.length < 20) samples.push({ key: r[k], issue: 'missing' }); }
      else if (names.every(n => norm(r[n]) === norm(p[n]))) matched++;
      else { mismatched++; if (samples.length < 20) samples.push({ key: r[k], issue: 'mismatch' }); }
    }
  }
  return { table, sourceCount: src, targetCount: dst, matched, missing, mismatched,
    extraInTarget: dst - matched - mismatched, ok: src === dst && !missing && !mismatched, samples };
}

export const qm = n => '`' + n.replace(/`/g, '``') + '`';
export const qp = n => '"' + n.replace(/"/g, '""') + '"';
export function upsertSql(table, names, pk, nRows) {
  const n = names.length;
  const vals = Array.from({ length: nRows }, (_, i) => '(' + names.map((_, j) => '$' + (i * n + j + 1)).join(',') + ')').join(',');
  const upd = names.filter(c => !pk.includes(c));
  const action = upd.length ? 'DO UPDATE SET ' + upd.map(c => `${qp(c)}=EXCLUDED.${qp(c)}`).join(',') : 'DO NOTHING';
  return `INSERT INTO ${qp(table)} (${names.map(qp).join(',')}) VALUES ${vals} ON CONFLICT (${pk.map(qp).join(',')}) ${action}`;
}
export function toPg(v) {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string' && v.startsWith('0000-00-00')) return null; // MySQL zero-date is invalid in PG
  return v;
}
export function norm(v) {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return v.toString('hex');
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d\.\d+$/.test(s) ? s.replace(/\.?0+$/, '') : s;
}

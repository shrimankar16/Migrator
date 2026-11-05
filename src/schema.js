import { my, pgp } from './db.js';
import { cfg } from './config.js';
import { qp } from './sql.js';

export async function listTables() {
  const [r] = await my.query("SELECT TABLE_NAME n, TABLE_ROWS approx_rows FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME", [cfg.MYSQL_DATABASE]);
  return r;
}
export async function describe(table) {
  if (!(await listTables()).some(t => t.n === table)) throw Object.assign(new Error('unknown table ' + table), { status: 404 });
  const [cols] = await my.query(`SELECT COLUMN_NAME name, DATA_TYPE type, COLUMN_TYPE \`full\`, IS_NULLABLE nullable, COLUMN_KEY k,
    CHARACTER_MAXIMUM_LENGTH \`len\`, NUMERIC_PRECISION p, NUMERIC_SCALE s FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`, [cfg.MYSQL_DATABASE, table]);
  const [fk] = await my.query(`SELECT CONSTRAINT_NAME cn, COLUMN_NAME col, REFERENCED_TABLE_NAME rt, REFERENCED_COLUMN_NAME rc
    FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`, [cfg.MYSQL_DATABASE, table]);
  return { table, cols, pk: cols.filter(c => c.k === 'PRI').map(c => c.name), fks: fk };
}
export async function addForeignKeys(schemas) {
  const have = new Set(schemas.map(s => s.table));
  for (const s of schemas) {
    const groups = {};
    for (const f of s.fks) (groups[f.cn] ??= []).push(f);
    for (const [cn, fs] of Object.entries(groups)) {
      if (!have.has(fs[0].rt)) continue; // parent not migrated, skip
      const name = `${s.table}_${cn}`.slice(0, 63);
      const ex = await pgp.query('SELECT 1 FROM pg_constraint WHERE conname=$1', [name]);
      if (ex.rowCount) continue;
      await pgp.query(`ALTER TABLE ${qp(s.table)} ADD CONSTRAINT ${qp(name)} FOREIGN KEY (${fs.map(f => qp(f.col)).join(',')}) REFERENCES ${qp(fs[0].rt)} (${fs.map(f => qp(f.rc)).join(',')})`);
    }
  }
}

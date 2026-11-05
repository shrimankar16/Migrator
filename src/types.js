// MySQL column -> PostgreSQL type. Pure function, unit tested.
export function mapType(c) {
  const u = /unsigned/i.test(c.full || '');
  switch (c.type) {
    case 'tinyint': return 'smallint';
    case 'smallint': return u ? 'integer' : 'smallint';
    case 'mediumint': return 'integer';
    case 'int': case 'integer': return u ? 'bigint' : 'integer';
    case 'bigint': return u ? 'numeric(20,0)' : 'bigint';
    case 'decimal': case 'numeric': return `numeric(${c.p},${c.s})`;
    case 'float': return 'real';
    case 'double': return 'double precision';
    case 'varchar': return `varchar(${c.len})`;
    case 'char': return `char(${c.len})`;
    case 'datetime': case 'timestamp': return 'timestamp';
    case 'date': return 'date';
    case 'time': return 'time';
    case 'year': return 'smallint';
    case 'json': return 'jsonb';
    case 'binary': case 'varbinary': case 'blob': case 'tinyblob': case 'mediumblob': case 'longblob': case 'bit': return 'bytea';
    default: return 'text'; // text types, enum, set
  }
}
const qp = n => '"' + n.replace(/"/g, '""') + '"';

/**
 * ddl
 * ---
 * Generates a CREATE TABLE IF NOT EXISTS statement.
 *
 * @param {object}      sc           schema descriptor from describe()
 * @param {Set<string>} [encCols]    column names that will be encrypted at rest.
 *                                   These are stored as bytea regardless of their
 *                                   MySQL source type because pgcrypto ciphertext
 *                                   is binary data.
 */
export function ddl(sc, encCols = new Set()) {
  const cols = sc.cols.map(c => {
    const pgType = encCols.has(c.name) ? 'bytea' : mapType(c);
    // Encrypted columns may not carry a NOT NULL constraint at the DDL level
    // because a NULL plaintext stays NULL (we never encrypt NULLs).
    const notNull = c.nullable === 'NO' && !encCols.has(c.name) ? ' NOT NULL' : '';
    return `${qp(c.name)} ${pgType}${notNull}`;
  });
  return `CREATE TABLE IF NOT EXISTS ${qp(sc.table)} (${cols.join(', ')}, PRIMARY KEY (${sc.pk.map(qp).join(', ')}))`;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mapType, ddl } from '../src/types.js';
import { upsertSql, toPg, norm } from '../src/sql.js';

test('type mapping', () => {
  assert.equal(mapType({ type: 'int', full: 'int unsigned' }), 'bigint');
  assert.equal(mapType({ type: 'bigint', full: 'bigint unsigned' }), 'numeric(20,0)');
  assert.equal(mapType({ type: 'decimal', p: 10, s: 2, full: 'decimal(10,2)' }), 'numeric(10,2)');
  assert.equal(mapType({ type: 'json', full: 'json' }), 'jsonb');
  assert.equal(mapType({ type: 'enum', full: "enum('a')" }), 'text');
});
test('ddl has primary key', () => {
  const s = ddl({ table: 't', pk: ['id'], cols: [{ name: 'id', type: 'int', full: 'int', nullable: 'NO' }] });
  assert.match(s, /PRIMARY KEY \("id"\)/);
});
test('upsert sql', () => {
  const s = upsertSql('t', ['id', 'a'], ['id'], 2);
  assert.match(s, /VALUES \(\$1,\$2\),\(\$3,\$4\) ON CONFLICT \("id"\) DO UPDATE SET "a"=EXCLUDED."a"/);
  assert.match(upsertSql('t', ['id'], ['id'], 1), /DO NOTHING/);
});
test('transforms', () => {
  assert.equal(toPg('0000-00-00 00:00:00'), null);
  assert.equal(toPg({ a: 1 }), '{"a":1}');
  assert.equal(norm('2020-01-01 10:00:00.500000'), '2020-01-01 10:00:00.5');
  assert.equal(norm('2020-01-01 10:00:00.000'), '2020-01-01 10:00:00');
});

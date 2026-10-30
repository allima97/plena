import test from 'node:test';
import assert from 'node:assert/strict';
import { seedCategories } from '../src/lib/fin/seed.js';

test('seedCategories gera ids determinísticos (re-seed não duplica no servidor)', () => {
  const a = seedCategories();
  const b = seedCategories();
  assert.deepEqual(a.map((c) => c.id), b.map((c) => c.id));
  assert.equal(new Set(a.map((c) => c.id)).size, a.length);
});

test('seedCategories mantém tipo, nome e secundarios vazios', () => {
  for (const cat of seedCategories()) {
    assert.ok(['receita', 'despesa'].includes(cat.tipo));
    assert.ok(cat.nome.trim().length > 0);
    assert.deepEqual(cat.secundarios, []);
    assert.ok(cat.id.startsWith(`seed-${cat.tipo}-`));
  }
});

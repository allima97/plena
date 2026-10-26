import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isTourismSection } from '../src/lib/goals/tourism-tour.js';

test('tourism help follows the selected control, including renamed template imports', () => {
 assert.equal(isTourismSection(null), false);
 assert.equal(isTourismSection({ id:'shop', name:'Loja de roupas' }), false);
 assert.equal(isTourismSection({ id:'shop', name:'TURISMO' }), true);
 assert.equal(isTourismSection({ id:'shop', name:'Agência de Turismo' }), true);
 assert.equal(isTourismSection({ id:'shop', name:'Agência', template:{id:'tourism'} }), true);
 const types=[{id:'cruise',sectionId:'shop',template:{id:'tourism'}}];
 assert.equal(isTourismSection({id:'shop',name:'Minha agência'},types),true);
 assert.equal(isTourismSection({id:'other',name:'Loja'},types),false,'another control must not inherit the tourism tour');
});

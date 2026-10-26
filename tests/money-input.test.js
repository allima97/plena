import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoneyInput, formatMoneyInput, moneyInputError, moneyInput } from '../src/lib/money-input.js';

test('BRL input preserves reais, cents, signs and Brazilian grouping', () => {
  const examples = new Map([
    ['3400', 3400], ['3.400', 3400], ['3.400,00', 3400], ['3400,5', 3400.5],
    ['3.400,50', 3400.5], ['R$ 3.400,50', 3400.5], ['3400.50', 3400.5],
    ['0,01', .01], [',50', .5], ['0', 0], ['-1.234,56', -1234.56],
    ['1.234.567,89', 1234567.89], ['1234,', 1234], ['', null], ['  ', null]
  ]);
  for (const [text, amount] of examples) {
    assert.equal(parseMoneyInput(text), amount, text);
    if (amount !== null) assert.equal(parseMoneyInput(formatMoneyInput(amount)), amount, text);
  }
  for (const value of [0, .01, 3400, 3400.5, -1234.56]) {
    assert.equal(parseMoneyInput(formatMoneyInput(value)), value);
  }
  assert.equal(formatMoneyInput(3400), '3.400,00');
  assert.equal(formatMoneyInput(3400.5), '3.400,50');
  assert.equal(formatMoneyInput(''), '');
});

test('malformed and overprecise amounts cannot silently become zero', () => {
  for (const text of ['abc', '1e3', 'Infinity', '1,234', '3400.123', '0.001', '1.23,45', '1,23,45', '1.234.56', '--1', '12 34', '9007199254740993,00']) {
    assert.ok(Number.isNaN(parseMoneyInput(text)), text);
    assert.ok(moneyInputError(text), text);
  }
  assert.ok(moneyInputError('', {required: true}));
  assert.equal(moneyInputError(''), '');
  assert.equal(moneyInputError('0,00', {required: true, min: 0}), '');
  assert.ok(moneyInputError('0,00', {min: .01}));
  assert.ok(moneyInputError('-0,01', {min: 0}));
  assert.ok(moneyInputError('10,01', {max: 10}));
  assert.equal(moneyInputError('10,00', {max: 10}), '');
  assert.equal(moneyInputError('invalid', {disabled: true, required: true}), '');
});

test('editing formats immediately while preserving the numeric model and invalid drafts', () => {
  const original = globalThis.MutationObserver;
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  try {
    const node = new EventTarget();
    Object.assign(node, {dataset: {}, value: '', required: true, disabled: false,
      getAttribute: name => name === 'min' ? '0.01' : null,
      setCustomValidity: error => node.error = error});
    let value = 3400;
    const options = () => ({value, setValue: next => value = next});
    const control = moneyInput(node, options());
    assert.equal(node.value, '3.400,00');
    node.value = '3400,5'; node.dispatchEvent(new Event('input'));
    assert.equal(value, 3400.5);
    control.update(options());
    assert.equal(node.value, '3.400,50');
    node.dispatchEvent(new Event('blur'));
    assert.equal(node.value, '3.400,50');
    node.value = '1,234'; node.dispatchEvent(new Event('input'));
    assert.equal(value, '');
    assert.ok(node.error);
    control.update(options()); node.dispatchEvent(new Event('blur'));
    assert.equal(node.value, '1,234');
    assert.ok(node.error);
    value = 12.34; control.update(options());
    assert.equal(node.value, '12,34');
    assert.equal(node.error, '');
    control.destroy();
  } finally { globalThis.MutationObserver = original; }
});

function field(initial = 0) {
 const node = new EventTarget(); let value = initial;
 Object.assign(node, { dataset: {}, value: '', required: false, disabled: false, selectionStart: 0, selectionEnd: 0,
  getAttribute: () => null, setCustomValidity(error) { node.error = error; },
  setSelectionRange(start, end = start) { node.selectionStart = start; node.selectionEnd = end; },
  select() { node.setSelectionRange(0, node.value.length); } });
 const control = moneyInput(node, { value, setValue: next => value = next });
 const send = (inputType, data = null) => {
  const before = Object.assign(new Event('beforeinput', { cancelable: true }), { inputType, data });
  node.dispatchEvent(before); if (before.defaultPrevented) return;
  let start = node.selectionStart, end = node.selectionEnd;
  if (start === end && inputType === 'deleteContentBackward') start = Math.max(0, start - 1);
  if (start === end && inputType === 'deleteContentForward') end = Math.min(node.value.length, end + 1);
  const text = inputType.startsWith('delete') ? '' : data;
  node.value = node.value.slice(0, start) + text + node.value.slice(end); node.setSelectionRange(start + text.length);
  node.dispatchEvent(Object.assign(new Event('input'), { inputType, data }));
 };
 node.dispatchEvent(new Event('focus'));
 return { node, control, send, get value() { return value; } };
}
function withFields(run) {
 const original = globalThis.MutationObserver; globalThis.MutationObserver = class { observe() {} disconnect() {} };
 try { run(); } finally { globalThis.MutationObserver = original; }
}
test('typing integer digits keeps reais and inserts grouping while preserving the caret before cents', () => withFields(() => {
 const f = field();
 for (const [digit, expected] of [['3','3,00'],['0','30,00'],['0','300,00'],['0','3.000,00'],['0','30.000,00']]) {
  f.send('insertText', digit); assert.equal(f.node.value, expected); assert.equal(f.node.selectionStart, expected.indexOf(','));
 }
 assert.equal(f.value, 30000); f.control.destroy();
}));
test('comma or dot enters cents, replaces displayed zeros and prevents a third typed decimal', () => withFields(() => {
 const f=field();f.send('insertText','3');f.send('insertText',',');f.send('insertText','5');
 assert.equal(f.node.value,'3,50');assert.equal(f.value,3.5);
 f.send('insertText','6');assert.equal(f.node.value,'3,56');assert.equal(f.value,3.56);
 f.send('insertText','7');assert.equal(f.node.value,'3,56');
 f.node.select();f.send('insertText','0');f.send('insertText','.');f.send('insertText','0');f.send('insertText','1');
 assert.equal(f.node.value,'0,01');assert.equal(f.value,.01);f.control.destroy();
}));
test('edits and deletion around grouping do not rescale reais into cents', () => withFields(() => {
 const f=field(1234.56);f.node.setSelectionRange(3);f.send('insertText','9');
 assert.equal(f.node.value,'12.934,56');assert.equal(f.value,12934.56);assert.equal(f.node.selectionStart,4);
 f.node.select();f.send('insertFromPaste','3.000,00');f.node.setSelectionRange(1);f.send('deleteContentForward');assert.equal(f.node.value,'300,00');
 f.node.select();f.send('insertFromPaste','3.000,00');f.node.setSelectionRange(2);f.send('deleteContentBackward');assert.equal(f.node.value,'0,00');
 f.node.select();f.send('deleteContentBackward');assert.equal(f.node.value,'');assert.equal(f.value,'');f.control.destroy();
}));
test('pasted BRL, negatives and decimal-dot values format immediately; malformed precision remains invalid', () => withFields(() => {
 const f=field();
 for (const [text, expected, amount] of [['R$ 3.400,50','3.400,50',3400.5],['3400.50','3.400,50',3400.5],['-12,34','-12,34',-12.34]]) {
  f.node.select();f.send('insertFromPaste',text);assert.equal(f.node.value,expected);assert.equal(f.value,amount);
 }
 for (const text of ['1,234','1.23,45']) {f.node.select();f.send('insertFromPaste',text);assert.equal(f.node.value,text);assert.equal(f.value,'');assert.ok(f.node.error);}
 f.control.destroy();
}));

test('replacing a full value preserves decimal dots and malformed grouping; erasing the last real digit allows a fresh amount', () => withFields(() => {
 const f=field(3000);f.node.select();f.send('insertText','3400.50');assert.equal(f.node.value,'3.400,50');assert.equal(f.value,3400.5);
 f.node.select();f.send('insertText','1.23,45');assert.equal(f.node.value,'1.23,45');assert.ok(f.node.error);
 f.node.select();f.send('insertText','3');f.send('deleteContentBackward');assert.equal(f.node.value,'');
 f.send('insertText','5');assert.equal(f.node.value,'5,00');assert.equal(f.value,5);
 f.node.select();f.send('insertFromPaste','3.000,00');f.node.setSelectionRange(2);f.send('insertFromPaste','2');assert.equal(f.value,32000);
 f.control.destroy();
}));
test('composition text is committed and formatted after composition ends', () => withFields(() => {
 const f=field();f.node.value='30';f.node.setSelectionRange(2);
 f.node.dispatchEvent(Object.assign(new Event('input'),{isComposing:true}));assert.equal(f.value,0);assert.equal(f.node.value,'30');
 f.node.dispatchEvent(new Event('compositionend'));assert.equal(f.node.value,'30,00');assert.equal(f.value,30);f.control.destroy();
}));

test('undo and redo restore formatted text and numeric drafts without changing reais into cents', () => withFields(() => {
 const f=field();f.send('insertText','3');f.send('insertText','0');f.send('insertText','0');assert.equal(f.value,300);
 f.send('historyUndo');assert.equal(f.node.value,'30,00');assert.equal(f.value,30);
 f.send('historyRedo');assert.equal(f.node.value,'300,00');assert.equal(f.value,300);
 f.send('historyUndo');f.send('insertText','5');assert.equal(f.value,305);
 f.send('historyRedo');assert.equal(f.value,305,'a new edit replaces the redo branch');f.control.destroy();
}));

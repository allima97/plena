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

test('editing keeps a numeric model without resetting typing or invalid drafts', () => {
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
    assert.equal(node.value, '3400,5');
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

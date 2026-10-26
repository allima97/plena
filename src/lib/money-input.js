const formatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// BRL punctuation takes precedence: 3.400 is three thousand four hundred reais.
// A decimal dot is accepted only when it cannot be a Brazilian thousands group.
export function parseMoneyInput(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  let text = String(value).trim().replace(/^(-?)\s*R\$\s*/, '$1');
  if (!text) return null;
  let normalized;
  if (text.includes(',')) {
    if (!/^-?(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+),\d{0,2}$/.test(text) && !/^-?,\d{1,2}$/.test(text)) return NaN;
    normalized = text.replaceAll('.', '').replace(',', '.');
  } else if (/^-?[1-9]\d{0,2}(?:\.\d{3})+$/.test(text)) {
    normalized = text.replaceAll('.', '');
  } else if (/^-?\d+(?:\.\d{0,2})?$/.test(text)) {
    normalized = text;
  } else return NaN;
  const result = Number(normalized);
  return Number.isFinite(result) && Number.isSafeInteger(Math.round(result * 100)) ? result : NaN;
}

export function formatMoneyInput(value) {
  if (value == null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? formatter.format(number) : '';
}

export function moneyInputError(text, { required = false, disabled = false, min, max } = {}) {
  if (disabled) return '';
  const value = parseMoneyInput(text);
  if (value === null) return required ? 'Informe o valor.' : '';
  if (!Number.isFinite(value)) return 'Informe um valor válido, como 3.400,50, com até duas casas decimais.';
  if (min != null && min !== '' && value < Number(min)) return `Informe um valor a partir de ${formatMoneyInput(min)}.`;
  if (max != null && max !== '' && value > Number(max)) return `Informe um valor até ${formatMoneyInput(max)}.`;
  return '';
}

const controllers = new WeakMap();

// Keeps a numeric model while displaying BRL immediately. Integer digits remain
// reais (3 -> 3,00); typing a decimal separator moves editing into the cents.
export function moneyInput(node, options = {}) {
  let config = options;
  let lastValue = config.value;
  let edit = null;
  let pointerFocus = false;
  let selectOnPointerUp = false;
  let restoring = false;
  let history = [];
  let historyIndex = -1;
  node.dataset.money = '';
  node.value = formatMoneyInput(lastValue);
  const selection = () => ({ start: node.selectionStart ?? node.value.length, end: node.selectionEnd ?? node.value.length });
  function select(start, end = start) { node.setSelectionRange?.(start, end); }
  function validate() {
    const error = moneyInputError(node.value, {
      required: node.required, disabled: node.disabled,
      min: node.getAttribute('min'), max: node.getAttribute('max')
    });
    node.setCustomValidity(error);
    return !error;
  }
  function recordHistory() {
    if (history[historyIndex]?.text === node.value) return;
    history.splice(historyIndex + 1);
    history.push({ text: node.value, value: lastValue, ...selection() });
    if (history.length > 200) history.shift();
    historyIndex = history.length - 1;
  }
  function restoreHistory(direction) {
    const nextIndex = historyIndex + direction;
    if (nextIndex < 0 || nextIndex >= history.length) return;
    historyIndex = nextIndex;
    const state = history[historyIndex];
    node.value = state.text;
    lastValue = state.value;
    edit = null;
    select(state.start, state.end);
    config.setValue?.(lastValue);
    validate();
    // Dynamic native forms also listen for the input event to update drafts.
    restoring = true;
    try { node.dispatchEvent(new Event('input', { bubbles: true })); }
    finally { restoring = false; }
  }
  function keyDown(event) {
    if (event.isComposing || event.altKey || (!event.ctrlKey && !event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y') {
      event.preventDefault();
      restoreHistory(key === 'y' || event.shiftKey ? 1 : -1);
    }
  }
  function beforeInput(event) {
    if (event.isComposing) return;
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      event.preventDefault();
      restoreHistory(event.inputType === 'historyUndo' ? -1 : 1);
      return;
    }
    const { start, end } = selection();
    if (history[historyIndex]) { history[historyIndex].start = start; history[historyIndex].end = end; }
    const comma = node.value.indexOf(',');
    edit = { value: node.value, start, end, canonical: node.value === formatMoneyInput(parseMoneyInput(node.value)) };
    if (event.inputType === 'insertText' && [',', '.'].includes(event.data) && comma >= 0) {
      event.preventDefault();
      select(comma + 1, comma + 2);
      return;
    }
    if (event.inputType === 'insertText' && /^\d$/.test(event.data ?? '') && comma >= 0 && start === end) {
      const integer = node.value.slice(0, comma);
      const zero = integer.startsWith('-') ? 1 : 0;
      if (integer.replace('-', '') === '0' && start >= zero && start <= zero + 1) select(zero, zero + 1);
    }
    if (event.inputType === 'insertText' && /^\d$/.test(event.data ?? '') && comma >= 0 && start > comma && start === end) {
      // Replace a displayed cent digit rather than inserting a third decimal.
      if (start >= comma + 3) event.preventDefault();
      else select(start, Math.min(start + 1, node.value.length));
    }
    if (start === end && event.inputType === 'deleteContentBackward') {
      if (node.value[start - 1] === '.' || node.value[start - 1] === ',') select(start - 1);
    }
    if (start === end && event.inputType === 'deleteContentForward') {
      if (node.value[start] === '.' || node.value[start] === ',') select(start + 1);
    }
  }
  function caretPosition(raw, position, formatted) {
    let separator = raw.indexOf(',');
    if (separator < 0 && raw.includes('.') && !/^-?[1-9]\d{0,2}(?:\.\d{3})+$/.test(raw)) separator = raw.lastIndexOf('.');
    const comma = formatted.indexOf(',');
    if (separator >= 0 && position > separator) {
      const digits = (raw.slice(separator + 1, position).match(/\d/g) || []).length;
      return Math.min(formatted.length, comma + 1 + digits);
    }
    const digits = (raw.slice(0, position).match(/\d/g) || []).length;
    if (!digits) return formatted.startsWith('-') && position > 0 ? 1 : 0;
    let count = 0;
    for (let i = 0; i < comma; i++) if (/\d/.test(formatted[i]) && ++count === digits) return i + 1;
    return comma;
  }
  function input(event) {
    if (restoring || event?.isComposing) return;
    let raw = node.value;
    const { start, end } = selection();
    // Group separators inserted by the mask may temporarily have the wrong
    // grouping during native edits. Pasted text still uses strict validation.
    const singleKey = event?.inputType === 'insertText' && event.data?.length === 1;
    const deleting = event?.inputType?.startsWith('delete');
    const partialPaste = event?.inputType === 'insertFromPaste' && edit && (edit.start > 0 || edit.end < edit.value.length) && /^\d+$/.test(raw.slice(edit.start, raw.length - (edit.value.length - edit.end)));
    const normalizeGroups = edit?.canonical && edit.value.includes(',') && raw.includes(',') && (singleKey || deleting || partialPaste);
    let draft = normalizeGroups ? raw.replaceAll('.', '') : raw;
    if (deleting && /^-?,0{0,2}$/.test(draft)) {
      draft = draft.startsWith('-') ? '-' : '';
      raw = draft;
      node.value = draft;
    }
    const parsed = parseMoneyInput(draft);
    lastValue = parsed === null || !Number.isFinite(parsed) ? '' : parsed;
    if (parsed === null || Number.isFinite(parsed)) {
      const formatted = formatMoneyInput(lastValue);
      node.value = formatted;
      if (formatted) select(caretPosition(raw, start, formatted), caretPosition(raw, end, formatted));
    }
    edit = null;
    config.setValue?.(lastValue);
    validate();
    recordHistory();
  }
  function blur() {
    edit = null;
    input();
    selectOnPointerUp = false;
  }
  function focus() {
    const zero = parseMoneyInput(node.value) === 0;
    if (!pointerFocus || zero) node.select?.();
    selectOnPointerUp = pointerFocus && zero;
    pointerFocus = false;
  }
  function pointerDown() { pointerFocus = node.ownerDocument?.activeElement !== node; }
  function pointerUp() { if (selectOnPointerUp) { node.select?.(); selectOnPointerUp = false; } }
  function compositionEnd() { input(); }
  recordHistory();
  const listeners = { keydown: keyDown, beforeinput: beforeInput, input, blur, focus, pointerdown: pointerDown, pointerup: pointerUp, compositionend: compositionEnd };
  for (const [event, handler] of Object.entries(listeners)) node.addEventListener(event, handler);
  const observer = new MutationObserver(validate);
  observer.observe(node, { attributes: true, attributeFilter: ['min', 'max', 'required', 'disabled'] });
  validate();
  const controller = {
    validate,
    update(next) {
      config = next;
      if (!Object.is(next.value, lastValue)) {
        lastValue = next.value;
        node.value = formatMoneyInput(lastValue);
        history = []; historyIndex = -1; recordHistory();
      }
      validate();
    },
    destroy() {
      observer.disconnect();
      for (const [event, handler] of Object.entries(listeners)) node.removeEventListener(event, handler);
      controllers.delete(node);
    }
  };
  controllers.set(node, controller);
  return controller;
}

export function validateMoneyInputs(root) {
  for (const input of root.querySelectorAll('input[data-money]')) {
    // Revalidate dynamic limits even if their mutation observer hasn't run yet.
    controllers.get(input)?.validate();
    if (!input.reportValidity()) return false;
  }
  return true;
}

// Native NextGoals renders HTML dynamically instead of using Svelte actions.
export function installMoneyInputs(root = document) {
  function mount(node) {
    if (!controllers.has(node)) moneyInput(node, { value: parseMoneyInput(node.value) });
  }
  function scan(node) {
    if (node.matches?.('input[data-money]')) mount(node);
    node.querySelectorAll?.('input[data-money]').forEach(mount);
  }
  scan(root);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(scan);
      for (const removed of record.removedNodes) {
        if (removed.isConnected) continue;
        if (removed.matches?.('input[data-money]')) controllers.get(removed)?.destroy();
        removed.querySelectorAll?.('input[data-money]').forEach(input => controllers.get(input)?.destroy());
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener('focus', event => {
    if (event.target.matches?.('input[data-money]')) mount(event.target);
  }, true);
  return observer;
}

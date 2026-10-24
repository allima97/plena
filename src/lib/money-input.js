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

// Keeps the original input element/styles/focus and a numeric value in the model.
// Formatting on blur avoids moving the caret while editing or pasting cents.
export function moneyInput(node, options = {}) {
  let config = options;
  let lastValue = config.value;
  node.dataset.money = '';
  node.value = formatMoneyInput(lastValue);
  function validate() {
    const error = moneyInputError(node.value, {
      required: node.required, disabled: node.disabled,
      min: node.getAttribute('min'), max: node.getAttribute('max')
    });
    node.setCustomValidity(error);
    return !error;
  }
  function input() {
    const parsed = parseMoneyInput(node.value);
    lastValue = parsed === null || !Number.isFinite(parsed) ? '' : parsed;
    config.setValue?.(lastValue);
    validate();
  }
  function blur() {
    input();
    if (validate()) node.value = formatMoneyInput(lastValue);
  }
  node.addEventListener('input', input);
  node.addEventListener('blur', blur);
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
      }
      validate();
    },
    destroy() {
      observer.disconnect();
      node.removeEventListener('input', input);
      node.removeEventListener('blur', blur);
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

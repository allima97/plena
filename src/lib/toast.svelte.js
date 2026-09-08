let toasts = $state([]);
let counter = 0;

export const toastState = {
	get items() {
		return toasts;
	}
};

/**
 * Mostra um toast simples, opcionalmente com uma ação (ex: "DESFAZER").
 * { message, actionLabel, onAction, duration }
 */
export function showToast({ message, actionLabel = null, onAction = null, duration = 5000 }) {
	const id = ++counter;
	const timer = setTimeout(() => dismissToast(id), duration);
	toasts = [...toasts, { id, message, actionLabel, onAction, timer }];
	return id;
}

export function dismissToast(id) {
	const found = toasts.find((t) => t.id === id);
	if (found?.timer) clearTimeout(found.timer);
	toasts = toasts.filter((t) => t.id !== id);
}

export function runToastAction(id) {
	const found = toasts.find((t) => t.id === id);
	if (found?.onAction) found.onAction();
	dismissToast(id);
}

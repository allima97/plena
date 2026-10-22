const identity = {
	name: 'Plena — Controle Financeiro Pessoal',
	short_name: 'Plena',
	description: 'Controle financeiro pessoal: contas, movimentações, categorias, relatórios e objetivos, sincronizado entre dispositivos.',
	id: '/',
	start_url: '/',
	scope: '/',
	display: 'standalone',
	orientation: 'portrait-primary',
	background_color: '#f6f7f3',
	theme_color: '#17212b',
	lang: 'pt-BR'
};

function iconsFor(platform, purpose, sizes) {
	return sizes.map((size) => ({
		src: `/icons/pwa-${platform}-${size}-v2.png`,
		sizes: `${size}x${size}`,
		type: 'image/png',
		purpose
	}));
}

// A stable id/start_url keeps existing installations attached to the same app.
// Each platform gets artwork prepared for the mask its OS applies.
export function pwaManifest(userAgent = '') {
	const windows = iconsFor('windows', 'any', [192, 512]);
	let icons;
	// iOS identifies itself as "like Mac OS X", so check it before macOS.
	if (/iPad|iPhone|iPod/i.test(userAgent)) {
		icons = iconsFor('ios', 'any', [192, 512, 1024]);
	} else if (/Android/i.test(userAgent)) {
		icons = [
			...iconsFor('android', 'any', [192, 512]),
			...iconsFor('android', 'maskable', [192, 512, 1024])
		];
	} else if (/Macintosh|Mac OS X/i.test(userAgent)) {
		icons = [
			...iconsFor('macos', 'any', [192, 512]),
			...iconsFor('macos', 'maskable', [512, 1024])
		];
	} else if (/Windows/i.test(userAgent)) {
		icons = windows;
	} else {
		icons = [...windows, ...iconsFor('android', 'maskable', [192, 512, 1024])];
	}
	return { ...identity, icons };
}

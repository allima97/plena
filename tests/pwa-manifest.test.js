import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pwaManifest } from '../src/lib/pwa-manifest.js';

const agents = {
	macos: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15',
	windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36',
	android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/148.0.0.0 Mobile Safari/537.36',
	ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
};

test('platform variants preserve the installed app identity and launch URL', () => {
	for (const ua of ['', ...Object.values(agents)]) {
		const manifest = pwaManifest(ua);
		assert.equal(manifest.id, '/');
		assert.equal(manifest.start_url, '/');
		assert.equal(manifest.scope, '/');
		assert.equal(manifest.display, 'standalone');
		assert.ok(manifest.icons.some(icon => icon.purpose === 'any' && icon.sizes === '192x192'));
		assert.ok(manifest.icons.some(icon => icon.purpose === 'any' && icon.sizes === '512x512'));
	}
});

test('macOS gets high resolution maskable artwork and iOS is not mistaken for macOS', () => {
	const mac = pwaManifest(agents.macos);
	assert.ok(mac.icons.every(icon => icon.src.includes('pwa-macos-')));
	assert.ok(mac.icons.some(icon => icon.purpose === 'maskable' && icon.sizes === '1024x1024'));
	for (const device of ['iPhone', 'iPad', 'iPod']) {
		const ios = pwaManifest(agents.ios.replaceAll('iPhone', device));
		assert.ok(ios.icons.every(icon => icon.src.includes('pwa-ios-')));
	}
});

test('Windows has its desktop icon and Android has an adaptive alternative', () => {
	const windows = pwaManifest(agents.windows);
	assert.ok(windows.icons.every(icon => icon.purpose === 'any' && icon.src.includes('pwa-windows-')));
	const android = pwaManifest(agents.android);
	assert.ok(android.icons.every(icon => icon.src.includes('pwa-android-')));
	assert.ok(android.icons.some(icon => icon.purpose === 'maskable' && icon.src.includes('pwa-android-')));
});

test('every advertised icon exists as a PNG with the declared dimensions', () => {
	for (const ua of ['', ...Object.values(agents)]) {
		for (const icon of pwaManifest(ua).icons) {
			const png = readFileSync(new URL(`../static${icon.src}`, import.meta.url));
			assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
			assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
		}
	}
});

import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			// Plena is its own independent app/deploy (not mounted under nextgoals
			// anymore) — builds to ./build, served at the domain root.
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				fallback: undefined,
				strict: true
			})
		})
	]
});

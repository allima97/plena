import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
      csp: { mode:'auto', directives: {
        'default-src':['self'], 'script-src':['self'],
        'style-src':['self','unsafe-inline','https://fonts.googleapis.com'],
        'font-src':['self','https://fonts.gstatic.com','data:'],
        'img-src':['self','data:','blob:'], 'connect-src':['self'],
        'object-src':['none'], 'base-uri':['self'], 'form-action':['self'], 'frame-ancestors':['none']
      } },
			alias: {
				'$lib': './src/lib'
			},
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			// Plena is deployed as its own Cloudflare Worker (same pattern as
			// nextgoals: Worker + static assets, D1 later for /api/plena/state).
			adapter: adapter()
		})
	]
});

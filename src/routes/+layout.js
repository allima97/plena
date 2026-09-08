// This is a static build (adapter-static) with a single route: all the
// actual data lives in the signed-in user's browser/D1 via runtime fetch
// calls (see src/lib/persist.js), never at build time, so there's nothing
// for SvelteKit to server-render — ssr:false keeps this a pure client app.
export const prerender = true;
export const ssr = false;

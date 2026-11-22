// The SvelteKit handler adapter-cloudflare writes at build time. wrangler.jsonc aliases
// this name to .svelte-kit/cloudflare/_worker.js.
declare module 'sveltekit-worker' {
	const handler: { fetch: ExportedHandlerFetchHandler<Env> };
	export default handler;
}

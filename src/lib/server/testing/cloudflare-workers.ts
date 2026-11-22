// Stands in for the runtime's `cloudflare:workers` module under Vitest (see vite.config.ts).
export const env: Record<string, unknown> = {};

export class DurableObject<E = unknown> {
	constructor(
		protected ctx: DurableObjectState,
		protected env: E
	) {}
}

import { env } from './cloudflare-workers';

// Replaces the bindings getEnv() returns for the rest of the test.
export function useTestEnv(fake: object): void {
	for (const key of Object.keys(env)) delete env[key];
	Object.assign(env, fake);
}

import { defineConfig } from '@playwright/test';
import { baseURL } from './tests/e2e/fixtures.ts';

// End-to-end tests against the built Worker under `wrangler dev` (tests/e2e/serve.ts).
// One worker: the tests share one server and one database, in order.
export default defineConfig({
	testDir: 'tests/e2e',
	workers: 1,
	// Generous, for a busy machine: a socket has taken 5 s to open under memory pressure.
	timeout: 60_000,
	expect: { timeout: 10_000 },
	use: { baseURL },
	webServer: {
		command: 'node tests/e2e/serve.ts',
		url: baseURL,
		timeout: 120_000,
		stdout: 'pipe'
	}
});

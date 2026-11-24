import { defineConfig } from '@playwright/test';
import { baseURL } from './tests/e2e/fixtures.ts';

// How long a keystroke takes on a long note (tests/perf/typing.spec.ts), against the built
// Worker under `wrangler dev` (tests/e2e/serve.ts), as playwright.config.ts runs the e2e specs.
export default defineConfig({
	testDir: 'tests/perf',
	workers: 1,
	timeout: 480_000,
	reporter: 'list',
	use: { baseURL },
	webServer: {
		command: 'node tests/e2e/serve.ts',
		url: baseURL,
		timeout: 120_000,
		stdout: 'pipe'
	}
});

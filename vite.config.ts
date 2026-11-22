import adapter from '@sveltejs/adapter-cloudflare';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'node:path';
import fs from 'node:fs';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

// wrangler.jsonc's `main` is src/worker.ts, which wraps SvelteKit's handler. The adapter
// writes its handler to whatever `main` it reads, so it gets a build-only config pointing
// it at .svelte-kit/cloudflare/_worker.js. Dev bindings still come from wrangler.jsonc.
const adapterConfig = '.svelte-kit/adapter-wrangler.json';
fs.mkdirSync('.svelte-kit', { recursive: true });
fs.writeFileSync(
	adapterConfig,
	JSON.stringify({
		main: './cloudflare/_worker.js',
		assets: { binding: 'ASSETS', directory: './cloudflare' }
	})
);

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
	// Under Vitest there is no Workers runtime; getEnv() reads a stub the tests fill, and the
	// thumbnail renderer's wasm and fonts, which wrangler's module rules load, are read from disk.
	resolve: process.env.VITEST
		? {
				alias: {
					'cloudflare:workers': path.resolve('src/lib/server/testing/cloudflare-workers.ts'),
					'./thumbnail-files': path.resolve('src/lib/server/testing/thumbnail-files.ts')
				}
			}
		: {},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Vitest starts one Vite server per project in parallel, and
			// adapter-cloudflare 8.0.0's platform emulation races: each server
			// spawns a Miniflare and only the last is disposed, so the run hangs
			// 10s on exit. Tests don't use the emulated platform, so skip the
			// adapter under Vitest until the race is fixed upstream.
			adapter: process.env.VITEST
				? undefined
				: adapter({ config: adapterConfig, platformProxy: { configPath: 'wrangler.jsonc' } })
		})
	],
	test: {
		expect: {
			requireAssertions: true
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [
							{
								browser: 'chromium',
								headless: true
							}
						]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.test.ts'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				extends: true,
				plugins: [
					// The plugin will run tests for the stories defined in your Storybook config
					// See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
					storybookTest({
						configDir: path.join(import.meta.dirname, '.storybook')
					})
				],
				test: {
					name: 'storybook',
					browser: {
						enabled: true,
						headless: true,
						provider: playwright({}),
						instances: [
							{
								browser: 'chromium'
							}
						]
					}
				}
			}
		]
	}
});

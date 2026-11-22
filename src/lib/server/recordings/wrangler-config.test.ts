import { describe, expect, it } from 'vitest';

async function config(env: string | undefined) {
	const { unstable_readConfig } = await import('wrangler');
	return unstable_readConfig({ config: 'wrangler.jsonc', env }, { hideWarnings: true });
}

describe('wrangler.jsonc', () => {
	it.each([undefined, 'staging', 'test'])(
		'records request URLs without their query string, so no sink token is logged (env %s)',
		async (env) => {
			expect((await config(env)).observability).toMatchObject({
				enabled: true,
				redact_query_string: true
			});
		}
	);

	it.each([undefined, 'staging', 'test'])('deploys the recording sink (env %s)', async (env) => {
		const { durable_objects, migrations } = await config(env);

		expect(durable_objects.bindings).toContainEqual({
			name: 'RECORDING_SINK',
			class_name: 'RecordingSink'
		});
		expect(migrations).toContainEqual({
			tag: 'v2-recording-sink',
			new_sqlite_classes: ['RecordingSink']
		});
	});
});

// The Worker entry: SvelteKit serves fetch; queues, crons and Durable Objects live beside it.
import sveltekit from 'sveltekit-worker';
import { consumeJobs, runCron } from './lib/server/jobs';
import type { JobMessage } from './lib/server/events';
import { connectRealtime, isRealtimePath } from './lib/server/realtime/connect';
import { connectRecordingSink, isRecordingSinkPath } from './lib/server/recordings/sink';

export { RealtimeHub } from './lib/server/realtime/hub';
export { RecordingSink } from './lib/server/recordings/sink';

export default {
	async fetch(request, env, ctx) {
		const { pathname } = new URL(request.url);
		if (isRealtimePath(pathname)) return connectRealtime(request, env);
		if (isRecordingSinkPath(pathname)) return connectRecordingSink(request, env);
		return sveltekit.fetch(request, env, ctx);
	},
	async queue(batch, env) {
		await consumeJobs(batch, env);
	},
	async scheduled(controller, env) {
		await runCron(controller, env);
	}
} satisfies ExportedHandler<Env, JobMessage>;

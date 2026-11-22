import { db, schema } from '../db';
import { newId } from '../id';
import type { JobMessage } from '../events';
import { notificationHandlers, type Handlers } from '../notifications/handlers';
import { callHandlers } from '../calls/invitations';
import { settleRecordedCalls } from '../calls/calls';
import { joinRequestHandlers } from '../join-requests';
import { sendDigests } from '../notifications/digests';
import { emailUnread } from '../notifications/email';
import { deliverFollowUps } from '../follow-ups';
import { recordingHandlers } from '../recordings/transcripts';
import { failStuckRecordings, stopOverdueRecordings } from '../recordings/health';
import { clearExpiredStatuses } from '../people/status';
import { thumbnailHandlers } from '../notes/thumbnails';
import { renderNoteThumbnails } from '../notes/thumbnail';

type JobHandler = (env: Env, message: JobMessage) => Promise<void>;

// One handler per event kind. A kind with no handler is acked and logged as "unhandled",
// so emitting ahead of the consumer is safe.
export const handlers: Handlers = {
	...notificationHandlers,
	...callHandlers,
	...recordingHandlers,
	...joinRequestHandlers,
	...thumbnailHandlers(renderNoteThumbnails)
};

export async function consumeJobs(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
	for (const message of batch.messages) {
		const job = message.body;
		// Handlers is keyed by kind, so this handler takes this job; TypeScript can't relate the two.
		const handler = handlers[job.kind] as JobHandler | undefined;
		let status: 'done' | 'unhandled' | 'failed' = handler ? 'done' : 'unhandled';
		let error: string | null = null;
		try {
			await handler?.(env, job);
			message.ack();
		} catch (cause) {
			status = 'failed';
			error = cause instanceof Error ? cause.message : String(cause);
			message.retry();
		}
		await db(env)
			.insert(schema.jobLog)
			.values({
				id: newId(),
				kind: job.kind,
				payload: JSON.stringify(job),
				status,
				error,
				createdAt: Date.now()
			});
	}
}

// Cron entry points, by the schedule in wrangler.jsonc.
export const crons: Record<string, (env: Env, scheduledTime: number) => Promise<void>> = {
	'*/5 * * * *': everyFiveMinutes,
	'0 * * * *': hourly
};

/** Reminders, unread email, expired statuses and recorded calls nobody is left in are independent:
 * one failing doesn't hold the others back. */
async function everyFiveMinutes(env: Env, scheduledTime: number): Promise<void> {
	await settleAll('*/5', [
		deliverFollowUps(env, scheduledTime),
		emailUnread(env, scheduledTime),
		clearExpiredStatuses(env, scheduledTime),
		settleRecordedCalls(env, scheduledTime)
	]);
}

/** Digests and the recordings checks are independent too. */
async function hourly(env: Env, scheduledTime: number): Promise<void> {
	await settleAll('0 *', [
		sendDigests(env, scheduledTime),
		stopOverdueRecordings(env, scheduledTime),
		failStuckRecordings(env, scheduledTime)
	]);
}

/** Waits for every job, then throws once with each one that failed. */
async function settleAll(cron: string, jobs: Promise<void>[]): Promise<void> {
	const results = await Promise.allSettled(jobs);
	const failures = results.flatMap((r) => (r.status === 'rejected' ? [String(r.reason)] : []));
	if (failures.length) throw new Error(`cron ${cron}: ${failures.join('; ')}`);
}

export async function runCron(controller: ScheduledController, env: Env): Promise<void> {
	const cron = crons[controller.cron];
	if (!cron) throw new Error(`scheduled: no handler for cron "${controller.cron}"`);
	await cron(env, controller.scheduledTime);
	await db(env)
		.insert(schema.jobLog)
		.values({
			id: newId(),
			kind: `cron:${controller.cron}`,
			payload: JSON.stringify({ scheduledTime: controller.scheduledTime }),
			status: 'done',
			error: null,
			createdAt: Date.now()
		});
}

import { describe, expect, it, vi } from 'vitest';
import { runCron } from '../jobs';
import { notificationWorld } from './testing/world';

const minute = 60 * 1000;

function cron(env: Env, schedule: '*/5 * * * *' | '0 * * * *', scheduledTime: number) {
	return runCron({ cron: schedule, scheduledTime } as ScheduledController, env);
}

function notification(
	w: ReturnType<typeof notificationWorld>,
	id: string,
	userId: string,
	kind: string,
	createdAt: number,
	{ readAt = null as number | null, itemKey = `item:${id}`, preview = null as string | null } = {}
) {
	w.sqlite
		.prepare(
			"INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, source, created_at, read_at, preview) VALUES (?, ?, 'ada', ?, ?, '/posts/p1', ?, ?, ?, ?)"
		)
		.run(id, userId, kind, itemKey, `src:${id}`, createdAt, readAt, preview);
}

function mail(w: ReturnType<typeof notificationWorld>) {
	return w.sqlite
		.prepare('SELECT to_address, subject, text_body, html_body FROM dev_mail ORDER BY created_at')
		.all() as { to_address: string; subject: string; text_body: string; html_body: string }[];
}

describe('unread notification emails', () => {
	const now = Date.UTC(2026, 10, 18, 12, 0);

	it('emails a mention or message still unread after 10 minutes, once', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		notification(w, 'n1', 'bo', 'mention', now - 11 * minute);
		notification(w, 'n2', 'bo', 'message', now - 12 * minute);
		await cron(w.env, '*/5 * * * *', now);
		await cron(w.env, '*/5 * * * *', now + 5 * minute);
		const sent = mail(w);
		expect(sent).toHaveLength(1);
		expect(sent[0].to_address).toBe('bo@example.com');
		expect(sent[0].subject).toBe('You have 2 unread notifications');
		expect(sent[0].text_body).toContain('- ada mentioned you\n  https://campfire.test/posts/p1');
		expect(sent[0].text_body).toContain('ada sent you a message');
		expect(sent[0].text_body).toMatchSnapshot('text');
		expect(sent[0].html_body).toMatchSnapshot('html');
	});

	it('quotes the stored preview under the sentence', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		notification(w, 'n1', 'bo', 'mention', now - 11 * minute, { preview: 'Ada: see the plan' });
		await cron(w.env, '*/5 * * * *', now);
		expect(mail(w)[0].text_body).toContain('- ada mentioned you: “Ada: see the plan”\n');
	});

	it('waits until a notification is 10 minutes old, and skips it once read', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		notification(w, 'young', 'bo', 'mention', now - 5 * minute);
		notification(w, 'read', 'bo', 'mention', now - 20 * minute, { readAt: now - 15 * minute });
		await cron(w.env, '*/5 * * * *', now);
		expect(mail(w)).toEqual([]);
	});

	it('emails only the kinds the person gets by email', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		notification(w, 'n1', 'bo', 'comment', now - 11 * minute);
		await cron(w.env, '*/5 * * * *', now);
		expect(mail(w), 'comments are not emailed by default').toEqual([]);
		w.sqlite
			.prepare(
				"INSERT INTO notification_settings VALUES ('bo', '[\"comment\"]', '[]', 0, 9, 0, 5, 17, NULL, NULL)"
			)
			.run();
		notification(w, 'n2', 'bo', 'comment', now - 11 * minute);
		await cron(w.env, '*/5 * * * *', now);
		expect(mail(w)).toEqual([
			expect.objectContaining({ subject: 'You have 1 unread notification' })
		]);
	});

	it('says a comment on a note is about a note, and one on a post about the post', async () => {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.sqlite
			.prepare(
				"INSERT INTO notification_settings VALUES ('bo', '[\"comment\"]', '[]', 0, 9, 0, 5, 17, NULL, NULL)"
			)
			.run();
		notification(w, 'n1', 'bo', 'comment', now - 11 * minute, { itemKey: 'note:x1' });
		notification(w, 'n2', 'bo', 'comment', now - 12 * minute, { itemKey: 'post:p1' });
		await cron(w.env, '*/5 * * * *', now);
		const [sent] = mail(w);
		expect(sent.text_body, 'the note comment').toContain('- ada commented on a doc\n');
		expect(sent.text_body, 'the post comment').toContain(
			'- ada commented on a thread you follow\n'
		);
	});
});

describe('unread notification emails through Cloudflare', () => {
	const now = Date.UTC(2026, 10, 18, 12, 0);

	/** Bo has one old unread mention; the EMAIL binding is `send`. */
	function cloudflareWorld(send: (message: unknown) => Promise<unknown>) {
		const w = notificationWorld();
		Object.assign(w.env, { EMAIL_TRANSPORT: 'cloudflare', EMAIL: { send } });
		w.person('ada');
		w.person('bo');
		notification(w, 'n1', 'bo', 'mention', now - 11 * minute);
		return w;
	}
	const emailedAt = (w: ReturnType<typeof notificationWorld>) =>
		w.sqlite.prepare('SELECT emailed_at FROM notifications').all();
	const refusedWith = (code: string) => async () => {
		throw Object.assign(new Error(code), { code });
	};

	it('carries a List-Unsubscribe header pointing at the notification settings', async () => {
		const send = vi.fn(async () => ({ messageId: 'm1' }));
		await cron(cloudflareWorld(send).env, '*/5 * * * *', now);
		expect(send).toHaveBeenCalledWith(
			expect.objectContaining({
				to: 'bo@example.com',
				headers: { 'List-Unsubscribe': '<https://campfire.test/settings/notifications>' }
			})
		);
	});

	it('gives up on a recipient Cloudflare refuses for good, so it is not tried every 5 minutes', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const send = vi.fn(refusedWith('E_RECIPIENT_SUPPRESSED'));
		const w = cloudflareWorld(send);
		await cron(w.env, '*/5 * * * *', now);
		await cron(w.env, '*/5 * * * *', now + 5 * minute);
		expect(send).toHaveBeenCalledTimes(1);
		expect(emailedAt(w)).toEqual([{ emailed_at: now }]);
		vi.restoreAllMocks();
	});

	it('leaves a notification unsent when Cloudflare is only busy, and tries again at the next run', async () => {
		const send = vi.fn(refusedWith('E_RATE_LIMIT_EXCEEDED'));
		const w = cloudflareWorld(send);
		await expect(cron(w.env, '*/5 * * * *', now)).rejects.toThrow('E_RATE_LIMIT_EXCEEDED');
		expect(emailedAt(w)).toEqual([{ emailed_at: null }]);
		await expect(cron(w.env, '*/5 * * * *', now + 5 * minute)).rejects.toThrow();
		expect(send).toHaveBeenCalledTimes(2);
	});
});

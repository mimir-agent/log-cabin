import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCron } from '../jobs';
import { notificationWorld } from './testing/world';

afterEach(() => {
	vi.unstubAllGlobals();
});

const hour = 60 * 60 * 1000;
const day = 24 * hour;
// Friday 20 November 2026; Los Angeles is 8 hours behind UTC.
const friday = (hourUtc: number) => Date.UTC(2026, 10, 20, hourUtc, 0);
const hourly = (env: Env, scheduledTime: number) =>
	runCron({ cron: '0 * * * *', scheduledTime } as ScheduledController, env);

/** Ada and Bo in Trail; Eve in a private Ops project; Gus a guest in Trail and Ops. */
function digestWorld() {
	const w = notificationWorld();
	w.person('ada');
	w.person('bo', 'member', { timezone: 'America/Los_Angeles' });
	w.person('eve');
	w.person('gus', 'guest');
	w.project('trail', 'ada', { members: ['ada', 'bo', 'gus'] });
	w.project('ops', 'eve', { private: true, members: ['eve', 'gus'] });
	w.project('camp', 'ada');
	const post = (id: string, project: string, author: string, title: string, at: number) =>
		w.sqlite
			.prepare(
				"INSERT INTO posts (id, project_id, author_id, title, body, body_text, created_at, last_activity_at) VALUES (?, ?, ?, ?, '{}', '', ?, ?)"
			)
			.run(id, project, author, title, at, at);
	const comment = (id: string, postId: string, author: string, text: string, at: number) =>
		w.sqlite
			.prepare(
				"INSERT INTO comments (id, post_id, author_id, body, body_text, created_at) VALUES (?, ?, ?, '{}', ?, ?)"
			)
			.run(id, postId, author, text, at);
	const react = (commentId: string, userId: string) =>
		w.sqlite
			.prepare("INSERT INTO reactions VALUES (?, 'comment', ?, ?, '👍', 0)")
			.run(`r-${commentId}-${userId}`, commentId, userId);
	const mail = (to: string) =>
		w.sqlite
			.prepare(
				'SELECT subject, text_body AS text, html_body AS html FROM dev_mail WHERE to_address = ? ORDER BY created_at'
			)
			.all(`${to}@example.com`) as { subject: string; text: string; html: string }[];
	return { ...w, post, comment, react, mail };
}

/** Sends env's email to a stand-in for Resend that refuses the first, as when it limits the rate. */
function stubResendRefusingFirst(env: Env) {
	const sentTo: string[] = [];
	const fetch = vi.fn(async (_url: string, init: RequestInit) => {
		if (fetch.mock.calls.length === 1) return new Response('rate limited', { status: 429 });
		sentTo.push(...(JSON.parse(init.body as string) as { to: string[] }).to);
		return new Response('{}');
	});
	Object.assign(env, { EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_key' });
	vi.stubGlobal('fetch', fetch);
	return { fetch, sentTo };
}

describe('daily digest', () => {
	it('comes at 9:00 in the person’s time zone with the last day’s posts by others, and the top comment', async () => {
		const w = digestWorld();
		w.post('p1', 'trail', 'ada', 'Tent options', friday(17) - 3 * hour);
		w.post('p2', 'trail', 'bo', 'My own post', friday(17) - 2 * hour);
		w.post('p3', 'trail', 'ada', 'Last week', friday(17) - 2 * day);
		w.comment('c1', 'p1', 'eve', 'First!', friday(17) - 2 * hour);
		w.comment('c2', 'p1', 'ada', 'The green one\nis lighter.', friday(17) - hour);
		w.react('c2', 'bo');

		await hourly(w.env, friday(9)); // 01:00 in Los Angeles
		expect(w.mail('bo')).toEqual([]);
		await hourly(w.env, friday(17)); // 09:00 in Los Angeles
		const [mail, ...more] = w.mail('bo');
		expect(more).toEqual([]);
		expect(mail.subject).toBe('1 thread you may have missed');
		expect(mail.text).toContain(
			'ada started the thread “Tent options” in trail: “ada: The green one is lighter.”'
		);
		expect(mail.text).toContain('https://campfire.test/posts/p1');
		expect(mail.text).not.toContain('My own post');
		expect(mail.text).not.toContain('Last week');
		expect(mail.html).toContain('href="https://campfire.test/posts/p1"');
		expect(mail.text).toMatchSnapshot('text');
		expect(mail.html).toMatchSnapshot('html');
	});

	it('leaves out what a guest can’t see, and projects someone neither belongs to nor starred', async () => {
		const w = digestWorld();
		w.post('p1', 'trail', 'ada', 'Trail news', friday(9) - hour);
		w.post('p2', 'ops', 'eve', 'Ops secret', friday(9) - hour);
		w.post('p3', 'camp', 'ada', 'Camp news', friday(9) - hour);
		// Gus starred Camp, which a guest outside it can't see.
		w.sqlite.prepare("INSERT INTO project_favorites VALUES ('camp', 'gus', 0)").run();
		// Ops is private: Gus belongs to it, Ada doesn't, though she follows a post there.
		w.sqlite.prepare("INSERT INTO post_subscriptions VALUES ('p2', 'ada', 0)").run();

		await hourly(w.env, friday(9));
		const [gus, ...more] = w.mail('gus');
		expect(more).toEqual([]);
		expect(gus.subject).toBe('2 threads you may have missed');
		expect(gus.text).toContain('Trail news');
		expect(gus.text).toContain('Ops secret');
		expect(gus.text).not.toContain('Camp news');
		expect(w.mail('ada'), 'Ada can’t see Ops and wrote the rest').toEqual([]);
	});

	it('leaves out a private project’s posts for a guest outside it', async () => {
		const w = digestWorld();
		w.person('fay', 'guest');
		w.sqlite.prepare("INSERT INTO project_members VALUES ('trail', 'fay', 0)").run();
		// Fay follows a post in Ops, which she doesn't belong to.
		w.post('p1', 'trail', 'ada', 'Trail news', friday(9) - hour);
		w.post('p2', 'ops', 'eve', 'Ops secret', friday(9) - hour);
		w.sqlite.prepare("INSERT INTO post_subscriptions VALUES ('p2', 'fay', 0)").run();

		await hourly(w.env, friday(9));
		const [fay, ...more] = w.mail('fay');
		expect(more).toEqual([]);
		expect(fay.text).toContain('Trail news');
		expect(fay.text).not.toContain('Ops secret');
	});

	it('includes posts someone follows outside their projects, and projects they starred', async () => {
		const w = digestWorld();
		w.post('p1', 'camp', 'eve', 'Camp news', friday(9) - hour);
		w.post('p2', 'camp', 'ada', 'Followed post', friday(9) - hour);
		w.sqlite.prepare("INSERT INTO project_favorites VALUES ('camp', 'eve', 0)").run();
		w.sqlite.prepare("INSERT INTO post_subscriptions VALUES ('p2', 'eve', 0)").run();
		await hourly(w.env, friday(9));
		const [mail] = w.mail('eve');
		expect(mail.subject).toBe('1 thread you may have missed');
		expect(mail.text).toContain('Followed post');
	});

	it('goes out once when the cron runs twice in the hour, and not at all when turned off', async () => {
		const w = digestWorld();
		w.post('p1', 'trail', 'ada', 'Trail news', friday(9) - hour);
		await hourly(w.env, friday(9));
		await hourly(w.env, friday(9) + 60 * 1000);
		expect(w.mail('gus')).toHaveLength(1);

		w.sqlite
			.prepare(
				"INSERT INTO notification_settings (user_id, email_kinds, push_kinds, daily_digest, daily_digest_hour, weekly_digest, weekly_digest_weekday, weekly_digest_hour) VALUES ('gus', '[]', '[]', 0, 9, 0, 5, 17) ON CONFLICT (user_id) DO UPDATE SET daily_digest = 0"
			)
			.run();
		await hourly(w.env, friday(9) + day);
		expect(w.mail('gus')).toHaveLength(1);
	});
});

describe('weekly summary', () => {
	it('comes on Friday at 17:00 with the week’s posts, the person’s own too, and new projects', async () => {
		const w = digestWorld();
		w.post('p1', 'trail', 'ada', 'Tent options', friday(17) - 3 * day);
		w.post('p2', 'trail', 'ada', 'Too old', friday(17) - 8 * day);
		w.sqlite
			.prepare(
				"INSERT INTO projects (id, name, private, created_by, created_at) VALUES ('river', 'River', 0, 'eve', ?), ('vault', 'Vault', 1, 'eve', ?)"
			)
			.run(friday(17) - day, friday(17) - day);

		await hourly(w.env, friday(16));
		expect(w.mail('ada').filter((m) => m.subject.includes('weekly'))).toEqual([]);
		await hourly(w.env, friday(17));
		const weekly = w.mail('ada').filter((m) => m.subject === 'Log Cabin weekly summary');
		expect(weekly).toHaveLength(1);
		expect(weekly[0].text).toContain('ada started the thread “Tent options” in trail');
		expect(weekly[0].text).toContain(
			'River, created by eve\n  https://campfire.test/projects/river'
		);
		expect(weekly[0].text).not.toContain('Too old');
		expect(weekly[0].text).not.toContain('Vault');
		expect(weekly[0].text).toMatchSnapshot('text');
		expect(weekly[0].html).toMatchSnapshot('html');
	});

	it('follows the day and hour someone chose, and skips a week with nothing new', async () => {
		const w = digestWorld();
		// Weekly on Wednesday at 08:00, daily off.
		w.sqlite
			.prepare(
				"INSERT INTO notification_settings (user_id, email_kinds, push_kinds, daily_digest, daily_digest_hour, weekly_digest, weekly_digest_weekday, weekly_digest_hour) VALUES ('ada', '[]', '[]', 0, 9, 1, 3, 8)"
			)
			.run();
		const wednesday8 = friday(8) - 2 * day;
		await hourly(w.env, wednesday8);
		expect(w.mail('ada')).toEqual([]);
		w.post('p1', 'trail', 'bo', 'Trail news', wednesday8 + hour);
		await hourly(w.env, friday(17));
		expect(w.mail('ada')).toEqual([]);
		await hourly(w.env, wednesday8 + 7 * day);
		expect(w.mail('ada').map((m) => m.subject)).toEqual(['Log Cabin weekly summary']);
	});
});

describe('the hourly run', () => {
	it('mails everyone else and still checks recordings when the first digest fails to send', async () => {
		const w = digestWorld();
		w.post('p1', 'trail', 'eve', 'Trail news', friday(9) - hour);
		w.sqlite
			.prepare(
				"INSERT INTO calls (id, project_id, started_by, started_at) VALUES ('call', 'trail', 'ada', 0)"
			)
			.run();
		w.sqlite
			.prepare(
				"INSERT INTO call_recordings (id, call_id, started_by, started_at, stopped_at, status) VALUES ('stuck', 'call', 'ada', 0, 0, 'processing')"
			)
			.run();
		const { fetch, sentTo } = stubResendRefusingFirst(w.env);

		// Ada and Gus get the daily digest of Eve's post; one of them is refused.
		await expect(hourly(w.env, friday(9))).rejects.toThrow(/answered 429/);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(sentTo).toHaveLength(1);
		const recording = w.sqlite
			.prepare("SELECT status FROM call_recordings WHERE id = 'stuck'")
			.get() as { status: string };
		expect(recording.status).toBe('failed');
	});
});

describe('the day a digest comes', () => {
	/** Cy, in New York, follows Trail and gets the daily digest at `hourOfDay`. */
	function newYork(hourOfDay: number) {
		const w = digestWorld();
		w.person('cy', 'member', { timezone: 'America/New_York' });
		w.sqlite.prepare("INSERT INTO project_favorites VALUES ('trail', 'cy', 0)").run();
		w.sqlite
			.prepare(
				"INSERT INTO notification_settings (user_id, email_kinds, push_kinds, daily_digest, daily_digest_hour, weekly_digest, weekly_digest_weekday, weekly_digest_hour) VALUES ('cy', '[]', '[]', 1, ?, 0, 5, 17)"
			)
			.run(hourOfDay);
		return w;
	}

	it('comes once when the clocks go back and the chosen hour happens twice', async () => {
		// New York goes from 02:00 back to 01:00 on 1 November 2026.
		const w = newYork(1);
		w.post('p1', 'trail', 'ada', 'Trail news', Date.UTC(2026, 10, 1, 4));
		await hourly(w.env, Date.UTC(2026, 10, 1, 5)); // 01:00 EDT
		await hourly(w.env, Date.UTC(2026, 10, 1, 6)); // 01:00 EST
		expect(w.mail('cy')).toHaveLength(1);
	});

	it('comes at 03:00 when the clocks go forward past the chosen hour', async () => {
		// New York goes from 02:00 forward to 03:00 on 8 March 2026.
		const w = newYork(2);
		w.post('p1', 'trail', 'ada', 'Trail news', Date.UTC(2026, 2, 8, 5));
		await hourly(w.env, Date.UTC(2026, 2, 8, 6)); // 01:00 EST
		expect(w.mail('cy')).toEqual([]);
		await hourly(w.env, Date.UTC(2026, 2, 8, 7)); // 03:00 EDT
		await hourly(w.env, Date.UTC(2026, 2, 8, 8));
		expect(w.mail('cy')).toHaveLength(1);
	});

	it('comes once a day, though someone changes its hour or their time zone after it came', async () => {
		const w = digestWorld();
		w.post('p1', 'trail', 'eve', 'Trail news', friday(9) - hour);
		await hourly(w.env, friday(9));
		w.sqlite
			.prepare("UPDATE notification_settings SET daily_digest_hour = 10 WHERE user_id = 'ada'")
			.run();
		await hourly(w.env, friday(10));
		w.sqlite.prepare("UPDATE users SET timezone = 'America/Los_Angeles' WHERE id = 'ada'").run();
		await hourly(w.env, friday(18)); // 10:00 on Friday in Los Angeles
		expect(w.mail('ada')).toHaveLength(1);
	});

	it('comes once a week, though someone moves its day after it came', async () => {
		const w = digestWorld();
		w.post('p1', 'trail', 'eve', 'Trail news', friday(17) - day);
		await hourly(w.env, friday(17));
		w.sqlite
			.prepare("UPDATE notification_settings SET weekly_digest_weekday = 6 WHERE user_id = 'ada'")
			.run();
		await hourly(w.env, friday(17) + day);
		const weekly = w.mail('ada').filter((m) => m.subject === 'Log Cabin weekly summary');
		expect(weekly).toHaveLength(1);
	});

	it('goes out at the next run that day when its send failed', async () => {
		const w = digestWorld();
		w.post('p1', 'trail', 'eve', 'Trail news', friday(9) - hour);
		const { sentTo } = stubResendRefusingFirst(w.env);

		await expect(hourly(w.env, friday(9))).rejects.toThrow(/answered 429/);
		await hourly(w.env, friday(10));
		expect(sentTo.sort()).toEqual(['ada@example.com', 'gus@example.com']);
	});
});

describe('digests through Cloudflare', () => {
	it('carry a List-Unsubscribe header pointing at the notification settings', async () => {
		const w = digestWorld();
		w.post('p1', 'trail', 'ada', 'Tent options', friday(17) - 3 * hour);
		const send = vi.fn<(message: unknown) => Promise<{ messageId: string }>>(async () => ({
			messageId: 'm1'
		}));
		Object.assign(w.env, { EMAIL_TRANSPORT: 'cloudflare', EMAIL: { send } });

		await hourly(w.env, friday(17));

		const subjects = send.mock.calls.map(([message]) => (message as { subject: string }).subject);
		expect(subjects).toContain('1 thread you may have missed');
		expect(subjects).toContain('Log Cabin weekly summary');
		for (const [message] of send.mock.calls) {
			expect(message).toMatchObject({
				headers: { 'List-Unsubscribe': '<https://campfire.test/settings/notifications>' }
			});
		}
	});
});

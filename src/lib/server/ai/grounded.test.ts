import { describe, expect, it } from 'vitest';
import {
	CHECK_INSTRUCTIONS,
	CHECK_MODEL,
	groundedSummary,
	groundedTitle,
	SUMMARY_INSTRUCTIONS,
	SUMMARY_MODEL,
	type SourceUnit
} from './grounded';
import { releaseDay } from './fixtures/release-day';

type Bullet = { text?: string; cites?: unknown };
type ModelInput = { messages: { role: string; content: string }[]; response_format: unknown };

function answer(json: unknown) {
	return { choices: [{ message: { content: JSON.stringify(json) } }] };
}

/**
 * An AI binding whose summary model answers with the given bullets, and whose check model finds
 * every point supported except the ones in `unsupported`. It remembers what each was asked.
 */
function modelAnswering(bullets: Bullet[], unsupported: string[] = []) {
	const asked: ModelInput[] = [];
	const checked: ModelInput[] = [];
	const env = {
		AI: {
			run: async (model: string, input: ModelInput) => {
				if (model === CHECK_MODEL) {
					checked.push(input);
					const points = input.messages[1].content.matchAll(/^Point (\d+): (.*)$/gm);
					const verdicts = [...points].map(([, n, text]) => ({
						point: Number(n),
						supported: !unsupported.includes(text)
					}));
					return answer({ verdicts });
				}
				if (model !== SUMMARY_MODEL) throw new Error(`expected ${SUMMARY_MODEL}, got ${model}`);
				asked.push(input);
				return answer({ bullets });
			}
		}
	} as unknown as Env;
	return { env, asked, checked };
}

// The post and comment behind the invented summary in the first staging acceptance run.
const gearCosts: SourceUnit[] = [
	{ author: 'Avery Admin', kind: 'post', text: 'Gear costs zephyrquartz @Morgan' },
	{ author: 'Morgan Member', kind: 'comment 1', text: 'Looks good, I will price tents.' }
];

describe('groundedSummary', () => {
	it('keeps the bullets the check model finds their sentences back, and drops the rest', async () => {
		const { env, checked } = modelAnswering(
			[
				{ text: 'Morgan priced tents', cites: [1, 2] },
				{ text: 'Avery assigned gear costs', cites: [1] },
				{ text: 'Morgan will look at what tents cost', cites: [2] }
			],
			['Morgan priced tents', 'Avery assigned gear costs']
		);

		expect(await groundedSummary(env, gearCosts)).toEqual({
			bullets: [{ text: 'Morgan will look at what tents cost', cites: [2] }],
			sources: [
				{
					id: 2,
					author: 'Morgan Member',
					kind: 'comment 1',
					text: 'Looks good, I will price tents.'
				}
			]
		});
		expect(checked, 'every bullet should be checked in one call').toHaveLength(1);
		expect(checked[0].messages[0].content).toBe(CHECK_INSTRUCTIONS);
		expect(checked[0].messages[1].content).toBe(
			'Point 1: Morgan priced tents\nSentences:\n' +
				'[1] post, Avery Admin: Gear costs zephyrquartz @Morgan\n' +
				'[2] comment 1, Morgan Member: Looks good, I will price tents.\n\n' +
				'Point 2: Avery assigned gear costs\nSentences:\n' +
				'[1] post, Avery Admin: Gear costs zephyrquartz @Morgan\n\n' +
				'Point 3: Morgan will look at what tents cost\nSentences:\n' +
				'[2] comment 1, Morgan Member: Looks good, I will price tents.'
		);
	});

	it.each([
		['has no citations', { text: 'Morgan will price tents', cites: [] }],
		['has no cites field', { text: 'Morgan will price tents' }],
		['cites a sentence that does not exist', { text: 'Morgan will price tents', cites: [3] }]
	])('drops a bullet that %s without asking the check model', async (_, bullet) => {
		const { env, checked } = modelAnswering([bullet]);

		expect(await groundedSummary(env, gearCosts)).toEqual({ bullets: [], sources: [] });
		expect(checked).toHaveLength(0);
	});

	it('drops a bullet the check model gives no verdict for', async () => {
		const env = {
			AI: {
				run: async (model: string) =>
					model === CHECK_MODEL
						? answer({ verdicts: [{ point: 2, supported: true }] })
						: answer({ bullets: [{ text: 'Morgan will price tents', cites: [2] }] })
			}
		} as unknown as Env;

		expect(await groundedSummary(env, gearCosts)).toEqual({ bullets: [], sources: [] });
	});

	it.each([
		['Morgan will price tents. [2]', 'Morgan will price tents.'],
		['Morgan will price tents (1, 2).', 'Morgan will price tents.'],
		['Morgan will price tents [1–2]', 'Morgan will price tents'],
		['Morgan will price tents ([1], [2]).', 'Morgan will price tents.'],
		['Morgan will price tents [1], [2].', 'Morgan will price tents.'],
		['Morgan will price tents (1,2).', 'Morgan will price tents.'],
		['Gear costs [1]; Morgan will price tents [2][1].', 'Gear costs; Morgan will price tents.']
	])(
		'keeps "%s" as "%s", and checks it that way: the numbers in it are its citations',
		async (text, shown) => {
			const { env, checked } = modelAnswering([{ text, cites: [1, 2] }]);

			const { bullets } = await groundedSummary(env, gearCosts);

			expect(bullets).toEqual([{ text: shown, cites: [1, 2] }]);
			expect(checked[0].messages[1].content).toContain(`Point 1: ${shown}\n`);
		}
	);

	it('keeps a bracketed number that is not one of the bullet’s citations', async () => {
		const units = [{ author: 'Ada', kind: 'message', text: 'We need tents for the group (30).' }];
		const { env } = modelAnswering([{ text: 'We need tents for the group (30) [1]', cites: [1] }]);

		const { bullets } = await groundedSummary(env, units);

		expect(bullets).toEqual([{ text: 'We need tents for the group (30)', cites: [1] }]);
	});

	it('asks for cited JSON bullets and forbids tense changes, inferred assignments and outside knowledge', async () => {
		const { env, asked } = modelAnswering([]);

		await groundedSummary(env, gearCosts);

		const [system, user] = asked[0].messages;
		expect(system.role).toBe('system');
		for (const rule of [
			'cites the numbers of the sentences it rests on.',
			'Keep the tense of each sentence: "I will book the venue" from Ada becomes "Ada will book the venue", never "Ada booked the venue".',
			'Never infer who owns, assigned, approved or agreed to something. Say it only when a sentence says it.',
			'Use no outside knowledge. Leave out anything the sentences don’t say.'
		]) {
			expect(system.content, 'the instructions should keep this rule word for word').toContain(
				rule
			);
		}
		expect(user.content).toBe(
			'[1] post, Avery Admin: Gear costs zephyrquartz @Morgan\n' +
				'[2] comment 1, Morgan Member: Looks good, I will price tents.'
		);
		expect(asked[0].response_format).toMatchObject({ type: 'json_schema' });
	});

	it('summarizes call transcript lines, one sentence at a time, citing their timestamps', async () => {
		const transcript: SourceUnit[] = [
			{ author: 'Ada', kind: '00:01:05', text: 'We should ship on Friday.' },
			{ author: 'Bo', kind: '00:01:12', text: 'I’ll write the release notes. Ada checks them.' }
		];
		const { env } = modelAnswering(
			[
				{ text: 'Bo will write the release notes', cites: [2] },
				{ text: 'Bo finished the release notes', cites: [2] },
				{ text: 'Ada checks them', cites: [3] }
			],
			['Bo finished the release notes']
		);

		expect(await groundedSummary(env, transcript)).toEqual({
			bullets: [
				{ text: 'Bo will write the release notes', cites: [2] },
				{ text: 'Ada checks them', cites: [3] }
			],
			sources: [
				{ id: 2, author: 'Bo', kind: '00:01:12', text: 'I’ll write the release notes.' },
				{ id: 3, author: 'Bo', kind: '00:01:12', text: 'Ada checks them.' }
			]
		});
	});

	it('throws when the model answers without a bullets list', async () => {
		const env = {
			AI: { run: async () => ({ choices: [{ message: { content: '{"summary": "x"}' } }] }) }
		} as unknown as Env;

		await expect(groundedSummary(env, gearCosts)).rejects.toThrow(
			`groundedSummary: expected ${SUMMARY_MODEL} to answer {"bullets": [...]}`
		);
	});

	it('throws when the check model answers without a verdicts list', async () => {
		const env = {
			AI: {
				run: async (model: string) =>
					model === CHECK_MODEL
						? answer({ supported: true })
						: answer({ bullets: [{ text: 'Morgan will price tents', cites: [2] }] })
			}
		} as unknown as Env;

		await expect(groundedSummary(env, gearCosts)).rejects.toThrow(
			`groundedSummary: expected ${CHECK_MODEL} to answer {"verdicts": [...]}`
		);
	});
});

describe('groundedTitle', () => {
	it('names the discussion with the first title the check model finds backed', async () => {
		const { env } = modelAnswering(
			[
				{ text: 'Camping trip gear plan', cites: [1, 2] },
				{ text: 'Pricing the tents ([2])', cites: [2] },
				{ text: 'Gear costs', cites: [1] }
			],
			['Camping trip gear plan']
		);

		expect(await groundedTitle(env, gearCosts)).toBe('Pricing the tents');
	});

	it('gives no title when the check model backs none', async () => {
		const { env } = modelAnswering(
			[{ text: 'Camping trip gear plan', cites: [1, 2] }],
			['Camping trip gear plan']
		);

		expect(await groundedTitle(env, gearCosts)).toBeNull();
	});

	it.each([
		['straight double quotes', '"Price tents"'],
		['curly double quotes', '“Price tents”'],
		['straight single quotes', "'Price tents'"],
		['curly single quotes', '‘Price tents’'],
		['closing full stop', 'Price tents.'],
		['quotes and a full stop', '"Price tents."']
	])('takes the %s off a title the model writes with them', async (_, title) => {
		const { env } = modelAnswering([{ text: title, cites: [2] }]);

		expect(await groundedTitle(env, gearCosts)).toBe('Price tents');
	});

	it.each([
		['Book the "north" gate', 'Book the "north" gate'],
		['"North" and "south" gates', '"North" and "south" gates'],
		["Ben's stoves", "Ben's stoves"],
		["'Ben's stoves'", "Ben's stoves"],
		["'North' and 'south' gates", "'North' and 'south' gates"]
	])('leaves the quote marks inside %s', async (title, stored) => {
		const units = [{ author: 'Ben', kind: 'post', text: title }];
		const { env } = modelAnswering([{ text: title, cites: [1] }]);

		expect(await groundedTitle(env, units)).toBe(stored);
	});

	it('still drops a quoted title the check model doesn’t back', async () => {
		const quoted = '“Camping trip gear plan.”';
		const { env } = modelAnswering([{ text: quoted, cites: [1, 2] }], [quoted]);

		expect(await groundedTitle(env, gearCosts)).toBeNull();
	});

	it('asks for titles under their own instructions, apart from the summary’s', async () => {
		const { env, asked } = modelAnswering([]);

		await groundedTitle(env, gearCosts);

		const [system, user] = asked[0].messages;
		expect(system.content).toContain('Write three different titles of at most eight words each');
		expect(system.content).not.toContain(SUMMARY_INSTRUCTIONS);
		expect(user.content).toBe(
			'[1] post, Avery Admin: Gear costs zephyrquartz @Morgan\n' +
				'[2] comment 1, Morgan Member: Looks good, I will price tents.'
		);
	});
});

// Runs against Workers AI when Cloudflare credentials are in the environment, and prints the
// real answers so a run can be compared with the next one.
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;

/** The AI binding's `run`, through Cloudflare's REST API. */
async function workersAi(model: string, input: unknown) {
	const url = `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`;
	const res = await fetch(url, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify(input)
	});
	const body = (await res.json()) as { result?: unknown };
	if (!res.ok)
		throw new Error(`expected 200 from ${model}, got ${res.status}: ${JSON.stringify(body)}`);
	return body.result;
}

describe.skipIf(!account || !token)('groundedSummary on Workers AI', () => {
	it('gets at least three bullets through on a 400-word post with 8 comments', async () => {
		const env = { AI: { run: workersAi } } as unknown as Env;

		const summary = await groundedSummary(env, releaseDay);

		console.log(
			`${SUMMARY_MODEL} on the release-day thread:`,
			JSON.stringify(summary.bullets, null, 2)
		);
		expect(summary.bullets.length).toBeGreaterThanOrEqual(3);
	}, 120_000);

	it('drops a planted false claim and keeps the true points beside it', async () => {
		const sentence = (piece: string) =>
			releaseDay
				.flatMap((u) => u.text.split(/\n+|(?<=[.!?])\s+/).filter(Boolean))
				.findIndex((s) => s.includes(piece)) + 1;
		const bullets = [
			{
				text: 'Marketing can move its product emails to Wednesday.',
				cites: [sentence('Marketing can move')]
			},
			{
				text: 'Marketing refused to move its product emails.',
				cites: [sentence('Marketing can move')]
			},
			{
				text: 'The 3pm Monday branch cut will be a hard rule.',
				cites: [sentence('The cut at 3pm on Monday')]
			},
			{
				text: 'Store review takes about three days.',
				cites: [sentence('Store review has been taking')]
			}
		];
		const env = {
			AI: {
				run: (model: string, input: unknown) =>
					model === CHECK_MODEL ? workersAi(model, input) : answer({ bullets })
			}
		} as unknown as Env;

		const summary = await groundedSummary(env, releaseDay);

		console.log(`${CHECK_MODEL} kept:`, JSON.stringify(summary.bullets, null, 2));
		expect(summary.bullets.map((b) => b.text)).toEqual([
			'Marketing can move its product emails to Wednesday.',
			'The 3pm Monday branch cut will be a hard rule.'
		]);
	}, 120_000);
});

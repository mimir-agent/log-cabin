/** The Workers AI text model that writes summaries (Cloudflare's catalog id). The README says why. */
export const SUMMARY_MODEL = '@cf/zai-org/glm-5.3';

/** The cheaper model that checks each bullet against the sentences it cites. The README says why. */
export const CHECK_MODEL = '@cf/thinkingmachines/inkling-2-small';

/**
 * One piece of the source as someone wrote or said it: a post body, a comment, a chat message, a
 * transcript line. `anchor` is the id of the element that shows it on the page, when it has one.
 */
export type SourceUnit = { author: string; kind: string; text: string; anchor?: string };

/** A sentence of a unit, numbered across the whole source. It keeps any other field its unit had. */
type SourceSentence<U extends SourceUnit = SourceUnit> = U & { id: number };

export type GroundedSummary<U extends SourceUnit = SourceUnit> = {
	bullets: { text: string; cites: number[] }[];
	/** Every sentence a bullet cites, in source order. */
	sources: SourceSentence<U>[];
};

export const SUMMARY_INSTRUCTIONS = [
	'You summarize a discussion from a team workspace. It comes as numbered sentences, each tagged with what it is part of and who wrote it.',
	'Write three to five bullets covering the main topics, decisions and next steps. Each bullet is one sentence of at most 25 words about one point, and cites the numbers of the sentences it rests on.',
	'Keep the tense of each sentence: "I will book the venue" from Ada becomes "Ada will book the venue", never "Ada booked the venue".',
	'Never infer who owns, assigned, approved or agreed to something. Say it only when a sentence says it.',
	'Use no outside knowledge. Leave out anything the sentences don’t say. Write no sentence numbers in a bullet.'
].join('\n');

const TITLE_INSTRUCTIONS = [
	'You name a discussion from a team workspace. It comes as numbered sentences, each tagged with what it is part of and who wrote it.',
	'Write three different titles of at most eight words each, best first, that name what the discussion was about. Each title cites the numbers of the sentences it rests on.',
	'Use no outside knowledge and add nothing the sentences don’t say. Write no sentence numbers in a title.'
].join('\n');

export const CHECK_INSTRUCTIONS = [
	'You check numbered points written about a discussion from a team workspace. Each point is a summary bullet or a title, and comes with the sentences it cites, each tagged with what it is part of and who wrote it.',
	'Judge each point only against its own sentences. It is supported when they say everything the point says, in any words. A point may leave things out and may name who wrote a sentence.',
	'It is not supported when it says anything its sentences don’t: a person, number, date, place or reason they don’t give; a decision, approval, agreement or assignment they don’t state; or something done, when the sentences only plan or propose it.',
	'Give one verdict for every point.'
].join('\n');

const bulletsSchema = {
	type: 'object',
	properties: {
		bullets: {
			type: 'array',
			maxItems: 5,
			items: {
				type: 'object',
				properties: {
					text: { type: 'string' },
					cites: { type: 'array', items: { type: 'integer' }, minItems: 1 }
				},
				required: ['text', 'cites']
			}
		}
	},
	required: ['bullets']
};

const verdictsSchema = {
	type: 'object',
	properties: {
		verdicts: {
			type: 'array',
			items: {
				type: 'object',
				properties: { point: { type: 'integer' }, supported: { type: 'boolean' } },
				required: ['point', 'supported']
			}
		}
	},
	required: ['verdicts']
};

/** One bracket group of sentence numbers, with the space or comma before it: " [4]", ", [1-4]", " (3, 4)", " ([4], [7])". */
const citationMark = new RegExp(
	String.raw`[\s,;]*(?:\[[\d\s,;–-]*\]|\((?:[\d\s,;–-]|\[[\d\s,;–-]*\])*\))`,
	'g'
);

/**
 * Takes out the sentence numbers a model writes into a bullet as well as citing them. A bracketed
 * number the bullet doesn't cite, such as a "(30)" someone said, stays.
 */
function withoutCitationMarks(text: string, cites: unknown[]): string {
	return text.replace(citationMark, (mark) => {
		const numbers = mark.match(/\d+/g) ?? [];
		return numbers.length && numbers.every((n) => cites.includes(Number(n))) ? '' : mark;
	});
}

/** Splits each unit into sentences, numbered from 1 across the whole source. */
function numberSentences<U extends SourceUnit>(units: U[]): SourceSentence<U>[] {
	return units
		.flatMap((unit) =>
			unit.text
				.split(/\n+|(?<=[.!?])\s+/)
				.map((text) => text.trim())
				.filter(Boolean)
				.map((text) => ({ ...unit, text }))
		)
		.map((sentence, i) => ({ ...sentence, id: i + 1 }));
}

/** Sentences as both models read them: "[2] comment 1, Morgan: I will price tents." */
function numbered(sentences: SourceSentence[]): string {
	return sentences.map((s) => `[${s.id}] ${s.kind}, ${s.author}: ${s.text}`).join('\n');
}

/**
 * Asks the model to summarize the units with citations, and keeps only the bullets the sentences
 * they cite back up. Throws when either model fails or answers with something other than the
 * requested JSON. A `focus` narrows what the bullets cover, after the standing instructions; the
 * check is the same.
 */
export async function groundedSummary<U extends SourceUnit>(
	env: Env,
	units: U[],
	focus?: string
): Promise<GroundedSummary<U>> {
	const sentences = numberSentences(units);
	const instructions = focus ? `${SUMMARY_INSTRUCTIONS}\n${focus}` : SUMMARY_INSTRUCTIONS;
	const bullets = await groundedBullets(env, sentences, instructions, 'groundedSummary');
	const cited = new Set(bullets.flatMap((b) => b.cites));
	return { bullets, sources: sentences.filter((s) => cited.has(s.id)) };
}

/**
 * Asks the model for a few titles for the units, and returns the first that the sentences it
 * cites back up, or null when none is.
 */
export async function groundedTitle(env: Env, units: SourceUnit[]): Promise<string | null> {
	const titles = await groundedBullets(
		env,
		numberSentences(units),
		TITLE_INSTRUCTIONS,
		'groundedTitle'
	);
	return titles[0] ? bareTitle(titles[0].text) : null;
}

/**
 * Quote marks around a whole title, with none of their kind inside except an apostrophe in a word,
 * as in 'Ben's stoves'.
 */
const wrappingQuotes = [
	/^"([^"]*)"$/,
	/^“([^“”]*)”$/,
	/^['‘]((?:[^'‘’]|(?<=\p{L})['’](?=\p{L}))*)['’]$/u
];

/**
 * A title as a heading shows it: without the quote marks a model may wrap it in, or a closing full
 * stop. It only takes characters away, so it can't add a word the check didn't see.
 */
function bareTitle(text: string): string {
	const unstopped = text.trim().replace(/\.$/, '');
	const inside = wrappingQuotes
		.map((quotes) => unstopped.match(quotes)?.[1])
		.find((t) => t !== undefined);
	return (inside ?? unstopped).replace(/\.$/, '');
}

/** Sends one system and one user message and parses the JSON the schema asks for. */
async function askJson(
	env: Env,
	model: string,
	system: string,
	user: string,
	schema: object
): Promise<unknown> {
	// Both models answer in the chat-completion shape, but the binding's types don't list every model.
	const result = (await env.AI.run(model, {
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: user }
		],
		response_format: { type: 'json_schema', json_schema: { name: 'answer', schema, strict: true } },
		reasoning_effort: 'low'
	})) as { choices: { message: { content?: string | null } }[] };
	return JSON.parse(result.choices[0]?.message.content ?? 'null');
}

type CitedBullet = { bullet: GroundedSummary['bullets'][number]; sources: SourceSentence[] };

/**
 * Asks the model for cited bullets under the instructions, then asks the check model whether each
 * one's sentences back it, and keeps the ones they do. `caller` names the function in errors and
 * warnings.
 */
async function groundedBullets(
	env: Env,
	sentences: SourceSentence[],
	instructions: string,
	caller: string
): Promise<GroundedSummary['bullets']> {
	const answer = (await askJson(
		env,
		SUMMARY_MODEL,
		instructions,
		numbered(sentences),
		bulletsSchema
	)) as { bullets?: { text?: unknown; cites?: unknown }[] } | null;
	if (!Array.isArray(answer?.bullets)) {
		throw new Error(`${caller}: expected ${SUMMARY_MODEL} to answer {"bullets": [...]}`);
	}
	const cited = answer.bullets.flatMap(({ text, cites }): CitedBullet[] => {
		const ids = Array.isArray(cites) ? cites : [];
		const sources = ids.map((id) => sentences.find((s) => s.id === id));
		if (typeof text !== 'string' || ids.length === 0 || sources.includes(undefined)) {
			console.warn(`${caller}: dropped a bullet that cites ${JSON.stringify(cites)}`);
			return [];
		}
		const bullet = { text: withoutCitationMarks(text, ids), cites: ids };
		return [{ bullet, sources: sources as SourceSentence[] }];
	});
	if (cited.length === 0) return [];
	const backed = await backedPoints(env, cited, caller);
	return cited
		.filter(({ bullet }, i) => {
			// The citations, not the text: it can come from a private post, and this goes to the logs.
			if (!backed.has(i + 1)) console.warn(`${caller}: dropped a bullet citing ${bullet.cites}`);
			return backed.has(i + 1);
		})
		.map((c) => c.bullet);
}

/**
 * The numbers, from 1, of the bullets the check model finds their sentences back. It checks them
 * all in one call: a call per bullet runs into Workers AI's per-minute limit on requests.
 */
async function backedPoints(env: Env, cited: CitedBullet[], caller: string): Promise<Set<unknown>> {
	const points = cited.map(
		({ bullet, sources }, i) => `Point ${i + 1}: ${bullet.text}\nSentences:\n${numbered(sources)}`
	);
	const answer = (await askJson(
		env,
		CHECK_MODEL,
		CHECK_INSTRUCTIONS,
		points.join('\n\n'),
		verdictsSchema
	)) as { verdicts?: { point?: unknown; supported?: unknown }[] } | null;
	if (!Array.isArray(answer?.verdicts)) {
		throw new Error(`${caller}: expected ${CHECK_MODEL} to answer {"verdicts": [...]}`);
	}
	return new Set(answer.verdicts.filter((v) => v.supported === true).map((v) => v.point));
}

import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { newId } from '../id';
import { publish } from '../realtime/publish';
import type { SignedIn } from '../auth/session';
import { posts as strings } from '../../strings/posts';
import { pollLimits } from '../../poll-limits';
import { loadWritableProject } from './access';
import type { LoadedPost } from './posts';

// Polls on posts, after Campsite's poll.rb, poll_option.rb and poll_vote.rb, with this
// deployment's rules: the limits in pollLimits, and a vote may be changed.

/** An option keeps its id when the poll is edited, which keeps its votes. */
export type PollInput = { question: string; options: { id?: string; description: string }[] };

/**
 * Reads the composer's poll field: empty means no poll. Blank options are dropped, since the
 * composer always shows a few empty rows.
 */
export function parsePoll(
	raw: FormDataEntryValue | undefined
): PollInput | null | { message: string } {
	if (!raw) return null;
	let parsed: PollInput;
	try {
		parsed = JSON.parse(String(raw));
	} catch {
		return { message: strings.errors.pollInvalid };
	}
	const question = String(parsed?.question ?? '').trim();
	if (!Array.isArray(parsed?.options)) return { message: strings.errors.pollInvalid };
	const options = parsed.options
		.map((o) => ({
			...(o.id ? { id: String(o.id) } : {}),
			description: String(o.description ?? '').trim()
		}))
		.filter((o) => o.description);
	const { minOptions, maxOptions, optionLength, questionLength } = pollLimits;
	if (options.length < minOptions || options.length > maxOptions) {
		return { message: strings.errors.pollOptionCount(minOptions, maxOptions) };
	}
	if (options.some((o) => o.description.length > optionLength)) {
		return { message: strings.errors.pollOptionTooLong(optionLength) };
	}
	if (question.length > questionLength)
		return { message: strings.errors.pollQuestionTooLong(questionLength) };
	return { question, options };
}

/**
 * Makes a post's poll match the composer's: adds it, changes its question and options, or
 * (with null) removes it. Options sent with an id keep their votes. The caller checks who may.
 */
export async function savePoll(env: Env, postId: string, poll: PollInput | null) {
	const { polls, pollOptions } = schema;
	if (!poll) {
		await db(env).delete(polls).where(eq(polls.postId, postId));
		return;
	}
	const kept = poll.options.flatMap((o) => (o.id ? [o.id] : []));
	const existing = await db(env)
		.select({ id: pollOptions.id })
		.from(pollOptions)
		.where(and(eq(pollOptions.postId, postId), inArray(pollOptions.id, kept)));
	if (existing.length !== kept.length) error(400, strings.errors.pollInvalid);
	await db(env)
		.insert(polls)
		.values({ postId, question: poll.question, createdAt: Date.now() })
		.onConflictDoUpdate({ target: polls.postId, set: { question: poll.question } });
	await db(env)
		.delete(pollOptions)
		.where(and(eq(pollOptions.postId, postId), notInArray(pollOptions.id, kept)));
	for (const [position, option] of poll.options.entries()) {
		const fields = { position, description: option.description };
		if (option.id) {
			await db(env).update(pollOptions).set(fields).where(eq(pollOptions.id, option.id));
		} else {
			await db(env)
				.insert(pollOptions)
				.values({ id: newId(), postId, ...fields });
		}
	}
}

/**
 * Records this person's vote, replacing any earlier one. Anyone who may write in the post's
 * project may vote, so viewers can't and an archived project's polls are closed.
 */
export async function vote(env: Env, who: SignedIn, post: LoadedPost, optionId: string) {
	await loadWritableProject(env, who, post.projectId);
	const { pollOptions, pollVotes } = schema;
	const option = await db(env)
		.select({ id: pollOptions.id })
		.from(pollOptions)
		.where(and(eq(pollOptions.id, optionId), eq(pollOptions.postId, post.id)))
		.get();
	if (!option) error(404, strings.errors.pollOptionNotFound);
	await db(env)
		.insert(pollVotes)
		.values({ postId: post.id, userId: who.user.id, optionId, createdAt: Date.now() })
		.onConflictDoUpdate({
			target: [pollVotes.postId, pollVotes.userId],
			set: { optionId, createdAt: Date.now() }
		});
	await publish(env, `post:${post.id}`, { type: 'poll.changed', postId: post.id });
}

/** A post's poll with each option's voters by name, or null when it has none. */
export async function loadPoll(env: Env, viewerId: string, postId: string) {
	const { polls, pollOptions, pollVotes, users } = schema;
	const poll = await db(env).select().from(polls).where(eq(polls.postId, postId)).get();
	if (!poll) return null;
	const options = await db(env)
		.select({ id: pollOptions.id, description: pollOptions.description })
		.from(pollOptions)
		.where(eq(pollOptions.postId, postId))
		.orderBy(asc(pollOptions.position));
	const votes = await db(env)
		.select({ optionId: pollVotes.optionId, userId: pollVotes.userId, name: users.name })
		.from(pollVotes)
		.innerJoin(users, eq(users.id, pollVotes.userId))
		.where(eq(pollVotes.postId, postId))
		.orderBy(asc(pollVotes.createdAt));
	return {
		question: poll.question,
		total: votes.length,
		options: options.map((option) => {
			const mine = votes.filter((v) => v.optionId === option.id);
			return {
				...option,
				voters: mine.map((v) => v.name),
				chosen: mine.some((v) => v.userId === viewerId)
			};
		})
	};
}

export type LoadedPoll = NonNullable<Awaited<ReturnType<typeof loadPoll>>>;

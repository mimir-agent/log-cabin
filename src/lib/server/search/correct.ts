import { sql } from 'drizzle-orm';
import { db } from '../db';
import type { SignedIn } from '../auth/session';
import { visibleRows } from './visible';

/** How many edits a word of this length may be from the word it's corrected to. */
const allowedEdits = (word: string) => (word.length <= 5 ? 1 : 2);

/**
 * Endings the porter stemmer takes off before a word reaches the index, which holds "tent"
 * for "tents". A held stem plus one of these is a word as people type it.
 */
const endings = ['', 's', 'es', 'e', 'ed', 'ing'];
const longestEnding = Math.max(...endings.map((ending) => ending.length));

/**
 * Edits between two words: inserting, deleting or changing a letter, or swapping two
 * neighbours, each count one (optimal string alignment), so "tnets" is one from "tents".
 */
export function editDistance(a: string, b: string): number {
	const d = Array.from({ length: a.length + 1 }, (_, i) =>
		Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
	);
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const change = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + change);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
			}
		}
	}
	return d[a.length][b.length];
}

/** Whether a row this member may see matches the word, as a prefix if asked. */
async function visibleRowHolds(env: Env, who: SignedIn, word: string, asPrefix: boolean) {
	const row = await db(env).all(sql`
		SELECT 1 FROM search_index s
		WHERE search_index MATCH ${`"${word}"${asPrefix ? '*' : ''}`} AND ${visibleRows(env, who)}
		LIMIT 1
	`);
	return row.length > 0;
}

/**
 * Words within allowedEdits of one, built from stems that rows this member may see hold,
 * nearest first, and alphabetical on a tie. Only those rows' stems are read, so what other
 * rows hold never becomes or orders a correction. Only stems that share a first
 * letter with the word, or have its first letter second, are kept. A word built from a
 * stem can stem to another one, so callers still check each word against visible rows.
 */
async function nearWords(env: Env, who: SignedIn, word: string): Promise<string[]> {
	const edits = allowedEdits(word);
	const [first, second = first] = word;
	const stems = await db(env).all<{ term: string }>(sql`
		SELECT DISTINCT v.term FROM search_vocab v JOIN search_index s ON s.rowid = v.doc
		WHERE length(v.term) BETWEEN ${word.length - edits - longestEnding} AND ${word.length + edits}
			AND (substr(v.term, 1, 1) IN (${first}, ${second}) OR substr(v.term, 2, 1) = ${first})
			AND ${visibleRows(env, who)}
	`);
	const candidates = stems.flatMap(({ term }) =>
		endings
			.map((ending) => ({ word: term + ending, distance: editDistance(word, term + ending) }))
			.filter(({ distance }) => distance <= edits)
	);
	candidates.sort((a, b) => a.distance - b.distance || a.word.localeCompare(b.word));
	return candidates.map((candidate) => candidate.word);
}

/** The word nearest to one, of those a row this member may see holds. */
async function nearestVisibleWord(env: Env, who: SignedIn, word: string): Promise<string | null> {
	for (const near of await nearWords(env, who, word)) {
		if (await visibleRowHolds(env, who, near, false)) return near;
	}
	return null;
}

/**
 * What was typed with each word no row this member may see holds replaced by the nearest
 * one that such a row does, or null when no word needed or found a correction. Words are
 * held one at a time, so the corrected words may still never meet in one row.
 */
export async function correctedQuery(
	env: Env,
	who: SignedIn,
	input: string
): Promise<string | null> {
	const words = input.match(/[\p{L}\p{N}]+/gu) ?? [];
	let changed = false;
	const corrected: string[] = [];
	for (const [i, word] of words.entries()) {
		if (await visibleRowHolds(env, who, word, i === words.length - 1)) {
			corrected.push(word);
			continue;
		}
		const nearest = await nearestVisibleWord(env, who, word.toLowerCase());
		changed ||= nearest !== null;
		corrected.push(nearest ?? word);
	}
	return changed ? corrected.join(' ') : null;
}

import { describe, expect, it } from 'vitest';
import { notes } from './notes';
import { shell } from './shell';

const tz = 'UTC';
const now = Date.UTC(2026, 10, 21, 12);

describe('thread and document copy limits', () => {
	it('keeps the two intent lines to one line at 316px', () => {
		expect(shell.create.post.line.length).toBeLessThanOrEqual(44);
		expect(shell.create.doc.line.length).toBeLessThanOrEqual(44);
	});
	it('names the two things you can start, and what each is for', () => {
		expect(shell.create.post).toEqual({
			title: 'New thread',
			line: 'Updates, proposals, topics and more'
		});
		expect(shell.create.doc.title).toBe('New document');
	});
	it('keeps the Share row’s line to 64', () => {
		expect(notes.sharePost.line.length).toBeLessThanOrEqual(64);
	});
	it('keeps the caption to 24 in every form', () => {
		for (const ago of [
			0,
			5 * 60e3,
			59 * 60e3,
			23 * 3600e3,
			6 * 86400e3,
			30 * 86400e3,
			900 * 86400e3
		]) {
			expect(notes.edited.ago(now - ago, tz, now).length).toBeLessThanOrEqual(24);
		}
	});
	it('says the time the way the bar does', () => {
		expect(notes.edited.ago(now - 17 * 3600e3, tz, now)).toBe('Edited 17h ago');
		expect(notes.edited.ago(now - 10_000, tz, now)).toBe('Edited just now');
		expect(notes.edited.ago(now - 30 * 86400e3, tz, now)).toBe('Edited Oct 22');
		expect(notes.edited.rowTime(now - 3 * 86400e3, tz, now)).toBe('3d ago');
	});
});

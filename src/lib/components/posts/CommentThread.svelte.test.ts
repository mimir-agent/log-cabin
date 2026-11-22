import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import CommentThread from './CommentThread.svelte';

vi.mock('$app/forms', () => ({
	enhance: () => ({}),
	applyAction: async () => {},
	deserialize: JSON.parse
}));

const body = (text: string) =>
	JSON.stringify({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});

const comment = (id: string, authorName: string, text: string) => ({
	id,
	authorId: authorName.toLowerCase(),
	authorName,
	body: body(text),
	createdAt: Date.UTC(2026, 10, 18, 12),
	editedAt: null
});

function thread(threadResolution: { at: number; byName: string | null } | null, canWrite = true) {
	return render(CommentThread, {
		comment: { ...comment('c1', 'Bo', 'Is this done?'), replies: [comment('r1', 'Ada', 'Yes')] },
		reactions: {},
		viewerId: 'vic',
		isAdmin: false,
		canWrite,
		canResolve: false,
		resolvedCommentId: null,
		members: [],
		orgEmoji: { custom: {}, orgName: 'Northwind', canAdd: false },
		boundary: null,
		threadResolution
	}).container;
}

describe('a comment thread', () => {
	it('folds a resolved thread to one line that opens it, with Reopen comment, and closes again', async () => {
		const root = thread({ at: Date.UTC(2026, 10, 18, 13), byName: 'Ada' });
		expect(root.textContent).toContain('Ada resolved this thread');
		expect(root.textContent, 'the comments are hidden').not.toContain('Is this done?');
		expect(root.querySelector('form[action="?/unresolveComment"]')).toBeNull();

		await page.getByRole('button', { name: /Ada resolved this thread/ }).click();
		expect(root.textContent).toContain('Is this done?');
		expect(root.textContent).toContain('Yes');
		const unresolve = root.querySelector('form[action="?/unresolveComment"]');
		expect(unresolve?.querySelector<HTMLInputElement>('[name=commentId]')?.value).toBe('c1');

		await page.getByRole('button', { name: /Ada resolved this thread/ }).click();
		expect(root.textContent).not.toContain('Is this done?');
	});

	it('offers Resolve on an open thread’s first comment, to someone who can comment', async () => {
		const root = thread(null);
		expect(root.textContent).toContain('Is this done?');
		const menus = page.getByRole('button', { name: 'More actions' });
		expect(menus.elements(), 'one menu: on the first comment, not the reply').toHaveLength(1);
		await menus.click();
		await expect.element(page.getByRole('menuitem', { name: 'Resolve comment' })).toBeVisible();
	});

	it('offers a reader who can’t comment neither Resolve nor Reopen', async () => {
		const open = thread(null, false);
		expect(open.textContent).toContain('Is this done?');
		expect(page.getByRole('button', { name: 'More actions' }).elements()).toHaveLength(0);
		open.remove();

		const resolved = thread({ at: Date.UTC(2026, 10, 18, 13), byName: 'Ada' }, false);
		await page.getByRole('button', { name: /Ada resolved this thread/ }).click();
		expect(resolved.textContent).toContain('Is this done?');
		expect(resolved.querySelector('form[action="?/unresolveComment"]')).toBeNull();
	});
});

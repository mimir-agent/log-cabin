import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { shell } from '#lib/strings/shell.js';
import KeyboardShortcuts from './KeyboardShortcuts.svelte';

const router = vi.hoisted(() => ({
	goto: vi.fn(async (href: string) => void href),
	url: new URL('https://campfire.test/chat')
}));
vi.mock('$app/navigation', () => ({ goto: router.goto }));
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return router.url;
		}
	}
}));

beforeEach(() => {
	router.goto.mockClear();
	router.url = new URL('https://campfire.test/chat');
});

const went = () => router.goto.mock.calls.map(([href]) => href);

describe('the keyboard shortcuts', () => {
	it('goes where Campsite’s shortcuts go, with our routes', async () => {
		render(KeyboardShortcuts, { canCreate: true });
		for (const keys of ['gi', 'gh', 'gd', 'ga', '/']) await userEvent.keyboard(keys);
		expect(went()).toEqual(['/inbox', '/', '/notes', '/activity', '/search']);
	});

	it('opens the New menu from the button on screen with c, and goes nowhere', async () => {
		const button = document.body.appendChild(document.createElement('button'));
		button.setAttribute('data-create-trigger', '');
		const pressed = vi.fn();
		button.addEventListener('keydown', (event) => pressed(event.key));
		render(KeyboardShortcuts, { canCreate: true });
		await userEvent.keyboard('c');
		expect(pressed).toHaveBeenCalledExactlyOnceWith('Enter');
		expect(went()).toEqual([]);
		button.remove();
	});

	it('starts a sequence again on a key that doesn’t continue it', async () => {
		render(KeyboardShortcuts, {});
		await userEvent.keyboard('gxgi');
		expect(went()).toEqual(['/inbox']);
	});

	it('does nothing for a key held with Ctrl or ⌘, or for the page already open', async () => {
		router.url = new URL('https://campfire.test/search');
		render(KeyboardShortcuts, {});
		await userEvent.keyboard('{Control>}g{/Control}i{Meta>}/{/Meta}/');
		expect(went()).toEqual([]);
	});

	it('lists the shortcuts in a sheet that ? opens', async () => {
		render(KeyboardShortcuts, { canCreate: true });
		await userEvent.keyboard('?');
		const sheet = page.getByRole('dialog', { name: shell.shortcuts.sheet.title });
		await expect.element(sheet).toBeVisible();
		for (const label of [
			shell.shortcuts.go.inbox,
			shell.shortcuts.go.home,
			shell.shortcuts.go.notes,
			shell.shortcuts.go.activity,
			shell.shortcuts.go.search,
			shell.shortcuts.newPost,
			shell.shortcuts.switcher,
			shell.shortcuts.help
		]) {
			await expect.element(sheet.getByText(label)).toBeVisible();
		}
		await userEvent.keyboard('{Escape}');
		await expect.element(sheet).not.toBeInTheDocument();
	});

	it('fires nothing while typing into a field or an editor', async () => {
		render(KeyboardShortcuts, { canCreate: true });
		const fields: HTMLElement[] = [
			document.createElement('input'),
			document.createElement('textarea'),
			Object.assign(document.createElement('div'), { contentEditable: 'true' })
		];
		for (const field of fields) {
			document.body.appendChild(field);
			field.focus();
			await userEvent.keyboard('gi/c?');
			field.remove();
		}
		expect(went()).toEqual([]);
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});
});

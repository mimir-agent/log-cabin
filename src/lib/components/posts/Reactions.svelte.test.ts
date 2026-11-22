import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
// The real tokens, so the picker has its real size.
import '../../../app.css';
import Reactions from './Reactions.svelte';

// What the root layout gives every member's page: the org's name and emoji, and who may add more.
const orgEmoji = {
	custom: { campfire: '/files/emoji/01JD5Z3W8Q9X2M4N6P7R8S9T0V' },
	orgName: 'Northwind',
	canAdd: true
};
vi.mock('$app/forms', () => ({ enhance: () => ({}), deserialize: JSON.parse }));

let submitted: FormData[] = [];
const keep = (event: SubmitEvent) => {
	event.preventDefault();
	submitted.push(new FormData(event.target as HTMLFormElement));
};

// The app's frame: a 240px sidebar, then the content column, #main.
function shell() {
	document.body.innerHTML = `
		<nav style="position: fixed; inset-block: 0; inset-inline-start: 0; inline-size: 240px"></nav>
		<main id="main" style="margin-inline-start: 240px; padding: 0; block-size: 700px"></main>`;
	return document.getElementById('main')!;
}

async function openPicker() {
	const main = shell();
	const screen = render(Reactions, {
		target: main,
		props: {
			summaries: [],
			subjectType: 'post',
			subjectId: 'post-1',
			canReact: true,
			orgEmoji,
			boundary: main
		}
	});
	await screen.getByRole('button', { name: 'Add reaction' }).click();
	await expect.element(page.getByRole('searchbox', { name: 'Search emoji' })).toBeVisible();
	// The emoji data arrives after the picker opens.
	await expect
		.element(page.getByRole('button', { name: 'grinning_face', exact: true }))
		.toBeInTheDocument();
	return main;
}

beforeEach(async () => {
	await page.viewport(1280, 800);
	localStorage.clear();
	submitted = [];
	window.addEventListener('submit', keep, true);
});
afterEach(() => window.removeEventListener('submit', keep, true));

describe('the reaction picker', () => {
	it('opens inside the content column when its button is at the column’s left edge', async () => {
		const main = await openPicker();
		const picker = document.querySelector('[data-popover-content]')!;
		const box = picker.getBoundingClientRect();
		const column = main.getBoundingClientRect();
		expect(box.width).toBeGreaterThan(300);
		expect(box.left).toBeGreaterThanOrEqual(column.left);
		expect(box.right).toBeLessThanOrEqual(column.right);
	});

	it('opens as a sheet along the bottom of a screen narrower than 1024px', async () => {
		await page.viewport(800, 700);
		await openPicker();
		const box = () => document.querySelector('[data-popover-content]')!.getBoundingClientRect();
		// It slides up into place, so wait for it to settle.
		await expect.poll(() => Math.round(box().bottom)).toBe(window.innerHeight);
		expect(box().left).toBe(0);
		expect(Math.round(box().right)).toBe(window.innerWidth);
	});

	it('finds any Unicode emoji by name or keyword and reacts with the first on Enter', async () => {
		await openPicker();
		await userEvent.keyboard('thumbs up');
		await expect.element(page.getByRole('button', { name: 'thumbs_up' })).toBeVisible();
		await userEvent.keyboard('{Enter}');
		expect(submitted.map((f) => f.get('emoji'))).toEqual(['👍']);
		expect(submitted[0].get('subjectId')).toBe('post-1');
	});

	it('offers the org’s own emoji in a section named for the org', async () => {
		await openPicker();
		await expect.element(page.getByRole('heading', { name: 'Northwind' })).toBeVisible();
		await page.getByRole('button', { name: 'campfire' }).click();
		expect(submitted.map((f) => f.get('emoji'))).toEqual([':campfire:']);
	});

	it('moves through the grid with arrow keys and keeps the chosen skin tone', async () => {
		await openPicker();
		await page.getByRole('combobox', { name: 'Skin tone' }).selectOptions('3');
		await userEvent.click(page.getByRole('searchbox', { name: 'Search emoji' }));
		await userEvent.keyboard('waving hand{ArrowDown}');
		await expect.element(page.getByRole('button', { name: 'waving_hand' })).toHaveFocus();
		await userEvent.keyboard('{Enter}');
		expect(submitted.map((f) => f.get('emoji'))).toEqual(['👋🏽']);
		expect(localStorage.getItem('campfire:emoji-skin-tone')).toBe('3');
	});

	it('says when nothing matches and points people who may add one to the emoji settings', async () => {
		await openPicker();
		await userEvent.keyboard('zzzzqqq');
		await expect.element(page.getByText('No emoji match')).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Add a custom emoji' }))
			.toHaveAttribute('href', '/settings/emoji');
	});
});

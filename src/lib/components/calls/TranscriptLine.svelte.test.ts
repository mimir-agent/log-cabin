import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TranscriptLine from './TranscriptLine.svelte';

const heard = {
	id: 'l1',
	startMs: 65_000,
	endMs: 70_000,
	text: 'Hello.',
	speaker: 'Bo',
	original: null as string | null
};
const fixed = { ...heard, text: 'Hello, Tentsile.', original: 'Hello, tent sale.' };

function show(line: typeof heard, canEdit: boolean, onseek = () => {}) {
	return render(TranscriptLine, {
		line,
		current: false,
		canEdit,
		onseek
	});
}

describe('TranscriptLine', () => {
	it('shows an unedited line with no Edited mark, and an Edit button only to people who may edit', async () => {
		const editor = show(heard, true);
		await expect.element(editor.getByRole('button', { name: 'Edit' })).toBeVisible();
		await expect.element(editor.getByText('Edited')).not.toBeInTheDocument();
		editor.unmount();

		const reader = show(heard, false);
		await expect.element(reader.getByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
	});

	it('marks an edited line, shows what was heard on request, and offers Revert only to people who may edit', async () => {
		const editor = show(fixed, true);
		await expect.element(editor.getByText('Edited')).toBeVisible();
		await expect.element(editor.getByText('Heard as: Hello, tent sale.')).not.toBeInTheDocument();
		await editor.getByRole('button', { name: 'Show original' }).click();
		await expect.element(editor.getByText('Heard as: Hello, tent sale.')).toBeVisible();
		await expect.element(editor.getByRole('button', { name: 'Revert to original' })).toBeVisible();
		editor.unmount();

		const reader = show(fixed, false);
		await expect.element(reader.getByRole('button', { name: 'Show original' })).toBeVisible();
		await expect
			.element(reader.getByRole('button', { name: 'Revert to original' }))
			.not.toBeInTheDocument();
	});

	it('opens the line in a field holding its text, and Cancel closes it without a change', async () => {
		const onseek = vi.fn();
		const screen = show(heard, true, onseek);

		await screen.getByRole('button', { name: 'Edit' }).click();
		await expect
			.element(screen.getByRole('textbox', { name: 'Edit what Bo said' }))
			.toHaveValue('Hello.');
		await screen.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(screen.getByRole('textbox')).not.toBeInTheDocument();
		await expect.element(screen.getByText('Hello.')).toBeVisible();
		expect(onseek).not.toHaveBeenCalled();
	});
});

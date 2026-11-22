import { applyAction, deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';

/**
 * Sends a checkbox tick to the page's `?/tick` action, then reloads the page's data so the
 * box shows what the server stored. A refused tick shows as the page's form error.
 */
export async function submitTick(
	subject: 'post' | 'comment',
	id: string,
	index: number,
	checked: boolean
) {
	const body = new FormData();
	body.set('subject', subject);
	body.set('id', id);
	body.set('index', String(index));
	body.set('checked', String(checked));
	const response = await fetch('?/tick', {
		method: 'POST',
		body,
		headers: { 'x-sveltekit-action': 'true' }
	});
	const result = deserialize(await response.text());
	if (result.type === 'success') await invalidateAll();
	else await applyAction(result);
}

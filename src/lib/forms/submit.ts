// Form submissions that answer before the server does. The page changes its own state in the
// input frame; a failure undoes it and says so in a toast, instead of SvelteKit's error page.
import { deserialize, type ActionResult, type SubmitFunction } from '$app/forms';
import { toast } from '#lib/components/ui/Toast.svelte';
import { core } from '#lib/strings/core.js';

/**
 * A `use:enhance` handler for a change that is shown at once: `apply` changes the page's local
 * state and returns how to revert it. On success the page reloads its data, then reverts, so
 * the server's copy of the same change takes over; it stays on the page even when the action
 * is another page's. On a failure or a lost connection it reverts at once and shows a toast;
 * the page and anything typed stay as they are.
 */
export function optimistic(apply: (data: FormData) => () => void): SubmitFunction {
	return ({ formData }) => {
		const revert = apply(formData);
		return async ({ result, update }) => {
			if (result.type === 'failure' || result.type === 'error') {
				revert();
				toast(failureText(result));
				return;
			}
			await update({ navigate: false });
			revert();
		};
	};
}

/** What a failed action says: the server's own message for a refused one, else the generic line. */
export function failureText(result: ActionResult): string {
	const message = result.type === 'failure' ? result.data?.message : undefined;
	return typeof message === 'string' ? message : core.errors.notSaved;
}

/**
 * Posts `data` to the form action `action` on the current page, as `use:enhance` does, for a
 * send that can be retried. A lost connection comes back as an `error` result, as it does there.
 */
export async function postAction(action: string, data: FormData): Promise<ActionResult> {
	try {
		const response = await fetch(action, {
			method: 'POST',
			body: data,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
		return deserialize(await response.text());
	} catch (error) {
		// What use:enhance reports for an error that isn't an HTTP one.
		return { type: 'error', error: { status: 500, message: String(error) } };
	}
}

// Favoriting a note or a thread from wherever it shows; the sidebar's Favorites follow.
import { invalidateAll } from '$app/navigation';
import { toast } from '#lib/components/ui/Toast.svelte';
import { core } from '#lib/strings/core.js';

export async function setFavorite(
	subject: { type: 'note' | 'thread'; id: string },
	favorite: boolean
) {
	const body = new FormData();
	body.set('subjectType', subject.type);
	body.set('subjectId', subject.id);
	body.set('favorite', String(favorite));
	const response = await fetch('/favorites', { method: 'POST', body }).catch(() => null);
	if (!response?.ok) {
		toast(core.errors.notSaved);
		return;
	}
	// The page shows whether it's a favorite, and the root layout lists them.
	await invalidateAll();
}

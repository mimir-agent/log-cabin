import { updateProfile } from '../members';
import { saveImage } from '../storage';
import { auth } from '../../strings/auth';
import { changeUsername } from './usernames';

export type ProfileField = 'name' | 'username' | 'avatar' | 'cover';

/**
 * Saves the profile form, in settings and in onboarding: `name`, `username`, and an `avatar`
 * or `cover` image when one was chosen. Says which field was wrong, and why, when one is.
 */
export async function saveProfileForm(
	env: Env,
	userId: string,
	form: FormData
): Promise<{ ok: true } | { ok: false; field: ProfileField; message: string }> {
	const name = String(form.get('name') ?? '').trim();
	if (!name) return { ok: false, field: 'name', message: auth.ownProfile.errors.nameMissing };
	const changes: Parameters<typeof updateProfile>[2] = { name };
	for (const [field, prefix, key] of [
		['avatar', 'avatars', 'avatarKey'],
		['cover', 'covers', 'coverKey']
	] as const) {
		const file = form.get(field);
		if (!(file instanceof File) || file.size === 0) continue;
		const saved = await saveImage(env, prefix, file);
		if (!saved.ok) return { ...saved, field };
		changes[key] = saved.key;
	}
	// The username goes last: a rename leaves the old name redirecting for 30 days, so it
	// waits until nothing else can refuse the save.
	const username = await changeUsername(env, userId, String(form.get('username') ?? ''));
	if (!username.ok) return { ...username, field: 'username' };
	await updateProfile(env, userId, changes);
	return { ok: true };
}

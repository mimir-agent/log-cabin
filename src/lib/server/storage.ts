import { newId } from './id';
import { auth } from '../strings/auth';

export async function putObject(
	env: Env,
	key: string,
	body: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob,
	contentType: string
): Promise<void> {
	await env.BUCKET.put(key, body, { httpMetadata: { contentType } });
}

export function getObject(env: Env, key: string): Promise<R2ObjectBody | null> {
	return env.BUCKET.get(key);
}

export async function deleteObject(env: Env, key: string): Promise<void> {
	await env.BUCKET.delete(key);
}

// The app path that serves an object. The /files route checks access before streaming
// from R2; the bucket itself is never public.
export function getObjectUrl(key: string): string {
	return `/files/${key.split('/').map(encodeURIComponent).join('/')}`;
}

const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const maxImageBytes = 2 * 1024 * 1024;

/** Stores an uploaded image in R2 under `prefix` and returns its key. */
export async function saveImage(
	env: Env,
	prefix: 'avatars' | 'org' | 'covers' | `project-covers/${string}` | `thread-pictures/${string}`,
	file: File
): Promise<{ ok: true; key: string } | { ok: false; message: string }> {
	if (!imageTypes.includes(file.type)) return { ok: false, message: auth.images.errors.type };
	if (file.size > maxImageBytes) return { ok: false, message: auth.images.errors.size };
	const key = `${prefix}/${newId()}`;
	await putObject(env, key, await file.arrayBuffer(), file.type);
	return { ok: true, key };
}

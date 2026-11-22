import { describe, expect, it, vi } from 'vitest';
import { deleteObject, getObject, getObjectUrl, putObject } from './storage';

function envWithBucket() {
	const bucket = { put: vi.fn(async () => null), get: vi.fn(async () => null), delete: vi.fn() };
	return { bucket, env: { BUCKET: bucket } as unknown as Env };
}

describe('storage', () => {
	it('puts the object in R2 with its content type', async () => {
		const { bucket, env } = envWithBucket();
		await putObject(env, 'avatars/u1.png', 'bytes', 'image/png');
		expect(bucket.put).toHaveBeenCalledWith('avatars/u1.png', 'bytes', {
			httpMetadata: { contentType: 'image/png' }
		});
	});

	it('returns null for a key that is not in R2', async () => {
		const { bucket, env } = envWithBucket();
		expect(await getObject(env, 'missing')).toBeNull();
		expect(bucket.get).toHaveBeenCalledWith('missing');
	});

	it('deletes the object from R2', async () => {
		const { bucket, env } = envWithBucket();
		await deleteObject(env, 'avatars/u1.png');
		expect(bucket.delete).toHaveBeenCalledWith('avatars/u1.png');
	});

	it('serves an object from /files, encoding each path segment but keeping the slashes', () => {
		expect(getObjectUrl('posts/p1/a file#1.png')).toBe('/files/posts/p1/a%20file%231.png');
	});
});

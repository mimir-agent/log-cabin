import { afterEach, expect, it, vi } from 'vitest';
import { emit } from './events';

afterEach(() => {
	vi.useRealTimers();
});

it('sends the event to the JOBS queue stamped with the time it was emitted', async () => {
	vi.useFakeTimers({ now: 1_700_000_000_000 });
	const send = vi.fn(async () => {});
	const env = { JOBS: { send } } as unknown as Env;

	await emit(env, { kind: 'post.created', postId: 'p1', projectId: 'pr1', authorId: 'u1' });

	expect(send).toHaveBeenCalledWith(
		{
			kind: 'post.created',
			postId: 'p1',
			projectId: 'pr1',
			authorId: 'u1',
			emittedAt: 1_700_000_000_000
		},
		{}
	);
});

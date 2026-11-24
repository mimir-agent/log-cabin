import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { postsWorld, routeEvent } from '#lib/server/testing/posts-world.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { load as layoutLoad } from '../+layout.server';
import { load } from './+page.server';
import Page from './+page.svelte';
import type { PageProps } from './$types';

type LayoutEvent = Parameters<typeof layoutLoad>[0];
type LoadEvent = Parameters<typeof load>[0];

describe('the privacy page', () => {
	it('loads for someone signed out, without sending them to sign in', async () => {
		await postsWorld();
		const data = await layoutLoad(routeEvent(null, '/privacy', {}) as unknown as LayoutEvent);
		expect(data?.user).toBeNull();
	});

	it('names the operator from the deployment’s env when none is saved, and links back to sign in', async () => {
		const w = await postsWorld();
		useTestEnv({ ...w.env, OPERATOR_NAME: 'Ada', LEGAL_CONTACT_EMAIL: 'ada@example.com' });
		const data = await load(routeEvent(null, '/privacy', {}) as unknown as LoadEvent);
		const { body } = render(Page, {
			props: { data: data as unknown as PageProps['data'], form: undefined, params: {} }
		});
		expect(body).toContain('<h1>Privacy policy</h1>');
		expect(body).toContain('the operator of this instance (Ada)');
		expect(body).toContain('Email ada@example.com.');
		expect(body).toContain('href="/login"');
	});
});

import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { postsWorld, routeEvent } from '#lib/server/testing/posts-world.js';
import { load as layoutLoad } from '../+layout.server';
import { load } from './+page.server';
import Page from './+page.svelte';
import type { PageProps } from './$types';

type LayoutEvent = Parameters<typeof layoutLoad>[0];
type LoadEvent = Parameters<typeof load>[0];

async function renderedWith(
	w: Awaited<ReturnType<typeof postsWorld>>,
	operator: { name?: string; contact?: string }
) {
	w.sqlite
		.prepare('UPDATE org SET operator_name = ?, operator_contact = ? WHERE id = 1')
		.run(operator.name ?? null, operator.contact ?? null);
	const data = await load(routeEvent(null, '/terms', {}) as unknown as LoadEvent);
	return render(Page, {
		props: { data: data as unknown as PageProps['data'], form: undefined, params: {} }
	}).body;
}

describe('the terms page', () => {
	it('loads for someone signed out, without sending them to sign in', async () => {
		await postsWorld();
		const data = await layoutLoad(routeEvent(null, '/terms', {}) as unknown as LayoutEvent);
		expect(data?.user).toBeNull();
	});

	it('names the operator and gives their contact, and has a way back to sign in', async () => {
		const body = await renderedWith(await postsWorld(), {
			name: 'Ada',
			contact: 'ada@example.com'
		});
		expect(body).toContain('<h1>Terms of service</h1>');
		expect(body).toContain('the operator of this instance (Ada)');
		expect(body).toContain('Email ada@example.com.');
		expect(body).toContain('href="/login"');
	});

	it('points to the admins by name when no contact is set', async () => {
		const w = await postsWorld();
		await w.person('Ida', 'admin');
		await w.person('Bo', 'admin');
		await w.person('Cy', 'member');
		const body = await renderedWith(w, {});
		expect(body).toContain('Ask the organization’s admins: Bo, Ida.');
		expect(body).not.toContain('Email ');
	});
});

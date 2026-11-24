import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { routeEvent } from '#lib/server/testing/posts-world.js';
import { load } from '../+layout.server';
import { legal } from '#lib/strings/legal.js';
import Page from './+page.svelte';

type LoadEvent = Parameters<typeof load>[0];

describe('the terms page', () => {
	it('loads for someone signed out, without sending them to sign in', async () => {
		const data = await load(routeEvent(null, '/terms', {}) as unknown as LoadEvent);
		expect(data?.user).toBeNull();
	});

	it('renders its heading and a way back to sign in', () => {
		const { body } = render(Page);
		expect(body).toContain(`<h1>${legal.terms.title}</h1>`);
		expect(body).toContain('href="/login"');
	});
});

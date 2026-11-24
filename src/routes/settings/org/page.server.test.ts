import { describe, expect, it } from 'vitest';
import { postsWorld, routeEvent } from '#lib/server/testing/posts-world.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { getOperator } from '#lib/server/org.js';
import { actions, load } from './+page.server';

type ActionEvent = Parameters<typeof actions.default>[0];
type LoadEvent = Parameters<typeof load>[0];

const fields = { name: 'Northwind', domainJoin: 'off', callRecording: 'ask' };

describe('/settings/org operator fields', () => {
	it('shows the deployment’s default until an admin saves their own', async () => {
		const w = await postsWorld();
		useTestEnv({ ...w.env, OPERATOR_NAME: 'Env Name', LEGAL_CONTACT_EMAIL: 'env@example.com' });
		const ida = await w.person('Ida', 'admin');

		const data = (await load(routeEvent(ida, '/settings/org', {}) as unknown as LoadEvent)) as {
			operator: { name: string; contact: string };
		};
		expect(data.operator).toEqual({ name: 'Env Name', contact: 'env@example.com' });

		await actions.default(
			routeEvent(
				ida,
				'/settings/org',
				{},
				{
					...fields,
					operatorName: ' Ida ',
					operatorContact: 'ida@example.com'
				}
			) as unknown as ActionEvent
		);
		expect(await getOperator(w.env)).toEqual({ name: 'Ida', contact: 'ida@example.com' });
	});

	it('falls back to the default again when an admin empties the fields', async () => {
		const w = await postsWorld();
		Object.assign(w.env, { LEGAL_CONTACT_EMAIL: 'env@example.com' });
		const ida = await w.person('Ida', 'admin');
		w.sqlite.exec("UPDATE org SET operator_contact = 'old@example.com' WHERE id = 1");

		await actions.default(
			routeEvent(
				ida,
				'/settings/org',
				{},
				{
					...fields,
					operatorName: '',
					operatorContact: ''
				}
			) as unknown as ActionEvent
		);
		expect(await getOperator(w.env)).toEqual({ name: null, contact: 'env@example.com' });
	});

	it('refuses a contact that is not an email address and saves nothing', async () => {
		const w = await postsWorld();
		const ida = await w.person('Ida', 'admin');

		const result = await actions.default(
			routeEvent(
				ida,
				'/settings/org',
				{},
				{
					...fields,
					operatorName: 'Ida',
					operatorContact: 'not an address'
				}
			) as unknown as ActionEvent
		);
		expect(result).toMatchObject({ status: 400 });
		expect(await getOperator(w.env)).toEqual({ name: null, contact: null });
	});
});

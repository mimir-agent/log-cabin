import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { clientId, newId } from './id';

function status(value: string) {
	try {
		clientId(value);
		return 'ok';
	} catch (e) {
		if (isHttpError(e)) return e.status;
		throw e;
	}
}

describe('clientId', () => {
	it('takes an id the browser made with newId', () => {
		const id = newId();
		expect(clientId(id)).toBe(id);
	});

	it('refuses anything else with a 400', () => {
		expect(status('')).toBe(400);
		expect(status(newId().toLowerCase())).toBe(400);
		expect(status(newId().slice(1))).toBe(400);
		expect(status(newId().slice(1) + 'U')).toBe(400);
	});
});

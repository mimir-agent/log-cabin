import { error } from '@sveltejs/kit';
import { core } from '../strings/core';

export { newId } from '../id';

const shape = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** The id the browser made for a message or comment it shows before it's stored; 400 if it isn't one. */
export function clientId(value: string): string {
	if (!shape.test(value)) error(400, core.errors.idRefused);
	return value;
}

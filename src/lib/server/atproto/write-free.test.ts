import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Signing in with an AT Protocol account asks for identity only and never writes to the
// member's PDS. These read the source, so a later change can't add either without failing here.

const src = resolve(import.meta.dirname, '../../..');

const sources = (readdirSync(src, { recursive: true, encoding: 'utf8' }) as string[])
	.filter((path) => /\.(ts|js|svelte)$/.test(path) && !/\.(test|spec)\./.test(path))
	.map((path) => ({ path, text: readFileSync(join(src, path), 'utf8') }));

const usesAtprotoClient = ({ path, text }: { path: string; text: string }) =>
	/atproto|oauth/.test(path) || text.includes('@atcute/oauth-node-client');

describe('AT Protocol sign-in', () => {
	it('has files to check', () => {
		expect(sources.filter(usesAtprotoClient).length).toBeGreaterThan(3);
	});

	it('makes no write call to a PDS', () => {
		const write =
			/com\.atproto\.repo\.(createRecord|putRecord|deleteRecord|applyWrites|uploadBlob)/;
		expect(sources.filter(({ text }) => write.test(text)).map(({ path }) => path)).toEqual([]);
	});

	it('asks for no scope but atproto', () => {
		const scopeValue = /\bscope\s*[:=]\s*['"`]([^'"`]*)['"`]/g;
		const scopeBuilder = /\bscope\.\w+\(|\btransition:/;
		const found = sources
			.filter(usesAtprotoClient)
			.flatMap(({ path, text }) => [
				...[...text.matchAll(scopeValue)]
					.filter(([, value]) => value !== 'atproto')
					.map(() => path),
				...(scopeBuilder.test(text) ? [path] : [])
			]);
		expect(found).toEqual([]);
	});
});

import { describe, expect, it } from 'vitest';
import { checkAttachment } from './attachments';

const env = { ATTACHMENT_MAX_MB: '1' } as unknown as Env;
const file = (name: string, type: string) => new File(['x'], name, { type });

describe('which files may be attached', () => {
	it.each(['demo.origami', 'demo.prd', 'demo.stitch', 'Demo.PRD'])(
		'takes the design-tool file %s whatever type the browser called it, as a download',
		(name) => {
			expect(checkAttachment(env, file(name, ''))).toBe('application/octet-stream');
			expect(checkAttachment(env, file(name, 'application/x-something'))).toBe(
				'application/octet-stream'
			);
		}
	);

	it('takes a JSON file, which an animation is', () => {
		expect(checkAttachment(env, file('spin.json', 'application/json'))).toBe('application/json');
	});

	it('still refuses a program, and a script that could run from our origin', () => {
		expect(() => checkAttachment(env, file('setup.exe', 'application/x-msdownload'))).toThrow();
		expect(() => checkAttachment(env, file('page.html', 'text/html'))).toThrow();
	});
});

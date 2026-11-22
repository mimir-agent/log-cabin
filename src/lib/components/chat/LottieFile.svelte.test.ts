import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import LottieFile from './LottieFile.svelte';

// A layer whose opacity carries an After Effects expression: a string lottie-web's full build
// evaluates as JavaScript on every frame.
const withExpression = (expression: string) => ({
	v: '5.5.2',
	fr: 30,
	ip: 0,
	op: 60,
	w: 100,
	h: 100,
	layers: [
		{
			ty: 4,
			ind: 1,
			ip: 0,
			op: 60,
			st: 0,
			ks: {
				o: { a: 0, k: 100, x: expression },
				r: { a: 0, k: 0 },
				p: { a: 0, k: [50, 50, 0] },
				a: { a: 0, k: [0, 0, 0] },
				s: { a: 0, k: [100, 100, 100] }
			},
			shapes: [
				{ ty: 'rc', d: 1, s: { a: 0, k: [10, 10] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 0 } },
				{ ty: 'fl', c: { a: 0, k: [1, 0, 0, 1] }, o: { a: 0, k: 100 } }
			]
		}
	]
});

afterEach(() => {
	vi.unstubAllGlobals();
	delete (globalThis as { expressionRan?: boolean }).expressionRan;
});

describe('an animation uploaded to a chat', () => {
	it('plays without running the JavaScript in its expressions', async () => {
		vi.stubGlobal('fetch', async () =>
			Response.json(withExpression('globalThis.expressionRan = true; var $bm_rt = 100;'))
		);
		const { container } = render(LottieFile, {
			file: { name: 'spin.json', size: 2048 },
			src: '/files/attachments/f1'
		});

		await expect.poll(() => container.querySelector('[role="img"] svg')).not.toBeNull();
		// Expressions run as the animation draws its frames.
		await new Promise((resolve) => setTimeout(resolve, 500));

		expect(
			(globalThis as { expressionRan?: boolean }).expressionRan,
			'an expression in an uploaded animation ran as JavaScript in the page'
		).toBeUndefined();
	});
});

import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// Without viewport-fit=cover iOS reports every env(safe-area-inset-*) as 0, so the insets the
// shell, the composers and the sheets pad themselves with do nothing in the installed app.
it('lets the page run under the status bar and home indicator, so the safe-area insets are real', () => {
	const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
	const viewport = html.match(/<meta name="viewport" content="([^"]*)"/)?.[1];
	expect(viewport).toContain('viewport-fit=cover');
});

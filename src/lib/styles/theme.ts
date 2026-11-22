// Light, dark or the system's choice. The whole app follows one attribute on <html>:
// `data-theme="light"` or `data-theme="dark"` forces a scheme, and no attribute follows
// `prefers-color-scheme`. suede-css sets `color-scheme` from the attribute, and every colour
// token is a `light-dark()`, so nothing else has to change. Any subtree can force a scheme the
// same way (the call stage and the lightbox are always dark).

export const themeChoices = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof themeChoices)[number];
export type ColorScheme = 'light' | 'dark';

export const themeAttribute = 'data-theme';

/**
 * Where the attribute goes in `src/app.html`: `<html lang="en" %theme%>`. The handle hook
 * replaces it in `transformPageChunk` with `themeHtmlAttribute(choice)`.
 */
export const themePlaceholder = '%theme%';

export function isThemeChoice(value: unknown): value is ThemeChoice {
	return typeof value === 'string' && (themeChoices as readonly string[]).includes(value);
}

/** Anything stored that isn't a known choice counts as "system". */
export function parseThemeChoice(value: unknown): ThemeChoice {
	return isThemeChoice(value) ? value : 'system';
}

/** The attribute's value for a choice; null means leave it off and follow the system. */
export function themeAttributeValue(choice: ThemeChoice): ColorScheme | null {
	return choice === 'system' ? null : choice;
}

/**
 * The attribute as HTML, for the server to write into `<html>` before the page is sent, so a
 * forced scheme is there at first paint. Empty for "system": the CSS already follows the OS.
 */
export function themeHtmlAttribute(choice: ThemeChoice): string {
	const value = themeAttributeValue(choice);
	return value ? ` ${themeAttribute}="${value}"` : '';
}

/** The scheme a choice comes out as, given whether the system prefers dark. */
export function resolveScheme(choice: ThemeChoice, systemPrefersDark: boolean): ColorScheme {
	if (choice === 'system') return systemPrefersDark ? 'dark' : 'light';
	return choice;
}

/**
 * Switches the page to a choice at once, without a reload. Colour transitions are held for one
 * frame so the switch is a single cut, not every border and background fading on its own clock.
 */
export function applyTheme(choice: ThemeChoice, root: HTMLElement = document.documentElement) {
	const value = themeAttributeValue(choice);
	const hold = root.ownerDocument.createElement('style');
	hold.textContent = '*,*::before,*::after{transition:none!important}';
	root.ownerDocument.head.appendChild(hold);

	if (value) root.setAttribute(themeAttribute, value);
	else root.removeAttribute(themeAttribute);

	// Reading a computed style flushes the change while transitions are off.
	void getComputedStyle(root).colorScheme;
	requestAnimationFrame(() => hold.remove());
}

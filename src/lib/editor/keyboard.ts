/**
 * Where the on-screen keyboard is. iOS Safari leaves the layout viewport as tall as the page and
 * shrinks only the visual viewport, so a bottom-anchored surface has to be lifted by the gap;
 * Chromium and Android shrink the layout viewport itself, and the gap is 0. The three custom
 * properties it writes (tokens.css has their defaults) are what surfaces offset themselves by.
 */

type Visual = { height: number; offsetTop: number };

/** The px between the layout viewport's bottom edge and the bottom of what the person can see. */
export function keyboardInset(innerHeight: number, visual: Visual): number {
	return Math.max(0, Math.round(innerHeight - visual.height - visual.offsetTop));
}

/**
 * Keeps `--keyboard-inset`, `--visual-h` and `--visual-top` on `<html>` current, one write per
 * frame however many `visualViewport` events arrive. Returns the stop.
 */
export function trackKeyboard(): () => void {
	const viewport = window.visualViewport;
	if (!viewport) return () => {};
	const root = document.documentElement.style;
	let frame = 0;
	const write = () => {
		frame = 0;
		root.setProperty('--keyboard-inset', `${keyboardInset(window.innerHeight, viewport)}px`);
		root.setProperty('--visual-h', `${viewport.height}px`);
		root.setProperty('--visual-top', `${viewport.offsetTop}px`);
	};
	const schedule = () => {
		if (!frame) frame = requestAnimationFrame(write);
	};
	write();
	viewport.addEventListener('resize', schedule);
	viewport.addEventListener('scroll', schedule);
	return () => {
		viewport.removeEventListener('resize', schedule);
		viewport.removeEventListener('scroll', schedule);
		cancelAnimationFrame(frame);
	};
}

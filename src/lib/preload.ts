import { preloadCode } from '$app/navigation';
import { match } from '$app/paths';

let settled: Promise<unknown> | undefined;

/** Resolves once the window's `load` has fired and the page's fonts are in. */
function pageSettled() {
	settled ??= new Promise((done) => {
		if (document.readyState === 'complete') done(null);
		else addEventListener('load', done, { once: true });
	}).then(() => document.fonts.ready);
	return settled;
}

/** Watches every link under `element`, now and as more arrive, and loads each one's code once it shows. */
function observeLinks(element: HTMLElement) {
	const loaded = new WeakSet<Element>();
	const shown = new IntersectionObserver((entries) => {
		for (const { isIntersecting, target } of entries) {
			if (!isIntersecting) continue;
			loaded.add(target);
			shown.unobserve(target);
			void match((target as HTMLAnchorElement).href).then(
				(route) => route && preloadCode(route.id)
			);
		}
	});
	const observeAll = () => {
		for (const a of element.querySelectorAll('a')) if (!loaded.has(a)) shown.observe(a);
	};
	const added = new MutationObserver(observeAll);
	observeAll();
	added.observe(element, { childList: true, subtree: true });
	return () => {
		shown.disconnect();
		added.disconnect();
	};
}

/**
 * An attachment that does what `data-sveltekit-preload-code="viewport"` does, but starts only
 * once the page has loaded and its fonts are in. On a slow phone line, dozens of route chunks
 * fetched at first paint hold up the font.
 */
export function preloadInView(element: HTMLElement) {
	let stop: (() => void) | undefined;
	let gone = false;
	void pageSettled().then(() => {
		if (!gone) stop = observeLinks(element);
	});
	return () => {
		gone = true;
		stop?.();
	};
}

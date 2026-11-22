import { flushSync, unmount } from 'svelte';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { popupHost } from '#lib/editor/suggestion-popup.js';

/** What a list component exports for the editor to drive it: SuggestionList's own pair. */
export type SuggestionListExports<Item> = {
	show: (items: Item[], rect: DOMRect | null, input: HTMLElement) => void;
	keydown: (event: KeyboardEvent) => boolean;
};

/**
 * Tiptap's suggestion `render` for a list: mounts it where `popupHost` says, shows each query's
 * items under the caret, hands it the keys, and removes it on exit.
 */
export function suggestionRender<Item, Attrs>(list: {
	/** Mounts the list in `target`; it calls `select` when an item is picked. */
	mount: (
		target: HTMLElement,
		props: SuggestionProps<Item, Attrs>,
		select: (item: Item) => void
	) => SuggestionListExports<Item>;
	/** What picking `item` does, with the props of the query's current range. */
	pick: (props: SuggestionProps<Item, Attrs>, item: Item) => void;
}): NonNullable<SuggestionOptions<Item, Attrs>['render']> {
	return () => {
		let mounted: SuggestionListExports<Item>;
		let target: HTMLElement;
		// Each update carries a command for the current query's range, so picking uses the latest.
		let latest: SuggestionProps<Item, Attrs>;
		const show = (props: typeof latest) => {
			latest = props;
			mounted.show(props.items, props.clientRect?.() ?? null, props.editor.view.dom);
		};
		return {
			onStart: (props) => {
				target = popupHost(props.editor.view.dom).appendChild(document.createElement('div'));
				mounted = list.mount(target, props, (item) => list.pick(latest, item));
				// A list component reaches its inner list through bind:this, set in an effect that
				// mount() leaves pending; `show` needs it now.
				flushSync();
				show(props);
			},
			onUpdate: show,
			onKeyDown: ({ event }) => mounted.keydown(event),
			onExit: () => {
				unmount(mounted);
				target.remove();
			}
		};
	};
}

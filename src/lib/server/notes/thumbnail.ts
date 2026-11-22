// A note's thumbnail: its title and first blocks drawn as a PNG inside the Worker. Satori lays
// the picture out as SVG, resvg rasterises it; both run as WebAssembly (thumbnail-files.ts).
import satori, { init as initLayout } from 'satori/wasm';
import initYoga from 'yoga-wasm-web';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { docText, type DocNode } from '../../editor/doc';
import { notes as strings } from '../../strings/notes';
import { interBold, interRegular, resvgWasm, yogaWasm } from './thumbnail-files';
import { thumbnailSizes, type ThumbnailSize } from './thumbnails';

/**
 * The light theme's colours, copied from tokens.css: Satori needs concrete values, and resvg
 * can't parse oklch().
 */
const colours = {
	/** --hue-z0-bg (light): --hue-white, oklch(100% 0 0). */
	background: '#ffffff',
	/** The same, fully transparent, where the fade over the last lines starts. */
	backgroundClear: 'rgba(255, 255, 255, 0)',
	/** --hue-z0-fg (light): --hue-gray-900. */
	fg: '#171717',
	/** --hue-z0-muted (light): --hue-gray-500. */
	muted: '#737373'
};

/** Spacing and type sizes, in pixels, at each size. */
const layout: Record<ThumbnailSize, { padding: number; title: number; text: number }> = {
	og: { padding: 72, title: 60, text: 30 },
	grid: { padding: 40, title: 34, text: 18 }
};

export type NoteThumbnails = Record<ThumbnailSize, Uint8Array>;

/** The note fields a thumbnail shows. */
export type ThumbnailNote = { title: string; body: DocNode };

const textBlocks = new Set(['paragraph', 'heading', 'blockquote']);
const lists = new Set(['bulletList', 'orderedList', 'taskList']);
/** More blocks than either size has room for; the rest would be laid out only to be cut. */
const maxLines = 12;

/** The text of the body's first paragraphs, headings and list items; images and files are skipped. */
export function thumbnailLines(body: DocNode): string[] {
	const lines = (body.content ?? []).flatMap((block) => {
		if (textBlocks.has(block.type)) return [docText(block)];
		if (!lists.has(block.type)) return [];
		const items = (block.content ?? []).map(docText).filter(Boolean);
		return items.map((item) => `• ${item}`);
	});
	return lines.filter(Boolean).slice(0, maxLines);
}

// Satori takes React elements; these plain objects are all a React element is to it.
type Element = { type: string; props: Record<string, unknown> };
type SatoriElement = Parameters<typeof satori>[0];
const div = (style: Record<string, unknown>, children?: unknown): Element => ({
	type: 'div',
	props: { style, children }
});

function picture(note: ThumbnailNote, size: ThumbnailSize): Element {
	const s = { ...thumbnailSizes[size], ...layout[size] };
	return div(
		{
			display: 'flex',
			flexDirection: 'column',
			width: s.width,
			height: s.height,
			boxSizing: 'border-box',
			padding: s.padding,
			gap: s.text,
			backgroundColor: colours.background,
			fontFamily: 'Inter'
		},
		[
			div(
				{ color: colours.fg, fontSize: s.title, fontWeight: 700, lineHeight: 1.2, lineClamp: 2 },
				note.title || strings.editor.titlePlaceholder
			),
			div(
				{
					display: 'flex',
					flexDirection: 'column',
					flexGrow: 1,
					position: 'relative',
					overflow: 'hidden',
					gap: s.text / 2
				},
				[
					...thumbnailLines(note.body).map((line) =>
						div({ color: colours.muted, fontSize: s.text, lineHeight: 1.45, lineClamp: 3 }, line)
					),
					div({
						position: 'absolute',
						left: 0,
						right: 0,
						bottom: 0,
						height: s.text * 3,
						backgroundImage: `linear-gradient(to bottom, ${colours.backgroundClear}, ${colours.background})`
					})
				]
			)
		]
	);
}

let ready: Promise<unknown> | undefined;

/** The note's thumbnail at both sizes, as PNGs. */
export async function renderNoteThumbnails(note: ThumbnailNote): Promise<NoteThumbnails> {
	await (ready ??= Promise.all([initWasm(resvgWasm), initYoga(yogaWasm).then(initLayout)]));
	const fonts = [
		{ name: 'Inter', data: interRegular, weight: 400 as const, style: 'normal' as const },
		{ name: 'Inter', data: interBold, weight: 700 as const, style: 'normal' as const }
	];
	const render = async (size: ThumbnailSize) => {
		const { width, height } = thumbnailSizes[size];
		const svg = await satori(picture(note, size) as SatoriElement, { width, height, fonts });
		const resvg = new Resvg(svg, { fitTo: { mode: 'original' } });
		const image = resvg.render();
		const png = image.asPng();
		image.free();
		resvg.free();
		return png;
	};
	return { og: await render('og'), grid: await render('grid') };
}

// Syntax highlighting for code blocks, shared by the note editor and RichText. It carries every
// common grammar, so both import it only where code blocks are shown.
import { common, createLowlight } from 'lowlight';

export const lowlight = createLowlight(common);

/** The tokens of a code block's text, as a hast tree of `hljs-*` spans and text. */
export type Highlighted = ReturnType<typeof lowlight.highlight>;

/**
 * A code block's tokens in its language when lowlight knows it, else in whichever language it
 * looks most like: what the editor's highlighting does too.
 */
export function highlightCode(code: string, language: unknown): Highlighted {
	return typeof language === 'string' && lowlight.registered(language)
		? lowlight.highlight(language, code)
		: lowlight.highlightAuto(code);
}

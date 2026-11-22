// A comment's passage in a note's live document: the noteComment mark, written by the note's
// hub straight into the Yjs document, so it moves with concurrent edits like any other text.
import * as Y from 'yjs';
import * as buf from 'lib0/buffer';
import * as sha256 from 'lib0/hash/sha256';
import { bodyField } from '../../notes/live';

const markName = 'noteComment';

/**
 * The text attribute y-prosemirror stores this comment's mark under. A mark that may overlap
 * others of its kind is keyed by a hash of its JSON (marksToAttributes in @tiptap/y-tiptap);
 * this is the same hash, so an editor finds the mark it would have written and leaves it be.
 */
export function commentMarkKey(commentId: string): string {
	const hash = sha256.digest(buf.encodeAny({ type: markName, attrs: { commentId } }));
	for (let i = 6; i < hash.length; i++) hash[i % 6] ^= hash[i];
	return `${markName}--${btoa(String.fromCharCode(...hash.slice(0, 6)))}`;
}

/**
 * The bytes of base64 text, as the browser's lib0 wrote them. lib0's own decoder, and its
 * encoder, use Node's Buffer anywhere but in a browser, and Workers have no Buffer.
 */
export function fromBase64(text: string): Uint8Array {
	return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

/** The document's text runs in reading order. */
function texts(type: Y.XmlFragment | Y.XmlElement): Y.XmlText[] {
	return type
		.toArray()
		.flatMap((child) =>
			child instanceof Y.XmlText ? [child] : child instanceof Y.XmlElement ? texts(child) : []
		);
}

/** Where an encoded relative position is now, if it is still in a text run of the document. */
function textPosition(doc: Y.Doc, encoded: Uint8Array) {
	const at = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(encoded), doc);
	if (!at || !(at.type instanceof Y.XmlText) || at.type._item?.deleted) return null;
	return { text: at.type, index: at.index };
}

/**
 * Marks the text between two relative positions (encoded Y.RelativePositions, as the browser
 * made them from its copy of the document) with the comment, across every text run between
 * them, in one transaction with `origin`. False, and nothing changed, when either position is
 * gone or no text is left between them, as when the passage was deleted.
 */
export function markComment(
	doc: Y.Doc,
	commentId: string,
	start: Uint8Array,
	end: Uint8Array,
	origin: unknown
): boolean {
	const [from, to] = [textPosition(doc, start), textPosition(doc, end)];
	if (!from || !to) return false;
	const runs = texts(doc.getXmlFragment(bodyField));
	const [first, last] = [runs.indexOf(from.text), runs.indexOf(to.text)];
	if (first < 0 || first > last || (first === last && from.index >= to.index)) return false;
	const attributes = { [commentMarkKey(commentId)]: { commentId } };
	doc.transact(() => {
		for (let i = first; i <= last; i++) {
			const begin = i === first ? from.index : 0;
			const length = (i === last ? to.index : runs[i].length) - begin;
			if (length > 0) runs[i].format(begin, length, attributes);
		}
	}, origin);
	return true;
}

/** Takes the comment's mark off wherever it is, in one transaction; false when it was nowhere. */
export function unmarkComment(doc: Y.Doc, commentId: string, origin: unknown): boolean {
	const found: { text: Y.XmlText; index: number; length: number; key: string }[] = [];
	for (const text of texts(doc.getXmlFragment(bodyField))) {
		let index = 0;
		for (const op of text.toDelta() as { insert: unknown; attributes?: object }[]) {
			const length = typeof op.insert === 'string' ? op.insert.length : 1;
			for (const [key, value] of Object.entries(op.attributes ?? {})) {
				if (key.startsWith(markName) && value?.commentId === commentId) {
					found.push({ text, index, length, key });
				}
			}
			index += length;
		}
	}
	if (found.length === 0) return false;
	doc.transact(() => {
		for (const { text, index, length, key } of found) text.format(index, length, { [key]: null });
	}, origin);
	return true;
}

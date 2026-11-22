import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import { documentSchema } from '../../editor/extensions';
import { bodyField } from '../../notes/live';
import * as buf from 'lib0/buffer';
import { commentMarkKey, fromBase64 } from './comment-marks';

describe('a comment’s mark in a live document', () => {
	it('is stored under the same key the editor stores it under, so an editor leaves it be', () => {
		const commentId = '01JD5Z3W8Q9X2M4N6P7R8S9T0V';
		const doc = new Y.Doc();
		const body = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{
							type: 'text',
							text: 'the ridge',
							marks: [{ type: 'noteComment', attrs: { commentId } }]
						}
					]
				}
			]
		};
		prosemirrorJSONToYXmlFragment(documentSchema(), body, doc.getXmlFragment(bodyField));
		const paragraph = doc.getXmlFragment(bodyField).get(0) as Y.XmlElement;
		const [run] = (paragraph.get(0) as Y.XmlText).toDelta() as { attributes: object }[];

		expect(run.attributes).toEqual({ [commentMarkKey(commentId)]: { commentId } });
	});

	it('is keyed, and its passage read, without the Node Buffer that Workers lack', () => {
		const commentId = '01JD5Z3W8Q9X2M4N6P7R8S9T0V';
		const key = commentMarkKey(commentId);
		const position = new Uint8Array([0, 171, 132, 213, 234, 9, 13, 65]);
		const encoded = buf.toBase64(position);
		vi.stubGlobal('Buffer', undefined);
		try {
			expect(commentMarkKey(commentId)).toBe(key);
			expect(fromBase64(encoded)).toEqual(position);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

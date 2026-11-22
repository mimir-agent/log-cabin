import { describe, expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import { editorExtensions, mentionSuggestion } from './extensions';
import { noteExtensions } from './note-extensions';

type Surface = 'post' | 'chat' | 'note';

/** A paste with every block syntax: headings, lists, a task, a quote, a fence, marks and a divider. */
const markdown = [
	'# Title',
	'## Sub',
	'- one',
	'1. first',
	'- [ ] task',
	'> quoted',
	'```js',
	'const a = 1;',
	'```',
	'**bold** _it_ `code` ~~gone~~ [link](https://example.com)',
	'---'
].join('\n');

/** An editor as the post and comment boxes (`post`), chat, or a note's (`note`) build it. */
function open(surface: Surface, withoutMarkdownPaste = false, content?: JSONContent) {
	const extensions = editorExtensions({
		placeholder: () => 'Write',
		mentionSuggestion: mentionSuggestion(() => []),
		checklists: surface !== 'chat',
		extra: surface === 'note' ? noteExtensions(() => ({}), undefined) : undefined
	}).filter((extension) => !(withoutMarkdownPaste && extension.name === 'markdownPaste'));
	const element = document.body.appendChild(document.createElement('div'));
	const editor = new Editor({ element, extensions, content });
	/** Pastes the clipboard `data` by type, the way a browser does. */
	const paste = (data: Record<string, string>) => {
		const clipboardData = new DataTransfer();
		for (const [type, value] of Object.entries(data)) clipboardData.setData(type, value);
		editor.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true }));
	};
	const done = () => {
		editor.destroy();
		element.remove();
	};
	return { editor, paste, done };
}

/** The document's blocks, less the empty paragraphs a paste may leave around them. */
const blocks = (editor: Editor): JSONContent[] =>
	(editor.getJSON().content ?? []).filter((node) => node.type !== 'paragraph' || node.content);
const types = (editor: Editor) => blocks(editor).map((node) => node.type);

/** One line with two spaces in it, and the position between them: a paste lands in the middle. */
const line: JSONContent = {
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello  world' }] }]
};
const between = 7;

describe.each<Surface>(['post', 'chat', 'note'])(
	'pasting Markdown into the %s editor',
	(surface) => {
		it('turns its blocks and marks into nodes', () => {
			const { editor, paste, done } = open(surface);
			paste({ 'text/plain': markdown });
			expect(types(editor)).toEqual([
				'heading',
				'heading',
				'bulletList',
				'orderedList',
				// Chat leaves tasks out, so a task there is a bullet item.
				...(surface === 'chat' ? ['bulletList'] : ['taskList']),
				'blockquote',
				'codeBlock',
				'paragraph',
				'horizontalRule'
			]);
			const [title, sub, , , , , code, line] = blocks(editor);
			expect(title).toMatchObject({ attrs: { level: 1 }, content: [{ text: 'Title' }] });
			expect(sub).toMatchObject({ attrs: { level: 2 } });
			expect(code).toMatchObject({
				attrs: { language: 'js' },
				content: [{ text: 'const a = 1;' }]
			});
			expect(
				line.content?.map((node) => [node.text, node.marks?.map((mark) => mark.type)])
			).toEqual([
				['bold', ['bold']],
				[' ', undefined],
				['it', ['italic']],
				[' ', undefined],
				['code', ['code']],
				[' ', undefined],
				['gone', ['strike']],
				[' ', undefined],
				['link', ['link']]
			]);
			done();
		});

		it('joins one pasted paragraph to the line it lands in', () => {
			const { editor, paste, done } = open(surface, false, line);
			editor.commands.setTextSelection(between);
			paste({ 'text/plain': 'see **this**' });
			expect(blocks(editor)).toMatchObject([
				{
					type: 'paragraph',
					content: [
						{ text: 'Hello see ' },
						{ text: 'this', marks: [{ type: 'bold' }] },
						{ text: ' world' }
					]
				}
			]);
			done();
		});

		it('keeps the link of one pasted paragraph in the line it lands in', () => {
			const { editor, paste, done } = open(surface, false, line);
			editor.commands.setTextSelection(between);
			paste({ 'text/plain': 'a [link](https://x.com) b' });
			expect(blocks(editor)).toMatchObject([
				{
					type: 'paragraph',
					content: [
						{ text: 'Hello a ' },
						{ text: 'link', marks: [{ type: 'link', attrs: { href: 'https://x.com' } }] },
						{ text: ' b world' }
					]
				}
			]);
			done();
		});

		it('joins the paragraphs at the ends of a longer paste to the line it lands in', () => {
			const { editor, paste, done } = open(surface, false, line);
			editor.commands.setTextSelection(between);
			paste({ 'text/plain': 'start **x**\n# Head\nend' });
			expect(editor.getText({ blockSeparator: '|' })).toBe('Hello start x|Head|end world');
			expect(types(editor)).toEqual(['paragraph', 'heading', 'paragraph']);
			done();
		});

		it('takes one undo to undo a paste into a line', () => {
			const { editor, paste, done } = open(surface, false, line);
			const before = editor.getJSON();
			editor.commands.setTextSelection(between);
			paste({ 'text/plain': 'see **this**' });
			expect(editor.getText()).toBe('Hello see this world');
			editor.commands.undo();
			expect(editor.getJSON()).toEqual(before);
			done();
		});

		it('is one undo step', () => {
			const { editor, paste, done } = open(surface);
			const before = editor.getJSON();
			paste({ 'text/plain': markdown });
			expect(types(editor).length).toBeGreaterThan(1);
			editor.commands.undo();
			expect(editor.getJSON()).toEqual(before);
			done();
		});

		it('leaves a pasted link to javascript: as text', () => {
			const { editor, paste, done } = open(surface);
			paste({ 'text/plain': '# Title\n[click](javascript:alert(1))' });
			expect(JSON.stringify(editor.getJSON())).not.toContain('"link"');
			expect(editor.getText()).toContain('[click](javascript:alert(1))');
			done();
		});

		it('pastes plain text as typed on Ctrl+Shift+V', () => {
			const { editor, paste, done } = open(surface);
			const keys = { key: 'V', ctrlKey: true, shiftKey: true, bubbles: true };
			editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', keys));
			paste({ 'text/plain': markdown });
			editor.view.dom.dispatchEvent(new KeyboardEvent('keyup', keys));
			expect(new Set(types(editor))).toEqual(new Set(['paragraph']));
			expect(editor.getText()).toContain('# Title');
			done();
		});

		it('pastes text with no Markdown as the editor does', () => {
			const { editor, paste, done } = open(surface);
			paste({ 'text/plain': 'Just words\nover two lines' });
			expect(editor.getText({ blockSeparator: '|' })).toBe('Just words|over two lines');
			done();
		});

		it('keeps rich HTML as the editor pastes it without the Markdown paste', () => {
			const html =
				'<h2>Day</h2><ul><li>one</li></ul><ol><li>first</li></ol><p><strong>b</strong> <em>i</em> <s>s</s> <code>c</code> <a href="https://example.com">link</a></p><blockquote><p>quoted</p></blockquote><pre><code>x = 1</code></pre><hr>';
			const plain = 'Day\none\nfirst\nb i s c link\nquoted\nx = 1';
			const { editor, paste, done } = open(surface);
			const baseline = open(surface, true);
			paste({ 'text/html': html, 'text/plain': plain });
			baseline.paste({ 'text/html': html, 'text/plain': plain });
			expect(types(editor)).toEqual([
				'heading',
				'bulletList',
				'orderedList',
				'paragraph',
				'blockquote',
				'codeBlock',
				'horizontalRule'
			]);
			expect(editor.getJSON()).toEqual(baseline.editor.getJSON());
			done();
			baseline.done();
		});

		it('pastes code from a code editor as code, and its Markdown as Markdown', () => {
			const html = '<div style="color: #d4d4d4">x</div>';
			const data = (mode: string) => JSON.stringify({ mode });
			const { editor, paste, done } = open(surface);
			paste({
				'text/html': html,
				'text/plain': '# a\nconst b = 1;',
				'vscode-editor-data': data('typescript')
			});
			expect(blocks(editor)).toMatchObject([
				{
					type: 'codeBlock',
					attrs: { language: 'typescript' },
					content: [{ text: '# a\nconst b = 1;' }]
				}
			]);
			editor.commands.clearContent();
			paste({
				'text/html': html,
				'text/plain': '**x** = 1;',
				'vscode-editor-data': data('typescript')
			});
			expect(blocks(editor)).toMatchObject([
				{ type: 'paragraph', content: [{ text: '**x** = 1;', marks: [{ type: 'code' }] }] }
			]);
			editor.commands.clearContent();
			paste({ 'text/html': html, 'text/plain': '# Doc', 'vscode-editor-data': data('markdown') });
			expect(types(editor)).toEqual(['heading']);
			done();
		});

		it('pastes into a code block as typed', () => {
			const { editor, paste, done } = open(surface);
			editor.commands.setCodeBlock();
			paste({ 'text/plain': '# Title\n- one' });
			expect(blocks(editor)).toMatchObject([
				{ type: 'codeBlock', content: [{ text: '# Title\n- one' }] }
			]);
			done();
		});
	}
);

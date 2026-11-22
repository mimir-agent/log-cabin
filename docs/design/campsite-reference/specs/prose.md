Source: Campsite (github.com/campsite/campsite) at commit cc14551, CC BY-NC 4.0.

# Prose: post, comment and chat bodies

Rich text in Campsite is rendered in two families of styles:

- `.prose`: post bodies, comment bodies, resolution notes, and every editable editor (post composer, comment composer). Built on `@tailwindcss/typography` 0.5 with Campsite overrides.
- `.chat-prose`: chat message bubbles, call chat and reply previews. Not built on the typography plugin.

Source files:

- `apps/web/styles/prose.css` (all `.prose` and `.chat-prose` overrides)
- `apps/web/styles/editor.css` (ProseMirror placeholder, details block)
- `packages/ui/src/styles/global.css` (`.prose h1–h6` weight, button/link focus ring)
- `packages/ui/src/styles/code.css` (syntax highlighting, One Light / One Dark)
- `packages/ui/tailwind.config.js` (`typography.DEFAULT.css.fontSize: '0.9375rem'`)
- `apps/web/components/InlinePost/InlinePostRenderer.tsx`, `apps/web/components/Comments/CommentRenderer.tsx`, `apps/web/components/MarkdownEditor/index.tsx`
- `apps/web/components/RichTextRenderer/handlers/*` (Mention, Kbd, RelativeTime, CodeBlock)
- `apps/web/components/Thread/Bubble/index.tsx` (chat bubble)
- `packages/editor/src/extensions/{Link,Mention,Comment,Details,HorizontalRule}.ts` (class names emitted into the HTML)

## 1. Token reference used in this file

| Token               | Light              | Dark                      |
| ------------------- | ------------------ | ------------------------- |
| `--text-primary`    | gray-900 `#171717` | gray-100 `#F5F5F5`        |
| `--text-secondary`  | gray-600 `#525252` | gray-300 `#D4D4D4`        |
| `--text-tertiary`   | gray-500 `#737373` | gray-400 `#A3A3A3`        |
| `--text-quaternary` | gray-400 `#A3A3A3` | gray-500 `#737373`        |
| `--bg-tertiary`     | gray-100 `#F5F5F5` | gray-800 `#262626`        |
| `--bg-quaternary`   | gray-150 `#F0F0F0` | gray-750 `#313131`        |
| `--bg-elevated`     | white `#FFFFFF`    | gray-850 `#1E1E1E`        |
| `--border-primary`  | `rgb(0 0 0 / 0.1)` | `rgb(255 255 255 / 0.12)` |

Tailwind palette colours referenced: blue-500 `#3B82F6`, blue-100 `#DBEAFE`, blue-400 `#60A5FA`, blue-600 `#2563EB`, blue-900 `#1E3A8A`, yellow-300 `#FDE047`, yellow-500 `#EAB308`, neutral-400 `#A3A3A3`, neutral-700 `#404040`, neutral-800 `#262626`.

Font: Inter via `next/font` (`--font-inter`), then the Tailwind default sans stack. `font-synthesis-weight: none` is set on `*`.

## 2. `.prose` base

```css
.prose {
	@apply text-primary max-w-full break-words leading-normal;
	word-break: break-word;
	word-wrap: break-word;
}
```

| Property    | Value                                                                                  |
| ----------- | -------------------------------------------------------------------------------------- |
| font-size   | 15px (`typography.DEFAULT.css.fontSize: '0.9375rem'`). Notes use 16px (`.prose.note`). |
| line-height | 1.5 → 22.5px (`leading-normal` overrides the plugin's 1.75)                            |
| colour      | `--text-primary` (`#171717` / `#F5F5F5`)                                               |
| max-width   | 100% (plugin's 65ch removed)                                                           |
| wrapping    | `word-break: break-word; overflow-wrap: break-word`                                    |

Container element (renderer): `<div class="prose select-text focus:outline-none">` around the rendered HTML. Comments add `data-reactions-only="true|false"`.

Editor element (TipTap `editorProps.attributes.class`):

```
prose editing focus:outline-none w-full max-w-full overflow-hidden select-auto {text-sm if textSize=sm} {containerClasses}
style="min-height: {minHeight}; max-height: {maxHeight};"
```

Default `containerClasses` is `px-3 py-2.5` (12px / 10px), default `minHeight` is 48px. The post composer uses `px-3 py-1` with `min-height: 128px; max-height: none`. Inline comment composers use `p-0 overflow-visible` with `min-height: none`.

### Block spacing

```css
p,
pre,
ul,
ol,
blockquote,
> div {
	@apply my-[1em];
} /* 15px at 15px */
> :first-child:not(.not-prose) {
	@apply mt-0;
}
> :last-child:not(.not-prose) {
	@apply mb-0;
}
```

Paragraph gap is therefore 15px (margins collapse between siblings), and the first and last blocks sit flush with the container. Custom block wrappers (`> div`, e.g. media galleries, link unfurls) use the same 1em rhythm. `> .node-mediaGallery:first-child` gets `mt-0`, `:last-child` gets `mb-1` (4px) so focus outlines are not clipped.

Every override is written as `selector:not(:where([class~='not-prose'] *))` so that blocks marked `.not-prose` keep their own styling.

## 3. Headings

The editor offers H1–H3 only.

```css
:where(h1, h2, h3, h1 strong, h2 strong, h3 strong) {
	@apply text-primary mb-2.5 mt-0 font-semibold;
}
h1 {
	@apply text-xl;
}
h2 {
	@apply text-lg;
}
h3 {
	@apply text-base;
}
```

`packages/ui/src/styles/global.css` also declares `.prose h1, …, h6 { @apply text-primary font-bold }` with higher specificity (0,1,1) than the `:where()` rule (0,1,0), so the rendered heading weight is 700. Bold runs inside a heading (`h1 strong`) resolve to 600.

| Level               | Size / line-height | Weight                                               | Margin top / bottom | Colour           |
| ------------------- | ------------------ | ---------------------------------------------------- | ------------------- | ---------------- |
| h1                  | 20px / 28px        | 700                                                  | 0 / 10px            | `--text-primary` |
| h2                  | 18px / 28px        | 700                                                  | 0 / 10px            | `--text-primary` |
| h3                  | 16px / 24px        | 700                                                  | 0 / 10px            | `--text-primary` |
| link inside heading | inherits size      | 600 (`a.prose-link:not(.mention) { font-semibold }`) |                     | blue-500         |

Notes (`.prose.note`, 16px base) use bold 700, `leading-[1.3]`, and fluid sizes: h1 `clamp(1.575rem, 4vw, 1.875rem)` (25.2–30px) with mt 40px / mb 8px; h2 `clamp(1.275rem, 4vw, 1.575rem)` (20.4–25.2px) mt 32px / mb 8px; h3 `clamp(1.175rem, 4vw, 1.275rem)` (18.8–20.4px) mt 24px / mb 6px.

## 4. Lists

Typography plugin defaults that remain in effect (em values at 15px):

| Property                        | Value                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ul`, `ol` margin               | 15px top/bottom (Campsite `my-[1em]`)                                                                                       |
| `ul`, `ol` padding-inline-start | 1.625em → 24.375px                                                                                                          |
| `li` margin                     | 0.5em → 7.5px top and bottom                                                                                                |
| `li` padding-inline-start       | 0.375em → 5.625px                                                                                                           |
| `ul > li::marker`               | `--tw-prose-bullets` = `#D1D5DB` (Tailwind's stock gray-300; the plugin uses its own palette, not Campsite's gray override) |
| `ol > li::marker`               | `--tw-prose-counters` = `#6B7280`, weight 400                                                                               |
| list-style                      | `disc` / `decimal`                                                                                                          |

Campsite overrides:

```css
:where(ul, ol) {
	ul,
	ol {
		@apply my-0;
	}
	p {
		@apply m-0;
	}
}
```

Nested lists have no extra vertical margin, and paragraphs inside list items have zero margin, so list rhythm is driven only by the 7.5px `li` margins.

### Task list (checklist)

```
<ul class="task-list"><li class="task-item" data-checked="true|false"><label><input type="checkbox"></label><div><p>…</p></div></li></ul>
```

- `ul.task-list`: `list-none`.
- `li.task-item`: `relative`.
- Checkbox: `absolute -left-5 top-0 -ml-1.5 mr-3 mt-0.5 h-5 w-5 rounded border border-black/[0.12] bg-elevated bg-clip-border align-top cursor-pointer` → 20×20px, radius 4px, 0.5px border `rgb(0 0 0 / 0.12)` (dark `rgb(255 255 255 / 0.08)`), background `--bg-elevated` (dark `bg-quaternary` `#313131`). Sits 20px + 6px left of the text, 2px down.
  - checked: `border-blue-500 bg-blue-500` (`#3B82F6`), white check from the forms plugin.
  - focus: `border-blue-500 ring-2 ring-blue-100` (dark `border-blue-400 ring-blue-600/20`), ring offset 0.
  - disabled / read-only (`.task-list-disabled`): `cursor-default`, no focus ring.
- Checked item text: `li[data-checked='true'] > div > p { text-quaternary line-through decoration-2 }` → `#A3A3A3` / `#737373`, 2px strike line. Inline `code` inside a checked item becomes `inline-block` and quaternary so the line does not run through it.
- `div:first-of-type` inside the item: `mb-0 min-w-[1em]` (keeps the caret visible in an empty item).

## 5. Blockquote

```css
blockquote {
	@apply text-secondary border-primary font-normal;
}
blockquote p:first-of-type::before,
::after {
	display: none;
} /* plugin's curly quotes removed */
blockquote blockquote {
	@apply my-0;
}
```

| Property             | Value                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------- |
| colour               | `--text-secondary` `#525252` / `#D4D4D4`                                                  |
| weight               | 400                                                                                       |
| style                | italic (plugin default, kept)                                                             |
| border-inline-start  | 0.25em → 3.75px solid `--border-primary` (`rgb(0 0 0 / 0.1)` / `rgb(255 255 255 / 0.12)`) |
| padding-inline-start | 1em → 15px                                                                                |
| margin               | 15px top/bottom; nested blockquotes 0                                                     |

## 6. Inline code

```css
code {
	@apply text-primary bg-tertiary whitespace-pre-wrap rounded border px-1 py-px font-medium dark:border-neutral-700 dark:bg-neutral-800;
}
code::before,
code::after {
	display: none;
} /* plugin backticks removed */
```

| Property   | Light                                       | Dark                        |
| ---------- | ------------------------------------------- | --------------------------- |
| font-size  | 0.875em → 13.125px (plugin)                 | same                        |
| weight     | 500                                         | 500                         |
| colour     | `--text-primary` `#171717`                  | `#F5F5F5`                   |
| background | `--bg-tertiary` `#F5F5F5`                   | neutral-800 `#262626`       |
| border     | 0.5px `--border-primary` `rgb(0 0 0 / 0.1)` | 0.5px neutral-700 `#404040` |
| padding    | 1px 4px                                     | same                        |
| radius     | 4px                                         | same                        |
| wrap       | `white-space: pre-wrap`                     | same                        |

## 7. Code block

```css
pre {
	@apply bg-tertiary border p-4 dark:border-neutral-700 dark:bg-neutral-800;
}
pre code {
	@apply text-primary whitespace-pre border-none bg-transparent p-0;
}
```

| Property    | Light                                                                                                                                                   | Dark                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| font-size   | 0.875em → 13.125px                                                                                                                                      | same                               |
| line-height | 1.7142857 → 22.5px                                                                                                                                      | same                               |
| font-family | `'Fira Code', 'Fira Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace` when a `language-*` class is present (code.css); plugin mono stack otherwise | same                               |
| padding     | 16px                                                                                                                                                    | same                               |
| margin      | 1em of the pre's own size → 13.125px top/bottom                                                                                                         | same                               |
| background  | `--bg-tertiary` `#F5F5F5`                                                                                                                               | neutral-800 `#262626`              |
| border      | 0.5px `--border-primary`                                                                                                                                | 0.5px neutral-700 `#404040`        |
| radius      | 6px (plugin `0.375rem`); 0.3em ≈ 4px when code.css applies via `language-*`                                                                             | same                               |
| overflow    | `overflow-x: auto`, `white-space: pre` on the inner code                                                                                                | same                               |
| text-shadow | none                                                                                                                                                    | `0 1px rgba(0,0,0,0.3)` (One Dark) |

Syntax token colours come from `packages/ui/src/styles/code.css`: One Light in light mode (comments `hsl(230 4% 64%)`, keywords `hsl(301 63% 40%)`, strings `hsl(119 34% 47%)`, functions `hsl(221 87% 60%)`, numbers `hsl(35 99% 36%)`, tags/deleted `hsl(5 74% 59%)`), and One Dark under `.dark` (foreground `hsl(220 14% 71%)`). The renderer uses Refractor (`RichTextRenderer/handlers/CodeBlock.tsx`). Editable code blocks show a language picker (`CodeBlockLanguagePicker`) when `enableSyntaxHighlighting` is set.

## 8. Links

Links in the HTML carry `class="prose-link"` and wrap their text in a `<span>` (`packages/editor/src/extensions/Link.ts`).

```css
.prose a,
.chat-prose a {
	@apply break-words font-normal no-underline;
	word-break: break-word;
	font-feature-settings: 'calt' 0;
}
.prose a.prose-link:not(.mention) {
	@apply font-normal text-blue-500 hover:underline;
}
.chat-prose a.prose-link:not(.mention) {
	@apply underline;
}
```

| State         | Post / comment (`.prose`)                                                             | Chat (`.chat-prose`)                    |
| ------------- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| rest          | blue-500 `#3B82F6`, weight 400, no underline                                          | inherits bubble text colour, underlined |
| hover         | underline                                                                             | underline                               |
| focus-visible | base rule for all `a`: `ring-2 ring-blue-100` (dark `ring-blue-600/40`), outline none | same                                    |

`.truncate-links a[data-truncated] span { display: none }` hides the long middle of auto-truncated URLs.

The editor's control-click link behaviour and the link bubble menu are described in composer.md.

## 9. Mentions

`<span class="mention" data-type="mention" data-id data-label data-username data-role>@Name</span>`

```css
.prose .mention {
	@apply text-primary cursor-pointer font-semibold;
}
.chat-prose .mention {
	@apply cursor-pointer font-semibold;
}
```

- Weight 600, colour `--text-primary`, no background, no padding. Text includes the leading `@`.
- In a viewer's own (blue) chat bubble: `[.viewer-chat-prose_&]:text-white`.
- App/integration mentions (`data-role="app"`) use `cursor-default`.
- Hovering a member mention opens the member hovercard (`MentionInteractivity`).

## 10. Other inline nodes

| Node                                                 | Classes                                                                                                                                                                                                                     | Result                                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Strong                                               | `strong { text-inherit }`                                                                                                                                                                                                   | weight 600 (plugin), colour inherits                                                                                   |
| Emphasis                                             | plugin default                                                                                                                                                                                                              | italic                                                                                                                 |
| Underline / strike                                   | browser default `u`, `s`                                                                                                                                                                                                    |                                                                                                                        |
| Custom emoji (`img[data-type='reaction']`)           | `my-0 inline-block h-4 w-4 object-contain align-text-top cursor-text`                                                                                                                                                       | 16×16px inline                                                                                                         |
| Native emoji (`span[data-type='reaction']`)          | `font-[emoji] leading-none`                                                                                                                                                                                                 |                                                                                                                        |
| Reactions-only body (`[data-reactions-only='true']`) | `.prose`: `text-4xl leading-none`, images `h-9 w-9`                                                                                                                                                                         | 36px emoji, images 36×36                                                                                               |
| Kbd                                                  | `bg-quaternary rounded-md border px-1 py-0.5 font-mono text-[13px] font-medium`                                                                                                                                             | 13px mono, 4px/2px padding, radius 6px, 0.5px border                                                                   |
| Relative time chip                                   | `cursor-default rounded bg-black/[0.04] px-[3px] py-0.5 align-baseline font-medium hover:bg-black/[0.08] dark:bg-white/10 dark:hover:bg-white/[0.14]`                                                                       | radius 4px, 3px/2px padding                                                                                            |
| Horizontal rule                                      | wrapper `div[data-hr-wrapper] { py-2 }`, `hr { my-0 border-t-2 }`                                                                                                                                                           | 8px above and below a 2px line in the plugin's `--tw-prose-hr` colour `#E5E7EB`; selected in editor: `border-blue-500` |
| Inline note comment highlight                        | `.note-comment { cursor-pointer border-b-2 border-yellow-300 bg-yellow-300/20 transition-colors dark:border-yellow-500 }`, hover `bg-yellow-300/50`                                                                         | 2px underline `#FDE047` (dark `#EAB308`), fill `rgb(253 224 71 / 0.2)`, hover 0.5                                      |
| Collaboration caret                                  | `.collaboration-cursor__caret { relative -mx-px inline border-x }`; label `absolute -left-px top-0 -translate-y-full rounded-md rounded-bl-none p-1 text-xs font-medium leading-none`, hides after 1500ms with a 100ms fade |                                                                                                                        |

## 11. Details (collapsible section)

From editor.css, applies inside `.ProseMirror`:

- `.details`: `my-2.5 flex rounded-lg` (10px vertical margin, radius 8px).
- Toggle button: `-ml-1 mr-1 h-6 w-6 flex-none rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-600 hover:opacity-70 dark:hover:bg-gray-700 dark:hover:text-gray-200`; glyph `▼` at 0.9em, rotated −90° when closed, 0° when open, with `transition-transform`.
- `summary`: weight 600. Empty summary shows `Section title` in neutral-400 `#A3A3A3`.
- Content: `mt-1` (4px). Empty content shows `Write, type '/' for commands, or paste/drag files` in neutral-400.

## 12. Editor-only styles

### Placeholder

```css
.ProseMirror p.is-editor-empty:first-child::before {
	@apply text-quaternary pointer-events-none float-left h-0;
	content: attr(data-placeholder);
}
```

- Colour `--text-quaternary` (`#A3A3A3` light, `#737373` dark), same size and line-height as body text (15px / 22.5px).
- Placeholders used: `What would you like to share?` (post body), `Write a comment...`, `Write a reply...` / `Write a reply` (comment composers).
- Multi-block post editor (`.ProseMirror.new-posts`): `.is-empty-prompt::before` uses neutral-400 `#A3A3A3`; in empty lists the placeholder is shifted `pl-1.5` (6px) to align with the caret.

Plain `<input>` and `<textarea>` placeholders (e.g. the post title field) use `placeholder-neutral-400` → `#A3A3A3` in both themes (`apps/web/styles/global.css`).

### Selection and caret

- Text selection uses the browser default highlight; there is no custom `::selection` rule for prose.
- Selected node (image, gallery, hr): hr turns blue-500; in notes `.ProseMirror-selectednode` has its outline removed. Inline atom nodes (relative time) show `outline outline-2 outline-blue-500` when selected and focused.
- Drop cursor: 2px blue-500 (`dropcursor: { class: 'text-blue-500', width: 2 }`); a trailing drop indicator below the editor is `mx-auto h-[2px] max-w-[44rem] bg-blue-500`.
- Focus: the editable element has `focus:outline-none`; focus is shown by the surrounding composer, not the text area.

### Drag handle (block editors)

`.drag-handle`: `fixed`, 1.2rem × 1.5rem (19.2×24px), radius 4px, six-dot SVG background in `rgba(163,163,163,1)` light / `rgba(82,82,82,1)` dark, size `calc(0.5em + 0.375rem)`. Opacity 0 → 1 on hover of a focused editor, `transition: opacity ease-in 0.1s`; hover background gray-100 `#F5F5F5` (dark gray-800 `#262626`). Hidden on coarse pointers and when the document has a single non-list child.

## 13. Comment bodies

Comments use the same `.prose` (`CommentRenderer.tsx`): 15px / 22.5px, `--text-primary`, same block rules. Differences:

- Wrapper: `flex max-w-full flex-1 flex-col gap-2` around the body, then `pb-2` (8px) below the body row.
- `data-reactions-only='true'` (body contains only emoji): 36px emoji, `leading-none`, custom emoji images 36×36.
- Comment attachments render below the body through `GroupedAttachments display='page'` (see post-detail.md).

## 14. `.chat-prose` (chat bubbles)

Bubble (`Thread/Bubble/index.tsx`):

```
chat-prose relative select-text whitespace-pre-wrap break-words px-3.5 py-2 lg:px-3
  other person: bg-quaternary text-primary
  viewer:       bg-blue-500 text-white viewer-chat-prose
```

| Property            | Value                                                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| font-size           | 16px below `lg`, 14px at `lg`+ (`[data-reactions-only='false'] { text-base lg:text-sm }`)                                                                                                                            |
| line-height         | 24px / 20px (from `text-base` / `text-sm`)                                                                                                                                                                           |
| padding             | 8px vertical; 14px horizontal, 12px at `lg`+                                                                                                                                                                         |
| radius              | 18px, with the corner nearest the next/previous bubble of the same sender reduced to 4px                                                                                                                             |
| other-person bubble | `--bg-quaternary` `#F0F0F0` / `#313131`, text `--text-primary`                                                                                                                                                       |
| viewer bubble       | blue-500 `#3B82F6`, white text                                                                                                                                                                                       |
| paragraphs          | `word-break: break-word`; empty `<p>` renders a non-breaking space so blank lines persist                                                                                                                            |
| links               | underlined, colour inherits                                                                                                                                                                                          |
| mentions            | weight 600; white in viewer bubbles                                                                                                                                                                                  |
| inline code         | `rounded-[3px] px-1 py-0.5 text-[15px] font-medium tracking-tight lg:text-[13px] whitespace-pre-wrap`; background `bg-black/[0.08]` (dark `bg-white/10`) in other-person bubbles, `bg-blue-900/25` in viewer bubbles |
| reactions-only      | `text-5xl leading-none` (48px), custom emoji 48×48, no bubble background                                                                                                                                             |
| inline custom emoji | 15×15 (`h-[15px] w-[15px]`) in text messages                                                                                                                                                                         |

Reply preview (`.reply-prose`, used in `ReplyPreview.tsx` and the comment `ReplyContent` chip): `text-tertiary chat-prose line-clamp-1` at 12–14px; code inside is `inline-block py-px text-[11px] ring-0`.

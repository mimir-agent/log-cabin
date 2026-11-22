# Styles

Campfire's design foundation, on top of suede-css. `src/app.css` imports these files in order.

| File                    | What it holds                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `port-to-suede-css.css` | Additions meant for suede-css itself: the `--text-*`, `--gap-*`, `--leading-*` scale |
| `tokens.css`            | Campfire's colour, elevation, radius, size and motion tokens                         |
| `type.css`              | Inter, the type roles and app-wide text defaults                                     |
| `prose.css`             | `.prose`, for post, comment and note bodies and the editor                           |
| `interaction.css`       | Native fields, keyboard focus, the `data-press` pressed state and reduced motion     |
| `fonts/`                | Inter Variable, with its licence (SIL OFL 1.1)                                       |

## Rules of thumb

- Never write a colour, size or font stack by hand. Every value is a token below or a suede-css
  token (`--gap-*`, `--text-*`, `--radius-*`, `--border-w-*`).
- The interface is neutral. `--hue-accent` is the one strong colour, and it marks the primary
  action and unread state only. Status colours say what happened, nothing else.
- Hierarchy comes from colour and placement before size. Most text is `--type-body` (14px);
  secondary text is the surface's `muted` colour, not a smaller size.

## Colour

Pick the surface, then stay in its set. Each has `bg`, `fg`, `muted` and `border`.

| Surface | Use for                                         |
| ------- | ----------------------------------------------- |
| `z0`    | The main column                                 |
| `z1`    | Sidebar, right rail, code blocks, table headers |
| `z2`    | Popovers, menus, dialogs                        |

| Token                                 | Use for                                             |
| ------------------------------------- | --------------------------------------------------- |
| `--hue-hover`, `--hue-pressed`        | Background of a row or button under pointer / press |
| `--hue-selected`                      | The current row, the current nav item               |
| `--hue-accent`, `--hue-accent-fg`     | Primary button fill and its text                    |
| `--hue-accent-subtle`                 | Mentions, a highlighted row                         |
| `--hue-unread`                        | Unread dots and counts                              |
| `--hue-danger`, `--hue-danger-subtle` | Destructive actions and errors                      |
| `--hue-success`, `--hue-warning`      | Status text and icons                               |
| `--hue-focus-ring`                    | Already applied to `:focus-visible`; don't restyle  |
| `--hue-caret`                         | The caret of a writing surface; it has no ring      |
| `--hue-selection`                     | Selected text (applied to `::selection`)            |
| `--hue-field-edge-focus`              | A field's edge while focused; a quote's bar         |
| `--hue-link`                          | Links inside text; links in the interface use `fg`  |

Light and dark follow the system. To force one, set `data-theme="light"` or `data-theme="dark"`
on `<html>`; any subtree can do the same, as the call stage and the lightbox do (they are dark in
both themes). `theme.ts` has what a theme setting needs: the choices, the attribute for the
server to write at first paint, and `applyTheme()` to switch the open page in one cut. See
`docs/design/parity.md` §2.

| Token                                        | Use for                                                     |
| -------------------------------------------- | ----------------------------------------------------------- |
| `--hue-live`, `--hue-live-subtle`            | A call in progress or a recording: the red dot, a live row  |
| `--hue-online`, `--hue-speaking`             | The presence dot; the ring on whoever is talking (marks)    |
| `--hue-media-bg`                             | Behind video and full-size images                           |
| `--hue-backdrop`                             | Behind a modal dialog                                       |
| `--person`, `--person-fg`, `--person-subtle` | A person's colour, under `data-hue="<scale>"`: carets, pins |

## Type

| Token             | Size     | Use for                                       |
| ----------------- | -------- | --------------------------------------------- |
| `--type-caption`  | 12       | Timestamps, counts, metadata                  |
| `--type-body`     | 14       | The interface: rows, buttons, labels          |
| `--type-prose`    | 15       | Bodies of posts, comments and notes           |
| `--measure-prose` | 38em     | The long-form line: a post or note body       |
| `--type-title`    | 20       | A title inside the content (settings section) |
| `--type-display`  | 24 to 32 | A post's or note's own title on its page      |

Set line height where you set the size: `--leading-ui` (1) for one line inside a control,
`--leading-tight` for headings and dense single lines, `--leading-loose` for anything that wraps.
Weight: regular almost everywhere, `--fw-medium` for a person's or post's name in a list,
`--fw-semibold` for titles. `<time>` and `.u:tabular` get tabular figures.

Wrap anything people wrote in `.prose`. Use `data-size="compact"` for comments and chat. A post's body takes `data-size="post"` and a note's `data-size="note"`; only those two hold the `--measure-prose` line.

The page header names the screen at interface size (14px semibold), the way dense apps do. Titles
inside the content use the utilities `u:type-display` (a post's or note's own title) and
`u:type-title` (a section of a settings page).

## Space, radius, elevation, motion

- Space: `--gap-xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, then fluid `2xl`+.
- Controls: `--control-h-sm` 28, `--control-h-md` 32, `--control-h-lg` 40. `--tap-min` (44) is the
  smallest touch target: under a coarse pointer `Button`, `SuedeButton` and `IconButton` grow to
  it in both height and width.
- Safe areas: `--safe-bottom` is the inset of the bottom edge with a floor, for a surface
  anchored there that has no padding of its own (`viewport-fit=cover` makes the inset real).
- Radius: `--radius-control` for buttons, inputs and rows; `--radius-surface` for popovers and
  dialogs; `--radius-full` for avatars and pills.
- Elevation is for things that float: `--elevation-popover` (menus, popovers),
  `--elevation-dialog` (modals). Everything else separates with a border or a surface step.
- Motion: `--motion-fast` with `--motion-ease` for hover and press; `--motion-base` for things
  that move in or out. Use motion when it shows where something came from or went. Reduced motion is handled
  globally.
- Layout sizes: `--sidebar-w`, `--rail-w`, `--header-h`, and `--measure` for the reading column.

## Shell components

All in `src/lib/components/shell/`, with stories under Shell in Storybook. The root layout
already wraps every signed-in page in `AppShell`, so a page renders only its own content.

| Component                                      | Use for                                                                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppShell`                                     | The frame: sidebar, main column, mobile drawer below 48rem, skip link. Takes `counts` (unread by nav href), `projects` and `userMenu` snippets.            |
| `PageHeader`                                   | First thing on every page. `title`, plus `description`, `leading` and `actions` snippets. Sticks to the top.                                               |
| `PageColumns`                                  | The page body. `width="reading"` centres it at `--measure` for posts, notes and threads; `full` for lists. A `rail` snippet adds the right rail at 72rem+. |
| `ListRow`                                      | Every row in a list: inbox, posts, notes, members. `href` makes it a link; `leading`, `description` and `meta` snippets; `unread` and `selected`.          |
| `EmptyState`                                   | What a list shows when it has nothing. `title`, `description`, and one `action`.                                                                           |
| `Avatar`                                       | People (round) and the org or projects (`shape="square"`). Initials on a tint from the name when there's no image. Sizes xs 16, sm 24, md 32, lg 40.       |
| `Badge`                                        | Counts and short labels. `tone` neutral, unread or danger. Pass `label` when the visible text needs words for screen readers ("3" → "3 unread").           |
| `UnreadDot`                                    | The unread marker on a row or item.                                                                                                                        |
| `Toolbar`, `ToolbarButton`, `ToolbarSeparator` | Rows of small buttons: the editor, a post's actions. Arrow keys move between buttons. `ToolbarButton` needs a `label`; `pressed` for toggles.              |
| `SidebarLink`                                  | Links in the sidebar's `projects` snippet, so they match the nav.                                                                                          |

The primary button is `#lib/components/ui/SuedeButton.svelte`; its fill is `--hue-accent`. Use it
once per screen, for the main action.

Strings the shell shows live in `#lib/strings/shell`.

## UI components

In `src/lib/components/ui/`, with stories under UI in Storybook: `Button` (secondary, ghost,
danger; sm, md, lg; `pressed` for toggles), `Dialog`, `Popover`, `Menu`, `SegmentedControl`,
`Switch`, `Banner`, `FacePile` and `Spinner`. `docs/design/parity.md` §3 says which to use where.

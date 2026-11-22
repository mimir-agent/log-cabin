# Design: calls, live notes, posts, people and onboarding

This is the layout, the states and the components for each new surface. It builds on the
foundation in `src/lib/styles/` (read its README first) and the shell in
`src/lib/components/shell/`. Shared components named here live in `src/lib/components/ui/` and
have stories under **UI** in Storybook.

Wording in this document shows the shape of a message, not its final words. Every string a
person reads goes in the module's file in `src/lib/strings/`.

## Contents

1. [Shared rules](#1-shared-rules)
2. [Theme: light, dark and system](#2-theme-light-dark-and-system)
3. [Shared components](#3-shared-components)
4. [Calls](#4-calls): stage, incoming call, recording, devices, the call page
5. [Live notes](#5-live-notes): cursors and presence
6. [Posts](#6-posts): poll, drafts, versions, gallery and lightbox, canvas comments, emoji
   picker, public post page, link preview
7. [People](#7-people): profile, status, local time, last seen
8. [Joining](#8-joining): onboarding, join requests
9. [Quiet hours](#9-quiet-hours)

---

## 1. Shared rules

These hold on every surface below. A section only repeats one when it bends it.

- **Type.** Interface text is `--type-body` (14). Metadata (times, counts, "edited") is
  `--type-caption` (12) in the surface's `muted` colour. Anything a person wrote is in `.prose`.
  A title inside the content is `u:type-title`; a post's or note's own title is `u:type-display`.
  Nothing else gets a size.
- **Colour.** Stay in one surface set (`z0`, `z1`, `z2`). The ember accent marks the screen's one
  primary action and unread state. Live things (a call in progress, a recording) use
  `--hue-live`; a person online uses `--hue-online`. Status colours say what happened.
- **Media surfaces are dark in both themes.** The call stage, the lightbox and the video player
  sit on `--hue-media-bg` and set `data-theme="dark"` on their root, so every control inside takes
  the dark tokens with no extra rules. Faces and photos read best on near-black, and a white frame
  around video glares.
- **Every list has five states:** loading, empty, error, one item, and the longest realistic
  case. Loading shows the page's frame with the header filled in and a `Spinner` where the list
  goes; it never shows a skeleton that guesses the content's shape. Empty is `EmptyState` with
  one action. An error says what failed and offers a retry that keeps what the person typed.
- **Names and titles truncate on one line** with an ellipsis and the full text in `title`, in
  rows and tiles. On a page of their own they wrap (`text-wrap: balance`).
- **Times** are `<time datetime>` with tabular figures: relative under a day ("4 min ago"),
  then a date. The exact time is in `title`.
- **Motion** explains a change: something arriving, leaving, or moving between two places. Use
  `--motion-fast` for colour and press, `--motion-base` for things that enter. Nothing loops
  except the recording dot and a spinner, and reduced motion stops both.
- **Touch.** Anything you press in a call, a lightbox or on a phone is at least
  `--control-h-lg` (40).
- **Focus.** Never remove the focus ring. A dialog returns focus to whatever opened it.

## 2. Theme: light, dark and system

The whole app follows one attribute on `<html>`:

| Choice | `<html>`             | Result                               |
| ------ | -------------------- | ------------------------------------ |
| System | no `data-theme`      | follows `prefers-color-scheme`       |
| Light  | `data-theme="light"` | light, whatever the operating system |
| Dark   | `data-theme="dark"`  | dark, whatever the operating system  |

Every colour token is a `light-dark()` pair, and suede-css sets `color-scheme` from the
attribute, so components need nothing of their own. Native controls (checkboxes, selects,
scrollbars, date inputs) follow `color-scheme` too.

`src/lib/styles/theme.ts` holds everything a theme setting needs:

- `themeChoices`, `parseThemeChoice(value)`: the three choices, and a reader that turns anything
  unknown into `system`.
- `themeHtmlAttribute(choice)`: the attribute as an HTML string. The server writes it into
  `<html>` before the page is sent (a `%theme%` placeholder in `app.html`, filled in the handle
  hook's `transformPageChunk`), so a forced theme is there at first paint, with no flash and no
  inline script.
- `applyTheme(choice)`: switches the open page at once after the setting is saved. It holds
  every transition for one frame, so the change is a single cut and buttons don't fade through
  muddy in-between colours.
- `resolveScheme(choice, systemPrefersDark)`: which scheme a choice comes out as, for the rare
  thing that has to know (a canvas drawing, an embedded map).

**Settings → Profile → Appearance** shows the choice as a `SegmentedControl` with System, Light,
Dark, in that order, System first because it is the default. It saves on change, with no Save
button. Signed out (login, public post) always follows the system.

Any subtree can force a scheme with the same attribute, as the media surfaces do. A forced
subtree must paint its own background and text colour from the surface tokens.

## 3. Shared components

| Component          | Where                     | Use for                                                                            |
| ------------------ | ------------------------- | ---------------------------------------------------------------------------------- |
| `Button`           | `ui/Button.svelte`        | Every action that isn't the screen's primary one: secondary, ghost, danger; sizes. |
| `SuedeButton`      | `ui/SuedeButton.svelte`   | The screen's one primary action.                                                   |
| `Dialog`           | `ui/Dialog.svelte`        | Modal questions and forms: confirm, recording consent, crop, bulk invite.          |
| `Popover`          | `ui/Popover.svelte`       | Non-modal panels from a button: device picker, emoji picker, status, hover cards.  |
| `Menu`             | `ui/Menu.svelte`          | Lists of commands or one-of choices: overflow menus, device lists, "Move to".      |
| `SegmentedControl` | `ui/SegmentedControl`     | Two to four exclusive views or modes: call layout, theme, list or grid.            |
| `Switch`           | `ui/Switch.svelte`        | A setting that is on or off and takes effect at once: quiet hours, public link.    |
| `Banner`           | `ui/Banner.svelte`        | A line above the content about the state of the page: recording, offline.          |
| `FacePile`         | `ui/FacePile.svelte`      | Several people in a small space: who's editing, who voted, who's in the call.      |
| `Spinner`          | `ui/Spinner.svelte`       | Waiting on something with no known length, always with a label.                    |
| `Avatar`           | `shell/Avatar.svelte`     | One person or the org. Adds `xl` (64) and a `presence` dot.                        |
| `ListRow`          | `shell/ListRow.svelte`    | Every row in a list: drafts, versions, join requests, calls.                       |
| `EmptyState`       | `shell/EmptyState.svelte` | Every empty list.                                                                  |

Components that belong to one surface (the call tile, the poll, the lightbox) live in that
module's folder under `src/lib/components/` and use these. Add a story only for a component that
two or more modules share.

### Person colours

A person's colour (their caret in a note, their pin on an image, the ring on their face in a
`FacePile`) comes from `data-hue="<scale>"` on the element. The server picks the scale per person
from a fixed list. The element then has three tokens:

| Token             | Use for                            |
| ----------------- | ---------------------------------- |
| `--person`        | The mark: caret bar, pin, ring     |
| `--person-fg`     | Text on the mark: the name label   |
| `--person-subtle` | Their selection, behind other text |

The steps are chosen so `--person-fg` on `--person` passes 4.5:1 in both themes (700 with white
text in light, 400 with near-black text in dark). Never put white text on a 500 or 600 step; it
fails contrast.

### Live tokens

| Token               | Use for                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `--hue-live`        | A call in progress, a recording: the red dot and the live border. |
| `--hue-live-subtle` | Background of a live row, such as a call happening now.           |
| `--hue-online`      | The presence dot. A mark, never text.                             |
| `--hue-speaking`    | The ring on the tile of whoever is talking.                       |
| `--hue-media-bg`    | Behind video and full-size images.                                |
| `--hue-backdrop`    | Behind a modal dialog or the lightbox.                            |

## 4. Calls

### 4.1 Call stage

When joined, the stage takes the whole main column below the page header; the right rail holds
people and chat and closes below 72rem.

```
┌ Page header: place name · [● 12:04 elapsed] ······ [Invite] [⋯] ┐
│ [Banner: recording]                                               │
│ ┌──────────────── stage (media-bg, dark) ──────────────────────┐  │
│ │                                                              │  │
│ │                   speaker tile (16:9)                        │  │
│ │                                                              │  │
│ │  ┌────┐ ┌────┐ ┌────┐ ┌────┐  ← filmstrip, scrolls          │  │
│ │  └────┘ └────┘ └────┘ └────┘                                 │  │
│ └──────────────────────────────────────────────────────────────┘  │
│        [mic] [camera] [share] | [layout] [devices] | [Leave]      │
└───────────────────────────────────────────────────────────────────┘
```

**Layouts.** A `SegmentedControl` (size `sm`) in the control bar: Speaker, Grid. The choice is
kept per browser.

- **Speaker.** The active speaker fills the stage at 16:9, letterboxed in `--hue-media-bg`. A
  screen share always takes the large tile and the speaker moves to the strip. Everyone else is
  in a strip of tiles 10rem wide at 16:9 under it, scrolling sideways; the strip hides when the
  call is two people, and the other person gets the large tile.
- **Grid.** Tiles of equal size, as large as fits, 16:9. Use a fixed set of columns by count
  (1: 1, 2: 2, 3–4: 2, 5–9: 3, 10–16: 4, more: 4 and the grid scrolls), so tiles never jump to odd
  sizes. Gap `--gap-sm`.

**Active speaker changes** move the large tile with no animation of the video itself; the
speaking ring fades in over `--motion-base`. Changing who is large on every syllable is
exhausting, so hold a speaker for at least 2 seconds before switching.

**A tile** (`calls/CallTile.svelte`):

- Video fills the tile with `object-fit: cover` for cameras and `contain` for screen shares.
  Your own camera is mirrored; your screen share isn't.
- Camera off: their `Avatar` at `xl` centred on `--hue-z1-bg` (dark).
- A name plate at the bottom left: name in `--type-caption`, medium weight, on a
  `color-mix(in oklch, var(--hue-media-bg) 72%, transparent)` pill so it reads on any video. A
  muted mic icon goes before the name.
- Speaking: a `--border-w-thick` ring in `--hue-speaking` inside the tile edge.
- Connection poor: a small signal icon at the top right, with its meaning in `title`.
- Radius `--radius-surface`. Tiles never have shadows.

**Control bar.** Centred under the stage, on `z0`, outside the dark stage, so it reads as the
page's own controls. Buttons are `Button` size `lg`, ghost, icon plus a visually hidden label,
with the shortcut in `title`. Mic and camera are toggles (`pressed`); when off they show the
crossed-out icon in `--hue-danger`. Groups split by a `ToolbarSeparator`: your media, the view,
then Leave on its own at the end as `danger`. Below 48rem the labels go and the bar is fixed to
the bottom of the screen.

**States.**

| State             | What shows                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Before joining    | Your camera preview in one tile at 16:9 (or your avatar), the device picker inline under it, and Join as the `SuedeButton`.   |
| Joining           | Join becomes a `Spinner` labelled "Joining"; the preview stays.                                                               |
| Alone             | Your tile, and in the stage centre: "Waiting for others" with an Invite button and the room link to copy.                     |
| Permission denied | A `Banner` (warning) over the stage saying which device was blocked and how to allow it in the browser; the call still joins. |
| Reconnecting      | A `Banner` (warning) "Reconnecting"; tiles freeze rather than vanish.                                                         |
| Ended / left      | The stage is replaced by a short page: the call's length, who was there (`FacePile`), Rejoin, and a link to the call page.    |
| 25+ people        | Grid pages at 16 tiles; the strip in speaker view scrolls. The rail shows everyone.                                           |

### 4.2 Incoming call

An incoming call shows as a card fixed to the top centre of the window, over everything, on `z2`
with `--elevation-dialog`. It is non-modal and leaves focus where it was, so whatever someone is
typing keeps their keystrokes and the next one can't answer the call by accident:

```
┌─────────────────────────────────────────────────────┐
│ (Av)  Ada Okafor                     [ ✕ ]  [ Join ] │
│       Calling you · Spring catalog                  │
└─────────────────────────────────────────────────────┘
```

- `role="alertdialog"`, `aria-modal="false"`, labelled by the caller's name, described by the
  second line, and announced when it appears. Answer and decline get shortcuts while it is open,
  picked with the app's global shortcuts so they don't collide with the browser's, and listed in
  the keyboard sheet.
- 26rem wide, `--radius-surface`. On a phone it spans the width with `--gap-sm` margins.
- Caller's `Avatar` (`lg`); for a group call, a `FacePile` of who is already in.
- Decline: `Button` ghost, size `lg`, icon only. Join: `SuedeButton`, the one place in a call
  invitation the accent goes. The two don't sit together as red and green circles: the accent
  already says which is the answer, and red-green pairs fail for colour-blind people.
- It slides 8px down and fades in over `--motion-base`, and leaves the same way. A soft sound
  every 5 seconds, which the person can turn off in notification settings.
- After 30 seconds it goes and a missed-call item lands in the inbox. Several calls at once
  stack, newest on top, at most three.
- If the call ends before anyone answers, the card changes to "Call ended" for 2 seconds, then
  leaves.

### 4.3 Recording banner and consent

**Starting.** Record is in the control bar's overflow menu, never a one-press button, so it
can't start by accident. It opens a `Dialog` (size `sm`):

- Title: start recording?
- Body: who will be able to play it back (the members of the place the call belongs to), that
  everyone in the call is told, and that a transcript is made.
- Actions: Cancel (`Button`), Start recording (`SuedeButton`).

**While recording,** everyone in the call sees a compact pill under the call's title: the
breathing red dot, "Recording", and Stop as a small `Button` for people who may stop it. Who
started it is the pill's tooltip. Outside the call (the call page, the pre-join screen) it is a
`Banner` with `tone="live"`, full width of the column, with "Recording, started by [name]". The page header also gets a red dot before
the elapsed time, so the state survives scrolling. The banner never closes while recording is
on.

**Joining a call that is recording:** the pre-join screen shows the same banner above the
preview, so people know before they join.

**Stopping** asks nothing, because starting again undoes it. The banner turns neutral for 4
seconds to say the recording is saved and will appear on the call page, then goes. There is no
toast as well.

States: starting (the Start button becomes a `Spinner` "Starting"), failed (a `Banner`
danger "Recording couldn't start" with Try again), video stopped because the person recording
left (the banner says only audio is being recorded now).

### 4.4 Device picker

A `Menu` from the devices button in the control bar, and inline under the preview before
joining. Three groups with `GroupHeading`s, Microphone, Camera, Speaker, each a
`RadioGroup` of devices. The current device is checked. Then a separator and a
`CheckboxItem` for noise cancellation.

- Device names are long ("MacBook Pro Microphone (Built-in)"); the menu grows to 20rem and
  truncates the rest with the full name in `title`.
- A microphone level meter sits beside the microphone heading: 5 bars, filled in
  `--hue-speaking`, updated at 10 fps. It is how people check the right mic before they speak.
- No permission yet: the group shows one item, "Allow access", which asks the browser.
- No devices of a kind: the group shows "None found", disabled.
- Speaker group is hidden where the browser can't choose an output.
- A device unplugged mid-call falls back to the system default and shows a warning `Banner`
  for 4 seconds naming the device that went.

### 4.5 Call page: playback and transcript

`/calls/<id>` after the call, with `PageColumns width="full"` and the right rail.

```
┌ Page header: call title · date · length ············ [⋯] ┐
│ ┌──────────── player (media-bg, 16:9) ───────────┐ │ Rail: │
│ │                                                │ │ People│
│ └────────────────────────────────────────────────┘ │ Links │
│ [▶] 04:12 ━━━━━━━●━━━━━━━━━━━━━ 38:20  1× [⤢]      │       │
│                                                     │       │
│ Summary                                             │       │
│ • bullet with its [1] [2] citations                 │       │
│                                                     │       │
│ Transcript                       [Search transcript]│       │
│ 00:00  Ada Okafor   Let's start with the cover…     │       │
│ 00:14  Morgan Lee   The light was flat on Monday…   │       │
└─────────────────────────────────────────────────────────────┘
```

- **Player.** Video when there is video, else an audio bar with the waveform of the mixed track
  drawn in `--hue-z0-muted`, played part in `--hue-z0-fg`. Controls are native-feeling: space
  plays and pauses, arrows skip 5 seconds. The scrubber shows chapter ticks where the speaker
  changes.
- **Summary.** Each bullet is `.prose` with its citations as small superscript links; clicking
  one scrolls the transcript to that line, highlights it in `--hue-accent-subtle` for 2 seconds,
  and seeks the player there.
- **Transcript.** A list, one row per turn: timestamp (caption, tabular, a button that seeks),
  speaker name (medium), text (`.prose` compact). The line playing now gets
  `--hue-selected` and the list keeps it in view unless the person has scrolled away; a "Back to
  now" button appears when they have. Search highlights matches and steps through them with
  Enter, and the whole transcript stays in view around them.
- **Width.** The transcript keeps to `--measure`. Below 72rem the rail's people and links go
  under the transcript.

**States.**

| State             | What shows                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Still processing  | The player if audio is ready; Summary and Transcript each a `Spinner` with a label saying what's being made. The page updates itself. |
| No recording      | No player. People, length, and any chat links. "This call wasn't recorded."                                                           |
| Audio only        | The audio bar.                                                                                                                        |
| Transcript failed | A danger line under the Transcript heading with Try again (people who can record only).                                               |
| Two-hour call     | The transcript is virtualised past 500 rows; search still covers all of it.                                                           |

## 5. Live notes

### 5.1 Presence

Who has the note open sits in the page header's `actions`, before the note's own buttons: a
`FacePile` (size `sm`, limit 4) of everyone else there, each face ringed in their person colour
so it matches their caret. You aren't in it. Hovering a face, or focusing it, shows the name and
"Editing" or "Viewing". Nobody else there: nothing shows, no "Only you" label.

### 5.2 Cursors and selections

Each other person's caret is a 2px bar in `--person`, with their first name in a label above
its start: `--type-caption`, medium, `--person-fg` on `--person`, radius `--radius-xs`, padding
0 `--gap-xs`. Render the caret element with `data-hue` set to their hue and let the tokens do
the rest.

- The label shows when their caret moves and fades out after 3 seconds still; the bar stays.
  Hovering the bar shows the label again. A page full of permanent name tags covers the text
  people are trying to read.
- Their selection is `--person-subtle` behind the text.
- A label that would run off the top of the editor flips below the line.
- Two carets in one place: both bars show; the later label sits above the earlier one.

### 5.3 Connection states

A `Banner` above the editor, never a modal:

| State                 | Banner                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Connecting (first)    | None for 1 second, then a neutral banner with a `Spinner`. The editor is read-only until synced. |
| Offline               | Warning: edits are kept on this device and will merge when you reconnect. Typing continues.      |
| Back online           | The banner goes. No "Saved!" flourish.                                                           |
| View-only share       | Neutral: you can view this note, and who to ask to edit.                                         |
| Note deleted remotely | Danger, with a link back to Notes. Editing stops.                                                |

The saved state in the header is a caption: "Saved" with a time, or "Saving…". It never
blinks on every keystroke: it changes to "Saving…" only after 1 second of unsaved edits.

## 6. Posts

### 6.1 Poll in a post

A poll sits in the post body below the text, inside a `z1` box with `--radius-surface` and
`--gap-md` padding.

```
┌────────────────────────────────────────────────┐
│ ◉ Thursday 7:00         ████████████  8   62%  │
│ ○ Thursday 9:00         ████          3   23%  │
│ ○ Studio, Friday        ██            2   15%  │
│ 13 votes · (faces) · Change vote               │
└────────────────────────────────────────────────┘
```

- **Before voting:** each option is a full-width `Button` (secondary, size `lg`, label aligned
  to the start), and one press votes. Results are hidden until you vote, so the count doesn't
  sway you; the footer says how many have voted. The post's author can preview the results
  without voting, from a ghost button in the footer.
- **After voting:** each row becomes a bar. The bar is `--hue-selected` for others' choices and
  `--hue-accent-subtle` for yours, with your option's label in medium weight and a check. Count
  and percentage at the end, tabular, right-aligned, so the numbers line up in a column. The bars
  grow from zero over `--motion-base` once, on your vote, to show where your vote went; they don't
  animate on page load.
- **Footer:** total votes (caption), a `FacePile` of voters (size `xs`, limit 5) that opens the
  full list per option in a `Popover`, and Change vote as a ghost `Button` size `sm`.
- **Longest case:** 10 options of 80 characters each; labels wrap, bars sit behind the label
  column only.
- Composing: options are inputs in a list with drag handles, Add option until 10, Remove on
  each past 2.

### 6.2 Drafts

`/drafts`, also a sidebar item with a count when there are any.

- `ListRow` per draft: the title, or the first line of the body in muted if there is no title;
  the project as `description`; "Edited 4 min ago" as `meta`. The row opens the composer with the
  draft.
- An overflow `Menu` on each row: Delete (danger), which asks in a `Dialog` size `sm`.
- Newest edited first.
- Empty: `EmptyState`, saying drafts appear here as you write, with New post as the action.
- In the composer, the autosave state is a caption next to the Post button: "Draft saved" with
  a time. Never a toast.

### 6.3 Versions

A post with versions shows "Version 3 of 3" as a caption link under its title, opening
`/posts/<id>/versions`.

- `PageColumns width="reading"`, a list of `ListRow`s, newest first: "Version 3", the author and
  date as `description`, comment count as `meta`. The current one is `selected` and says
  "Current".
- Opening an older version shows it read-only with a neutral `Banner`: you're reading version 2,
  with a link to the current one.
- "New version" lives in the post's overflow menu, for its author.
- A post with one version shows no version line at all.

### 6.4 Image gallery and lightbox

**In the post**, images lay out by count, with `--gap-xs` between and the outer corners at
`--radius-surface`:

| Count | Layout                                                     |
| ----- | ---------------------------------------------------------- |
| 1     | Its own aspect, at most 32rem tall, full column width      |
| 2     | Two equal columns, 4:3 crops                               |
| 3     | One large on the left (2/3), two stacked on the right      |
| 4     | 2 × 2                                                      |
| 5+    | 2 × 2, the fourth shows "+N" over a `--hue-backdrop` scrim |

Every image has its alt text, or the file name if none was given; the composer asks for alt
text on upload.

**The lightbox** is a full-screen `Dialog` on `--hue-media-bg`, `data-theme="dark"`:

- The image centred, as large as fits with `--gap-2xl` around it. Top bar: who posted it and
  when, the file name, Download, Comments (toggle), Close. Bottom: "3 of 7", tabular.
- Previous and next as `lg` ghost buttons at the edges; arrow keys too; swipe on touch.
- Zoom: double-click or `+`/`-` steps 1×, 2×, 4×; drag pans when zoomed. Esc closes, or resets
  zoom first if zoomed.
- It opens from the thumbnail: the image scales from the thumbnail's rect to its place over
  `--motion-base`, and goes back the same way. Reduced motion is a cross-fade.
- While a large image loads, the thumbnail stays scaled up and blurred under a `Spinner`.

### 6.5 Canvas comment markers

Comments pinned to a point on an image, shown in the lightbox with Comments on.

- A marker is a 24px circle in the commenter's `--person` with their initials in
  `--person-fg`, its tip at the point (a round pin with a pointed corner at bottom left:
  `border-radius: 50% 50% 50% 0`). A resolved comment's marker is a hollow ring in
  `--hue-z0-muted`.
- Clicking a marker opens its thread in a `Popover` beside it. The comment panel on the right
  lists every thread; hovering one in the list highlights its marker, and the reverse.
- Adding: with Comments on, the cursor becomes a crosshair; a click drops a provisional marker
  in your colour and opens a composer `Popover` there. Esc cancels and removes it.
- Markers keep their place relative to the image at every zoom level and stay the same screen
  size.
- Many markers in one place: they don't merge; the list on the right is the way to reach a
  hidden one.

### 6.6 Emoji picker and custom emoji

A `Popover` (padding `none`, 22rem wide, 24rem tall) from the reaction button, the status
picker and the composer.

```
┌──────────────────────────────────┐
│ [ Search emoji                 ] │
│ ⏱ ☺ 🐻 🍔 ⚽ ✈ 💡 # ⚑ ★           │ ← category tabs, ★ = this org's
│ Frequently used                  │
│ 😀 👍 🎉 …                        │
│ Northwind                        │
│ :tent: :ship-it: …               │
│ Smileys                          │
│ …                                │
├──────────────────────────────────┤
│ 👍  :thumbsup:          [skin ▾] │ ← preview of the focused one
└──────────────────────────────────┘
```

- Search is focused when it opens. Typing filters across names and keywords, custom ones
  included; Enter picks the first.
- Grid of 32px cells, 8 per row. Arrow keys move through the grid; the focused cell gets
  `--hue-selected` and its name shows in the footer. The grid is a `role="grid"` of buttons
  named by the emoji's name, not the character.
- The org's custom emoji are their own section after Frequently used, titled with the org's
  name, images at 24px. Their `:name:` shows in the footer and in `title`.
- Skin tone is one choice in the footer, kept per person.
- Category tabs scroll the grid to the section; the current section's tab is underlined as you
  scroll.
- Empty search: "No emoji match" and, for people allowed to add one, a link to the custom emoji
  settings.
- Reactions on a post show the 3 most used inline plus the picker button; the picker is the
  only place for the rest.

**Custom emoji settings** (Organization → Emoji): a grid of the org's emoji with name and who
added it, an Add button that takes an image and a name, and an error under the field when a
name is taken or the file is over the limit.

### 6.7 Public post page

`/p/<token>`, signed out. No sidebar, no app chrome: this page is read by people who don't use
the product.

- A thin top bar: the org's logo and name on the left, nothing on the right (no sign-up
  prompt).
- The post at `--measure`, centred: title in `u:type-display`, author with `Avatar md` and
  date, body in `.prose`, images and polls as in the app (polls read-only, showing results).
  Comments are not shown.
- A footer line in muted caption: when it was posted, and that it was shared from the org.
- Follows the system theme.
- `og:title`, `og:description` (the first 160 characters of the body) and `og:image` (the first
  image, else the org logo).
- **Revoked or turned off:** a plain 404 page in the same frame, saying the link no longer works.
  It never reveals whether the post exists.

### 6.8 Link preview card

Under the body of a post, comment or chat message, one card per link, at most three; more links
stay as links.

```
┌──────────────────────────────────────────────┐
│ ┌──────┐ Page title, up to two lines then …  │
│ │ img  │ One line of description, muted …    │
│ └──────┘ (icon) example.com                  │
└──────────────────────────────────────────────┘
```

- `z1` box, `--border-w-thin` `--hue-z1-border`, `--radius-surface`, max 32rem. The whole card
  is one link. Hover: `--hue-hover`.
- Image on the left at 5rem square, `object-fit: cover`, `--radius-control`. No image: no
  placeholder, the text takes the width.
- Title: body size, medium, 2 lines. Description: muted, 1 line. Domain: caption, muted, with
  the site's icon at 16px if it has one.
- YouTube: the card becomes a 16:9 thumbnail with a play button; clicking swaps in the
  privacy-enhanced embed in place. Nothing loads from YouTube before the click.
- Loading (the preview is fetched after posting): nothing shows; the card fades in when ready.
  A failed fetch shows nothing; the link in the text is enough.
- The author can remove a preview with a small ghost close button on hover, top right.

## 7. People

### 7.1 Profile

`/people/<username>`, `PageColumns width="reading"`.

```
┌─────────────── cover 3:1 ───────────────────┐
│                                             │
│(Avatar xl)                                  │
└─────────────────────────────────────────────┘
  Ada Okafor                          [Message] [⋯]
  @ada · Designer
  🏕 At the field test · until 18:00
  14:32 local time · Active now
```

- **Cover.** 3:1, `--radius-surface` on the bottom corners only, full column width. No cover:
  the band is shorter (`--gap-4xl`) and filled with the person's avatar tint at low strength,
  so profiles without a cover don't look broken.
- **Avatar** `xl` overlapping the cover's bottom edge by half, with a `--border-w-thick` ring in
  `--hue-z0-bg`.
- **Name** in `u:type-title`, semibold. Username and title on one muted line.
- **Status** on its own line: emoji, text, and "until [time]" in muted. No status: nothing.
- **Local time and last seen** share one caption line: "14:32 local time" (updating on the
  minute) then "Active now" with the `--hue-online` dot, or "Last seen 3 h ago". When their
  time zone is ahead of or behind yours, the difference follows in muted ("8 h ahead"), because
  the difference is what people need when deciding whether to message.
- **Actions:** Message (`Button`), and an overflow `Menu`. On your own profile: Edit profile.
- Below: their recent posts as `ListRow`s, then projects they're in.
- **Hover card** (`Popover` on hover or focus of a name, 18rem): `Avatar lg` with presence, name,
  username, status, local time line, and Message. It opens after 400 ms and stays while the
  pointer is over it.

**Editing** cover and avatar uses a crop `Dialog` (size `lg`): the image with a fixed frame (1:1
or 3:1), drag to move, a slider to zoom, Cancel and Save. Upload errors (type, size) show under
the frame.

### 7.2 Status picker

A `Popover` from the profile, the user menu and the hover card on yourself:

- An emoji button (opens the emoji picker) and a text input, 80 characters, with a live count
  from 60.
- "Clear after": a `Menu` of 30 minutes, 1 hour, 4 hours, Today, This week, Custom, Never.
- Five recent statuses as one-click rows.
- Save (`SuedeButton`) and, when one is set, Clear.

### 7.3 Presence dot

`Avatar` takes `presence="online"` (filled `--hue-online`) or `presence="paused"` (a ring:
notifications paused), with a `presenceLabel` so it is read out. The dot shows on avatars at
`sm` and up in member lists, hover cards, chat and the profile. It never shows in post bylines
or comments: there it would only be noise.

## 8. Joining

### 8.1 Onboarding

After the first sign-in, a full-screen page without the sidebar: the org's logo at the top
left, the step in the middle at 28rem, a step count at the top right ("2 of 3", caption,
tabular). No progress bar; three steps don't need one.

| Step              | Content                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Profile           | Name, username (suggested from the name, checked as you type, with the reason if taken), avatar upload with crop. |
| Projects          | The org's open projects as rows with a `Switch` each; the default projects are already on.                        |
| Invite teammates  | Only for people who may invite. A textarea of emails, one role, Send. The step can be skipped.                    |
| Org (first admin) | Before the others: logo upload and the email domain setting.                                                      |

- Each step has one primary action (Continue) and a ghost "Skip for now"; Back on all but the
  first. The last step's primary action is "Go to [org]".
- Each step slides 16px and fades over `--motion-base` in the direction of travel, so Back
  feels like going back.
- Leaving midway is fine: the next visit resumes at the first step not done, and a small
  `Banner` on Home offers to finish setup until it's done or dismissed.
- Errors sit under their fields. Continue stays enabled; pressing it focuses the first error.

### 8.2 Join requests

Organization → Members has a "Requests" `SegmentedControl` segment beside "Members" with a count
`Badge` when there are any.

- `ListRow` per request: `Avatar sm`, name and email, "Asked 2 h ago" as `meta`, and Approve
  (`Button` secondary) and Deny (`Button` ghost) at the end. No dialog for either; Deny shows an
  Undo inline in the row for 5 seconds before it sends the email.
- Approved: the row leaves with a height collapse over `--motion-base`, and a status line
  announces it (`role="status"`).
- Empty: `EmptyState` saying requests from people with your domain appear here, with a link to
  the domain setting.
- Many: newest first, and Approve all at the top when there are more than three.

## 9. Quiet hours

Settings → Notifications gets a section above the per-kind table.

```
Pause notifications                         [ Pause for… ▾ ]

Quiet hours                                          [  ●]
Push and email wait outside these hours. Your inbox still fills.

  [M] [T] [W] [T] [F] [S] [S]      18:00 [▾]  to  09:00 [▾]
  Your time zone: Europe/Lisbon (change)
```

- **Pause for…** a `Menu` of 30 minutes, 1 hour, 2 hours, Until tomorrow, Until next week,
  Custom. While paused, the section's first line becomes "Paused until 09:00" in
  `--hue-warning` with Resume, and the avatar in the sidebar's user menu shows the `paused`
  presence ring.
- **Quiet hours** is a `Switch`; turning it off keeps the schedule greyed below so turning it on
  again restores it.
- **Days** are seven toggle buttons (`Button` size `sm`, `pressed`), each named in full for
  screen readers. Weekdays on by default.
- **Times** are selects in 15-minute steps, in the person's own clock format. A window that
  crosses midnight is normal and is said in a muted line below: "Overnight, ends the next day".
- Saves on change, with a caption "Saved" that fades after 2 seconds, like the theme setting.
- **Error:** start equal to end shows a line under the times; nothing saves until it's fixed.

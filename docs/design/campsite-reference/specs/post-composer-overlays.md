Source: Campsite (github.com/campsite/campsite) at commit cc14551, CC BY-NC 4.0.

# Post detail, comments, composer and overlays

Paths are relative to the Campsite repository root. Spacing, the 0.5px `border`, tokens, shadows (`shadow-popover`, `shadow-select-item`, `shadow-sm`, `shadow-md`), Button sizes/variants, Avatar sizes and the 100ms default transition are defined in `primitives.md`; post and comment body typography is in `prose.md`. This file only references them.

Breakpoints (Tailwind defaults plus config): `xs` 430, `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536, `3xl` 1792, `4xl` 2048. Tailwind 3.4.3 with `darkMode: 'class'` (dark variants match `.dark *`).

---

## 1. Post page

Source: `apps/web/components/Post/PostView.tsx`, `apps/web/components/InlinePost/*`.

### 1.1 Page structure

```
div.flex.min-w-0.flex-1.flex-col.overflow-hidden
  PostViewTitlebar                                   (lg+ only)
  div "bg-secondary dark:bg-primary flex min-w-0 flex-1 flex-col overflow-hidden"
    ScrollableContainer "relative flex-initial flex-col"
      div.bg-primary                                  (post band)
        div "relative mx-auto flex w-full max-w-[--post-width] flex-col px-4 pb-4 pt-6 md:pt-8 lg:pt-10 xl:pt-12 2xl:pt-14"
          InlinePost display='page'
          div "-ml-1 flex flex-col gap-4 py-4"         (Linear issues, references, AI summary; members only)
      div "bg-secondary dark:bg-primary border-t"     (comments band)
        div "relative mx-auto flex w-full max-w-[--post-width] flex-col px-4"
          Comments
      div.h-px                                        (end-of-comments sentinel)
    ReplyComposer                                     (sticky bottom composer, §2.6)
```

- Column: `max-w-[--post-width]` = **756px**, 16px side padding, so text width is 724px.
- Top padding steps up with viewport: 24 → 32 (md) → 40 (lg) → 48 (xl) → 56px (2xl). Bottom 16px.
- Post band background `bg-primary`; comments band `bg-secondary` (dark: `bg-primary`, so in dark mode both bands are the same colour, separated only by the 0.5px `border-t`).

### 1.2 Titlebar

Source: `Titlebar/BreadcrumbTitlebar.tsx`, `InboxItems/InboxSplitView.tsx`, `Post/PostBreadcrumbs.tsx`, `Post/PostNavigationButtons.tsx`.

- Container: `bg-primary sticky top-0 z-10 hidden h-[--navbar-height] flex-none items-center gap-3 border-b px-3.5 lg:flex` → **56px** tall, 14px side padding, 12px gap, 0.5px bottom border. Hidden below 1024px (the post page renders no titlebar of its own on mobile). Desktop app with collapsed sidebar on macOS: `pl-21` (84px) for traffic lights.
- Left group (when not in split view):
  - Prev/next: `flex items-center gap-1`, two `plain` icon-only base buttons (30×30) `ChevronUpIcon`/`ChevronDownIcon`, tooltips "Navigate up" `k` / "Navigate down" `j`; then a divider `mx-1 h-6 w-[1px] border-r` (24px tall, 0.5px line, 4px margins).
  - Breadcrumbs `flex min-w-0 flex-1 items-center gap-1.5`: project accessory icon + `BreadcrumbLabel` (15px, weight 500, `leading-tight` 1.25, `max-w-[32ch] truncate`) + `LockIcon` 16px `text-tertiary` if private; separator `/` in `text-quaternary` 14px; post title as a second `BreadcrumbLabel` with `ml-1` ("Untitled" fallback); then favourite star button.
- Right group `flex items-center gap-1.5` (members only): viewers facepile popover, `plain` "Share" button with `PaperAirplaneIcon` left slot, `plain` "Resolve"/"Reopen" button (`CheckCircleIcon`/`RotateIcon`), overflow `DotsHorizontal` dropdown aligned `end`.

### 1.3 Post header grid (display='page')

`InlinePostGrid`: `grid grid-cols-[32px,minmax(0,1fr)] grid-rows-[24px,0,max-content,max-content]`.

- Resolution card above it when resolved (`mb-5`, 20px): `rounded-lg border shadow-sm bg-elevated`, header row `h-11` (44px) `p-3 pr-2 gap-3`, green `Badge` "Resolved by …", 14px preview at `opacity-40` (hidden below lg).
- Version link above grid if versioned: `RefreshIcon` green-500 in a 40px right-aligned slot, `v{n}` in 15px mono, `text-quaternary hover:text-primary`, `pb-1`.
- Avatar: col 1, rows 1–2, `MemberAvatar size='sm'` = **24px** round. Wrapped in member hovercard + profile link.
- Byline: col 2, rows 1–2, `flex items-center`, so it is vertically centred on the 24px avatar row. Inner `span.text-tertiary inline-flex flex-wrap gap-1 gap-y-0 text-[15px]`:
  - Author name 15px weight 500 `text-primary`, `hover:underline`, `line-clamp-1`.
  - Guest badge or "App" badge `h-4.5 translate-y-0.5`.
  - " in {project}" — hidden on the page view on desktop (`hideProject={!isMobile}`); shown on mobile devices: project name 15px weight 500 `text-primary`, emoji accessory 13px, `LockIcon` 16px.
  - Timestamp: `ml-1.5 text-[15px] text-quaternary hover:text-primary`, relative time, tooltip with long timestamp.
  - No overflow menu in the byline on the page view (it is in the titlebar).
- Content column: `InlinePostContentGrid` = `col-span-2 col-start-1 row-start-3 flex flex-col gap-3` → body starts flush left under the avatar (no indent), 12px between children.

### 1.4 Title and body

- Title (`InlinePostTitle`): `h2.text-primary break-anywhere -mb-2 mt-4 text-[22px] font-bold leading-snug select-text` → **22px / 700 / 30.25px**, 16px above, −8px below (net 4px gap to body). Omitted if there is no title or the title was derived from the description.
- For reference: feed title is `text-xl font-semibold leading-snug` (20px/600), preview is 16px/600.
- Body wrapper: `mt-2` (8px); `InlinePostRenderer` renders `div.prose.select-text` (see prose.md). Page view never truncates. Empty body renders a `min-h-4` (16px) spacer.
- Polls, then attachments, then rich link card (`max-w-lg`, 512px), then tags.
- Tags: `flex flex-wrap gap-x-2.5 gap-y-2`, each `text-quaternary text-sm` (14px; `text-[15px]` is overridden by `text-sm`), `#` at `opacity-60` (dark 80), `hover:text-primary` for members.

### 1.5 Attachments

Source: `GroupedAttachments.tsx`, `AttachmentGrid/index.tsx`.

- Wrapper `flex flex-col gap-3`: media grid, then non-media files.
- Media grid (max 4 inline):
  - 1 item: image `mx-auto h-auto max-h-[500px] object-contain`, radius `rounded-md` (6px); single video has native controls, autoplays muted, `max-h-[500px] w-full object-contain`.
  - 2 items: `grid grid-cols-2 aspect-[2/1] gap-px rounded-md ring-1 ring-neutral-150 bg-neutral-150` (#F0F0F0 shows through the 1px gap); dark `bg-neutral-700/50 ring-neutral-700/50`. Images `object-cover`, outer corners only rounded (6px).
  - 3–4 items: `h-[500px] grid-flow-col grid-cols-2 grid-rows-2`, same 1px gap; with 3, the third tile `row-span-2` (right column full height).
  - Overflow chip "+N more…" bottom-right, video duration bottom-left: `m-1 flex h-6 items-center rounded-md bg-black px-2 text-xs font-bold text-white` (24px tall, 4px inset, mono for timestamps).
- Files: `divide-secondary flex flex-col divide-y rounded-md border` list of `FileAttachment` rows.
- Clicking media opens the attachment lightbox.

### 1.6 Reactions bar (page)

Source: `InlinePostSocialActions.tsx`, `InlinePostReactions.tsx`, `Reactions/index.tsx`.

- Row: `-ml-1 flex flex-wrap items-center gap-x-0.5 gap-y-1 py-2` (2px horizontal gap, 4px row gap, 8px vertical padding). On the page view it contains only reactions (no comment/share/follow-up buttons; those are feed-only, 30px round `plain` buttons with 24px icons).
- Add-reaction trigger: `Button round variant='plain'` icon-only 30×30, `FaceSmilePlusIcon size={24}`.
- Pill: `flex gap-1.5 items-center p-1 pl-2 pr-2.5 h-7.5 min-w-[32px] rounded-full text-xs font-semibold ring-1` → **30px** tall, 8px left / 10px right padding, 6px gap.
  - Not reacted: `bg-tertiary hover:bg-quaternary`, text inherited.
  - Reacted: `bg-blue-100/70 text-blue-900 hover:bg-blue-100`; dark `bg-blue-900/40 text-blue-400 hover:bg-blue-900/60`.
  - Emoji `mt-0.5 font-["emoji"] text-sm leading-none`; custom emoji image 15×15; count `font-mono leading-none` (12px semibold).
  - `ring-1` draws in the base-layer colour `ring-transparent`, so no visible ring except `focus-visible:ring-blue-100` (dark `blue-600/40`).
  - Tooltip: `max-w-[200px]`, "{names} reacted with :name:" with the second part `text-tertiary`.
  - Motion: `whileTap scale 0.9`, spring stiffness 600 damping 30; pills enter/exit via `AnimatePresence` with `MotionConfig duration 0.2`.
- Reaction picker (desktop popover): `h-[424px]`, `rounded-lg shadow-popover border bg-elevated`, dark `shadow-[0_0_0_1px_black]`; 9 columns × 34px cells (306px grid), section headers 36px (`text-xs font-medium text-secondary pt-4 pb-1 px-1.5`), cell `rounded-md text-xl hover:bg-quaternary`. Below lg it becomes a bottom sheet `bg-elevated fixed inset-x-0 bottom-0 rounded-t-xl` over `bg-black/50`.
- Page view has no engagement line (comment/view counts are feed/preview only).

## 2. Activity and comments

Source: `Post/PostView.tsx`, `Comments/*`, `TimelineEvent/*`.

### 2.1 Section header

- `Comments` wrapper: `relative flex w-full flex-1 flex-col gap-4 pt-4` (16px top, 16px gap).
- `CommentListHeader`: `flex scroll-mt-4 items-center gap-1.5 h-7.5` (30px). "Activity" `text-[15px] font-semibold flex-1`. Right: Switch labelled "Notifications" (hotkey `s`).
  - Switch `base`: track `h-4 w-7` (16×28), `p-0.5`, `rounded-full`, off `bg-gray-400`, on `bg-blue-500`, disabled `opacity-50`; thumb is the full height, `bg-gradient-to-b from-white via-white to-gray-100` (on: `to-gray-200`), `translate-x-full` when on, `transition-all`. Label left of switch, 12px gap, 14px weight 500 `leading-none tracking-tight`.
- "Show previous comments": `flat` base button, full row.
- List: `flex flex-col-reverse`, `-mt-3` when there are comments; comments and timeline events interleaved by date.

### 2.2 Comment thread card

```
div "divide-secondary relative isolate divide-y bg-elevated dark:bg-secondary my-3 overflow-hidden rounded-lg border-[0.5px] shadow-sm
     dark:border-0 dark:shadow-[inset_0_0.5px_0_rgb(255_255_255/0.06),_inset_0_0_0.5px_rgb(255_255_255/0.1)]"
  root comment row
  resolved tombstone (if resolved)
  reply rows + thread timeline events (chronological)
  inline reply composer (md+)  |  mobile reply row (<md)
```

- 12px vertical margin, 8px radius, 0.5px `border-primary`, `shadow-sm`; rows separated by 0.5px `border-secondary` dividers.
- Dark: background `bg-secondary`, no border, two inset highlight shadows instead.
- Replies are **not indented**: each reply is another full-width row in the same card with the same 24px avatar.

### 2.3 Comment row

```
div.group "relative isolate flex flex-1 gap-3 p-3 scroll-mt-1 transition-colors duration-150"
  div.self-start > MemberAvatar size='sm'                     24px
  div "flex flex-1 flex-col min-w-0 pt-px" (+ pt-0.5 for replies)
    div "relative z-50 -mb-1 -mt-1.5 flex items-center"         byline
      div "flex min-w-0 flex-1 space-x-1.5 align-baseline leading-none"
        name   14px / 500 / text-primary, line-clamp-1
        time   "text-tertiary hover:text-primary whitespace-nowrap text-sm" (tooltip = long timestamp)
      div.min-h-[34px] > hover actions
    Badge green mono "mb-1.5 mt-1"   (only on the comment that resolved the post)
    div "flex justify-between gap-4 pb-2"
      body: div.prose.select-text (see prose.md)
      canvas/attachment thumbnail 80×80 "rounded-lg ring-1 ring-black/10 hover:ring-black/20" (dark white/10 → white/20)
    GroupedAttachments display='page'
    engagements "flex flex-col items-start gap-2 pt-1"
```

- Row padding 12px, avatar-to-content gap 12px.
- Replying state on mobile (<md): replied-to row `bg-tertiary`, other rows `opacity-60`, 150ms colour transition.
- Hover actions: `flex items-center justify-end rounded-lg p-0.5 -mr-1`, `opacity-0` until `group-hover`, kept visible while a menu is open (`[&:has(button[aria-expanded=true])]`, `group-has-[[data-state=open]]`), when focus is visible, or always on touch (`[@media(hover:none)]:opacity-100`). `transition-opacity` 100ms. Buttons, all `plain` 30×30 with 20px icons: Add reaction (`FaceSmilePlusIcon`), Resolve/Reopen comment (desktop only), overflow (`DotsHorizontal`).
- Optimistic states in the same slot: spinner in a 30×30 box after 1s; error = `plain` button `text-red-500` with `WarningTriangleIcon`, "Failed to send", tooltip "Retry".
- Comment overflow items: Start a post…, Create Linear issue · Resolve/Reopen comment, Resolve/Reopen post · Copy link, Copy ID · Edit, Delete (destructive), groups split by separators.
- Comment reactions: `-ml-1 flex flex-wrap items-center gap-1`; trigger `Button round size='sm' plain` (26×26, `px-0.5 text-tertiary hover:text-primary`, 20px icon), shown only when reactions exist. Pill: `h-6.5` (**26px**) `p-0.5 pl-1.5 pr-2 gap-[5px] rounded-full text-xs font-semibold min-w-[32px]`; reacted `bg-blue-50` (not `/70`) `hover:bg-blue-100 text-blue-900`, dark same as post pills.
- Follow-up count: `text-quaternary dark:text-tertiary hover:underline`, 14px.
- Resolved tombstone: `flex p-1` > button `flex flex-1 items-center gap-3 rounded-md p-2 bg-primary hover:bg-tertiary` (dark `bg-secondary hover:bg-tertiary`), green `CheckIcon` 24px, 14px tertiary text with name `text-primary`, chevron `text-quaternary group-hover:text-tertiary`.
- Timeline events inside a thread: `relative flex items-start gap-2 p-3`; in the activity list: `flex items-start gap-3 px-3 py-2.5`; accessory box 24×24 with a 20px `text-tertiary` icon.
- Motion: every row sits in `CommentLayoutTransitionContainer` (`bg-elevated dark:bg-secondary overflow-hidden`): height 0 → auto and an inner opacity 0 → 1 with Framer Motion defaults; animates only for optimistic (new) items. Inner pieces (resolved badge, engagements, composer controls) use height+opacity over **200ms**.

### 2.4 Inline reply composer (inside each card, md+)

`CommentComposer display='inline-refresh'`, placeholder "Write a reply", lazily mounted when scrolled into view (placeholder text 15px `text-quaternary`).

- Form `relative isolate flex flex-1 gap-3 p-3`: viewer `Avatar size='sm'` (24px) + editor column.
- Editor: `.prose.editing`, container padding 0, no min-height.
- Controls row (hidden while empty and unfocused; height/opacity 200ms): `flex items-center justify-between -ml-1.5 pt-3`.
  - Left `flex gap-0.5`: `plain` icon buttons 30×30 — Add files (`PicturePlusIcon`, tooltip shortcut), emoji, GIF.
  - Right `flex gap-2`: discard-draft control, then `primary` base button "Reply" (30px, tooltip "Create reply" + `mod+enter`); disabled = `opacity-50`.
- Editing a comment uses `display='inline-edit'` with the same controls row; button reads "Save".
- Below md: `CommentMobileReplyComposer` row `relative flex gap-3 p-3` with 24px avatar and 15px `text-quaternary` "Write a reply…" (or 15px semibold `text-secondary` "Cancel reply"); tapping it routes the reply to the sticky composer.

### 2.5 Unseen comments pill

`UnseenCommentsButton`: `absolute z-10 flex items-center gap-2 rounded-full bg-blue-500 py-2 pl-2 pr-3.5 text-white shadow-lg hover:scale-[1.02]`, `FacePile size='xs' limit=3`, "{n} new comments" 14px semibold. Enter: opacity 0, y −48px → opacity 1, y −56px (centred via `left: 50%`, `translateX: -50%`); exit back to −48px.

### 2.6 Sticky bottom composer

```
div
  div.h-px.border-t       (border-transparent while the end of comments is in view)
  div "pb-safe-offset-3 sticky bottom-0 mx-auto flex w-full max-w-[--post-width] flex-1 flex-col gap-3 p-4"
    ReplyContent           (mobile reply target)
    UnseenCommentsButton
    div.flex.flex-col.gap-3
      resolution banner     (when resolved)
      PostCommentComposer  maxHeight='40vh'
```

- Container: 756px max, 16px padding (bottom = 12px + safe area), 12px gap. Background is the parent's `bg-secondary` (dark `bg-primary`).
- Composer (`display='block'`): `relative flex min-w-0 flex-1 flex-col bg-elevated rounded-lg border shadow-sm` (8px radius, 0.5px border). Editor area `min-h-[48px]`, `overflow-y-auto`, `max-height: 40vh`; ProseMirror padding `px-3 py-2.5` (12/10px). Placeholder "Write a comment..." (mobile reply: "Write a reply...").
- Controls `flex items-center justify-between p-3 pt-2` (always visible): same left icon buttons; right `primary` "Comment" (or "Reply") 30px, tooltip `mod+enter`.
- Resolution banner above composer: `rounded-t-lg bg-green-500 px-2 pb-3.5 pt-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-white`, `InformationIcon` 14px at 80%; dark `bg-green-900/50 text-green-400`; tucked under the composer with `-mb-6`.
- Mobile reply context (`ReplyContent`): `bg-tertiary flex items-center gap-2 rounded-[18px] pt-2 pb-2 pl-4 pr-2`; author line 13px `text-secondary`, preview `chat-prose line-clamp-1 text-sm text-tertiary`; close button `text-tertiary hover:text-primary hover:bg-black/5` (dark `hover:bg-white/10`).

## 3. New-post composer

Source: `PostComposer/PostComposer.tsx`, `PostComposerForm.tsx`, `PostComposerHeaderActions.tsx`, `PostComposerProjectPicker.tsx`, `PostComposerActions.tsx`, `PostComposerInteractiveAttachments.tsx`, `TitleTextField.tsx`.

### 3.1 Presentations

Two presentations, persisted in localStorage `campsite:post-composer-presentation` (default `dialog`); mobile devices always use the dialog.

- **Dialog** (`Dialog.Root align='top'`):
  - Collapsed (default): `size='2xl'` → `sm:max-w-2xl` **672px**, `top-[10vh]`, `max-h-[calc(100dvh - safe-bottom - 20vh)]`, height by content.
  - Expanded: `size='3xl'` → **768px**, `fillHeight`: `top-[4dvh] h-full max-h-[calc(100dvh - safe-bottom - 8vh)]`.
  - Below 640px: `max-w-[calc(100vw-32px)]` (16px gutters); still a floating panel, not a sheet. When the on-screen keyboard shrinks the visual viewport, `maxHeight = visualViewportHeight − 12vh`.
- **Mole** (docked, non-modal, ignores outside clicks): `fixed bottom-0 right-4 bg-elevated flex flex-col overflow-hidden rounded-t-xl border-t border-l border-r border-b-0 shadow-lg`; dark `bg-gray-900 dark:border-primary-opaque shadow-[0px_2px_16px_rgba(0,0,0,1)]`.
  - Expanded (default): 460×450, 2xl 480 wide, 3xl 500×470, 4xl 520×490.
  - Minimised: `min-h-12 w-[320px]`, single row `px-3 pl-4 pt-3 pb-2.5`: "New post" 14px semibold + header actions.

### 3.2 Form layout

```
form "flex flex-1 flex-col overflow-hidden rounded-b-lg"
  header "flex items-center px-3 pb-2.5 pt-3"          project picker … header actions
  div.h-px.border-t                                    border-primary once scrolled, transparent at top
  div "relative flex flex-1 flex-col gap-1 overflow-y-auto pb-2 pt-0"
    TitleTextField
    MarkdownEditor
    polls / feedback request (px-3)
  div "z-20 flex gap-2 border-t px-3 pt-2.5"           "Request feedback" (border transparent at bottom)
  footer "bg-elevated sticky bottom-0 z-10 flex justify-between gap-3 p-3 pr-2.5 pt-1.5 dark:bg-gray-900"
    attachment/emoji/GIF buttons … Save draft / Post
```

- Header: 12px top, 10px bottom, 12px sides.
- Project picker: `Select` with `SelectTrigger size='sm'` = `base` variant button 26px tall, 13px weight 500, 4px radius, `ChevronDownIcon` `text-tertiary` right slot; tooltip "Change channel" `mod+p`. Guests warning beside it: `sm` plain button `bg-amber-100 text-amber-900` (dark `bg-amber-900/20 text-amber-400`), "{n} guests", 6px gap.
- Picker popover (`SelectPopover`): width `max(trigger width, 250px)`, `sideOffset` 4, align start, `max-h min(430px, available)`; container `bg-elevated rounded-[9px] border border-neutral-400/40 shadow-md` (dark `border-primary-opaque`, `shadow-[0_0_0_0.5px_black,0_4px_4px_rgba(0,0,0,0.24)]`). Search row `px-2.5 pt-1`, `SearchIcon` at 60%, input `h-8` 14px `placeholder-gray-400`; separator `h-px bg-tertiary` (dark `gray-900` + 1px white/5 under-shadow). Items `h-8` (32px) `px-2 gap-1.5 rounded-lg text-sm font-medium`, check icon on the selected item; highlight `bg-black/[0.04]` (dark `bg-white/10 shadow-select-item`).
- Header actions `ml-auto flex items-center gap-0.5`, all `plain` 30×30: Delete draft (`TrashIcon`, drafts only), Pop out/Pop in (`PopOutIcon`/`PopInIcon`, hidden below sm), Expand/Shrink (`MaximizeIcon`/`MinimizeIcon` in dialog, `MinusIcon`/`MinusDownIcon` in mole, hidden below sm), Close (`CloseIcon` stroke 2, tooltip "Close" `Esc`).
- Title field: auto-growing `textarea`, `resize-none border-0 bg-transparent p-0`, then `px-3 pb-0 pt-1 text-[15px] font-semibold leading-snug` → **15px / 600 / 20.6px**, placeholder "Subject (optional)" (`placeholder-neutral-400`). Enter moves focus into the body.
- Body: `MarkdownEditor` placeholder "What would you like to share?", ProseMirror `px-3 py-1`, `min-height: 128px`, no max height (the middle region scrolls). Body is 4px below the title (`gap-1`).
- Request-feedback row: `flat` `sm` button "Request feedback" (26px).
- Footer left `flex items-center gap-0.5`: `plain` 30×30 Add files (`PicturePlusIcon`), emoji picker, GIF picker.
- Footer right `flex flex-1 items-center justify-end gap-3 sm:gap-2`: new post / draft = `plain` "Save draft" + `primary` "Post" (base 30px, 10px side padding, tooltip "Create post" `mod+enter`); edit = `primary` "Save"; new version = `primary` "Create new version". Disabled while empty or uploading: `opacity-50`.
- `mod+enter` submits from anywhere in the form.
- Motion: the dialog uses the Dialog behaviour in §4.3; the mole has no animation classes.

### 3.3 Inline "What do you want to share?" row

Source: `Home/NewPostButton.tsx` (top of feeds, `mb-8` in the comfortable feed).

```
div "text-tertiary relative -mx-2 flex items-center gap-3 rounded-lg border-0 bg-[#fcfcfc] px-4 py-3 shadow-sm ring-[0.5px] ring-black/[0.08] transition-all
     hover:bg-elevated hover:shadow dark:bg-secondary dark:hover:bg-tertiary dark:shadow-[…]"
  div.relative
    Avatar size='lg' clip='notificationReason'               40px
    span "h-5.5 w-5.5 absolute -bottom-1 -right-1 rounded-full bg-black text-white dark:bg-white/10"  PlusIcon 18 stroke 2.5
  UIText text-[15px]  "What do you want to share?"            text-tertiary
  div.flex-1
  Button primary disabled pointer-events-none "Post"          30px, 50% opacity
  button.absolute.inset-0                                     whole row opens the composer
```

- Bleeds 8px past the column on each side, 16px/12px padding, 12px gaps, 8px radius; row height = 40px avatar + 24px = 64px.
- Light: `#FCFCFC` with `shadow-sm` + 0.5px `black/8%` ring; hover `bg-elevated` and the default `shadow`, 100ms. Dark: `bg-secondary`, hover `bg-tertiary`, shadow `inset 0 0 0 0.5px rgb(255 255 255/0.06), 0 1px 2px rgb(0 0 0/0.2), 0 2px 4px rgb(0 0 0/0.12), 0 0 0 0.5px rgb(0 0 0/0.12)`.
- Optional suggestions tray directly under it: `bg-tertiary -mx-2 -mt-2.5 rounded-b-2xl` (dark `bg-neutral-900/50`), header `pt-5.5 p-4 pb-2.5 pr-2.5` with "Suggestions" 12px weight 500 tertiary and a `sm` close button; chips `flex flex-wrap gap-2 p-4 pt-0` of `flat` buttons with 16px left icons.

## 4. Overlays

### 4.1 Dropdown menu

Source: `packages/ui/src/DropdownMenu/*`, `Menu/*`.

- Desktop (≥1024px) Radix dropdown; below 1024px a vaul bottom drawer (§4.1.1).
- Defaults: `side='bottom'`, `sideOffset` **8**, `collisionPadding` 8, width `w-[220px]`.
- Panel: `text-primary bg-elevated rounded-lg border border-neutral-400/40 p-1 shadow-md` → 8px radius, 0.5px border at `rgb(163 163 163 / 0.4)`, 4px padding; dark `border-primary-opaque` + `shadow-[0_0_0_0.5px_rgba(0,0,0,1),0_4px_4px_rgba(0,0,0,0.24)]`.
- Item: `group relative flex items-center rounded-[5px] cursor-pointer outline-none h-10.5 text-base md:h-8.5 md:text-sm` → **34px / 14px** on md+ (42px / 16px below md). Inner `flex flex-1 items-center gap-2` (8px).
  - Padding left: 6px with a left icon, 10px without. Right: 8px with right slot, 6px with shortcut, 12px otherwise.
  - Left icon: default 20px, `text-tertiary`, `transition-colors`.
  - Label `line-clamp-1 flex-1`.
  - Highlighted: `bg-black/5`, dark `bg-white/10` + `shadow-select-item`.
  - Destructive highlighted: `bg-red-500 text-white` (no colour change until highlighted).
  - Disabled: `opacity-50 cursor-not-allowed`.
- Shortcut label (`KeyboardShortcut`): `flex items-baseline gap-1 rounded bg-black/5 px-1.5 py-0.5` (dark `bg-white/10` + `inset 0 0.5px 0 rgba(255,255,255,0.12)`), keys 12px weight 600 `text-secondary`, mono (symbols ⌘ ⌥ ⇧ ⌫ in the emoji font). `mod` = ⌘ on macOS, "Ctrl" elsewhere. Hidden on mobile devices.
- Separator: `bg-tertiary relative -mx-1 my-1.5 h-px md:my-1` → full-bleed 1px line, 4px above/below on md+; dark `bg-gray-900` + `0 1px 0 rgb(255 255 255/0.05)`.
- Heading / text rows: `px-3 pb-1 pt-2`, 12px `text-tertiary`.
- Submenu trigger: same as item plus `ChevronRightIcon` `text-secondary -mr-2`; sub panel uses the same panel classes.
- Motion (shared `CONTAINER_STYLES.animation`, tailwindcss-animate): open `fade-in-0 zoom-in-[0.98] ease-out`, close `fade-out-0 zoom-out-[0.98] ease-in duration-150`, transform origin from Radix. Open uses `duration-50`, which has no value in the duration scale, so it falls back to the plugin default duration (theme `transitionDuration.DEFAULT` = 100ms).

#### 4.1.1 Mobile drawer menu

- Overlay `fixed inset-0 bg-black/50`. Sheet `bg-elevated text-secondary fixed inset-x-0 bottom-0 flex max-h-[95dvh] flex-col rounded-t-xl` (12px top corners), content `pb-safe-offset-1` (4px + safe area).
- Handle: `p-3 py-2` row, bar `h-1 w-8 rounded-full bg-[--text-primary] opacity-20` (4×32px).
- Items: `flex w-full items-center gap-2.5 px-4 font-medium h-10.5 text-base` (42px, 16px, weight 500), left icon `text-neutral-400 scale-125`. No shortcut labels and no destructive styling. Submenus open a second drawer (chevron 28px `text-quaternary`).

### 4.2 Popover

Source: `packages/ui/src/Popover/Popover.tsx`, `utils/consts.ts`.

- Radix popover; defaults `align='center'`, `sideOffset` 4, `collisionPadding` 8; max size = Radix available width/height. No background of its own: callers add it. Same open/close animation as the dropdown.
- Common surfaces:
  - Share popover: `w-[440px] bg-elevated rounded-xl shadow-popover`, dark `border` with `bg-clip-border`.
  - Hover cards (member, recent, activity): `animate-scale-fade` (opacity 0 → 1, scale 0.95 → 1, 150ms ease-in-out) `shadow-popover bg-primary rounded-lg border border-transparent w-[420px]`, dark `border-primary-opaque shadow-[0_2px_16px_rgba(0,0,0,1)]`.
  - Select/project picker: see §3.2.
- With `sheetBreakpoint` (`sm`/`md`/`lg`, max-width match) the popover becomes a vaul drawer: overlay `bg-black/20` (dark `bg-black/60`), sheet `bg-elevated fixed inset-x-0 bottom-0 -mb-10 rounded-t-xl pb-safe-offset-1`, handle row `p-3 pt-1` with the 4×32px bar, and a 40px spacer at the bottom (offsets the `-mb-10` overscroll).

### 4.3 Dialog

Source: `packages/ui/src/Dialog/Dialog.tsx`, `ConfirmDialog/ConfirmDialog.tsx`.

- Backdrop: `animate-backdrop fixed inset-0 bg-black/20`, dark `bg-black/60`; fades in over 150ms ease-in-out.
- Panel: `fixed left-1/2 -translate-x-1/2 w-full flex flex-col transition-all bg-elevated shadow-popover rounded-lg`. Dark: `bg-gray-900` and `shadow-[inset_0_0.5px_0_rgb(255_255_255/0.08), inset_0_0_1px_rgb(255_255_255/0.24), 0_0_0_0.5px_rgb(0,0,0,1), 0_0_4px_rgba(0,0,0,0.08), 0_0_10px_rgba(0,0,0,0.12), 0_0_24px_rgba(0,0,0,0.16), 0_0_80px_rgba(0,0,0,0.2)]`.
- The panel has no keyframe animation class; the `animate-dialog` keyframe (`slide-up-scale-fade`, 200ms) exists in the config but is not applied in `Dialog.tsx`.
- Widths (all `max-w-[calc(100vw-32px)]` below 640px):

| size             | max width ≥640px                                           |
| ---------------- | ---------------------------------------------------------- |
| `xs`             | 320px                                                      |
| `sm`             | 384px                                                      |
| `base` (default) | 448px                                                      |
| `lg`             | 512px                                                      |
| `xl`             | 576px                                                      |
| `2xl`            | 672px                                                      |
| `3xl`            | 768px                                                      |
| `fit`            | `w-fit`                                                    |
| `full`           | `calc(100vw - 32px)`, full height (+`pt-8` in desktop app) |
| `cover`          | full width and height, `bg-primary`, no radius/shadow      |

- Position: `align='center'` → vertically centred, `max-h: 100dvh − safe areas − 32px` (64px in the desktop app). `align='top'` → `top-[10vh]`, or `top-[4dvh]` with `fillHeight`.
- No mobile sheet variant: dialogs stay floating panels with 16px side gutters.
- Header: `flex-none rounded-t-lg p-4 text-sm` (16px padding, 14px text). Title `flex-1 font-semibold` (14px/600). Description `text-secondary`.
- Content: `p-4 pt-0 flex flex-1 flex-col overflow-y-auto` (padding only if no padding class is passed).
- Footer: `flex items-center rounded-b-lg border-t p-3` (12px padding, 0.5px top border); `variant='secondary'` adds `bg-secondary`. Leading/Trailing action groups: `flex flex-1 items-center gap-2`, justify start/end.
- Close button: `plain` icon-only 30×30 `absolute right-3 top-3`, `CloseIcon` stroke 2, tooltip "Close" + `Esc`, `tabIndex=-1`.
- Confirm dialog: `base` size, title in header, 14px description, footer trailing `flat` "Cancel" + `destructive` confirm (red-500, autofocused, loading state).
- Escape closes; elements with `data-autofocus="true"` receive initial focus.

### 4.4 Tooltip

Source: `packages/ui/src/Tooltip/Tooltip.tsx`.

- Radix tooltip, `side='top'`, `align='center'`, `sideOffset` 5, `alignOffset` 5, `collisionPadding` 8, open delay **400ms** (FacePile uses 0), hidden on keyboard focus by default, no explicit animation.
- Classes: `dark pointer-events-none flex max-w-sm flex-row gap-3 break-words rounded-md bg-gray-900 py-1 text-center text-[13px] font-normal text-primary dark:bg-elevated` plus `shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.02), inset_0_0.5px_0_rgb(255_255_255/0.04), inset_0_0_0_1px_rgb(255_255_255/0.02), 0_0_0_0.5px_rgb(0_0_0/0.24)]`.
- The element carries `.dark` itself, so its tokens are the dark set in both themes: text `text-primary` = gray-100. Background: light theme `bg-gray-900` (#171717); dark theme `bg-elevated` (gray-850).
- 13px, line-height 1.5 (19.5px), 4px vertical padding, 6px radius, max width 384px.
- Horizontal padding: label only 8px; label + shortcut `pl-2.5 pr-1` (10/4px); shortcut only 4px. Label and shortcut 12px apart; shortcut chip as in §4.1.

### 4.5 Command menu (Cmd-K)

Source: `apps/web/components/CommandMenu/LocalCommandMenu.tsx`, `packages/ui/src/Command/*`, `apps/web/styles/global.css`.

- Toggle: `meta+k` on macOS, `ctrl+k` elsewhere; works inside inputs and editors; disabled during onboarding.
- Overlay: `fixed inset-0 bg-black/10` (dark `bg-black/60`), `animate-fade-in` 100ms ease-out / `animate-fade-out` 75ms ease-in.
- Content: `fixed left-1/2 top-16 w-full max-w-[calc(100%-16px)] -translate-x-1/2 md:max-w-3xl` → 64px from top, **768px** wide on md+, 8px gutters below; same fade in/out.
- Panel: `command-menu bg-elevated shadow-popover flex max-h-[454px] flex-col rounded-lg border border-transparent`, dark `border-gray-800`.
- Input: `w-full border-0 bg-transparent px-4 py-3 text-[15px] placeholder-gray-400 outline-none`, placeholder "Type a command or search..." (16px/12px padding, 15px text, 22.5px line → 46.5px row). No divider below the input.
- List: `scrollbar-hide scroll-pb-2 overflow-y-auto px-2 pb-2`.
- Group heading (`[cmdk-group-heading]`): `text-secondary flex h-10 items-center px-2 text-xs` (40px, 12px). Groups: Jump to, (search results: organizations, chats, channels), Create, then loose items (feedback, "Search for …"), Tools (staff).
- Item: `h-10 gap-2 flex items-center rounded-lg px-2 text-[15px] text-primary cursor-pointer select-none scroll-m-1` → **40px**, 8px radius, 8px padding, 8px icon gap, 20px icons or `xs` (20px) avatars.
  - Selected (`aria-selected`): `bg-black/[0.04]`, dark `bg-white/10` + `shadow-select-item`; same for `data-[state=open]`. Not applied on mobile devices.
  - Pointer modality: `transition-all ease-out duration-150`.
  - Private channel lock: 22×22 box, `LockIcon` 16px stroke 2 `text-quaternary`; archived suffix 12px tertiary "(Archived)"; org switch row adds `ChevronRightIcon` `text-quaternary opacity-70` and "Switch organization" `text-tertiary`.
- Enter or Backspace on an empty query triggers a bounce: panel `scale(0.99)` for 150ms.
- Closing clears the query after 300ms.

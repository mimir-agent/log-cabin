Source: Campsite (github.com/campsite/campsite) at commit cc14551, CC BY-NC 4.0.

# Feed and Inbox surfaces

Paths are relative to the Campsite repository root (`apps/web/components/…` unless noted). Token names (`text-tertiary`, `bg-quaternary`, …), Button sizes/variants, Avatar sizes, Badge, FacePile and the base `EmptyState` are defined in `primitives.md`; this file refers to them by name. Reminders: `border` = 0.5px `border-primary`; `text-[15px]` with no `leading-*` gets line-height 1.5 = 22.5px; UIText default is `text-sm` 14/20, weight 400; default `transition` = 100ms.

Feed layout switch (`Feed/index.tsx`): if the feature flag `comfy_compact_layout` is on → `ComfyCompactFeed`; else if searching → `SearchFeed`; else if the user's `posts_density` preference is `compact` → `CompactFeed`; otherwise `ComfortableFeed` (full post previews). Density is chosen in the "Display and sort" dropdown (`PostsIndex/PostsIndexDisplayDropdown.tsx`: Display density Compact / Comfortable; Ordering Recent activity / Created; toggles Reactions, Attachments, Comments, Resolved).

---

## 1. Home feed

### 1.1 Page frame

Source: `MyWork/index.tsx` (route `/[org]/posts`), `IndexPages/components.tsx`, `SplitView/*`.

```
SplitViewContainer            flex flex-1 divide-x overflow-hidden       (0.5px divider)
├─ IndexPageContainer         relative flex flex-1 flex-col overflow-hidden
│  └─ IndexPageContent        (ScrollableContainer, scroll-padding 8px)
│     div  "mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-4 md:gap-6 md:py-6
│           lg:gap-8 lg:px-6 lg:py-8"  + "@container lg:py-16"
│     ├─ div (comfortable only: "mx-auto w-full max-w-[--feed-width]")
│     │  ├─ header  "mb-4 flex flex-col gap-4 md:mb-6 lg:mb-8"
│     │  │  ├─ "Home"  text-4xl (36/40) font-bold -tracking-[1px], "hidden lg:flex"
│     │  │  └─ filter row
│     │  ├─ NewPostButton (composer row)
│     │  └─ RefetchingPageIndicator
│     └─ Feed
└─ SplitViewDetail  fallback = HomeSidebar, fallbackWidth var(--sidebar-width) (240px)
```

- Content column: max-width 896px (`max-w-4xl`), centred. Padding 16px all round below md; 16px x / 24px y at md; 24px x / 64px y at lg (`lg:py-16` overrides `lg:py-8`). Vertical gap between header block and feed: 16px → 24px (md) → 32px (lg).
- Comfortable density additionally constrains the header/composer column and the feed to `--feed-width` 700px.
- "Home" title is only shown ≥ lg (1024px). Below lg the page title lives in the mobile navigation bar.
- Right column (≥ lg only, `max-lg:hidden`): `HomeSidebar` is `bg-secondary dark:bg-primary relative hidden h-screen w-[--sidebar-width] flex-col overflow-hidden border-l lg:flex` (240px). When a post is opened in split view the detail pane takes `width: 60%` and slides in: initial `{marginLeft:-60%, translateX(100%)}` → `{marginLeft:0, translateX(0)}`, 0.2s; the fallback sidebar uses the same animation with its 240px width; inner content fades opacity 0 → 1. Split view is only available ≥ lg and not in comfortable density (`SplitView/hooks/useIsSplitViewAvailable.ts`).
- `/[org]/home` (`pages/[org]/home`) is a mobile-only page: at ≥ lg it redirects to the inbox.

### 1.2 Filter tabs "For me / Created / All"

Source: `MyWork/index.tsx` `MyWorkPostsFilters`, `hooks/useGetPostsIndex.ts`.

```
div "flex items-center gap-0.5"
  Button "For me"    variant = selected ? 'flat' : 'plain'
  Button "Created"   …
  Button "All"       className "mr-auto"
  PostsIndexDisplayDropdown   Button plain, size base, iconOnly SlidersIcon, tooltip "Display and sort"
```

- Buttons are `base` size: 30px tall, 14px (`text-[14.01px]`) weight 500, 10px horizontal padding, 6px radius. Gap between tabs 2px. "All" pushes the dropdown to the far right.
- Selected: `flat` (`bg-black/[0.06]`, dark `bg-white/[0.08]`; hover `bg-black/[0.08]` / `bg-white/10`). Unselected: `plain` (transparent; hover `bg-black/[0.06]` / `bg-white/[0.08]`). Text colour is inherited (`text-primary`). No transition on background (button element).
- Default filter `for-me`; persisted per org in web storage (`{scope}:posts-index-filter`). Sort default `last_activity_at`, persisted per filter.

### 1.3 Inline composer row "What do you want to share?"

Source: `Home/NewPostButton.tsx`.

```
div
  div  "text-tertiary relative -mx-2 flex items-center gap-3 rounded-lg
        hover:bg-elevated dark:bg-secondary dark:hover:bg-tertiary border-0 bg-[#fcfcfc]
        px-4 py-3 shadow-sm ring-[0.5px] ring-black/[0.08] transition-all hover:shadow
        dark:shadow-[…]"
    div.relative
      Avatar size lg (40px), clip notificationReason, current user
      span "h-5.5 w-5.5 absolute -bottom-1 -right-1 flex items-center justify-center rounded-full
            bg-black text-white dark:bg-white/10"     → PlusIcon 18px, strokeWidth 2.5
    UIText text-[15px] inherit  "What do you want to share?"
    div.flex-1
    Button variant primary (base, 30px) disabled, pointer-events-none  "Post"
    button.absolute.inset-0  (whole row opens the composer)
  OnboardingComposerPrompts
```

- Box: bleeds 8px either side (`-mx-2`), padding 12px y / 16px x, gap 12px, radius 8px. Height = 12 + 40 + 12 = 64px.
- Light: background literal `#fcfcfc` (same value as `bg-secondary`), `shadow-sm` + 0.5px ring `rgb(0 0 0 / 0.08)`. Hover: `bg-elevated` and the default `shadow` (layered, from primitives). `transition-all` 100ms.
- Dark: `bg-secondary`, hover `bg-tertiary`; shadow `inset 0 0 0 0.5px rgb(255 255 255 / 0.06), 0 1px 2px rgb(0 0 0 / 0.2), 0 2px 4px rgb(0 0 0 / 0.12), 0 0 0 0.5px rgb(0 0 0 / 0.12)`.
- Prompt text: 15px / 22.5px, weight 400, `text-tertiary`.
- Avatar badge: 22×22 circle, offset −4px bottom/right, black with white plus (dark: `bg-white/10`). The avatar uses the `notificationReason` clip so the badge sits in a cut-out.
- "Post" button is the primary variant shown disabled (opacity 50%).
- Only rendered when the viewer can post. In comfortable density it gets `mb-8` (32px) above the first post.
- Suggestions panel (until dismissed): `bg-tertiary -mx-2 -mt-2.5 flex flex-col items-start rounded-b-2xl dark:bg-neutral-900/50` — tucks 10px under the composer, 16px bottom radius. Header `pt-5.5 flex w-full items-center gap-2 p-4 pb-2.5 pr-2.5` (22px top, 16px left, 10px bottom/right) with "Suggestions" (12px, 500, `text-tertiary`) and a `sm` plain icon button (CloseIcon 16px, stroke 2). Body `flex flex-wrap gap-2 p-4 pt-0` of `flat` base buttons with 16px left icons: "Start a daily standup", "Write a project update", "Make an announcement", "Ask a question".
- Viewer-role upsell instead of composer (`Feed/ViewerRoleInlineComposerUpsell.tsx`): wrapper `px-4 py-4 md:pt-6 lg:px-0 lg:pt-8`; field `bg-tertiary ring-gray-150 flex h-11 w-full items-center justify-between rounded-lg py-2.5 pl-3 pr-2 ring-1 dark:ring-gray-800` (44px tall, 1px ring), 15px `text-tertiary` placeholder, disabled primary button.

### 1.4 Date group headings (Today / Yesterday / date)

Source: `Feed/CompactFeed.tsx`, `Feed/ComfyCompactFeed.tsx`, `utils/getGroupDateHeading.ts`.

```
Command.List "flex flex-1 flex-col gap-4 md:gap-6 lg:gap-8"
  div.flex.flex-col                           (one per day)
    div "flex items-center gap-4 py-2"
      UIText font-medium tertiary  {heading}  14/20, 500
      div "flex-1 border-b"                   0.5px rule, border-primary
    div "@container -mx-2 flex flex-col gap-px py-1"   (rows; comfy: gap-3)
```

- Heading row: 8px vertical padding, 16px gap from label to a hairline that fills the rest of the width. Total height 36px.
- Labels: "Today", "Yesterday", else `toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'short', day:'numeric' })` → e.g. "Monday, Nov 16, 2026".
- Grouping key: the sort field (`last_activity_at` or `published_at`, falling back to `created_at`).
- Gap between day groups: 16px → 24px (md) → 32px (lg). Row list: bleeds 8px each side, 4px top/bottom padding, 1px between rows (compact) or 12px (comfy compact).
- Comfortable density has no date grouping.

### 1.5 Compact post row

Source: `CompactPost/CompactPost.tsx`, `ProjectTag.tsx`, `packages/ui/src/Command/HighlightedCommandItem.tsx`.

```
div "@xl:px-4 group relative flex min-h-12 items-center gap-3 rounded-lg p-3"
  HighlightedCommandItem "absolute inset-0 z-0"        (hit area + hover/selected background; context menu)
  div "mt-0.5 flex items-start self-start"
    MemberAvatar size lg (40px)                         (hovercard + profile link for members)
  div "@xl:flex-row @xl:items-center @xl:gap-3 flex flex-1 flex-col-reverse items-start gap-0.5"
    div "flex flex-1 items-center"
      div "flex flex-1 flex-col gap-0.5"
        div "flex flex-shrink items-center"            line 1
          VersionBadge  (Badge default, "mr-1.5 shrink-0 rounded font-mono", "v2")
          unread dot    "h-2.5 w-2.5 flex-none rounded-full bg-blue-500"
          UIText primary font-medium "break-anywhere mr-2 line-clamp-1 text-[15px]"  {title}
        div "flex items-center"                         line 2
          status badges "mr-1.5 flex items-center gap-1.5"
          comment count chip
          UIText tertiary "break-anywhere line-clamp-1 flex-1"  {preview}
    div "@xl:self-center self-start"
      ProjectTag
```

Dimensions

- Row: min-height 48px, padding 12px (16px horizontal when the list container is ≥ 576px, `@xl:px-4`), radius 8px, gap 12px between avatar and text.
- Avatar: 40px circle (4px radius square for integrations), nudged 2px down (`mt-0.5`) and top-aligned.
- Text block: 2px between title line and preview line.
- Title: 15px / 22.5px, weight 500, `text-primary`, one line. Falls back to "Post by {display name}".
- Preview: 14/20, `text-tertiary`, one line. Content: if the viewer has seen the post, the latest comment preview, else the truncated description (pinned: always description; search: "MMM d, yyyy").
- Comment-count chip (only if comments > 0): `h-4.5 mr-2 mt-px flex items-center justify-center self-start rounded px-1.5 text-[10px] font-semibold uppercase` → 18px tall, 6px x padding, 4px radius, 10px semibold, 8px right margin, 1px top offset.
  - Unread comments: `bg-blue-500 text-white`.
  - Otherwise: `text-tertiary bg-black/[0.04] dark:bg-white/10`.
- Status badges (Badge primitive, 18px): "Resolved" green; "Needs feedback" brand (requested of viewer) or default; follow-up tag (orange, mono, clock icon). 6px apart, 6px right margin.

Unread state

- A post is unread when `!viewer_has_viewed && !viewer_is_author`: a 10px `bg-blue-500` dot before the title. It animates in/out with framer-motion: `opacity 0, marginRight -10px` ↔ `opacity 1, marginRight 10px` (no duration set; framer default). Title weight does not change.

Project chip (right side)

- Below the `@xl` container width (< 576px) the content stack is `flex-col-reverse`, so the project name sits **above** the title as plain text: `text-quaternary hover:text-primary`, 14px, gap 4px, no border.
- At `@xl` (≥ 576px) it becomes a pill on the right, vertically centred: `@xl:text-tertiary @xl:border @xl:h-6 rounded-full`, 24px tall, 0.5px `border-primary`, 12px text (`@xl:text-xs`). Horizontal padding: name only `px-2` (8px); emoji accessory `pl-1.5 pr-2.5` (6/10px); private `pl-2.5 pr-1.5` (10/6px); both `px-1.5` (6px). Accessory emoji 12px, `leading-none`, `mr-px`. Private: `LockIcon` 14px at 80% opacity after the name. Hover: text → `text-primary`. Hovercard on the project (top, centred).
- Hidden on a project's own feed (`hideProject`).

Hover / selected (row background comes from the `HighlightedCommandItem` layer)

- Base: `text-primary rounded-lg px-2 text-[15px] outline-none ease-in-out will-change-[background,_color] scroll-m-1 cursor-pointer`.
- `aria-selected` (keyboard focus via j/k/arrow keys, and pointer hover since the Command list selects the item under the pointer): `bg-black/[0.04]`; dark `bg-white/10` plus `shadow-select-item` (`inset 0 1px 0 rgb(255 255 255 / 0.02), inset 0 0 0 1px rgb(255 255 255 / 0.02), 0 1px 2px rgb(0 0 0 / 0.12), 0 2px 4px rgb(0 0 0 / 0.08), 0 0 0 0.5px rgb(0 0 0 / 0.24)`). Active while selected (dark): `bg-white/10`. Context menu open: `data-[state=open]:bg-black/[0.04]` / dark `bg-white/10`.
- When pointer selection is disabled by the list: `hover:bg-black/[0.025]` (and `group-hover:`), dark `bg-white/5`.
- Transition: when the last input was the mouse, `transition-all ease-out duration-150` (150ms); keyboard moves are instant.
- On mobile devices (`isMobile`) none of the `aria-selected` styles apply.
- Click target: unread → post; read with a newer comment by someone else → that comment; else post.

### 1.6 Comfy compact row (feature-flag variant)

Source: `CompactPost/ComfyCompactPost.tsx`. Same row shell but `px-2 py-3` (`@xl:px-4`), rows 12px apart.

- Text column `flex flex-1 flex-col gap-2` (8px): project name above title (always plain-text style, `text-quaternary hover:text-primary`, 14px → 12px at `@xl`), title 15px/500 **two lines** (`line-clamp-2`) followed by Badge "New" (blue) when unread (instead of a dot), then status badge; description 14/20 `text-tertiary` `line-clamp-2`.
- Commenters line (link to latest comment): FacePile `xs` (20px, limit 3, no tooltips), 6px gap, count chip `h-4.5 mt-px min-w-4 rounded px-1 text-[10px] font-semibold uppercase` (18px tall, min 16px wide, 4px x padding). Unseen: `bg-blue-50 font-extrabold text-blue-500`, dark `bg-blue-500/20 text-blue-400`, text "+N". Seen: `text-tertiary bg-black/[0.04]` (dark `bg-white/10`), hover `text-secondary bg-black/[0.06]` (dark `bg-white/15`). Then the latest comment preview, 14px `text-tertiary`, hover `text-primary`, one line. Count hidden when there is exactly one seen comment.
- Reactions: `-ml-1 flex flex-wrap items-center gap-1`; add-reaction `sm` round plain icon button (`text-tertiary hover:text-primary px-0.5`); pills `h-6.5 rounded-full p-0.5 pl-1.5 pr-2 gap-[5px] text-xs font-semibold ring-1 min-w-[32px]` (26px tall). Reacted `bg-blue-50 hover:bg-blue-100 text-blue-900`, dark `bg-blue-900/40 hover:bg-blue-900/60 text-blue-400`; not reacted `bg-tertiary hover:bg-quaternary`.
- Attachment thumbnail (right): `bg-elevated max-w-30 max-h-22 rounded-lg ring-1 ring-inset ring-[--border-primary]` (max 120×88px, aspect ratio of the first media), count badge `bottom-1 right-1 h-5 w-5 rounded-md bg-black/50 backdrop-blur-lg`, 12px text in dark-mode primary colour.
- Hover actions: `bg-elevated absolute right-2 top-1 -translate-y-1/2 rounded-lg border p-0.5 shadow`, opacity 0 → 1 on row hover / focus-visible / menu open (`transition-opacity` 100ms); always visible on touch devices. Contains a plain add-reaction button and the overflow dropdown (30px buttons).

---

## 2. Space (project) feed with full post previews

Source: `Projects/ProjectView.tsx`, `Projects/ProjectPosts.tsx`, `Feed/ComfortableFeed.tsx`, `InlinePost/*`, `GroupedAttachments.tsx`, `AttachmentGrid/index.tsx`, `Reactions/index.tsx`.

### 2.1 Page frame

- Titlebar (`BreadcrumbTitlebarContainer`): `bg-primary sticky top-0 z-10 hidden h-[--navbar-height] flex-none items-center gap-3 border-b px-3.5 lg:flex` — 56px, 14px x padding, 0.5px bottom border, ≥ lg only. Contents: project accessory icon + name + lock, favourite button, layout filter (Posts / Docs / Calls), right side call button, overflow, sidebar toggle.
- Second bar under it: `h-auto min-h-10 py-1.5` (min 40px, 6px y) with a search input (`SearchIcon` 20px in a 20px box `text-tertiary`, 8px gap, 14px input, placeholder "Search...", ⌘F focuses) and the display dropdown.
- Content uses `IndexPageContent` (same paddings as §1.1, without `lg:py-16`), then `NewPostButton` (not on mobile devices), pinned posts, then the feed with `hideProject`. Comfortable density (when split view is unavailable) constrains to 700px. Compact density in a project uses the compact rows of §1.5 without the project chip.
- Empty: `PostsIndexEmptyState` (§4.2).

### 2.2 Post card (`InlinePost`, display `feed`)

```
InlinePostContainer  "relative isolate cursor-pointer"   (click anywhere non-interactive → post; ⌘/ctrl → new tab)
  sr-only link "View post"
  InlinePostVersionStatus (only if versions)
  grid "grid-rows relative isolate grid grid-cols-[52px,minmax(0,1fr)]
        grid-rows-[minmax(20px,1fr),20px,max-content,max-content]"
    InlinePostActor   col 1, rows 1–2: MemberAvatar lg (40px), z-10
    InlinePostByline  col 2, row 1
    content grid      col 2, rows 2–4: "flex flex-col gap-3 border-b pb-6"
      Title, Resolution, Content, Poll, GroupedAttachments, link unfurl (max-w-lg 512px),
      Tags, Social actions, Engagements
```

- Posts are stacked `flex flex-col gap-6` (24px). Each card ends with a 0.5px `border-primary` bottom rule after 24px padding. No card background, border or radius; no hover background.
- Avatar column 52px (40px avatar + 12px gutter).
- Byline (`InlinePostByline.tsx`): `text-tertiary inline-flex flex-wrap gap-1 gap-y-0 text-[15px]`.
  - Author: 15px, 500, `text-primary`, one line, `hover:underline`; member hovercard.
  - Optional Guest badge or "App" badge (`h-4.5 translate-y-0.5`).
  - " in " (tertiary) + project link `text-primary font-medium`, name 15px with `group-hover/byline-project:underline`, emoji accessory 13px (`translate-y-px`), `LockIcon` 16px if private.
  - Timestamp: relative time, `ml-1.5` (6px), 15px, `text-quaternary hover:text-primary`, tooltip with the long timestamp.
  - Right: overflow `Button plain iconOnly DotsHorizontal` (30×30) `text-tertiary hover:text-primary` inside a 20px-tall flex span (overflows visually).
- Title (`InlinePostTitle.tsx`): `text-primary -mb-4 mt-1 text-xl font-semibold leading-snug` → 20px, 600, line-height 27.5px, 4px top, −16px bottom (pulls the body up under the 12px gap). Hidden when there is no title or it was taken from the body.
- Body (`InlinePostContent.tsx`): wrapper `mt-1` (`mt-2` with a title), rendered in `.prose` (15px body). Truncated HTML; if truncated, "Read more →" link `text-primary mt-3 text-[15px] font-medium hover:underline`. Empty body → `min-h-4` (16px) spacer.
- Version status (above the grid, only for versioned posts): `text-quaternary hover:text-primary inline-flex items-center gap-3 self-start pb-1`; 40px right-aligned slot with green `RefreshIcon`, then "v2" in mono 15px.
- Tags: `flex flex-wrap gap-x-2.5 gap-y-2` (10px/8px); each `text-quaternary` 14px (`text-sm` wins over `text-[15px]`), "#" at 60% opacity (80% dark), `hover:text-primary` for members.

### 2.3 Attachments

- `GroupedAttachments`: `flex flex-col gap-3`; media grid then non-media files.
- Media grid (`AttachmentGrid`), max 4 shown:
  - 1 item: full width, `max-h-[500px] object-contain` (images `mx-auto h-auto`), radius 6px; single video shows controls and may autoplay muted.
  - 2 items: `grid grid-cols-2 aspect-[2/1]`.
  - 3+ items: `h-[500px] grid-flow-col grid-cols-2 grid-rows-2`; with 3, the third spans both rows.
  - Multi-item grids: `ring-neutral-150 bg-neutral-150 grid auto-rows-fr gap-px rounded-md ring-1` (1px seams in neutral-150; dark `bg-neutral-700/50 ring-neutral-700/50`), cells `object-cover`, outer corners only rounded 6px.
  - Overflow "+N more…" and video timestamp chips: `m-1 flex h-6 items-center justify-center rounded-md bg-black px-2 text-xs font-bold text-white` (24px, 6px radius), bottom-right / bottom-left.
- Non-media files: `divide-secondary flex flex-col divide-y rounded-md border` list of `FileAttachment` rows.

### 2.4 Social actions and reactions

Source: `InlinePostSocialActions.tsx`, `InlinePostReactions.tsx`.

- Row `-ml-1 flex flex-wrap items-center gap-x-0.5 gap-y-1` (2px / 4px).
- Buttons: `plain`, `round`, base size → 30×30 circles, 24px icons: Comment (`ChatBubbleIcon`), Share (`PaperAirplaneIcon`, members only), Follow-up (`AlarmIcon` / `AlarmCheckIcon` when set), Add reaction (`FaceSmilePlusIcon`). Hover `bg-black/[0.06]` (dark `bg-white/[0.08]`).
- Feedback-requested posts (viewer not author, not yet commented): labelled round button "Feedback requested" with `FeedbackRequestAltIcon`; `flat` + `text-secondary hover:text-primary`, or when requested of the viewer `bg-brand-primary hover:bg-brand-secondary text-white`.
- Reaction pill: `h-7.5 rounded-full p-1 pl-2 pr-2.5 gap-1.5 text-xs font-semibold ring-1 min-w-[32px]` (30px tall, 8px left / 10px right padding, 6px gap). Emoji 14px `leading-none mt-0.5` (custom 15×15 image); count `font-mono leading-none`. Reacted: `bg-blue-100/70 hover:bg-blue-100 text-blue-900`, dark `bg-blue-900/40 hover:bg-blue-900/60 text-blue-400`. Not reacted: `bg-tertiary hover:bg-quaternary`. `ring-1` has no colour class and the repo sets no ring colour, so Tailwind's default ring colour applies. Tooltip: "{names} reacted with :name:". Pills animate in/out with framer-motion (0.2s).
- Clicking Comment opens an inline comment composer below (height 0 → auto, opacity, 0.1s, 8px top padding). In the inbox and on the post page it focuses the existing composer instead.

### 2.5 Engagements (comment facepile / count)

Source: `InlinePostEngagements.tsx` (`FeedPostEngagements`). Row `flex flex-wrap items-center gap-1.5` (6px), only if comments, views or follow-ups > 0:

- Comments link: FacePile `xs` (20px avatars, limit 3) + 8px gap + "N comments" (14/20, `text-quaternary`, dark `text-tertiary`, `hover:underline`). New comments: pill "new" `ml-1 rounded-full bg-blue-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white`; link jumps to `#comments-end`, else `#comments`.
- " · " separators in `text-quaternary`.
- "N views" and "N follow-ups" buttons, same text style, open the viewers popover.

---

## 3. Inbox

Source: `InboxItems/InboxSplitView.tsx`, `InboxNotificationItem.tsx`, `NotificationListItem.tsx`, `FollowUpListItem.tsx`, `InboxViewOptions.tsx`, `InboxTriageActions.tsx`, `InboxHoverCard.tsx`, `Titlebar/BreadcrumbTitlebar.tsx`. Route `/[org]/inbox/[inboxView]`, views `updates`, `archived`, `later`, `activity`.

### 3.1 Split view

```
div "flex flex-1 overflow-hidden"
  list column  "w-full flex-col overflow-hidden lg:max-w-[600px] lg:basis-[30%] lg:border-r"
               + lg:min-w-[350px] (lg:min-w-[450px] in the Mac desktop app with collapsed sidebar)
               + (detail open ? "hidden lg:flex" : "flex")
    BreadcrumbTitlebar (≥ lg, 56px)  → InboxViewOptions + "…" bulk menu (updates only)
    BreadcrumbTitlebar "flex h-auto py-1.5 lg:hidden"  → InboxViewOptions incl. Activity (below lg)
    RefetchingPageIndicator
    ScrollableContainer → groups / list / empty state / InfiniteLoader
  detail column "flex min-w-0 flex-1 flex-col" + (detail open ? "flex" : "hidden lg:flex")
    Detail → PostView | InboxProjectRenderer | NoteView | CallView  ("Not found" otherwise)
```

- ≥ lg: list is 30% of the width, clamped 350–600px, 0.5px right border; detail fills the rest. Clicking a row opens it in the detail pane (⌘-click navigates). With nothing selected the detail column is empty.
- Below lg: one column at a time. The list is full width; opening an item navigates to its page.
- Detail toolbar actions (`InboxTriageActions`, placed in the detail titlebar): `flex items-center gap-3 border-r pr-3.5` with `base`-variant icon buttons (30×30): Follow up (`f`), Archive / Unarchive (`e`).
- Keyboard: `1/2/3` switch views, `j/k` or arrows move, `h/l` collapse/expand group, ⌘↑/⌘↓ first/last, `f` follow up, `e`/backspace/delete archive, `alt+u` mark all read, `shift+backspace` archive read.

### 3.2 Filters (view tabs) and bulk menu

```
span "flex w-full gap-3"
  span "flex flex-1 gap-0.5"
    Button "Updates"  (tooltip shortcut 1)   variant flat when current, else plain
    Button "Archived" (2)
    Button "Later"    (3)
    Button "Activity" (below-lg bar only) rightSlot = 8px dot "h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" when unread activity
  {rightSlot}
```

- Same 30px base buttons as the Home tabs, 2px apart; on mobile devices `fullWidth` (each tab stretches).
- Bulk menu (updates view): `Button plain iconOnly DotsHorizontal` → dropdown 250px wide, align end: "Mark all read" (⌥U), "Archive read notifications" (⇧⌫), "Archive all notifications".

### 3.3 Day groups

- `InboxGroup`: header `bg-primary sticky top-0 z-10 flex h-10 items-center border-b px-3` — 40px, 12px x padding, 0.5px bottom border, sticky; label 14/20, 500, `text-tertiary` (Today / Yesterday / long date as in §1.4).
- Rows list: `ul flex flex-col gap-px p-2` (8px padding, 1px between rows). Archived and Activity views are ungrouped lists with the same `ul` style; Later is grouped by date.

### 3.4 Row shell (`InboxItem`)

```
div "group relative flex min-h-12 flex-none cursor-pointer scroll-m-2 scroll-mt-12 items-center gap-3
     rounded-lg p-2.5 dark:focus:bg-tertiary  (no outline / ring / border on focus)"
  Link "absolute inset-0"
  {row content}
```

- Min height 48px, padding 10px, gap 12px, radius 8px. Scrolls into view (smooth, nearest) when it becomes active.
- Backgrounds:

| variant                  | default                                      | hover           | active (selected in detail pane)     |
| ------------------------ | -------------------------------------------- | --------------- | ------------------------------------ |
| plain                    | none                                         | `bg-tertiary`   | `bg-tertiary`, hover `bg-quaternary` |
| group parent (collapsed) | none                                         | `bg-tertiary`   | `bg-quaternary`                      |
| group parent (expanded)  | `bg-black/[0.025]` / dark `bg-white/[0.045]` | `bg-quaternary` | `bg-quaternary`                      |
| group child              | `bg-black/[0.025]` / dark `bg-white/[0.045]` | `bg-quaternary` | `bg-quaternary`                      |

- Group rows join into one block: an expanded parent gets `rounded-b-none`, middle children `rounded-none`, the last child `rounded-t-none`; `transition-all duration-150`.
- Rows enter/leave with framer-motion: `opacity 0, height 0, y −4px` ↔ `opacity 1, height auto, y 0`, 0.15s.
- Right-click opens the notification context menu (hover-capable devices).

### 3.5 Notification row content (`InboxNotificationItem`, Updates and Archived)

```
div "pointer-events-none relative mt-0.5 flex items-start self-start"
  Avatar sm (24px) with reason badge | AlarmIcon 24 (follow-up) | VideoCameraFilledIcon 24 text-green-500 (call)
div "flex min-w-0 flex-1 flex-col gap-0.5"
  channel line  "text-tertiary flex h-5 items-center justify-between gap-2"  (read: text-quaternary)
    left  "flex items-center gap-1": emoji (12px, leading-none, mr-px) + project name + LockIcon 14 @80%
          (no project: "Private" + lock)
    right "flex items-center gap-1": RelativeTime "text-quaternary flex-shrink-0 text-sm"
          (+ "…" plain button on touch devices)
  title line "flex h-5 flex-shrink items-center"   (inside "@xl:flex-row flex flex-1 flex-col")
    status badge ("Resolved" green mono, or follow-up tag) "mr-2"
    unread dot "h-2.5 w-2.5 flex-none rounded-full bg-blue-500"
    UIText "break-anywhere mr-2 line-clamp-1"  {target title}
    spacer flex-1
    group toggle (group parent only)
  reply-to quote "mb-0.5 flex border-l-2 pl-2 pr-3 leading-tight"  → 14px text-quaternary, 1 line
  body preview "break-anywhere text-secondary line-clamp-2"  (read: text-quaternary)
```

- Leading avatar: 24px, nudged 2px down, top-aligned; integrations `rounded-md`. When there is a reason, the avatar is clipped (`notificationReason` / `…Square`) and a 16px circular badge sits at −5px bottom/right:
  - mention: `AtSignIcon` 14, `bg-yellow-500/40 text-yellow-900` (dark text `yellow-100`)
  - comment resolved: `CheckIcon` 12, `bg-blue-500 text-white`
  - feedback requested: `QuestionMarkIcon` 11 (stroke 3), `bg-brand-primary text-white`
  - post resolved: `CheckIcon` 12, `bg-green-500` (dark `green-600`) white
  - subscription to a post: `RefreshIcon` 14; to a comment: `QuoteIcon` 14 (or `Reply2Icon` when replying); permission granted to a project: `ProjectIcon` 14 — all `bg-black/10 dark:bg-white/15 text-secondary`; to a note: `NoteFilledIcon` 14 `bg-blue-500 text-white`.
- Channel line and title line are each fixed at 20px tall; 2px between lines. Channel text 14px, 12px at `@xl`.
- Unread vs read:
  - Unread: 10px blue-500 dot before the title (enters `opacity 0, marginRight −10` → `opacity 1, marginRight 6px`, 0.15s); title 14px **600** `text-primary`; channel `text-tertiary`; body `text-secondary`.
  - Read: no dot; title 14px 400 `text-tertiary`; channel `text-quaternary`; body `text-quaternary`; follow-up/call icons at 60% opacity.
- Body preview: up to 2 lines, prefixed "{prefix}: " when present.
- Grouped notifications (same target): the first row is the parent; its title line ends with a toggle `relative z-10 -mr-1 flex gap-px pl-0.5 text-blue-500` showing the count (14px, 500) and `ChevronRightCircleIcon` that rotates 90° when expanded (`transition-transform duration-150`); touch hit area expanded to ≥ 32px. Children hide the channel and title lines and show only the preview.

### 3.6 Activity rows and Later rows

- Activity (`NotificationListItem`, display `activity`): 24px avatar with reason badge (or 24px emoji at `text-[22px] leading-6` for reactions, `AlarmIcon`/`VideoCameraIcon` 24 `text-secondary`); summary sentence 14px `leading-tight` with bold blocks `font-medium` and others `text-secondary`, followed by relative time (14px `text-secondary`), `pt-0.5`; optional quote (`border-l-2 pl-2 pr-3`, `text-secondary`, 1 line) and body preview (`text-secondary`, 1 line) in `my-1 flex flex-col gap-y-1`. Optional 48×48 preview image `rounded-lg ring-1 ring-black/5 dark:ring-white/5 bg-tertiary`, only ≥ sm (`hidden sm:inline-block`).
- Same component in `home` display: read rows at 60% opacity; a footer `flex items-center gap-2` with an 8px `bg-blue-500` unread dot and the relative time (`text-tertiary`, 50% opacity when read).
- Later (`FollowUpListItem`): 24px subject avatar in a 24×24 slot, summary sentence, quote, then "Follow up at {time}" in `text-amber-600`.

### 3.7 Inbox empty state

```
IndexPageEmptyState  "mx-auto flex w-full max-w-lg flex-1 items-center justify-center"
  "flex flex-col items-center space-y-4 text-center"
    InboxIcon 80px (updates) | AlarmIcon 80px (other views)  "text-gray-300 dark:text-gray-700"
```

Icon only, no text. Detail pane with no selection: empty column (no placeholder). Project detail error: `bg-secondary dark:bg-primary flex flex-1 items-center justify-center p-6` with `EmptyState` (QuestionMarkIcon 32, "Something went wrong", "The project may have been deleted or you may not have access to it."). Inbox hovercards use `EmptyState` with `InboxIcon`/`AlarmIcon` 44px `text-quaternary`.

---

## 4. Empty states

### 4.1 `EmptyState` component

Source: `EmptyState/index.tsx` (full DOM in `primitives.md` §7).

- Centred in available space (`flex flex-1 items-center justify-center`), column, `text-center`.
- Order: emoji (20/28, 600, 16px below) → icon box (8px padding, `text-primary` at 80% opacity, 16px below) → `flex flex-col gap-2` with title (14/20, 500, `text-primary`) and message (14/20, `text-tertiary`) → children.
- Callers size the icon: 32px (`QuestionMarkIcon`), 40px (`NoteIcon`, `ChatBubbleIcon` `text-quaternary`), 44px (`InboxIcon`/`AlarmIcon`/`ChatBubbleIcon` `text-quaternary` in popovers). Children usually add `mt-4` and a primary button (e.g. NoteView: "Note not found" / "It may have been deleted or had its permissions changed." / "Go home").

### 4.2 Feed empty state (`PostsIndex/PostsIndexEmptyState.tsx`)

- `IndexPageEmptyState` (max 512px, 16px vertical spacing), centred in the remaining height.
- `PostIcon` 32px → `flex flex-col gap-1`: "Write a post" (16/24, 600) + "Share an update, ask a question, or get feedback on an idea." (16/24, `text-tertiary`) → `NewProjectPostButton` primary. When not writeable: "No posts yet" only, no button.
- Comfortable feed wraps it in `isolate mx-auto flex w-full max-w-[--feed-width] flex-1 flex-col`.

### 4.3 Search empty state (`Feed/EmptySearchResults.tsx`)

- `flex flex-1 items-center justify-center py-24` (96px y padding).
- Illustration: 128px-tall box with two 80×96 `bg-elevated rounded-md border border-neutral-200 shadow` cards (dark `border-neutral-700`), centred and rotated +5° / −5°; on hover they rotate to ±9°, scale 1.05 and take `shadow-md` (`transition` 100ms).
- Text "No search results found." 14px, 500.

### 4.4 Loading

`IndexPageLoading`: `flex flex-1 flex-col items-center justify-center` with a lazy spinner. `InfiniteLoader` at the end of every list fetches the next page.

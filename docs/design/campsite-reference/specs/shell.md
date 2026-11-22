Source: Campsite (github.com/campsite/campsite) at commit cc14551, CC BY-NC 4.0.

# App shell: sidebar, titlebar, layout columns, right rail, mobile

Paths are relative to `apps/web/components/` unless they start with `packages/` or `apps/`. Token names (`bg-quaternary`, `text-tertiary`, …), the 0.5px `border`, shadows, Button sizes and Avatar sizes are defined in `primitives.md`; this file only names them. Icons are 20px unless a size is given.

Breakpoints: `useBreakpoint` (`packages/ui/src/hooks/useBreakpoint.ts`) uses sm 640, md 768, **lg 1024**, xl 1280 (`window.innerWidth >= n`). Tailwind adds `xs` 430px, `3xl` 1792px, `4xl` 2048px. Layout variables: `--sidebar-width` 240px, `--feed-width` 700px, `--navbar-height` 56px. `--titlebar-height` is used in the sidebar but its definition was not found.

## 1. Page frame

Source: `Layout/AppLayout.tsx`.

```
<>
  {below lg && logged in: <NavigationBar/>}            mobile titlebar (§7)
  <DesktopDragAndExpand/>                              desktop app only: fixed top drag strip, h-[--navbar-height]
  <RefreshAppBanner/>
  <div class="px-safe flex w-full flex-1 items-stretch overflow-y-auto lg:h-full lg:overflow-hidden">
    {lg && member of >1 org: <SidebarOrgSwitcher/>}     48px org rail (§2.1)
    {lg: <SidebarContainer/>}                           240px sidebar (§2)
    <main id="main" class="flex flex-1 flex-col overflow-hidden">{page}</main>
  </div>
  {below lg: <MobileTabBar/>}                           (§8)
</>
```

- ≥1024px: columns are `[org rail 48px] [sidebar 240px] [main flex-1]`; the page's own split view may add a right column (§5).
- <1024px: no rail, no sidebar; a 56px top bar and a bottom tab bar wrap `main`, and the wrapper scrolls (`overflow-y-auto`).
- `px-safe`: horizontal safe-area padding (`tailwindcss-safe-area`).

## 2. Sidebar

Source: `Sidebar/index.tsx`.

### 2.1 Org rail (left of the sidebar, multi-org users only)

Source: `Sidebar/SidebarOrgSwitcher.tsx`. Shown when the user is in more than one organization and the sidebar is not collapsed.

```
<div class="h-screen w-12">                                           48px wide (desktop mac: pt-11.5 = 46px)
  <div class="bg-secondary scrollbar-hide relative flex h-full w-full flex-col items-center gap-3 overflow-y-auto border-r py-3">
    <Reorder.Group class="flex flex-col gap-3">                       12px between orgs, drag to reorder (y)
      <a class="relative flex gap-2 rounded-[5px] ring-offset-2 ring-offset-gray-50 dark:ring-offset-gray-900 [selected: ring-2 ring-black dark:ring-white/90]">
        <Avatar size="sm" rounded="rounded-[5px]"/>                    24×24, 5px radius
        <div class="absolute right-px top-px h-2 w-2 rounded-full bg-blue-500 ring-2 ring-gray-50 dark:ring-gray-900" style="transform:translate(50%,-50%)"/>   unread dot
      </a>
      <a class="group relative flex h-6 w-6 items-center justify-center rounded-[5px] bg-black/10 hover:bg-black/15 dark:bg-white/10 dark:hover:bg-white/20 ...">
        <PlusIcon size=18 strokeWidth=2 class="opacity-50 group-hover:opacity-100"/>   "New organization" tooltip, side right
      </a>
```

- Padding 12px top/bottom, 0.5px right border, `bg-secondary`.
- Selected org: 2px ring, black (dark white/90), offset 2px in gray-50 (dark gray-900).
- Unread dot (inbox + message count > 0, only when not the selected org): 8px blue-500, 2px ring in gray-50 / gray-900, centred on the avatar's top-right corner.
- Dragging item: `opacity-60`; drag elastic 0.065. Hover card per org (`OrganizationSwitchHoverCard`); desktop app gets `mod+1…9` shortcuts.

### 2.2 Container

```
<m.div/>                                       width spacer: 240px ↔ 0 when collapsed, 100ms linear
<div class="fixed bottom-0 top-0 isolate z-30 h-screen w-[--sidebar-width] transition-[opacity,transform] duration-200 {left-0 | left-12}">
  <nav class="bg-primary flex h-full max-h-screen flex-col transition-[opacity,color] border-r">
    <header block/>   (§2.3)
    <div id="sidebar-scroll-container" class="scrollbar-hide flex-1 overflow-y-auto overscroll-contain">
      <SidebarGroup class="pt-0">Home, Inbox, [Messages], Docs, Calls, [Drafts]</SidebarGroup>
      <SidebarFavoritesGroup/>  <SidebarProjectsGroup/>  <SidebarChatSectionGroup/>
    </div>
    <footer group/>   (§2.8)
  </nav>
```

- Fixed, 240px wide, full height, `bg-primary`, 0.5px right border (`border-primary`). `left-12` (48px) when the org rail is present.
- Scrollbar hidden.
- Collapsed (`[` hotkey; persisted in `localStorage` key `sidebarCollapsed`): spacer animates to 0; container gets `p-3 pr-5`, `-translate-x-[calc(100%-12px)] opacity-0`, and slides back in (`translate-x-0 opacity-100`) on hover, focus-within, or while it contains an open menu (`has-[button[aria-expanded=true]]`). Transition 200ms on opacity/transform. The nav becomes a floating card: `rounded-md border shadow` (6px radius, 0.5px border, default `shadow`) with no `border-r`. Hover cards on nav links are disabled while collapsed.
- `/` hotkey goes to search; `c` opens the post composer.

### 2.3 Header block

```
<div class="relative flex flex-col gap-1.5 border-b p-3 pb-3 {border-primary | border-transparent when scrolled to top}">
  {desktop app: row h-[--titlebar-height] gap-0.5 with back/forward (ChevronLeftIcon/ChevronRightIcon 24, plain), RecentlyViewed, Activity}
  <div class="flex items-center justify-between">  <OrganizationSwitcher/>  {web: <SidebarActivity/>}  </div>
  <div class="flex flex-1 items-center gap-1">
    <span class="flex-1"><NewPostButton/></span>
    <SidebarSearchButton/>
  </div>
  <SidebarMoreUnreadsTop/>
</div>
```

- Padding 12px all sides, 6px between rows. The bottom 0.5px border is transparent until the list below is scrolled (intersection observer on a sentinel), then `border-primary`.
- Web height: 12 + 32 (org row) + 6 + 30 (button row) + 12 = **92px** plus the 0.5px border.

Org switcher trigger (`NavigationSidebar/OrganizationSwitcher.tsx`):

```
<button class="hover:bg-quaternary relative flex cursor-pointer items-center justify-between gap-2 overflow-hidden rounded-md p-1.5 text-sm focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-100">
  <div class="flex min-w-[0] items-center gap-2 text-left">
    <Avatar size="xs" rounded="rounded"/>                       20×20, 4px radius
    <UIText weight="font-medium" class="truncate whitespace-nowrap">{org name}</UIText>   14/20, 500
  </div>
  <div class="flex items-center gap-1">
    {admin with pending requests: <div class="h-2 w-2 flex-none rounded-full bg-blue-500"/>}
    <div class="text-tertiary"><ChevronSelectIcon/></div>      20px
  </div>
</button>
```

- 32px tall (6px padding + 20px), 6px radius, hover `bg-quaternary`. Width is content width (not stretched).
- Dropdown: `align start`, `sideOffset 4`, width 280px. Items: People (UserCircleIcon, blue `N requests` badge), Channels (ProjectIcon), separator, Settings (GearIcon), Custom emojis (FaceSmileIcon), Integrations (AppsIcon); "New organization" (PlusIcon) when only one org.
- Loading placeholder: `flex h-8 flex-1 items-center gap-2 p-1.5`, a 20px `bg-quaternary` circle and a 6px-tall half-width `bg-quaternary` pill.

Activity button (`Sidebar/SidebarActivity.tsx`): Button `plain` icon-only 30×30; `BoltIcon`, or `BoltFilledIcon` in `text-blue-500` when there are unread activities; tooltip `Activity` / `N unread`, shortcut `g+a`. Opens a popover 420×420, `rounded-lg bg-primary shadow-popover`, dark `border-primary-opaque` + `0 2px 16px rgba(0,0,0,1)`, header `h-11` (44px) `border-b px-3` with "Activity" semibold 14px. Side `right` on web, `bottom` in the desktop app; `sideOffset 4`.

New post (`Sidebar/NewPostButton.tsx`): Button `variant="base"`, `fullWidth`, base size (30px tall, 14.01px 500, 6px radius, `px-2.5`, `shadow-button-base`). Label "New post", or "Resume post" when a local draft exists. No icon. Tooltip with shortcut `c`.

Search (`SidebarSearchButton/SidebarSearchButton.tsx`): Button `plain`, icon-only `SearchIcon` 20, 30×30, links to `/{org}/search`, tooltip "Search" shortcut `/`. Inherits text colour (no `text-tertiary` class).

"More unreads" pill (`Sidebar/SidebarMoreUnreads.tsx`): appears when unread rows are scrolled out of view. `absolute bottom-2 z-10 rounded-full bg-blue-500 px-4 py-2 text-blue-50`, label "More unreads" 12px bold `whitespace-nowrap`, shadow `inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,0,0,0.8)`. Centred (`left 50%`, `translateX -50%`). Fades and moves over 200ms (top pill: y 40 → 52px). Click smooth-scrolls the item to 30px from the edge.

### 2.4 Nav link (`Sidebar/SidebarLink.tsx`)

```
<div class="group/sidebar-link relative flex min-w-0 flex-1">
  <a class="h-7.5 relative flex w-full items-center gap-2 rounded-md p-1.5 font-medium {state}">
    <span class="{unread: text-primary}">{leading icon/avatar}</span>
    <span class="flex flex-1 items-center gap-1.5 truncate text-sm [max-w-[calc(100%-52px)] when removable]">
      <span class="truncate {label state}">{label}</span>
      {labelAccessory}  {private: <LockIcon size=16 strokeWidth=2 class="text-quaternary flex-none"/>}
    </span>
    {trailing accessory (badge, call chip)}
  </a>
  {removable: remove button (below)}
</div>
```

| property       | value                                          |
| -------------- | ---------------------------------------------- |
| height         | 30px (`h-7.5`)                                 |
| padding        | 6px all sides                                  |
| icon–label gap | 8px; label–accessory gap 6px                   |
| radius         | 6px                                            |
| font           | 14px (`text-sm`, line-height 20px), weight 500 |
| row spacing    | 1px (`gap-px` in the group)                    |

| state                                   | row                                                                       | label                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| default                                 | transparent, `text-tertiary`                                              | `opacity-85`                                                            |
| hover                                   | `bg-quaternary`, `text-primary`                                           | opacity 100                                                             |
| active (current route)                  | `bg-quaternary text-primary` (`dark:bg-gray-750`, same as the dark token) | `opacity-85` (100 on hover)                                             |
| context menu open (`data-state="open"`) | `bg-quaternary text-primary`                                              |                                                                         |
| unread                                  | (unchanged row)                                                           | `text-primary font-[750] opacity-100`; leading icon also `text-primary` |
| disabled                                | `aria-disabled`/`disabled` only; no visual style found                    |                                                                         |

No `transition` class on the link: background and colour changes are instant.

Remove button (favorites and favorited items): `absolute right-0.5 top-1/2 -translate-y-1/2 z-[1] rounded p-1 bg-quaternary text-tertiary hover:text-primary`, `CloseIcon` 16 stroke 2 (24×24 box, 2px from the right edge, 4px radius). `opacity-0`, shown on row hover, focus, or open state. Tooltip e.g. "Remove favorite".

### 2.5 Primary nav items (order as rendered)

Source: `Sidebar/SidebarMyWorkGroup.tsx`, `SidebarInbox.tsx`, `SidebarDrafts.tsx`. Group: `SidebarGroup` = `flex flex-col gap-px px-3 py-2` with `pt-0` → 0 top, 8px bottom, 12px sides.

| label    | icon (size)            | route                        | badge                                            | condition                                    |
| -------- | ---------------------- | ---------------------------- | ------------------------------------------------ | -------------------------------------------- |
| Home     | `HomeIcon` (20)        | `/{org}/posts`               | none                                             | always                                       |
| Inbox    | `InboxIcon` (20)       | `/{org}/inbox/{defaultView}` | unread count, non-important; label bold when > 0 | always                                       |
| Messages | `ChatBubbleIcon` (20)  | `/{org}/chat`                | unread DM count, non-important                   | only with `sidebar_dms` feature flag         |
| Docs     | `NoteIcon` (20)        | `/{org}/notes`               | none                                             | always                                       |
| Calls    | `VideoCameraIcon` (20) | `/{org}/calls`               | none                                             | hidden in the community org                  |
| Drafts   | `PostDraftIcon` (20)   | `/{org}/drafts`              | draft count, non-important                       | only when drafts exist or the page is active |

Hover cards (Inbox, Messages, Docs, Calls) open to the side with `sideOffset 4`, `alignOffset -44`. There is no standalone "Chat" link without the feature flag; chats are a collapsible group (§2.7). No "Notes" label: the notes link is labelled "Docs".

### 2.6 Unread badge (`Sidebar/SidebarUnreadBadge.tsx`)

```
<div class="pointer-events-none flex-none rounded-full px-1.5 py-px font-mono text-[10px] font-bold {colour}">{count}</div>
```

- 6px horizontal, 1px vertical padding, pill radius, monospace 10px bold. No line-height class, so it inherits 1.5 (15px) → about 17px tall.
- `important=false` (all sidebar uses): `bg-quaternary text-secondary`. `important=true`: `bg-blue-500 text-white`.

### 2.7 Collapsible groups: Favorites, Channels, Chat

Header (`Sidebar/SidebarCollapsibleButton.tsx`):

```
<button class="hover:bg-quaternary group flex flex-1 items-center rounded-md px-2 py-1">
  <span class="text-quaternary mr-1.5 transition-transform duration-200 {rotate-90 expanded | rotate-0 collapsed}">
    <PlayIcon size=12/>                     filled triangle pointing right when collapsed, down when open
  </span>
  <UIText size="text-xs" tertiary weight="font-medium">{label}</UIText>   12/16, 500
</button>
```

- 24px tall (4px + 16px + 4px), 8px horizontal padding, 6px radius, hover `bg-quaternary`. Triangle 12px, 6px gap, rotation over 200ms.
- Each group is a `SidebarGroup` (12px sides, 8px top/bottom, 1px row gap). Header row: `flex items-center gap-px`.
- Collapse state persists per org (`sidebar-favorites-collapsed`, `sidebar-projects-collapsed`, `sidebar-chat-collapsed`). **Collapsed groups still show unread and selected items** (and, for chats, the thread being hovered).
- Header actions (hover-revealed, `opacity-0` → 100 on group hover or open menu): Channels has a 24×24 `rounded-md p-0.5 hover:bg-quaternary` button with `DotsHorizontal` scaled 85% (menu: New channel `PlusIcon`, Browse all channels `CompassIcon`; `sideOffset 2`). Chat has a 24×24 button with `PlusIcon` 16 stroke 2, `text-tertiary hover:text-primary`.
- Reorder handle (expanded Favorites and Channels): `ReorderDotsIcon` 16 stroke 2, `text-quaternary`, `absolute -left-[11px]` vertically centred, `cursor-move`, shown on row hover. Dragged row `opacity-60`.
- Trailing rows: Channels ends with a "New channel" link (`PlusIcon`), Chat with "New chat" (`PlusIcon`), styled as normal nav links, only when expanded.

Empty states (expanded, no items): `text-quaternary p-2 pt-0.5` (8px sides/bottom, 2px top), text 12px:

- Favorites: "Favorite your most important chat threads and channels." + `StarOutlineIcon` 16 at `opacity-70`, row `flex items-center gap-2`.
- Channels: "Join channels for quick access to projects, teams, and topics you care about." + "Browse all channels" link `text-blue-500 hover:underline`, stacked `gap-1`.
- Chat: "Send direct messages or start a group conversation." + "New chat" button `text-blue-500 hover:underline`.

Row content per type:

- **Channel** (`SidebarProject.tsx`, `Projects/ProjectAccessory.tsx`): leading is a 20×20 box with the emoji accessory at 13px (`font-[emoji]`), or `ProjectIcon` 20 (`ChatBubbleIcon` for chat channels, `ArchiveIcon` if archived). Unread when `unread_for_viewer`. Private: lock 16. Archived label gets " (Archived)". Active when the URL starts with the channel URL or its context menu is open.
- **Chat thread** (`SidebarChatThread.tsx`): DM leading `MemberAvatar` xs (20px, with online dot); group with image: Avatar xs; group without image: `bg-quaternary text-tertiary flex h-5 w-5 items-center justify-center rounded-md font-mono text-xs font-semibold` member count; integration DM: Avatar xs `rounded-md`. DMs show the member's status emoji after the name (14px, `leading-none`). Active call chip: 16×16 `rounded-md`, `VideoCameraFilledIcon` 12; `bg-green-500 text-white` if the viewer is in the call, otherwise `bg-green-100 text-green-500 dark:bg-green-900/50`. Unread when `unread_count > 0` (and not active) or manually marked unread. No count badge on chat rows.
- **Favorite doc/post/call** (`SidebarFavorite.tsx`): `NoteFilledIcon` `text-blue-500`, `PostFilledIcon` (inherits), `VideoCameraFilledIcon` `text-green-500`, all 20px. Fallback names "Untitled doc", "Untitled call".

### 2.8 Footer

```
<SidebarGroup class="border-t pb-3 pt-1.5 {border-primary | border-transparent when list end is visible}">   px 12, top 6, bottom 12
  <BrowserNotificationsUpsell/>
  <SidebarMoreUnreadsBottom/>
  <div class="flex items-center gap-px">                        (Sidebar/SidebarProfile.tsx)
    <div class="flex items-center gap-1">
      <Button round variant="plain" iconOnly=<MemberAvatar size="sm" displayStatus/>/>   30×30 round, 24px avatar; opens profile menu (side top, align start)
      <StatusPicker/>                                           plain 30×30, FaceSmilePlusIcon 20 (or status emoji), text-tertiary hover:text-primary
    </div>
    <div class="flex-1"/>
    <Button variant="plain" iconOnly=<QuestionMarkCircleIcon/> class="text-tertiary hover:text-primary"/>   "Share feedback"
    <ChangelogDropdown/>                                        plain 30×30, ShipIcon / ShipUnreadIcon, text-tertiary hover:text-primary
  </div>
</SidebarGroup>
```

- Row height 30px; footer total 6 + 30 + 12 = 48px plus the 0.5px top border (transparent when the list's end sentinel is in view).
- Changelog menu items show a 6px `bg-brand-primary` dot for unread entries and `ArrowUpRightIcon` for the external link.
- Browser notifications upsell (web only, permission not yet asked): `bg-elevated mb-2 flex flex-col gap-2 rounded-lg border p-3`, 12px `text-secondary` copy, then Button `size="sm" variant="important"` "Enable notifications".

## 3. Page titlebar (desktop)

Source: `Titlebar/BreadcrumbTitlebar.tsx`, `Titlebar/BreadcrumbPageIcons.tsx`, `packages/ui/src/Squircle/index.tsx`.

```
<div class="bg-primary sticky top-0 z-10 hidden h-[--navbar-height] flex-none items-center gap-3 border-b px-3.5 lg:flex">
  {sidebar collapsed (web): <Button plain iconOnly=<span class="scale-x-flip"><SidebarIcon/></span> tooltip="Open" shortcut="["/>}
  <a class="flex items-center gap-3"> <SquircleIcon small/> <BreadcrumbLabel>Docs</BreadcrumbLabel> </a>
  <div class="ml-2 flex flex-1 items-center gap-0.5">{filter tabs: Buttons}</div>
  {trailing buttons}
</div>
```

- Height 56px, padding 14px left/right, 12px gap, 0.5px bottom border, `bg-primary`, sticky. **Hidden below lg** (`hidden lg:flex`).
- `BreadcrumbLabel`: `UIText` 500, `text-[15px] leading-tight` (15px / 18.75px), `max-w-[32ch] truncate break-anywhere min-w-0`, inherits colour.
- Page icon: `SquircleIconContainer size="small"` = 24×24 squircle; the squircle colour comes from `text-*`: Home transparent + `HomeIcon` `text-primary`; Docs `text-blue-500` + white `NoteFilledIcon`; Calls `text-green-500` + white `VideoCameraFilledIcon` 16; People `text-red-500` + white `UserCircleFilledIcon`; Post `text-gray-800 dark:text-gray-700` + white `PostFilledIcon`; Drafts transparent + `PostDraftIcon` 24; Tags transparent + `HashtagIcon`; Channel transparent + emoji 18px or `ProjectIcon`/`ChatBubbleIcon` 24.
- Multi-level crumbs (`Post/PostBreadcrumbs.tsx`): `flex min-w-0 flex-1 items-center gap-1.5`; first crumb `flex items-center gap-1` (icon + label + `LockIcon` 16 `text-tertiary` if private); separator `<UIText quaternary>/</UIText>` (14px, `text-quaternary`); second label `ml-1`; then a favorite star button.
- Trailing buttons are page-specific Buttons (mostly `plain` 30px icon buttons, gap 2px `gap-0.5`; project pages use `ml-auto flex items-center gap-1.5`).
- Secondary bar under the titlebar on index pages: `BreadcrumbTitlebarContainer class="h-10"` = same styles at 40px tall, holding a search input (`SearchIcon` 20 in a `text-tertiary h-5 w-5` box, 8px gap, borderless 14px input, placeholder "Search...").
- Below lg, pages render a second `BreadcrumbTitlebar className="flex h-auto py-1.5 lg:hidden"` holding full-width filter tabs (6px vertical padding, auto height).
- Desktop app with collapsed sidebar on macOS: `pl-21` (84px) to clear the traffic lights, plus back/forward buttons.
- Fallback `BasicTitlebar` (`Titlebar/index.tsx`): `drag bg-primary grid h-[--navbar-height] grid-cols-5 items-center px-4 lg:grid-cols-3 border-b`; center `col-span-3 lg:col-span-1`; default trailing is a plain Button with `ReorderHandlesIcon` 24.
- Underline tabs (`Titlebar/Subnavigation.tsx`): `py-4 text-sm font-medium rounded-md gap-1.5`, default `text-tertiary`; active `text-primary` with a 2px full-width bar at `-bottom-px`, black / dark white; hover `text-secondary` with a neutral-400 / dark neutral-600 bar.

## 4. Main content column

Source: `IndexPages/components.tsx`, `ScrollableContainer.tsx`, `SplitView/SplitViewContainer.tsx`, `MyWork/index.tsx`.

- `SplitViewContainer`: `flex flex-1 divide-x overflow-hidden` (0.5px dividers, `border-primary`).
- `IndexPageContainer`: `relative flex flex-1 flex-col overflow-hidden`.
- `ScrollableContainer`: `flex w-full flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]`.
- `IndexPageContent`: `mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:gap-8 lg:px-6 lg:py-8`.

| width      | max-width | padding x | padding y | gap  |
| ---------- | --------- | --------- | --------- | ---- |
| <768       | 896px     | 16px      | 16px      | 16px |
| ≥768 (md)  | 896px     | 16px      | 24px      | 24px |
| ≥1024 (lg) | 896px     | 24px      | 32px      | 32px |

- Home (posts) page: content `lg:py-16` (64px); in the comfortable layout the header and feed sit in `mx-auto w-full max-w-[--feed-width]` (700px). Header: `mb-4 md:mb-6 lg:mb-8 flex flex-col gap-4`; title "Home" `text-4xl` (36/40) bold `-tracking-[1px]`, **lg only**; filter row `flex items-center gap-0.5` of base Buttons "For me", "Created", "All" (selected `flat`, others `plain`) then a display dropdown pushed right (`mr-auto` on "All"). The Home page has no breadcrumb titlebar.
- Inbox list column (`InboxItems/InboxSplitView.tsx`): `w-full lg:max-w-[600px] lg:basis-[30%] lg:border-r lg:min-w-[350px]` (450px when macOS traffic lights are present); on narrow screens the list hides when an item is open.

## 5. Right rail: people list on Home

Source: `Home/HomeSidebar.tsx`, `SplitView/SplitViewDetail.tsx`.

`SplitViewDetail` with `fallback={<HomeSidebar/>}` and `fallbackWidth='var(--sidebar-width)'`:

```
<m.div class="bg-primary z-10 flex flex-col overflow-hidden max-lg:hidden">     width 240px; slides in from the right (translateX 100% → 0, margin-left -240px → 0), 200ms
  <m.div class="flex flex-1 flex-col overflow-hidden">                          opacity 0 → 1
    <m.div>  width 240 / opacity 1 ↔ width 0 / opacity 0, 150ms easeInOut  (localStorage `home-people-sidebar`, default open; no toggle found in source)
      <div class="bg-secondary dark:bg-primary relative hidden h-screen w-[--sidebar-width] flex-col overflow-hidden border-l lg:flex">
        search input
        members list
```

- When a post/doc/call is selected for split view, this column becomes 60% wide and shows the item instead.
- Hidden below lg and on mobile devices. Background `bg-secondary` light, `bg-primary` dark; 0.5px left border.
- Search: wrapper `text-quaternary relative`; `SearchIcon` 20 at `left-3` (12px), vertically centred; TextField `bg-transparent pl-10 pr-10 h-[--navbar-height] rounded-none border-0 focus:ring-0` → 56px tall, 40px left/right padding, 14px text, placeholder "Search people...". Clear button `CircleFilledCloseIcon` 20 at `right-3`, `text-quaternary hover:text-secondary`.
- List: `scrollbar-hide -mt-px flex flex-1 flex-col overflow-y-auto overscroll-contain border-t p-1.5 pt-0` (6px sides/bottom, 0 top); the top border is transparent while scrolled to the top.
- Sections in order: **"N online"** (header wrapper `flex px-1 pt-2`), **"Team"** (offline members, `px-1 pt-5`), **"Guests"** (`px-1 pt-5`). Headers use `SidebarCollapsibleButton` (24px, 12px label); while searching they become static 12px tertiary labels with `px-1 py-1`. Team/Guests headers have a hover-revealed "Invite" button: `rounded-md px-1.5 py-0.5 text-xs text-tertiary hover:text-primary hover:bg-quaternary`. Each list is `<ul class="px-1">`. Collapse state per org (`home-online-members-collapsed`, `home-offline-members-collapsed`, `home-guests-collapsed`). Online members sorted by name with the viewer first.
- Member row: `hover:bg-tertiary data-[state=open]:bg-tertiary group relative flex w-full items-center gap-3 rounded-md py-2 pl-2 pr-1.5 text-left` → 8px top/bottom, 8px left, 6px right, 12px avatar gap, 6px radius. `MemberAvatar size="base"` (32px, green online dot). Text column `flex flex-1 flex-col`: name 14px `leading-snug` (19.25px) `line-clamp-1`, inherits `text-primary`; status line `text-quaternary text-[13px] leading-snug flex gap-1` (emoji + message, tooltip with expiry). Viewer without a status sees "Update status" 13px `text-quaternary group-hover:text-secondary`. Row height: 48px with a name only (32px avatar + 16px padding); about 54.5px with a status line (2 × 19.25px text + 16px). Click opens the DM (or new chat); hover card on the left (`side left, align start`); right-click menu: Chat, View profile, Copy email, Copy link to profile, Copy member ID, Deactivate (admins).
- No results: centred `SearchIcon` 48 at `opacity-20`, "Nobody found" `text-quaternary` with `mt-1 mb-5`, flat "Invite people" button, then small plain "Copy invite link" (`text-blue-500`, `text-green-500` once copied).

## 6. Responsive summary

| element             | ≥1024 (lg)                | <1024                                                                                                     |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| org rail            | 48px column (multi-org)   | hidden; org switcher moves to mobile titlebar avatar menu, which also lists other orgs with unread counts |
| sidebar             | 240px fixed               | hidden; replaced by tab bar + `/home` screen                                                              |
| desktop titlebar    | 56px breadcrumb bar       | hidden; `NavigationBar` 56px + optional `lg:hidden` filter strip                                          |
| right rail          | 240px people list on Home | hidden                                                                                                    |
| `/home` route       | redirects to the inbox    | mobile home screen (§9)                                                                                   |
| floating "New post" | hidden                    | fixed button (§9)                                                                                         |

## 7. Mobile titlebar

Source: `NavigationBar/index.tsx` (`NavigationBar`).

```
<nav class="lg:hidden min-h-[--navbar-height] z-10 drag border-b transition-shadow flex-none bg-primary">
  <div class="mx-auto grid h-[--navbar-height] max-w-7xl grid-cols-5 items-center px-3">
    <div class="flex items-center justify-start gap-2 pr-3">{leading}</div>
    <div class="col-span-3 flex items-center justify-center text-center">{title}</div>
    <div class="flex items-center justify-end pl-3">{trailing}</div>
```

- 56px, 0.5px bottom border, `bg-primary`, 12px side padding, 5-column grid (1 / 3 / 1), max width 1280px.
- Title: `UIText size="text-base" weight="font-semibold"` (16/24, 600), e.g. Posts, Inbox, Chat, Docs, Calls, Channels, People, Drafts, Profile, Post, Version history; org name on `/home`. Channel title: `flex items-center gap-3` with emoji (16px), name `line-clamp-1`, "(Archived)" tertiary, `LockIcon` tertiary, favorite button. Chat thread: `MemberAvatar` sm (24px, `mr-1`) + title + status emoji 16px, gap 8px. Search page: the search field fills the center.
- Leading (40×40 box): the org avatar (`Avatar size="base"` 32px `rounded-md`, plus `ChevronSelectIcon` in `text-quaternary hover:text-tertiary` when in multiple orgs, hidden on mobile devices) cross-fades with a plain icon Button `ArrowLeftIcon` stroke 2 ("Back") on detail and secondary pages. Each layer animates opacity 0↔1 and translateX ∓16px (framer default spring). Unread-in-other-org dot: 10px `bg-blue-500 ring-4 ring-gray-50 dark:ring-gray-900`, `absolute -right-1 -top-1`.
- Trailing default: `flex items-center gap-2` with StatusPicker and a round plain Button holding `MemberAvatar` sm (24px). Page-specific trailing: display dropdown (Posts, Docs), `PlusIcon` 24 "New chat" (Chat), "New" (Channels), call + overflow buttons (channel, thread), "Share" with `PaperAirplaneIcon` (call), nothing on Calls/Search/Drafts.
- Desktop app on macOS: `pl-24 2xl:px-3`.
- Signed-out bar: `drag bg-primary sticky top-0 z-10 min-h-[--navbar-height] border-b`, inner `grid h-14 grid-cols-3 gap-4 px-3`, logo left, brand Button "Try Campsite" right.

## 8. Mobile bottom tab bar

Source: `NavigationBar/index.tsx` (`MobileTabBar`). Rendered below lg only.

```
<nav class="drag bg-primary z-10 grid items-center gap-1.5 border-t p-1.5 lg:hidden grid-cols-3 {pb-safe-offset-1.5 on mobile devices}">
  <a class="hover:bg-tertiary group flex flex-1 items-center justify-center rounded-md px-3 py-1.5 {active: bg-tertiary text-primary | text-tertiary bg-transparent}">
    <div class="relative">
      {unread: <div class="pointer-events-none absolute -right-[3px] -top-px z-10 h-2 w-2 flex-none rounded-full bg-blue-500"/>}
      <HomeIcon size=28/>
```

- Tabs: **Home** `HomeIcon` 28 → `/{org}/home` (dot when any channel is unread), **Inbox** `InboxIcon` 28 → inbox (dot when inbox count > 0), **Chat** `ChatBubbleIcon` 28 → `/{org}/chat` (dot when unread messages; hidden in the community org, grid becomes 2 columns). No labels.
- Bar: 6px padding (bottom becomes safe-area inset + 6px on phones), 6px gap, 0.5px top border, `bg-primary`. Tab: 12px × 6px padding, 6px radius, 28px icon → 40px tall; bar ≈ 52px plus border and safe area.
- Tab colours: inactive `text-tertiary`, active `bg-tertiary text-primary`, hover `bg-tertiary`. No transition class. Unread dot 8px `bg-blue-500`, offset 3px right / 1px up from the icon's corner.
- Tapping the active tab refetches and shows a pull indicator (`RefetchingPageIndicator`, height 0 → 64px).
- Hidden on: post detail, chat thread, new chat, doc detail, search, chat-channel routes, and when signed out.

## 9. Mobile home screen and floating button

Source: `apps/web/pages/[org]/home/index.tsx`, `MobileHome/*`, `FloatingButtons/NewPost.tsx`.

- Container `ScrollableContainer pb-20` (80px bottom). Order: onboarding/push prompts, search form, shortcut cards, unread channels, favorites, channels.
- Search: `form p-4 pb-0`; TextField `h-10 rounded-full border-transparent bg-tertiary dark:bg-tertiary focus:bg-elevated focus:border-blue-500 text-base pl-4 pr-3 py-3`, placeholder "Search" (40px pill, 16px text).
- Shortcut cards row: `scrollbar-hide flex flex-none gap-2 overflow-x-auto p-4`; each card `bg-elevated flex min-w-[100px] flex-1 flex-col gap-2 rounded-[10px] border p-3 pb-2.5` with a 24px squircle icon (Posts, Docs, Calls; Drafts uses `PostDraftIcon` 24 plus a `h-5 min-w-5 rounded-full px-1.5 bg-quaternary font-mono text-[12px] font-bold` count, colour class `text-system-secondary` which has no definition in the styles found) and a 15px 500 label.
- Section: `border-b py-3`. Section header: `flex items-center justify-between gap-3 px-4`; `ChevronRightIcon` 24 `text-quaternary transition-transform`, `rotate-90` when open; label 14px 500 `text-tertiary` with `py-2`.
- Row (`HomeNavigationItem`): `flex items-center gap-3 px-4 py-2.5`, 24×24 icon box, label `text-base` (16/24) `line-clamp-1`; unread `text-primary font-semibold`, else `text-tertiary font-normal`. Rows stacked `flex flex-col gap-0.5`. Channel icons: emoji 20px (17px in favorites) or `ProjectIcon` 24 `text-tertiary`; chat rows use `MemberAvatar` sm 24 or a 24×24 `rounded-md bg-quaternary` mono count. Row height 44px.
- Empty-state copy: `text-quaternary flex gap-3 p-4 pt-0.5` with a 24px spacer keyline.
- Floating "New post" (`lg:hidden`): `fixed bottom-16 right-4 z-20` (64px from bottom, 16px from right; `mb-safe-offset-2` on phones). Button `size="large" round variant="plain"` with `PlusIcon`: 40px tall pill, 15.01px 500, `bg-black text-white shadow-md hover:bg-gray-800`; dark `bg-elevated` with `inset 0 1px 0 rgb(255 255 255/0.04), inset 0 0 0 1px rgb(255 255 255/0.02), 0 1px 2px rgb(0 0 0/0.4), 0 2px 4px rgb(0 0 0/0.08), 0 0 0 0.5px rgb(0 0 0/0.24)`, hover `gray-800`.

## 10. Dark mode notes

All shell surfaces use semantic tokens, so dark mode follows the token table. Explicit dark overrides in the shell:

- Org rail: ring `white/90`, ring offset and unread-dot ring `gray-900`; new-org button `white/10` → `white/20`.
- Active nav link: `dark:bg-gray-750` (equals dark `bg-quaternary`).
- Right rail: `dark:bg-primary` instead of `bg-secondary`.
- Activity popover: `dark:border-primary-opaque` and `0 2px 16px rgba(0,0,0,1)`.
- Active call chip: `dark:bg-green-900/50`.
- Post breadcrumb squircle: `dark:text-gray-700`.
- Floating button: `dark:bg-elevated` with the custom shadow above.
- Mobile org-unread dot ring: `dark:ring-gray-900`.

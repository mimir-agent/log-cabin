# Campsite reference board

The target for Log Cabin's look. Log Cabin should look as good as Campsite, and in the same way: the
same layout, hierarchy, density, type and interaction feel, built on suede-css.

Campsite's
source is CC BY-NC 4.0; see `NOTICE` for the files adapted from it.

- `specs/`: measurements read from Campsite's source (commit cc14551): tokens, primitives, prose.

## What makes it look like Campsite

Read from the screenshots and the source. These are the things to match first.

1. **Neutral grey, no tint.** Surfaces are white and #FCFCFC; text is #171717, #525252, #737373.
   Colour comes from avatars, emoji and project icons, almost never from the chrome.
2. **The primary action is ink.** Black button with white text in light mode, white with black in dark.
   No brand colour on buttons.
3. **Hairlines.** Borders are 0.5px at black 10%, so dividers read as a change of tone, not a line.
   Raised things (buttons, popovers) carry layered soft shadows instead of borders.
4. **Inter at 14 and 15.** UI text is 14px; post titles and bodies 15px in lists. Hierarchy comes
   from weight (500 for names and titles) and from four greys, rarely from size.
5. **Dense rows.** Sidebar items are 30px tall with a 20px icon, 6px padding and 6px radius, labels
   at 500 in the tertiary grey; feed rows are a 40px avatar, a one-line 15px/500 title and a
   one-line 14px preview. A selected row is a grey fill, not a colour. Unread is a 10px blue dot.
6. **Columns.** 240px sidebar, a 56px titlebar, a centred 700px feed (756px for a post), and a
   240px right rail only where people live.
7. **Quiet motion.** 100ms colour and opacity transitions. Most things don't move at all.

Measurements: `specs/shell.md`, `specs/feed-inbox.md`, `specs/post-composer-overlays.md`.

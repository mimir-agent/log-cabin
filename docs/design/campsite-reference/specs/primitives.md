Source: Campsite (github.com/campsite/campsite) at commit cc14551, CC BY-NC 4.0.

# Primitives: tokens, Text, Button, Avatar, Badge, FacePile, EmptyState

All paths are relative to the Campsite repository root. Pixel values assume a 16px root.

## 1. Scale and global rules

Source: `packages/ui/tailwind.config.js`, `apps/web/styles/global.css`, `apps/web/pages/_app.tsx`, `apps/web/pages/_document.tsx`.

- Spacing: every 0.5 step is 2px (`p-1.5` = 6px, `h-7.5` = 30px, `h-4.5` = 18px, `h-5.5` = 22px, `pt-11.5` = 46px, `pl-21` = 84px). `px` = 1px, `sm` = 2px.
- `border` with no width is **0.5px**; `border-1` is 1px. Default border colour is `--border-primary`. Every `.border*` element gets `background-clip: padding-box`. `divide-*` children also use `--border-primary`.
- `transition` default duration is **100ms**, timing `cubic-bezier(0.4, 0, 0.2, 1)` (Tailwind default). `transition-opacity`, `transition-colors`, `transition-all` all pick up 100ms unless a `duration-*` class is present.
- Hover styles only apply under `@media (hover: hover)` (`future.hoverOnlyWhenSupported`).
- Dark mode is class based: `.dark` on an ancestor.
- Font: Inter via `next/font` exposed as `--font-inter`; `font-sans` = `var(--font-inter), ui-sans-serif, system-ui, ...`. `body` is `bg-primary text-primary fixed isolate select-none overflow-hidden antialiased !h-full !w-full`.
- Line height: the root `line-height` is Tailwind preflight's `1.5`. Arbitrary sizes like `text-[15px]` set only `font-size`, and `cn()` (tailwind-merge) removes the competing `text-sm`, so `text-[15px]` text gets line-height 1.5 = **22.5px** unless a `leading-*` class is present.
- `font-synthesis-weight: none` on `*`. Scrollbars: `scrollbar-width: thin; scrollbar-color: var(--scrollbar-color) transparent`.
- Layout variables on `:root`: `--sidebar-width: 240px`, `--feed-width: 700px`, `--chat-width: 60px`, `--navbar-height: 56px`, `--post-width: 756px`.
- Container queries plugin (`@container`, `@xl:` = container width ≥ 576px).
- Focus ring pattern (used by Button and `.focus-ring`): a pseudo-element at `-inset-[3px]`, `rounded-lg` (8px), `border` (0.5px) `border-blue-500` (#3B82F6), `ring-2 ring-blue-500/20` (box-shadow `0 0 0 2px rgb(59 130 246 / 0.2)`), opacity 0 → 1 on focus-visible, `transition-opacity` 100ms.

### 1.1 Gray scale (overrides Tailwind's gray)

| step | hex     |
| ---- | ------- |
| 50   | #FCFCFC |
| 100  | #F5F5F5 |
| 150  | #F0F0F0 |
| 200  | #E5E5E5 |
| 300  | #D4D4D4 |
| 400  | #A3A3A3 |
| 500  | #737373 |
| 600  | #525252 |
| 700  | #404040 |
| 750  | #313131 |
| 800  | #262626 |
| 850  | #1E1E1E |
| 900  | #171717 |
| 950  | #0D0D0D |

Brand: `brand-primary` #FF591E, `brand-secondary` #FB432C. Other colours are Tailwind v3.4 defaults; the ones used in these specs: blue-50 #EFF6FF, blue-100 #DBEAFE, blue-400 #60A5FA, blue-500 #3B82F6, blue-600 #2563EB, blue-700 #1D4ED8, blue-900 #1E3A8A, green-100 #DCFCE7, green-400 #4ADE80, green-500 #22C55E, green-600 #16A34A, green-900 #14532D, red-500 #EF4444, yellow-500 #EAB308, yellow-900 #713F12, yellow-100 #FEF9C3, amber-300 #FCD34D, amber-500 #F59E0B, amber-600 #D97706, amber-900 #78350F, orange-50 #FFF7ED, orange-300 #FDBA74, orange-800 #9A3412, orange-900 #7C2D12, violet-500 #8B5CF6, neutral-100 #F5F5F5, neutral-400 #A3A3A3, neutral-600 #525252, neutral-700 #404040, neutral-900 #171717.

### 1.2 Semantic tokens

`:root` / `.light` values, then `.dark` values. Tailwind class names map as: `text-primary` → `--text-primary`, `bg-primary` → `--bg-primary`, `border-primary` → `--border-primary`, and so on.

| token                       | light                                   | dark                                  |
| --------------------------- | --------------------------------------- | ------------------------------------- |
| `--text-primary`            | gray-900 #171717                        | gray-100 #F5F5F5                      |
| `--text-secondary`          | gray-600 #525252                        | gray-300 #D4D4D4                      |
| `--text-tertiary`           | gray-500 #737373                        | gray-400 #A3A3A3                      |
| `--text-quaternary`         | gray-400 #A3A3A3                        | gray-500 #737373                      |
| `--text-primary-action`     | white #FFFFFF                           | gray-900 #171717                      |
| `--text-light`              | gray-50 #FCFCFC                         | (unchanged)                           |
| `--text-dark`               | gray-900 #171717                        | (unchanged)                           |
| `--text-blue`               | blue-700 #1D4ED8                        | blue-400 #60A5FA                      |
| `--text-highlight`          | yellow-900 #713F12                      | yellow-100 #FEF9C3                    |
| `--bg-main`                 | gray-50 #FCFCFC                         | gray-950 #0D0D0D                      |
| `--bg-primary`              | white #FFFFFF                           | gray-950 #0D0D0D                      |
| `--bg-secondary`            | gray-50 #FCFCFC                         | gray-900 #171717                      |
| `--bg-tertiary`             | gray-100 #F5F5F5                        | gray-800 #262626                      |
| `--bg-quaternary`           | gray-150 #F0F0F0                        | gray-750 #313131                      |
| `--bg-elevated`             | white #FFFFFF                           | gray-850 #1E1E1E                      |
| `--bg-button`               | white #FFFFFF                           | gray-750 #313131                      |
| `--bg-primary-action`       | gray-900 #171717                        | white #FFFFFF                         |
| `--bg-primary-action-hover` | gray-750 #313131                        | gray-150 #F0F0F0                      |
| `--bg-secondary-action`     | gray-200 #E5E5E5                        | gray-700 #404040                      |
| `--bg-tertiary-action`      | white #FFFFFF                           | gray-800 #262626                      |
| `--bg-highlight`            | yellow-500 / 20% `rgb(234 179 8 / 0.2)` | (unchanged)                           |
| `--border-primary`          | black / 10% `rgb(0 0 0 / 0.1)`          | white / 12% `rgb(255 255 255 / 0.12)` |
| `--border-primary-opaque`   | gray-200 #E5E5E5                        | gray-750 #313131                      |
| `--border-secondary`        | black / 7%                              | white / 8%                            |
| `--border-secondary-opaque` | gray-150 #F0F0F0                        | gray-800 #262626                      |
| `--border-tertiary`         | black / 4%                              | white / 6%                            |
| `--scrollbar-color`         | gray-400 / 80%                          | gray-500 #737373                      |
| `--base-shadow-color`       | `rgb(0 0 0 / 0.05)`                     | `rgb(0 0 0 / 0.16)`                   |
| `--tag-bg`                  | black / 8%                              | neutral-600 #525252                   |
| `--tag-border`              | neutral-100 #F5F5F5                     | neutral-700 #404040                   |

Inside `.bg-main` or `.bg-elevated`, `--base-shadow-color` becomes `rgb(0 0 0 / 0.045)` (light) / `rgb(0 0 0 / 0.05)` (dark); a `.bg-primary` nested inside those resets it to 0.05 / 0.14.

### 1.3 Shadows

| class                          | value                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shadow` (DEFAULT, overridden) | `0 3px 6px -3px C, 0 2px 4px -2px C, 0 1px 2px -1px C, 0 1px 1px -1px C, 0 1px 0 -1px C` where C = `var(--base-shadow-color)`                                             |
| `shadow-sm` (Tailwind default) | `0 1px 2px 0 rgb(0 0 0 / 0.05)`                                                                                                                                           |
| `shadow-md` (Tailwind default) | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`                                                                                                        |
| `shadow-button`                | `var(--button-shadow)`                                                                                                                                                    |
| `shadow-button-base`           | `var(--button-base-shadow)`                                                                                                                                               |
| `shadow-button-primary`        | `var(--button-primary-shadow)`                                                                                                                                            |
| `shadow-popover`               | `var(--popover-shadow)`                                                                                                                                                   |
| `shadow-dropdown-item`         | `var(--dropdown-item-shadow)`                                                                                                                                             |
| `shadow-select-item`           | `inset 0 1px 0 rgb(255 255 255 / 0.02), inset 0 0 0 1px rgb(255 255 255 / 0.02), 0 1px 2px rgb(0 0 0 / 0.12), 0 2px 4px rgb(0 0 0 / 0.08), 0 0 0 0.5px rgb(0 0 0 / 0.24)` |
| `shadow-inset-image-border`    | `inset 0 0 0 1px var(--border-primary)`                                                                                                                                   |

Shadow variables, light:

```css
--button-shadow:
	inset 0px 1px 0px 0px rgb(255 255 255 / 1), 0px 0px 0px 1px rgb(0 0 0 / 0.06),
	0px 1px 0px 0px rgb(0 0 0 / 0.08), 0px 2px 2px 0px rgb(0 0 0 / 0.04),
	0px 3px 3px 0px rgb(0 0 0 / 0.02), 0px 4px 4px 0px rgb(0 0 0 / 0.01);
--button-base-shadow:
	0px 1px 1px -1px rgb(0 0 0 / 0.08), 0px 2px 2px -1px rgb(0 0 0 / 0.08),
	0px 0px 0px 1px rgb(0 0 0 / 0.06), inset 0px 1px 0px #fff, inset 0px 1px 2px 1px #fff,
	inset 0px 1px 2px rgb(0 0 0 / 0.06);
--popover-shadow:
	0px 0px 3.6px rgba(0, 0, 0, 0.04), 0px 0px 10px rgba(0, 0, 0, 0.04),
	0px 0px 24.1px rgba(0, 0, 0, 0.05), 0px 0px 80px rgba(0, 0, 0, 0.08);
--dropdown-item-shadow:
	inset 0px 1px 0px rgb(255 255 255 / 0.02), inset 0px 0px 0px 1px rgb(255 255 255 / 0.02),
	0px 1px 2px rgb(0 0 0 / 0.12), 0px 2px 4px rgb(0 0 0 / 0.08), 0px 0px 0px 0.5px rgb(0 0 0 / 0.24);
--button-drop-shadow: rgb(0 0 0 / 0);
```

`--button-primary-shadow` is **not defined in light mode**; the primary button only applies it under `dark:`.

Dark:

```css
--button-shadow:
	0px -1px 0px 0px rgb(255 255 255 / 0.04), 0px 0px 0px 1px rgb(255 255 255 / 0.12),
	0px 0px 1px 0px rgb(0 0 0 / 0.04), 0px 2px 2px 0px rgb(0 0 0 / 0.04),
	0px 4px 2px 0px rgb(0 0 0 / 0.04), 0px 6px 3px 0px rgb(0 0 0 / 0.04);
--button-base-shadow:
	0px 0px 0px 0.5px rgb(0 0 0 / 0.4), 0px 1px 1px -1px rgb(0 0 0 / 0.12),
	0px 2px 2px -1px rgb(0 0 0 / 0.12), inset 0px 0.5px 0px rgb(255 255 255 / 0.06),
	inset 0px 0px 1px 0px rgb(255 255 255 / 0.16), inset 0px -6px 12px -4px rgb(0 0 0 / 0.16);
--button-primary-shadow:
	0px 1px 1px -1px rgb(0 0 0 / 0.08), 0px 2px 2px -1px rgb(0 0 0 / 0.08),
	0px 0px 0px 1px rgb(0 0 0 / 0.06), inset 0px 1px 0px #fff, inset 0px 0px 2px 1px #fff,
	inset 0px 1px 2px rgb(0 0 0 / 0.06), inset 0px -4px 8px -4px rgb(0 0 0 / 0.06);
--popover-shadow:
	0px 0px 4px rgba(0, 0, 0, 0.08), 0px 0px 10px rgba(0, 0, 0, 0.12),
	0px 0px 24px rgba(0, 0, 0, 0.16), 0px 0px 80px rgba(0, 0, 0, 0.2);
--button-drop-shadow: rgb(0 0 0 / 0.4);
--danger-drop-shadow: rgb(127 29 29 / 0.8);
```

### 1.4 Radii and type scale used

`rounded` 4px, `rounded-md` 6px, `rounded-lg` 8px, `rounded-xl` 12px, `rounded-2xl` 16px, `rounded-full` 9999px. Arbitrary radii seen: `rounded-[5px]` (org rail), `rounded-[10px]` (mobile home cards).

`text-xs` 12/16, `text-sm` 14/20, `text-base` 16/24, `text-lg` 18/28, `text-xl` 20/28, `text-2xl` 24/32, `text-3xl` 30/36, `text-4xl` 36/40. `leading-none` 1, `leading-tight` 1.25, `leading-snug` 1.375, `leading-normal` 1.5. Prose (`@tailwindcss/typography`) body size is overridden to 15px (`0.9375rem`).

### 1.5 Icons

Source: `packages/ui/src/Icons/index.tsx`.

Every icon is an inline SVG with `viewBox="0 0 24 24"`, default `size = 20` (width and height 20px), stroke icons use `stroke="currentColor"`, `strokeWidth="1.5"`, round caps and joins. Filled variants (`*FilledIcon`) use `fill="currentColor"`. Colour always comes from the text colour of the parent.

## 2. Text

Source: `packages/ui/src/Text/Text.tsx`.

`UIText` renders `element` (default `<p>`) with classes `cn(weight, size, colourFlag, className)`.

- Defaults: `weight = 'font-normal'` (400), `size = 'text-sm'` (14px/20px), no colour (inherits).
- Colour flags: `primary` → `text-primary`, `secondary` → `text-secondary`, `tertiary` → `text-tertiary`, `quaternary` → `text-quaternary`, `inherit` → `text-inherit` (wins over the others). `selectable` adds `select-text` (the body is `select-none`).

Presets:

| component    | element | weight | size (base → md ≥768px)                                                                                               | colour                             |
| ------------ | ------- | ------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `LargeTitle` | h1      | 700    | `text-2xl md:text-4xl` 24/32 → 36/40                                                                                  | inherit                            |
| `Title1`     | h2      | 500    | `text-xl md:text-2xl` 20/28 → 24/32                                                                                   | inherit                            |
| `Title2`     | h2      | 500    | `text-lg md:text-xl` 18/28 → 20/28                                                                                    | inherit                            |
| `Title3`     | h2      | 500    | `text-md md:text-lg`; `text-md` is not a Tailwind class, so below md the size is inherited (16px at root), then 18/28 | inherit                            |
| `Headline`   | p       | 500    | `text-base` 16/24                                                                                                     | inherit                            |
| `Body`       | p       | 400    | `text-base` 16/24                                                                                                     | `text-secondary` #525252 / #D4D4D4 |
| `Caption`    | p       | 500    | `text-xs` 12/16                                                                                                       | `text-secondary`                   |

## 3. Button

Source: `packages/ui/src/Button/Button.tsx`.

### 3.1 DOM

```
<button class="outline-none {base} {variant} {size} {padding}">      (or <a> via Link when href is set)
  {iconOnly}                                                         (icon node rendered directly)
  <span class="relative z-[2] flex items-center overflow-hidden gap-{1|1.5|2}">
    <span class="inline-flex flex-none justify-center">{leftSlot}</span>
    <span class="truncate leading-normal">{children}</span>
    <span class="inline-flex flex-none justify-center">{rightSlot}</span>
  </span>
</button>
```

`align='left'` or `isSelect` adds `grow` to the inner span and `flex-1 grow text-left` to the label. The `<a>` version adds `relative outline-none transition` (all colour/opacity/shadow/transform properties, 100ms) and, when disabled or loading, `pointer-events-none opacity-50`. The `<button>` version has **no** `transition` class, so background and colour changes are instant; only the `::before` hover sheen and `::after` focus ring fade.

### 3.2 Base classes (every variant)

```
relative font-medium shrink-0 group inline-flex items-center justify-center select-none transform-gpu
initial:border-none disabled:opacity-50
focus:!outline-none focus:!ring-0 active:!outline-none active:!ring-0
after:pointer-events-none after:absolute after:-inset-[3px] after:rounded-lg after:border after:border-blue-500
  after:opacity-0 after:ring-2 after:ring-blue-500/20 after:transition-opacity
  focus-visible:after:opacity-100 active:after:opacity-0
before:pointer-events-none before:bg-gradient-to-b before:transition-opacity before:from-white/[0.12]
  before:absolute before:inset-0 before:z-[1] before:rounded before:opacity-0
```

- Weight 500.
- Hover sheen: `::before` covers the button with `linear-gradient(to bottom, rgb(255 255 255 / 0.12), transparent)`, radius 4px (`before:rounded`, even on 6px/8px buttons), opacity 0 by default, faded by the variant's `hover:before:opacity-*` over 100ms.
- Focus ring: `::after` at 3px outside, radius 8px, 0.5px #3B82F6 border plus `0 0 0 2px rgb(59 130 246 / 0.2)`, visible only on keyboard focus and hidden while pressed.
- Disabled: whole button `opacity: 0.5`. `loading`: `opacity-50 cursor-wait`.
- `round`: `rounded-full`, and `::before`/`::after` also `rounded-full`.
- `fullWidth`: `w-full flex-1`.
- Press animation constant `ANIMATIONS.whileTap = { scale: 0.9 }` with spring stiffness 600, damping 30 is exported for motion-wrapped buttons; the plain Button does not apply it.

### 3.3 Sizes

| size             | height       | font             | radius           | text padding                                                    | icon-only box     | gap           | leftSlot pad-left | rightSlot pad-right |
| ---------------- | ------------ | ---------------- | ---------------- | --------------------------------------------------------------- | ----------------- | ------------- | ----------------- | ------------------- |
| `sm`             | `h-6.5` 26px | `text-[13.01px]` | `rounded` 4px    | `px-2` 8px                                                      | `w-6.5 p-0` 26×26 | `gap-1` 4px   | `!pl-1` 4px       | `!pr-1` 4px         |
| `base` (default) | `h-7.5` 30px | `text-[14.01px]` | `rounded-md` 6px | `px-2.5` 10px                                                   | `w-7.5 p-0` 30×30 | `gap-1.5` 6px | `!pl-2` 8px       | `!pr-2` 8px         |
| `large`          | `h-10` 40px  | `text-[15.01px]` | `rounded-lg` 8px | `px-4.5` 18px (overrides the variant's `px-10`) and `py-3` 12px | `w-10 p-0` 40×40  | `gap-2` 8px   | `!pl-4` 16px      | `!pr-4` 16px        |

The `.01px` font sizes exist to stop Chrome from rendering text 1px off centre. The label has `leading-normal` (1.5). Icons inside are the default 20px unless sized explicitly.

### 3.4 Variants

| variant          | background                                                                                       | text                                                   | shadow                                                                                                                                                                                                                                                                                                                                                                                                                               | hover / open                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base` (default) | `bg-white` #FFFFFF / `dark:bg-gray-750` #313131                                                  | `text-gray-900` #171717 / `dark:text-gray-50` #FCFCFC  | `shadow-button-base` (light and dark values above)                                                                                                                                                                                                                                                                                                                                                                                   | `hover:before:opacity-100`, `dark:hover:before:opacity-50`                                                                                                                          |
| `primary`        | `bg-gray-800` #262626 / `dark:bg-gray-100` #F5F5F5                                               | `text-gray-50` #FCFCFC / `dark:text-gray-900` #171717  | none in light; `dark:shadow-button-primary`                                                                                                                                                                                                                                                                                                                                                                                          | `hover:before:opacity-50`                                                                                                                                                           |
| `flat`           | `bg-black/[0.06]` / `dark:bg-white/[0.08]`                                                       | inherited                                              | none                                                                                                                                                                                                                                                                                                                                                                                                                                 | `hover:bg-black/[0.08]` / `dark:hover:bg-white/10`                                                                                                                                  |
| `plain`          | transparent                                                                                      | inherited                                              | none                                                                                                                                                                                                                                                                                                                                                                                                                                 | `hover:bg-black/[0.06]` / `dark:hover:bg-white/[0.08]`; `data-[state=open]:bg-gray-150` #F0F0F0 / `dark:data-[state=open]:bg-gray-750` #313131; disabled keeps transparent on hover |
| `destructive`    | `bg-red-500` #EF4444                                                                             | `text-gray-50`                                         | none                                                                                                                                                                                                                                                                                                                                                                                                                                 | `hover:before:opacity-100`                                                                                                                                                          |
| `important`      | `bg-blue-500` #3B82F6 / `dark:bg-blue-600` #2563EB                                               | white / `dark:text-gray-50`                            | dark only: `0 0 4px rgba(30,58,138,0.6), 0 0 0 0.5px rgb(0 0 0 / 0.94), inset 0 0.5px 0 rgba(255,255,255,0.12), inset 0 0 1px 0 rgba(255,255,255,0.4), inset 0 -4px 8px -4px rgba(30,58,138,0.4)`                                                                                                                                                                                                                                    | `hover:before:opacity-100`                                                                                                                                                          |
| `brand`          | `bg-gradient-to-tl from-brand-secondary to-brand-primary` (#FB432C → #FF591E), `saturate-[105%]` | white                                                  | `inset 0 0.5px 0 rgb(255 255 255 / 0.32)`                                                                                                                                                                                                                                                                                                                                                                                            | `hover:before:opacity-100`                                                                                                                                                          |
| `onboarding`     | `bg-green-600` #16A34A                                                                           | `text-gray-50`                                         | light: `0 0 4px rgba(20,83,45,0.1), 0 0 0 0.5px rgba(20,83,45,0.6), inset 0 0.5px 0 rgba(255,255,255,0.08), inset 0 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 1px rgba(20,83,45,0.24), inset 0 -4px 8px -4px rgba(20,83,45,0.08)`; dark: `0 0 4px rgba(20,83,45,0.4), 0 0 0 0.5px rgba(20,83,45,0.94), inset 0 0.5px 0 rgba(255,255,255,0.24), inset 0 0 1px 0 rgba(255,255,255,0.4), inset 0 -4px 8px -4px rgba(20,83,45,0.4)` | `hover:before:opacity-100`                                                                                                                                                          |
| `text`           | none                                                                                             | `text-blue-600` #2563EB / `dark:text-blue-500` #3B82F6 | none                                                                                                                                                                                                                                                                                                                                                                                                                                 | `!h-auto !p-0` (link-like)                                                                                                                                                          |
| `none`           | no variant classes                                                                               |                                                        |                                                                                                                                                                                                                                                                                                                                                                                                                                      |                                                                                                                                                                                     |

Plain and flat buttons have no text colour of their own; callers often add `text-tertiary hover:text-primary` (#737373 → #171717; dark #A3A3A3 → #F5F5F5) for icon buttons in toolbars.

A tooltip wraps every button; `tooltip` and `tooltipShortcut` show a label and key hint.

## 4. Avatar

Source: `packages/ui/src/Avatar/Avatar.tsx`, `AvatarOnlineClip.tsx`, `AvatarFacepileClip.tsx`, `AvatarNotificationReasonClip.tsx`, `AvatarNotificationReasonSquareClip.tsx`; `apps/web/components/MemberAvatar/index.tsx`.

### 4.1 DOM

```
<span class="relative flex shrink-0 select-none" style="width:S; min-width:S; height:S">
  <span class="relative flex shrink-0 select-none items-center justify-center font-semibold {rounded}
               {image ? 'border border-black/10 dark:border-white/5' : accentColour} {textSize}"
        style="clip-path:url(#clipId)">
    <img class="absolute inset-0 aspect-square object-cover {rounded}">        (when an image URL exists)
    <span class="text-dark flex text-opacity-60"><p class="mix-blend-color-burn saturate-150 font-medium">A</p></span>  (fallback initial)
    <svg> <clipPath id=…/> </svg>                                              (clip definition when clipped)
  </span>
  <div class="absolute rounded-full bg-green-500 {pos} {dot}"/>               (online dot)
  <MoonFilledIcon class="absolute text-violet-500 {pos}"/>                    (notifications paused)
</span>
```

### 4.2 Sizes

| size             | px  | initial font | online dot size | online dot position     | DND moon size | DND position              |
| ---------------- | --- | ------------ | --------------- | ----------------------- | ------------- | ------------------------- |
| `xs`             | 20  | 10px         | 5×5             | bottom 1px, right 1px   | 12            | bottom −3px, right −3.5px |
| `sm`             | 24  | 12px         | 7×7             | bottom 1px, right 1px   | 15            | bottom −4px, right −4.5px |
| `base` (default) | 32  | 14px         | 8×8             | bottom 1px, right 1px   | 18            | bottom −5px, right −5.5px |
| `lg`             | 40  | 20px         | 10×10           | bottom 2px, right 2px   | 22            | bottom −5px, right −5px   |
| `xl`             | 64  | 32px         | 12×12           | bottom 4px, right 4px   | 28            | bottom −5px, right −5px   |
| `xxl`            | 112 | 44px         | 14×14           | bottom 10px, right 10px | 38            | bottom −3px, right −5px   |

- Shape: `rounded` prop, default `rounded-full`. `MemberAvatar` uses `rounded` (4px) for integration/bot users, otherwise `rounded-full`. Organization avatars use `rounded` (4px) in the sidebar switcher, `rounded-md` in the mobile bar and `rounded-[5px]` in the org rail.
- Image avatars get a 0.5px `border-black/10` (`rgb(0 0 0 / 0.1)`), dark `border-white/5`.
- Fallback colours, picked by `name.charCodeAt(0) % 8`: `bg-blue-300 text-blue-800`, `bg-green-300 text-green-800`, `bg-yellow-300 text-yellow-800`, `bg-red-300 text-red-800`, `bg-purple-300 text-purple-800`, `bg-pink-300 text-pink-800`, `bg-indigo-300 text-indigo-800`, `bg-teal-300 text-teal-800` (hex: blue #93C5FD/#1E40AF, green #86EFAC/#166534, yellow #FDE047/#854D0E, red #FCA5A5/#991B1B, purple #D8B4FE/#6B21A8, pink #F9A8D4/#9D174D, indigo #A5B4FC/#3730A3, teal #5EEAD4/#115E59). The letter itself is `text-dark` (#171717) at 60% opacity with `mix-blend-mode: color-burn` and `saturate(1.5)`, weight 500, uppercase first character.
- `fade`: `opacity-50 saturate-[10%]`. `deactivated`: `saturate-[10%]`.
- Online dot: `bg-green-500` #22C55E circle. When online or paused, the avatar body is clipped with a notch cut around the dot (clip path `onlineAvatarMask*`), so the dot sits in a transparent gap with no ring. Example for `base`: the notch is a circle of radius 7 centred at (27,27) within the 32px avatar.
- Notifications paused: violet-500 #8B5CF6 moon icon replaces the dot, same notch.

### 4.3 Clip shapes

- `facepile`: the right edge is cut by a concave arc so the next avatar can overlap (for `base`, the visible shape is 28px wide out of 32px: the avatar circle minus a circle of the same 16px radius centred 24px to the right of the avatar's centre). Used for every avatar in a FacePile except the last when there is no overflow chip.
- `notificationReason`: bottom-right is cut by a circle so a reason badge can sit there. For `sm` (24px) the cut is a circle of radius 10 centred at (21,21); for `base` (32px) radius 12 centred at (26,26).
- `notificationReasonSquare`: the same cut on a rounded square (4px corners at `sm`, 6px at `base`), used for integration actors.

## 5. Badge

Source: `packages/ui/src/Badge/index.tsx`.

```
<span class="min-h-4.5 flex flex-none items-center justify-center rounded px-1.5 pb-px pt-0.5 uppercase {bg} {text} [gap-0.5 pl-1 when icon]">
  {icon}
  <p class="font-semibold text-[10px] flex-none leading-none">{label}</p>
</span>
```

- Min height 18px, radius 4px, padding top 2px / bottom 1px / x 6px (left 4px with an icon, icon gap 2px), 10px semibold uppercase, line-height 1.
- Optional tooltip wrapper.

| color     | background light               | background dark       | text light                | text dark                 |
| --------- | ------------------------------ | --------------------- | ------------------------- | ------------------------- |
| `default` | `bg-black/5` rgb(0 0 0 / 0.05) | `bg-white/10`         | `text-tertiary` #737373   | `text-tertiary` #A3A3A3   |
| `blue`    | `bg-blue-50` #EFF6FF           | `bg-blue-500/20`      | `text-blue-500` #3B82F6   | `text-blue-400` #60A5FA   |
| `green`   | `bg-green-500` #22C55E         | `bg-green-900/50`     | white                     | `text-green-400` #4ADE80  |
| `brand`   | `bg-brand-primary` #FF591E     | `bg-brand-primary/20` | white                     | `text-orange-300` #FDBA74 |
| `orange`  | `bg-orange-50` #FFF7ED         | `bg-orange-900/20`    | `text-orange-800` #9A3412 | `text-orange-300` #FDBA74 |
| `amber`   | `bg-amber-500` #F59E0B         | `bg-amber-900/40`     | white                     | `text-amber-300` #FCD34D  |

Common uses: `New` (blue) for unread posts, `Resolved` (green), `Needs feedback` (brand when requested of the viewer, default otherwise), `v2` version badge (default, `font-mono rounded`), follow-up tag (orange, `font-mono`, `ClockIcon` 14px stroke 2, text like `3:00 PM`, `Tue`, or `Tue, Nov 4th`), `App` for integrations.

## 6. FacePile

Source: `apps/web/components/FacePile/index.tsx`.

```
<span class="flex {containerLeftPadding}">
  <span class="flex {overlapMargin}"><Avatar size clip="facepile" tooltip/></span> …
  <div class="flex flex-none items-center justify-center rounded-full bg-black text-white dark:bg-neutral-700 {minW} {padX} {overlapMargin}">
    <span class="-ml-[5%] font-mono font-semibold tracking-tighter {fontSize}"><span class="inline-block -translate-y-[0.5px]">+</span>N</span>
  </div>
</span>
```

- Default `limit = 3`, default size `base`. If the total is exactly limit + 1, the extra avatar is shown instead of a `+1` chip.
- Every avatar except the last visible one (or all of them when there is an overflow chip) uses the `facepile` clip.

| size | overlap (negative margin-left per item) | container padding-left | overflow min-width | overflow padding-x | overflow font |
| ---- | --------------------------------------- | ---------------------- | ------------------ | ------------------ | ------------- |
| xs   | −1px                                    | 1px                    | 20px               | 4px                | 10px          |
| sm   | −2px                                    | 2px                    | 24px               | 6px                | 11px          |
| base | −4px                                    | 4px                    | 32px               | 8px                | 13px          |
| lg   | −9px                                    | 9px                    | 40px               | 10px               | 15px          |
| xl   | −10px                                   | 10px                   | 64px               | 12px               | 23px          |
| xxl  | −14px                                   | 14px                   | 112px              | 14px               | 30px          |

Overflow chip: black (#000) with white text in light, neutral-700 #404040 in dark, monospace semibold, `letter-spacing: -0.05em`. Its height comes from the content (no explicit height). `showIsPresent` fades absent users (`opacity-50 saturate-[10%]`). Tooltips appear with 0ms delay.

## 7. EmptyState

Source: `apps/web/components/EmptyState/index.tsx`; index variant in `apps/web/components/IndexPages/components.tsx`.

`EmptyState`:

```
<div class="flex flex-1 items-center justify-center">
  <div class="flex flex-col items-center justify-center text-center">
    <p class="text-xl font-semibold mb-4">{emoji}</p>                       20px/28px
    <div class="text-primary mb-4 p-2 text-opacity-80">{icon}</div>          8px padding, 16px below
    <div class="flex flex-col gap-2">
      <p class="text-sm font-medium text-primary">{title}</p>               14/20, 500, #171717 / #F5F5F5
      <p class="text-sm text-tertiary">{message}</p>                         14/20, 400, #737373 / #A3A3A3
    </div>
    {children}
  </div>
</div>
```

`IndexPageEmptyState` (used by feeds and the inbox): `mx-auto flex w-full max-w-lg flex-1 items-center justify-center` (max 512px) with an inner `flex flex-col items-center space-y-4 text-center` (16px between children). Posts version: `PostIcon` 32px, then a `flex flex-col gap-1` with "Write a post" (`text-base` 16/24, semibold 600) and "Share an update, ask a question, or get feedback on an idea." (`text-base`, tertiary), then a primary "New post" button.

## 8. Other shared pieces

- `LoadingSpinner` / `LazyLoadingSpinner`: centred in `IndexPageLoading` (`flex flex-1 flex-col items-center justify-center`).
- `RefetchingPageIndicator` (`apps/web/components/NavigationBar/RefetchingPageIndicator.tsx`): a `pointer-events-none flex flex-none items-center justify-center` block that animates height 0 → 64px and opacity 0 → 1 while a list refetches, with a spinner inside.
- `TextField` input (`packages/ui/src/TextField/TextField.tsx`): `text-sm h-8 rounded-md border border-primary bg-primary dark:bg-quaternary pl-2 text-primary placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-600/40`; 32px tall, 0.5px border, 6px radius, `font-feature-settings: 'calt' 0`.
- Popovers: `rounded-lg` (8px) `bg-primary shadow-popover`, `border border-transparent dark:border-primary-opaque`, open animation `scale-fade` (opacity 0 → 1, scale 0.95 → 1, 150ms ease-in-out).
- Dialogs open with `slide-up-scale-fade` (opacity 0, scale 0.98, translateY 20px → none; 200ms `cubic-bezier(0.16, 1, 0.3, 1)`); backdrop fades 150ms.

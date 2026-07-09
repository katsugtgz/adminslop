# EduAdmin Pro Premium Design System

## 1. Atmosphere & Identity

EduAdmin Pro Premium is a quiet Indonesian school operations desk: warm,
editorial, trustworthy, and dense only where repeated work needs it. The
signature is paper-like warmth with batik-earth depth: cream surfaces, deep ink
text, terracotta action, subtle grain, and measured motion.

## 2. Color

### Palette

Token values live in `src/app/globals.css`: `:root` defines light mode, `.dark`
defines dark mode, and `@theme inline` maps them into Tailwind v4 utilities.
This table is the usage contract, not the raw color source of truth.

| Role | Token | Usage |
| --- | --- | --- |
| Surface/page | `--background` | App background |
| Text/primary | `--foreground` | Body, headings |
| Surface/card | `--card` | Cards, panels |
| Text/card | `--card-foreground` | Card text |
| Surface/popover | `--popover` | Menus, tooltips |
| Brand/primary | `--primary` | Primary buttons, logo mark |
| Brand/primary text | `--primary-foreground` | Text on primary |
| Surface/secondary | `--secondary` | Quiet icon wells, secondary fills |
| Surface/muted | `--muted` | Empty states, soft panels |
| Text/muted | `--muted-foreground` | Captions, helper text |
| Accent/action | `--accent` | CTAs, focus, active nav |
| Accent/action text | `--accent-foreground` | Text on accent |
| Status/error | `--destructive` | Dangerous states |
| Status/success | `--success` | Completion, connected status |
| Status/warning | `--warning` | Caution |
| Border/default | `--border` | Dividers, cards |
| Input/border | `--input` | Inputs, outline buttons |
| Focus/ring | `--ring` | Focus indicators |

### Rules

- Terracotta `--accent` is the only primary action accent.
- Charts may use `--chart-1` through `--chart-5`; product chrome should not.
- Avoid corporate blue and purple gradient defaults.
- Raw color values belong in `globals.css` tokens or print-only CSS only.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| Display | `2.75rem` to `6rem` | 700 | 0.95-1.05 | -0.025em | Landing hero |
| H1 | `2.25rem` to `3rem` | 700 | 1.05-1.15 | -0.02em | Page headers |
| H2 | `1.875rem` to `2.25rem` | 700 | 1.1-1.2 | -0.02em | Section headers |
| H3 | `1.125rem` to `1.5rem` | 600-700 | 1.2-1.35 | -0.01em | Card titles |
| Body/lg | `1.125rem` to `1.5rem` | 400-500 | 1.55 | 0 | Hero and lead copy |
| Body | `1rem` | 400-500 | 1.5-1.6 | 0 | Default text |
| Body/sm | `0.875rem` | 400-500 | 1.45 | 0 | Secondary info |
| Caption | `0.75rem` | 500-600 | 1.35 | 0-0.02em | Metadata |
| Eyebrow | `0.6875rem` | 600 | 1.3 | `0.16em` | Section labels |

### Font Stack

- Sans: Plus Jakarta Sans via `--font-sans`.
- Display: Bricolage Grotesque via `--font-display`.
- Mono: Geist Mono via `--font-mono`.

### Rules

- Headings use `.font-display`; operational body copy uses the sans stack.
- Data-heavy numbers use tabular figures from the global base.
- UI language is Bahasa Indonesia and domain terms follow `CONTEXT.md`.

## 4. Spacing & Layout

### Base Unit

All spacing maps to Tailwind's 4px scale.

| Token | Value | Usage |
| --- | --- | --- |
| `1` | 4px | Tight icon offsets |
| `2` | 8px | Icon-label gap |
| `3` | 12px | Compact groups |
| `4` | 16px | Default gaps |
| `5` | 20px | Dense card padding |
| `6` | 24px | Default card padding |
| `8` | 32px | Section groups |
| `10` | 40px | Dashboard groups |
| `12` | 48px | Major page breaks |
| `16` | 64px | Landing sections |
| `20` | 80px | Hero spacing |
| `24` | 96px | Large editorial breaks |

### Grid

- Max content width: `max-w-6xl`.
- App shell margins: `px-4 sm:px-6`.
- Breakpoints follow Tailwind defaults.
- Dashboard surfaces favor dense responsive grids over long ungrouped lists.

### Rules

- Use `min-h-dvh`, not `h-screen`.
- Fixed-format UI controls keep stable heights and tap targets.
- Dense admin pages prioritize scanning over decorative symmetry.

## 5. Components

### Button

- **Structure**: `Button` wrapper around native `button` or Radix `Slot`.
- **Variants**: `default`, `outline`, `secondary`, `ghost`, `link`,
  `destructive`.
- **Spacing**: default height `h-11`; large height `h-12`; icon `h-11 w-11`.
- **States**: hover shifts tone, active presses with transform, focus uses
  `--ring`, disabled reduces opacity and removes pointer events, `aria-busy`
  blocks interaction.
- **Accessibility**: labels required for icon-only controls; tap target minimum
  44px for non-link variants.
- **Motion**: 200ms color/shadow/transform transitions.

### Card Surface

- **Structure**: rounded container with semantic token background and text.
- **Variants**: static panel, interactive module, dashed empty state.
- **Spacing**: `p-5` for operational cards, `p-6 md:p-8` for page headers.
- **States**: interactive cards use `hover:border-accent/40`,
  `hover:shadow-warm-lg`, and `.t-lift`; these symbols are defined in
  `src/app/globals.css`. Empty states use dashed border and muted fill.
- **Accessibility**: whole-card links need a clear accessible name and visible
  focus ring.
- **Motion**: transform-only lift; no hover motion on non-interactive cards.

### Page Header

- **Structure**: `PageReveal` section/header, optional icon well, headline,
  support copy, and contextual action.
- **Variants**: landing hero, dashboard module header, centered restriction
  state.
- **Spacing**: `p-6 md:p-8` for dashboard, `py-14 sm:py-20 md:py-28` for hero.
- **States**: non-interactive except contained actions.
- **Accessibility**: one `h1` per page; decorative numerals and glows are
  `aria-hidden`.
- **Motion**: reveal on mount through `.t-rise`.

### Module Navigation

- **Structure**: grouped sections containing `KartuModul` links.
- **Variants**: standard row, compact row, featured operational item when a
  workflow needs emphasis.
- **Spacing**: section `gap-4`, group `gap-3`, card `p-5`.
- **States**: hover/focus highlight the row and action target.
- **Accessibility**: preserve explicit labels such as `Buka Cetak`.
- **Motion**: `.t-lift` only on interactive module cards.

### Empty / Restricted State

- **Structure**: icon, eyebrow, title, explanatory copy, one clear action.
- **Variants**: denied access, choose tenant, no data.
- **Spacing**: centered narrow panels use `max-w-md p-8 md:p-10`.
- **States**: role and auth state decide action copy.
- **Accessibility**: use `role="alert"` where access or error state needs it.
- **Motion**: normal page reveal only.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Micro | 150-200ms | ease-out | Button press, icon shift |
| Standard | 200-300ms | cubic-bezier(0.22, 1, 0.36, 1) | Card hover, nav underline |
| Emphasis | 400-600ms | cubic-bezier(0.22, 1, 0.36, 1) | Page and text reveal |
| Loading | 1000-2000ms | linear or ease-in-out | Shimmer, pulse |

### Rules

- Animate only `transform`, `opacity`, and `filter`.
- Motion must explain affordance or state; no decorative hover on inert UI.
- `prefers-reduced-motion` disables transition and animation primitives.

## 7. Depth & Surface

### Strategy

Mixed, but constrained: borders define structure, warm shadows define elevated
interactive surfaces, and grain/glow is reserved for hero or high-level headers.

| Level | Token/Class | Usage |
| --- | --- | --- |
| Line | `border-border` | Dividers, inputs, quiet panels |
| Soft card | `shadow-warm` | Standard cards and headers |
| Raised card | `shadow-warm-lg` | Hover or prominent panels |
| Grain | `bg-grain` | Hero and page header material |
| Glow | `hero-glow` | One restrained focal glow per hero/header |

### Rules

- Do not nest cards inside decorative cards.
- Large glows are atmospheric accents, not repeated filler.
- Use `rounded-md`, `rounded-lg`, `rounded-xl`, and `rounded-2xl` by hierarchy;
  avoid making every element the same radius.

## 8. Implementation Source

- Theme tokens and Tailwind mappings: `src/app/globals.css` `:root`, `.dark`,
  and `@theme inline`.
- Surface utilities: `shadow-warm`, `shadow-warm-lg`, `bg-grain`, and
  `hero-glow` are Tailwind v4 `@utility` rules in `src/app/globals.css`.
- Motion primitives: `.t-lift`, `.t-rise`, `.t-stagger`, and `.t-shimmer` are
  defined in the motion primitive layer in `src/app/globals.css`.

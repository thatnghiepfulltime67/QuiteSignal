# QuietSignal Design System

> A dark verification canvas for confidential forecasts. Warm cream typography
> carries the narrative; semantic colors explain what is private, public, pending,
> or proven. Motion is expressive around the system, never ambiguous inside it.

## Design principles

1. **Privacy is visible.** Every page distinguishes owner-only data, public chain
   data, and attested-compute activity without requiring protocol knowledge.
2. **Evidence feels calm.** Explorer facts, transaction states, and verifier output
   use the same hierarchy as product marketing; proof is part of the interface.
3. **Color is a taxonomy.** Colors identify data/control states, not decoration or
   arbitrary brand flavor.
4. **Typography is the hero.** Large cream type creates confidence and clarity; cards
   remain quiet so the state of a signal is never confused with a CTA.
5. **Motion explains transitions.** Encryption, batching, settlement, and recovery
   may animate; values never slide or morph in a way that implies a false state.

## Theme

Dark. The page is a near-black stage with a single warm cream surface. Nested panels
lift one step to off-black. Thin lines and outlined controls keep the canvas open.
There are no filled primary CTA buttons.

## Color tokens

| Name | Value | Token | Meaning |
|---|---|---|---|
| Just Black | `#0e100f` | `--color-canvas` | Page canvas and deep sections |
| Surface Cream | `#fffce1` | `--color-cream` | Primary text, headings, borders, icons |
| Surface 50 | `#7c7c6f` | `--color-muted` | Secondary text and disabled labels |
| Surface 25 | `#42433d` | `--color-line` | Hairlines, dividers, inactive outlines |
| Off Black | `#191919` | `--color-panel` | Cards, code blocks, footer, read models |
| Signal Green | `#0ae448` | `--color-signal` | Valid action, accepted input, healthy flow |
| Light Signal | `#abff84` | `--color-signal-soft` | Signal gradient endpoint and subtle success wash |
| Pending Orange | `#ff8709` | `--color-pending` | Awaiting wallet, gateway, keeper, or confirmation |
| Private Pink | `#fec5fb` | `--color-private` | Owner-only data, sealed position, private score |
| Compute Lilac | `#9d95ff` | `--color-compute` | Encrypted computation, Nox activity, proof pending |
| Public Blue | `#00bae2` | `--color-public` | Public chain facts, aggregate, explorer, verifier |
| Warning Lipstick | `#f100cb` | `--color-warning` | Risk, mismatch, recovery attention; never normal status |
| Core Wash | `#dfffd1` | `--color-core-wash` | Low-opacity signal-tinted surface only |

### Semantic color rules

- `--color-private` marks data that only the connected owner may decrypt.
- `--color-public` marks data any observer can verify on-chain.
- `--color-compute` marks encrypted computation or proof work, not success.
- `--color-pending` marks waiting, never failure.
- `--color-signal` marks a completed action or valid state.
- `--color-warning` appears with an explanatory label and never alone.
- Never use a semantic color for a different meaning on another route.
- Text must remain readable without color; pair every color with a label, icon, or pattern.

## Typography

### Family

Use `Mori` when licensed and available. The fallback is a humanist sans stack:
`Söhne`, `DM Sans`, `ui-sans-serif`, `sans-serif`. Do not introduce a second display
family. The single family keeps market facts, privacy labels, and narrative copy in
one visual voice.

```css
:root {
  --font-sans: 'Mori', 'Söhne', 'DM Sans', ui-sans-serif, sans-serif;
  --weight-regular: 400;
  --weight-semibold: 600;
}
```

### Type scale

| Role | Desktop | Mobile | Line height | Tracking |
|---|---:|---:|---:|---:|
| caption | 14px | 14px | 1.4 | -0.01em |
| body-sm | 16px | 16px | 1.25 | -0.01em |
| body | 19px | 17px | 1.2 | -0.01em |
| body-lg | 23px | 20px | 1.35 | -0.01em |
| subheading | 34px | 28px | 1.15 | -0.015em |
| heading-sm | 44px | 34px | 1.1 | -0.018em |
| heading | 66px | 48px | 1.0 | -0.02em |
| heading-lg | 101px | 64px | 0.95 | -0.025em |
| display | 144px | 72px | 0.88 | -0.03em |

The application shell uses `heading-sm` to `heading`; the landing surface may use
`heading-lg` or `display`. Do not use display type inside a transaction card.

## Spacing, shape, and layout

- Base unit: 4px.
- Content max width: 1280px for narrative surfaces, 1440px for dense explorer surfaces.
- Page gutters: 24px mobile, 40px tablet, 64px desktop.
- Section gap: 80px; compact app section gap: 48px.
- Card padding: 24px; dense data row padding: 16px.
- Element gap: 16px; micro gap: 8px.
- Card radius: 8px.
- Small tag radius: 8px.
- Button/pill radius: 100px; use `9999px` only for status dots and circular controls.
- Dividers: 1px `--color-line`; no decorative box shadows.

```css
:root {
  --space-unit: 4px;
  --space-8: 8px;
  --space-12: 12px;
  --space-16: 16px;
  --space-20: 20px;
  --space-24: 24px;
  --space-32: 32px;
  --space-48: 48px;
  --space-64: 64px;
  --space-80: 80px;
  --radius-card: 8px;
  --radius-pill: 100px;
  --content-max: 1280px;
  --explorer-max: 1440px;
}
```

## Surfaces and elevation

| Level | Surface | Use |
|---:|---|---|
| 0 | `--color-canvas` | Page and uninterrupted narrative sections |
| 1 | `--color-panel` | Signal cards, verifier panels, footer, code |
| 2 | `--color-cream` at low opacity | Deliberate callout or owner-only focus surface |

Depth comes from surface steps, hairlines, and internal gradients. Do not use
drop shadows on cards or illustrations.

## Core components

### Outlined cream pill

The default action control is transparent, cream text, 1px cream border, 100px
radius, 15px vertical and 24px horizontal padding, 18px semibold text. Hover shifts
border opacity and translates up by 1px; it does not fill with color.

### Gradient-stroked action pill

Use only for the single primary action on a page: `linear-gradient(114deg,
--color-signal, --color-signal-soft)` as a 1.5px border, transparent fill, cream
label. Never create multiple competing gradient CTAs.

### Ghost navigation link

16px regular cream/muted text, no background or border, 10px vertical hit area.
Hover changes to cream and underlines; focus uses a 2px signal outline.

### Privacy boundary legend

An always-available compact legend with four labeled swatches:

```text
PRIVATE  pink     owner-only position, stake, score
COMPUTE  lilac    encrypted operation or proof in progress
PUBLIC   blue     chain facts, aggregate, verifier output
PENDING  orange   waiting for wallet, gateway, keeper, or oracle
```

The legend is text-first and collapses to a disclosure panel on mobile.

### Curly annotation

Section eyebrows use literal braces, for example `{ private signal }` or
`{ public evidence }`, at 16–19px regular cream. The annotation is a signature, not
a replacement for a semantic heading.

### Sealed signal card

Role: input surface for probability and stake.

- Panel surface, 8px radius, 24px padding.
- Inputs use cream labels and muted helper text; values are masked after encryption.
- A lilac/pink sealed strip shows `Encrypted locally` and the pool-bound context.
- The commit action is one outlined pill; approval is a separate explicit state.
- Never show raw handles, proofs, or confidential values in the UI.

### Epoch timeline

Role: public lifecycle explanation.

- Vertical hairline with labeled states: `Open`, `Aggregate`, `Execute`, `Resolve`,
  `Settle`.
- Completed states use signal green, active compute uses lilac, waiting uses orange,
  public facts use blue, and recovery uses lipstick with an explanation.
- Each row includes timestamp/transaction link only when public.
- No animation may imply that a pending state has completed.

### Aggregate panel

Role: public market output after the k-gate.

- Blue category label `{ public aggregate }`.
- Large cream totals with unit labels; aggregate numbers never use private pink.
- Include cohort count and a plain-language note that membership/timing remain public.
- Pair every total with a verifier link or transaction reference.

### Owner position card

Role: owner-only view and terminal actions.

- Pink left rail and a small `OWNER ONLY` label.
- Masked values by default; reveal requires an explicit owner decrypt action.
- Score and payout are separate rows so a user does not confuse quality with money.
- Claim/refund buttons state whether funds move and whether the operation is retry-safe.

### Verification panel

Role: make trust inspectable.

- Blue heading, off-black panel, monospaced compact data rows.
- Show chain id, pool address, manifest status, code-hash status, invariant status,
  and public transaction links.
- Failed checks use lipstick plus an explanation and next action.
- Never render raw confidential calldata, handles, proofs, or environment values.

### Status chip

8px radius, 14px regular label, 8px/12px padding. Always includes text and a 4–8px
dot/icon. Status chips are not buttons unless explicitly marked as such.

## Motion system

Motion creates a sense of a living confidential computation without changing meaning.

| Motion | Duration | Easing | Use |
|---|---:|---|---|
| Entry fade/translate | 240ms | `cubic-bezier(.2,.8,.2,1)` | Sections and cards |
| State handoff | 360ms | `cubic-bezier(.22,1,.36,1)` | Timeline status changes |
| Gradient drift | 8–14s | linear | Decorative blobs only |
| Button lift | 120ms | ease-out | Hover/focus feedback |
| Proof pulse | 1.6s loop | ease-in-out | Lilac compute indicator while pending |

- Respect `prefers-reduced-motion: reduce`: disable drift, pulse, parallax, and layout animation.
- Never animate private values from one number to another; use masked-to-revealed transition.
- Never use motion to conceal a transaction delay or imply finality before confirmation.
- Motion is decorative around data; state text remains immediately available to assistive technology.

## Imagery and illustration

Use soft organic 3D forms—sealed envelopes, fluid loops, translucent blocks, and
abstract signal waves—built from internal gradients. Shapes may overlap type on
narrative surfaces but remain contained in transaction and verification views.

- Private illustrations bias pink/lilac.
- Public illustrations bias blue/green.
- Pending illustrations bias orange.
- No photography is required for the product surface.
- No drop shadows; use gradient lighting and panel surface steps.
- Icons are monochrome cream, approximately 1.5px stroke, and never carry color meaning alone.

## Responsive composition

### Desktop (≥ 1100px)

- Top navigation with wordmark left, compact public/private legend center/right, wallet control far right.
- Narrative hero may bleed display type to the viewport edge.
- Signal and position views use a two-column composition: explanation/illustration plus action card.
- Verification uses a dense two-column evidence grid.

### Tablet (700–1099px)

- Reduce display scale to heading-lg/heading.
- Keep two columns only when both maintain ≥ 320px; otherwise stack.
- Legend remains inline but may wrap.

### Mobile (< 700px)

- One column, 24px gutters, 48px section gaps.
- Navigation collapses to a borderless icon button with a labeled drawer.
- Cards retain 24px padding; data rows use 16px.
- Timeline becomes full-width; verifier rows wrap labels before values.
- Never hide privacy boundary or recovery explanation behind horizontal scroll.

## Accessibility contract

- Cream/muted text must meet WCAG AA contrast on canvas/panel; semantic accents are
  not used as the only text color for essential information.
- Every color-coded status includes text, icon, or pattern.
- Focus ring: 2px signal green with 2px offset against all dark surfaces.
- Minimum interactive hit area: 44×44px.
- All forms expose labels, units, bounds, and errors programmatically.
- Live status updates announce without stealing focus.
- Test keyboard-only, screen reader, reduced motion, 200% zoom, and 360px viewport.

## Do

- Keep the dark canvas uninterrupted and let cream typography establish hierarchy.
- Use semantic colors consistently for private, compute, public, pending, and valid.
- Pair every public claim with a verifier link, transaction, or explicit limitation.
- Keep primary actions outlined and weightless; let the state—not the button—carry emphasis.
- Use masked owner data and explicit reveal actions.

## Do not

- Do not use filled solid-color CTAs or more than one gradient-stroked primary action per view.
- Do not use pure white `#ffffff` or pure black `#000000` as default surfaces.
- Do not use accent colors for arbitrary decoration that could be read as state.
- Do not show raw confidential values, handles, proofs, keys, or seed phrases.
- Do not use box shadows, noisy dashboards, or dense tables without explanatory hierarchy.
- Do not claim anonymity, untraceable membership, or hidden timing.
- Do not let animation alter, interpolate, or obscure financial/confidential values.

## Canonical CSS starter

```css
:root {
  color-scheme: dark;
  --color-canvas: #0e100f;
  --color-cream: #fffce1;
  --color-muted: #7c7c6f;
  --color-line: #42433d;
  --color-panel: #191919;
  --color-signal: #0ae448;
  --color-signal-soft: #abff84;
  --color-pending: #ff8709;
  --color-private: #fec5fb;
  --color-compute: #9d95ff;
  --color-public: #00bae2;
  --color-warning: #f100cb;
  --font-sans: 'Mori', 'Söhne', 'DM Sans', ui-sans-serif, sans-serif;
  --content-max: 1280px;
  --radius-card: 8px;
  --radius-pill: 100px;
}

html { background: var(--color-canvas); }
body {
  margin: 0;
  background: var(--color-canvas);
  color: var(--color-cream);
  font-family: var(--font-sans);
  font-weight: 400;
  font-size: 19px;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

button, a, input, select { font: inherit; }
:focus-visible { outline: 2px solid var(--color-signal); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}
```

## Design acceptance checklist

- [ ] Every new component declares its semantic color role.
- [ ] Every stateful component has loading, error, retry, and recovery copy.
- [ ] No primary route leaks private values into URL, logs, analytics, or server requests.
- [ ] New motion has reduced-motion behavior and does not imply false finality.
- [ ] Accessibility contract passes at desktop, mobile, zoom, keyboard, and screen-reader checks.
- [ ] Screenshots and public evidence obey the project secret/privacy rules.

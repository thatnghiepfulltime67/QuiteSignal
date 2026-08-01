# QuietSignal Design System

> Neon signage on cocoa leather.

## Design intent

QuietSignal is a dark, poster-like confidential forecasting product. Its warm cocoa
canvas, electric orchid typography, and full-bleed colour bands make the privacy
boundary legible without turning the application into a dashboard. Typography is the
primary image. Surfaces are printed, flat, and sharply structured: no gradients,
glass, elevation, stock imagery, or decorative status colour.

The visual system may be expressive, but protocol meaning remains precise. A colour
or motion effect must never imply that a transaction, encryption operation, proof,
or recovery action has completed before the corresponding public state confirms it.

## Principles

1. **Poster rhythm, not card grids.** Major narrative areas are edge-to-edge colour
   fields. Cards are reserved for contained forms, facts, and owner views.
2. **Type is the hero.** Large, tight, centred display type establishes hierarchy;
   compact monospaced labels provide context and state.
3. **Privacy is visible in words.** Labels describe `PRIVATE`, `COMPUTE`, `PUBLIC`,
   or `PENDING`; colour is supporting information, never the only signal.
4. **Flat contrast creates hierarchy.** Use colour-field changes and hairlines,
   never shadows, gradients, blurred backgrounds, or raised controls.
5. **Motion adds atmosphere, not meaning.** Decorative movement is subtle and is
   fully disabled for reduced-motion users. State text is always immediately clear.

## Tokens

### Colour

| Name            |     Value | Token                     | Role                                              |
| --------------- | --------: | ------------------------- | ------------------------------------------------- |
| Cocoa Husk      | `#322312` | `--color-cocoa-husk`      | Base canvas; cocoa ink on light surfaces          |
| Neon Orchid     | `#ff77c9` | `--color-neon-orchid`     | Display type, links, icon strokes, active detail  |
| Petal Wash      | `#ffdfef` | `--color-petal-wash`      | Bright light bands and dark-surface action labels |
| Plum Velvet     | `#470b64` | `--color-plum-velvet`     | Deep alternate band                               |
| Bubblegum Blush | `#ffc2e1` | `--color-bubblegum-blush` | Light bands and contained cards                   |
| Lavender Haze   | `#e2c9f8` | `--color-lavender-haze`   | Decorative geometry and compute accent            |
| Magenta Spark   | `#de8aff` | `--color-magenta-spark`   | Rare, high-emphasis detail only                   |
| Oxblood Rust    | `#481d2a` | `--color-oxblood-rust`    | Low-frequency supporting detail, never status     |
| Lilac Whisper   | `#eee2ff` | `--color-lilac-whisper`   | Dark-surface borders and controls                 |
| Walnut Vein     | `#5b4f41` | `--color-walnut-vein`     | Hairlines and subdued structure                   |

The palette is intentionally closed. Do not introduce white, neutral gray, blue,
green, orange, a gradient, or an unlabelled semantic status colour. Private,
compute, public, pending, success, warning, and recovery states must use explicit
text and icon/pattern distinctions; the shared palette is decorative and structural,
not a replacement for accessibility semantics.

### Typography

Use the following licensed font names when available; otherwise use the specified
system-safe substitutes. Never fetch a font from a third-party runtime service.

| Voice             | Family token          | Substitute                         | Use                                |
| ----------------- | --------------------- | ---------------------------------- | ---------------------------------- |
| Display and body  | `--font-gt-planar`    | `Inter Tight`, `Arial`, sans-serif | Headline and readable body copy    |
| Monospaced labels | `--font-abcrepromono` | `JetBrains Mono`, ui-monospace     | Uppercase eyebrows, tags, controls |
| UI microcopy      | `--font-suisseintl`   | `Inter`, ui-sans-serif             | Compact navigation and icon labels |

| Role          | Size | Leading |  Tracking |
| ------------- | ---: | ------: | --------: |
| Caption       | 11px |    0.79 |    normal |
| Body          | 18px |     1.4 |    normal |
| Subheading    | 22px |     1.2 |    normal |
| Heading small | 42px |     1.0 | `-0.84px` |
| Heading       | 48px |    0.95 | `-0.96px` |
| Heading large | 59px |    0.95 | `-1.18px` |
| Display       | 95px |    0.90 |  `-3.8px` |

Headlines use display type at weight 700 (or 300 only for a deliberate 95px display
moment), tight tracking, and centred composition. Body copy stays between 16px and
22px. Eyebrows are 11px uppercase mono labels set 20–40px above a heading.

### Layout and shape

- Base unit: 4px. Use `4`, `8`, `12`, `20`, `36`, `40`, and `116`px steps.
- Maximum content width: 1200px. Major bands use 80–120px vertical padding.
- The main page is a vertical sequence of full-bleed bands: cocoa → petal/plum →
  bubblegum → cocoa. The background change is the layout system.
- Cards use a 10px radius; badges, inputs, and buttons use a 4px radius.
- Cards have a 1px Walnut Vein border, 20px padding, and no shadow.
- Inputs and all interactive targets remain at least 44px high.

## Components

### Header and navigation

The persistent header sits on cocoa with a 1px Walnut Vein bottom border. The
QuietSignal wordmark is an orchid outlined diamond followed by the wordmark in
display type. Navigation is a grouped task bar: Overview, Markets, Portfolio, and Test
Lab. Markets lists verified pools and exposes one selected pool's facts and action
panels; the selected-pool list stays visible in its own viewport-height scroll rail while
the detail column scrolls. Portfolio
holds wallet-level ETH/QSFC/QSCC balance summary, Mint, Approve, Wrap, and explicit
QSCC Reveal controls alongside position entry points; Test Lab contains Create/Join,
including an explicit sequential flow for creating ten real verified test pools.
Use uppercase 12px mono labels in Petal Wash; hover and the current task shift only to
Neon Orchid. The task bar remains pinned to the top of the viewport while scrolling,
with an opaque Cocoa background and a Walnut Vein separator so it never visually
merges with page content. A selected market reveals only the panel the user opens;
never expose transaction forms for every listed pool at once.

When a wallet is connected, a compact balance strip below the header shows public
Sepolia ETH and QSFC amounts. QSCC is labelled as hidden until the user explicitly
presses the adjacent Reveal control; that owner-only amount is session-only and
re-masks on account or chain change. The strip wraps on narrow viewports rather than
creating horizontal scrolling.

### Action controls

All standard action controls use one solid Neon Orchid treatment: Orchid background,
Petal Wash uppercase mono label, 1px Orchid border, 4px radius, and `12px 20px`
padding. Hover shifts to Lilac Whisper while retaining dark, readable text contrast;
disabled actions lower opacity without changing their purpose. Selection rows and
inline text links may remain distinct because they are navigation or choice controls,
not transaction actions. Do not make an action control imply a completed transaction;
wallet and chain state are always stated beside it.

When a wallet request, signature, or receipt is pending, the page disables competing
controls and navigation until that operation succeeds or fails. A compact, live
notification in the upper-right reports the current wallet step and the confirmed or
failed outcome. It states progress only; it does not expose a confidential value or
imply finality before the public receipt is confirmed.

### Self-test configuration

Self-test creation exposes editable, bounded public values: an ETH/USD threshold and
comparison, a five-minute to fourteen-day commit-window duration, and a participant
gate. The form uses clear duration presets, including five and ten days. Feed,
collateral wrapper, timeout, recovery, and network bindings remain fixed and are
stated beside the form. The shared join link carries the selected public configuration
so a second participant can verify the immutable pool and adapter facts before any
wallet action.

### Hero and section bands

The hero is centred Cocoa Husk with 120–160px vertical breathing room, a neon orchid
eyebrow, and a 59–95px Orchid headline. Separate major regions with a single Orchid
hairline when the canvas does not already change. Light bands shift heading ink to
Cocoa Husk. Do not use a card grid as the primary page composition.

### Cards, tags, forms, and fact rows

Use cards only inside a light band or for a self-contained transaction interaction.
They use Petal Wash or Bubblegum Blush, Cocoa text, a Walnut Vein hairline, 10px
radius, and 20px padding. Tags are uppercase mono, textual, and flat. Form labels
remain programmatic; private form input is never copied into a URL, log, storage,
analytics request, or public evidence.

### Privacy and transaction states

Every privacy boundary uses a textual label and explanatory sentence:

- `PRIVATE`: an explicit connected owner may reveal a value for this session.
- `COMPUTE`: encryption or proof work is in progress; it is not final.
- `PUBLIC`: an observer may inspect the stated on-chain fact.
- `PENDING`: wallet, chain, gateway, or permissionless recovery work remains.

Owner values are masked by default and cleared on account or chain change. Raw
handles, proofs, calldata, signatures, environment data, private keys, and seed
phrases are never rendered.

## Motion and decoration

Use flat, geometric decorative shapes—outlined diamonds, hatch lines, and bounded
lavender/pink orbits—rather than photography, screenshots, 3D renders, or gradients.
Decorations must remain outside form controls and data rows.

| Motion                | Duration | Use                                                   |
| --------------------- | -------: | ----------------------------------------------------- |
| Band/content entrance |    240ms | Opacity and 8px vertical settle when a route appears  |
| Control feedback      |    120ms | 1px lift and colour change on hover/focus             |
| Decorative orbit      |   10–14s | Slow linear movement of non-interactive geometry only |
| Compute pulse         |     1.6s | Bounded indicator while text says work is pending     |

Never animate a financial or confidential number between values. Never animate a
pending protocol state as if it were final. With `prefers-reduced-motion: reduce`,
disable all nonessential animations and transitions.

## Responsive and accessibility contract

- Desktop: 1200px centred interior; dense public facts may use multiple columns.
- Tablet: stack when columns would be narrower than 320px.
- Mobile: one column, 20–24px gutters, 48px section rhythm, no horizontal scroll.
- Keyboard focus is a 2px Lilac Whisper outline with an offset. Every action has a
  visible label, semantic role, and a 44×44px target.
- Live status changes are announced without moving focus. Colour is never the only
  carrier of protocol, privacy, or error meaning.
- Test every primary route at 360px, 768px, 1280px, and 1440px, with keyboard,
  screen reader, 200% zoom, and reduced-motion settings.

## Canonical CSS starter

```css
:root {
  color-scheme: dark;
  --color-cocoa-husk: #322312;
  --color-neon-orchid: #ff77c9;
  --color-petal-wash: #ffdfef;
  --color-plum-velvet: #470b64;
  --color-bubblegum-blush: #ffc2e1;
  --color-lavender-haze: #e2c9f8;
  --color-magenta-spark: #de8aff;
  --color-oxblood-rust: #481d2a;
  --color-lilac-whisper: #eee2ff;
  --color-walnut-vein: #5b4f41;
  --font-gt-planar: 'GT-Planar', 'Inter Tight', Arial, sans-serif;
  --font-abcrepromono: 'ABCReproMono', 'JetBrains Mono', ui-monospace, monospace;
  --font-suisseintl: 'SuisseIntl', Inter, ui-sans-serif, sans-serif;
  --page-max-width: 1200px;
  --radius-cards: 10px;
  --radius-controls: 4px;
}
```

## Acceptance checklist

- [ ] Each screen uses Cocoa, Plum, Petal, and Bubblegum bands intentionally.
- [ ] Neon Orchid appears on every screen as type, link, or geometric detail.
- [ ] No shadows, gradients, glass effects, stock imagery, or oversized rounding.
- [ ] Every stateful component includes loading, error, retry, and recovery copy.
- [ ] No primary route leaks confidential data into logs, storage, URLs, services,
      screenshots, or evidence.
- [ ] Motion respects reduced-motion preferences and never claims false finality.
- [ ] Desktop and mobile preserve readable type, keyboard focus, and privacy context.

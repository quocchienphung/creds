# UIArc Button: page brief

Source: https://uiarc.dev/components/button (free, open source). Read on 2026-11-03 with the clone-website workflow of `web clone engine`: the page's own
registry item `https://uiarc.dev/r/button.json` (source and CSS), `https://uiarc.dev/r/arc-motion-tokens.json`, and the computed styles of the rendered
page in Edge at 1440px (light and dark). Verbatim copies of the source are in `source/`.

## What the page declares

| Thing | Value |
|---|---|
| Variants | `primary` (default), `secondary`, `ghost`, `danger` |
| Sizes | sm 36px, md 44px (default), lg 50px (`--control-height-sm/md/lg` = 2.25 / 2.75 / 3.125rem) |
| Radius | 18px for every size (`--radius-control`, 1.125rem) |
| Padding | 0 12px (sm), 0 16px (md), 0 20px (lg); gap 8px |
| Type | 14px / 1.4, weight 500, letter-spacing -0.01em |
| Transition | color, background, border-color, opacity, box-shadow, 0.16s `cubic-bezier(.22,1,.36,1)` |
| Hover | only on `(hover: hover) and (pointer: fine)`: primary opacity .91, secondary/ghost take `surface-muted`, danger gets a danger border |
| Press | Motion `whileTap` scale .97 (.96 for icon-size, .985 for wide), snappy spring `visualDuration .26, bounce 0`; colour answer in CSS (primary opacity .84) |
| Loading | spinner, `aria-busy`, swallows clicks, keeps focus |
| Disabled | primary opacity .52; secondary/danger keep the border and take a muted fill and label; ghost only a muted label |
| Focus | `outline: 2px solid oklab(.24 0 0 / .72)` (dark `oklab(.91 0 0 / .72)`), offset 2px, keyboard only |
| Label change | new label rises 2px and fades in over .24s, the old fades out in .1s; the slot width springs (`visualDuration .42`) |
| Light tokens | foreground `oklch(15% 0 0)`, surface `oklch(100% 0 0)`, surface-muted `oklch(97.8% 0 0)`, border `oklch(93.5% 0 0)`, text-secondary `oklch(46% 0 0)`, text-muted `oklch(59% 0 0)`, danger `oklch(53% .18 10)` |
| Dark tokens | background `oklch(19% 0 0)`, foreground `oklch(96% 0 0)`, surface `oklch(21.5% 0 0)`, border `oklch(29% 0 0)`, danger `oklch(71% .155 8)` |
| Demo layout | rows of `display:flex; gap:8px; justify-content:center; align-items:center; flex-wrap:wrap` |

## Where it went

- `src/components/sites/uiarc/button/Button.tsx` + `button.module.css`: the registry source, with tokens renamed `--arc-*` so they cannot collide.
- `src/components/sites/uiarc/arc-tokens.css`: the tokens above (light and dark).
- `src/components/sites/uiarc/button/ui-button.css`: the workspace's existing `.ui-button` class restated with the same values. The old base of that class
  lived in a stylesheet of a page that was removed (`analytics-reference.css`), so every plain button had lost its layout (icon above label, no height);
  this file restores it, in UIArc's look.
- The React `<Button>` is used where the press, spinner and label morph matter: "Tự động sửa Excel" (shows its spinner while a repair runs), the buttons of
  its dialog, and "Undo" on the change-applied card. Everything else keeps the CSS skin.

## Layout rhythm (presentation only, `collateral/arc-layout.css`)

Measured on the before screenshots (`screens/ours-*-before.png`): controls of five heights (26-36px) in the review toolbar, tools on a row of their own,
status line 24px from its toolbar, a 28px file chip beside a 36px action, 6px between the breadcrumbs and the title, and an alarm-red "Fix these first"
card for what is only a note about the JSON conversion. After: every control 36px with the 18px radius, 8px between related controls and 12px between
groups, two toolbar rows (what / where) with the tools at the right edge of the first, the status line 12px under the second, a 12px title gap, the note
neutral. See `screens/ours-*-after.png`, `ours-review-mobile-after.png`, `ours-review-dark.png`.

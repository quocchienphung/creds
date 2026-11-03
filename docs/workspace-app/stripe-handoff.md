# Stripe homepage reconstruction — handoff

Updated 2026-09-17 (session 2). Read `docs/stripe-component-status.md` and `docs/stripe-forensics.md` first.
Reference is https://stripe.com/ (en-US), frozen captures in `docs/research/stripe-live/` (DOM per viewport,
full-page PNGs, topology JSON, partitioned CSS, extracted bundle modules + GLSL).

## How the project is built
- Next.js 16 app router; the homepage is `src/app/page.tsx` composing `src/components/stripe/*`.
- Markup is a literal port of the reference DOM (same class names); styling is the reference stylesheet
  partitioned into `src/styles/stripe/generated/*.css` (generated — do not hand-edit; overrides go in
  `src/styles/stripe/overrides.css`). Fonts: Sohne variable + Source Code Pro from `public/stripe`.
- WebGL pieces are Three.js r178 ports of the reference bundle modules: hero ribbon (`Hero/wave`), agentic
  particles (`Solutions/graphics/agentic`), issuing card (`Solutions/graphics/issuing`), crypto globe
  (`Solutions/graphics/globe`), developer wave (`Developers/DevelopersWave.tsx`), news canvas carousel.
- Dev server: `npm run dev` (port 3000). Checks: `npx tsc --noEmit`, `npx eslint src`.

## Validation tooling (`scripts/forensics/`, Playwright + pixelmatch; headless Chrome via `channel: "chrome"`)
- `compare.mjs <vp> <name> <y> <h> [--no-capture] [--wait ms]` → reference/local/overlay/diff PNGs in
  `docs/design-references/compare/` plus a diff %.
- `topology-check.mjs [vps…]` → every top-level section's y/height, local vs frozen reference.
- `measure.mjs <live|url> <vp> "<selector>"…` → rects + computed styles.
- `shot.mjs`, `shot-crypto.mjs` (frame-samples the crypto card; `--hover`, `--times`), `measure-crypto.mjs`.
- `dump-globe.mjs`, `dump-dataviz.mjs` → extract bundle GLSL/JS into `docs/research/stripe-live/shaders/`.

## State at hand-off
- Topology: all 15 top-level sections match the reference at 1440/1280/1024/768/390 within 0.1px; page
  heights identical (15186 @1440). Region diffs @1440: hero 1.2% (ribbon phase), solutions 0.9%, developers
  0.6%, news 0.05%, CTA/footer 0.0%, business 9.9% (only the platform graphic's timeline step and the
  stats data-viz theme at the top of the crop), stats 34% (time-of-day theme differs from the frozen capture;
  with the same theme only the data-viz motion differs).
- Session 2 work:
  1. **Crypto globe** — full port of chunk 38639 (`Solutions/graphics/globe/{config,dots,shaders,GlobeRenderer}.ts`,
     `CryptoGlobe.tsx`). Validated frame-by-frame vs live at 1440 and 390 and with hover
     (`docs/design-references/crypto/side-*.png`). Gotcha found while porting: the dot sampler's uv helper
     uses `centre − point` (samples the antipode); port it literally or continents land on the wrong side.
  2. Stats heading: live uses `The backbone of&nbsp;global commerce` (wrap "The backbone / of global commerce").
  3. Startups carousel nav/hover/drag (`Business/useCaseStudyCarousel.ts`), measured against live: next/prev
     scroll by card+gap (348px @1440), hovered card scaleX 1.036 with ±5.976px neighbour shifts.
  4. **Stats data-viz** — full port of module 40428 into `src/components/stripe/Stats/dataviz/`
     (`core.ts` tween/easing/palettes/noise, `RaysAnimation`, `GlobeLinesAnimation`, `WaveLinesAnimation`,
     `SplinesAnimation`, `DataVizController`, `shaders.ts`) + `Stats/DataViz.tsx`; `Stats.tsx` now also
     mirrors the live dark/night forcing below 940px and the 1200ms transitioning class. Validated
     frame-by-frame vs live (`docs/design-references/stats/*-sheet.png`, `night-sheet.png`). The
     reference's slot-cycling tween in the wave animation is never started on the homepage → not ported.
- The status doc from session 1 was stale for: agentic particles (WebGL port exists), issuing card (Three.js
  port exists), enterprise accordion (interactive), platforms (timeline hook exists), nav mobile menu (exists).

  5. Motion/interaction parity validated against live by frame-sampling (`docs/design-references/motion/*-sheet.png`):
     hero ribbon, developer wave, agentic particles + chat sequence, enterprise accordion (open heights
     56/698/73/73 identical), news squeezy carousel (mid-transition frames match), platforms timeline
     (payments ~1.5–2s, notification ~4.5s, payouts ~7.5s after entering view on both).
  6. Stats: controls + data-viz canvas are only mounted at the desktop breakpoint (≥940px) like live;
     `npm run build` passes.

## Remaining work
Homepage Guide me now opens the collaborative painting intro at `/guide`, then continues to `/personalize?browse=1`. The source/adaptation notes, local artwork provenance and QA are documented in [guide-intro/README.md](research/guide-intro/README.md).

Nothing structural is outstanding: topology matches at 1440/1280/1024/768/390 (the only flagged rows in
`topology-check.mjs` are index offsets from zero-height wrapper elements). Candidates for further polish:
- Frame-phase differences of time-driven animations (hero ribbon, globe rotation) are load-time dependent,
  not defects.
- The stats data-viz hover physics were compared visually only (pointer path is hard to replay identically).
- The reference wave animation's unused slot-cycling tween and the globe "flags" UI variant were not ported.
- `Stats.tsx` still has the pre-existing jsx-a11y combobox warning (`aria-controls`) mirrored from the live markup.

## Decisions
- Only the globe's "default" UI variant (wallet badge) is ported; the "flags" variant is unused on the homepage.
- Dots are generated on the main thread (~20ms) instead of the reference's worker; shared across instances.
- Reduced motion pauses the globe (draws one frame), matching the other WebGL components in this repo.

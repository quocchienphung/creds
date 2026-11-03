# Stripe homepage forensics

Frozen reference: https://stripe.com/ — English (United States), inspected 2026-09-17. Live browser DOM and computed styles take precedence over DESIGN-stripe.md.

## Repository
Next.js 16.3 App Router, React 19.2.4, strict TypeScript, npm/package-lock, Tailwind v4, shadcn/Base UI, Lucide, tw-animate-css. Untouched root scaffold. No existing product assets or motion/WebGL dependencies. Initial fonts: next/font Geist and Geist Mono. No Git repository was present.

## Output plan
Source / maps to local /. Research: docs/research/stripe-com-9ababc9a/root-8a5edab2. Components and assets use sites/stripe-com-9ababc9a/root-8a5edab2. Only template root route is replaced. Shared font and CSS foundation will be updated.

## Frozen page order at 1440 × 1000
1. hds-color-mode hero-section-container section section--white hds-mode--light: Y=76.00, height=752.80. Global GDP running on Stripe: 1.71678404%1.71678404%The Global GDP running on Stripe is calculated using a simple algorithm that p

2. hds-color-mode section section--white hds-mode--light: Y=828.80, height=2195.60. Flexible solutions for every business model.Grow your business with a comprehensive set of payments and financial tools⁠—⁠designed

3. hds-color-mode section section--white hds-mode--light: Y=3024.40, height=560.00. Building the economic infrastructure for AIWatch now

4. hds-color-mode stats-section stats-section--time-sunrise section section--white hds-mode--light: Y=3584.40, height=977.11. The backbone of global commerce135+currencies and payment methods supported$1.9Tin payments volume processed in 202599.999%histori

5. hds-color-mode business-sizes-section section section--white hds-mode--light: Y=4561.51, height=4608.64. Powering businesses of all sizes.Run your business on a reliable platform that adapts to your needs.Transform your enterprise with

6. hds-color-mode section hds-mode--dark: Y=9170.15, height=2341.35. Reliable, extensible infrastructure for every stack.Adapt Stripe to your business needs with flexible integration options.View dev

7. hds-color-mode section section--white hds-mode--light: Y=11511.50, height=1740.34. What’s happeningSee the latest from Stripe.Businesses on Stripe generated $1.9T in 2025.Our annual letter explores the trends defi

8. hds-color-mode section hds-mode--light: Y=13251.84, height=380.00. Ready to get started?Create an account instantly, or contact us to design a custom package for your business.Start nowContact sale

9. hds-color-mode footer section hds-mode--light: Y=13631.84, height=1101.60. Products and pricingPricingAtlasAuthorization BoostBillingCapitalCapital for platformsCheckoutClimateConnectCryptoCrypto OnrampDat

## Navbar and hero
Navigation: 76px tall; section container 1298px wide at x=63.4, padding 6px 18px. Hero main layout: 1266px at x=79.4, height 680px, padding 36px 16px. Internal 12-column grid: 88.025px columns, 16px gap. Text begins x=200.225. Eyebrow y=231.2. Title y=292, width=958.4625, height=220.8. Sohne variable, 48px, weight 300, line-height 55.2px, tracking -0.96px, ss01. Actions y=552.8, 48px high, 8px gap. Customer strip y=756, height 72.8. Hero ends y=828.8. Full computed properties are in measurements-1440.json.

## Reference conflicts
Live buttons have 4px corners, not markdown pills. Live title is 48px, not 56px. Live primary heading ink is #061b31. Current hero has no dashboard composition.

## Product rendering techniques
Hero: Three.js r178 canvas ribbon plus desktop/tablet/mobile fallback images. Terminal: detailed official hardware raster with separately composed screen UI. Payments: DOM checkout layered over photographic background. Issuing: foreground/background card texture assets and palette image; canvas presence and motion require further inspection. Do not replace these with generic cards or hardware.

## Validation
Desktop full-page capture saved. Detailed interaction/responsive audit and implementation pending. Initial page screenshot contains lazy sections; scroll sweep will supplement it.

## Crypto globe ("Access borderless money movement with stablecoins and crypto")
Bento card 400×676 at x=936 (1440); `.globe` is `inset:-20px` → canvas 447×728 (390: card 358×524.5, canvas 398×565). Live renders a Three.js r178 scene (bundle chunk 38639, shaders captured in `docs/research/stripe-live/shaders/globe/`): perspective camera fov 25 at z=11.7 (11.3 on coarse-pointer touch devices), globe radius 2 at y=−1 (homepage prop `position={{y:-1}}`), tilt x=−2° z=8°, initial y=70°, auto-rotation 0.00115 rad/frame@60fps (×1.25 while the Pacific faces the camera, lerped 0.01/frame). Dots: Fibonacci sphere of 60k candidates (30k touch) jittered 0.15×0.75 in the tangent plane, kept where `map_dots.png` (2160×1080, sampled with centre−point uv) has alpha > 0 → ~18k points; point sprite 0.12 world × sizeVariation(1±0.375) × (canvasHeight/800) × 300/−viewZ × dpr/2; 3-stop screen-space gradient #ff7c3f/#fd3ae6/#533afd at stops .024/.379/.794 angle 225°; opacity 0.6 × (1−hash×0.3) × depth fade (front .25, back −.1, min .15, curve 2); 25% of dots may lift off ("corona") 0.6 units, participation 0.2, boosted ×1.33 while the card is hovered. Surface: sphere 0.9995R, white→#005eff camera-space gradient (clock 215°, depth −.1, contrast 2, offset −.4) at opacity .2 with #c7b6ea fresnel (strength .1, power .3). Halo plane 12×12 facing the camera, #a953ff ring R→1.02R fading over 0.4R, intensity .08 × opacity .35. Arcs: pooled Line2 fat lines (worldUnits, width .007 UI / .004 simple), slerp great circle between cities lifted by sin(πt)×peak (UI: lerp(.1,.275, angleT^1.2)×R; simple: lerp(.06,.18,angleT)×R), 256 / 64 segments, drawn by discarding instances outside a visible range (gl_InstanceID); markers are 0.4-unit planes with a 128px ring sprite (25% halo, ring, white core) scaled 0.2 / 0.12. UI arc timeline: markerA 600ms, markerB 550ms, line 1800–4500ms (2800ms × km/8000, easeOutCubic) → badge intro 800ms → travel 3000–6000ms along t∈[.05,.95] (easeInOutCubic) → outro 600ms easeInCubic while the line retreats 2200ms and markers fade 600ms. Controller: max 4 UI arcs, spawn every 1500–4000ms, min 2000km, transpacific pairs preferred when the Pacific is in view, 80px screen exclusion; 3 simple arcs every 800–2000ms (500–8000km, 1200ms draw, 800ms retreat). Badge: pooled `.globe__arc-ui` DOM (24px wallet icon from 6 inline SVGs, "$1–999", USDC/USDB or CASH for Phantom), positioned via --ui-x/--ui-y with scale .75–1 by altitude, hidden behind the globe (facing < −.5) with a smoothstep fade. Reduced motion / offscreen: paused (timestamps shifted on resume).

## Stats data-viz ("The backbone of global commerce")
Live: one WebGL2 canvas (`.data-viz__canvas`, 1234×519 @1440) rendered by bundle module 40428 (dumped to `docs/research/stripe-live/shaders/dataviz/` with 16 GLSL modules). Camera fov 45 at z=5, alpha canvas over the CSS gradient, dpr ≤ 2. Four animations, one per stat, switched by the stat menu with 1.25s cross-fades (outgoing dots scatter to a shared 400-point cloud at z −90 while the incoming dots arrive from the outgoing positions; lines fade via `animValue`): (0) rays — 810 Fibonacci directions from (0,−2.3,−0.4), length 2.75–3.75, culled to the frustum, 1.2s 0.7→1 intro, spring physics bends tips away from the pointer; (1) volume — 258 meridian arcs on a radius-4 sphere tilted (40°,24°,24°) at (0,−2.5,−1.4), rotating 0.01°/frame, pairs exit 3s / re-enter 8s at seeded random latitude regions, depth-faded dots at tips; (2) uptime — 600 vertical lines along a 4-oscillation sinusoid receding 20 units, pulse every 2.8s accelerating after 20%, 10-band noise shimmer, spring physics on tops; (3) subscriptions — 98 centripetal Catmull-Rom splines to 33 right anchors with 9s heartbeat pulses. Palettes per time of day (top/bottom/stop): pre-dawn #d91aff/#0008ff, sunrise #ff29b0/#9435ed, daytime #66c9ff/#0000db, dusk #66c9ff/#0000ff, sunset #f394ff/#5b24db, night #fff/#fff stop .66; palette changes lerp over 0.5s while in view. Non-desktop (<940px) forces the night theme and `stats-section--dark hds-mode--dark`; toggling to/from night adds `stats-section--transitioning` for 1200ms. Reduced motion: renders single frames, switches without tweening. Heading uses a non-breaking space ("The backbone of&nbsp;global commerce").

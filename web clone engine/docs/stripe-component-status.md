# Stripe component status

Statuses reflect completed evidence only (see `docs/stripe-forensics.md` for measurements and
`docs/design-references/compare/` for the overlay/diff outputs).

| Component | Status | Notes |
|---|---|---|
| Navbar | VALIDATED DESKTOP | 76px header, 1298 layout, mega-menus portaled to body; overlay crisp at 1440 |
| Mega-menus (Products/Solutions/Developers/Resources) | VALIDATED DESKTOP | content parsed from live popups; hover/keyboard/Esc |
| Hero text + buttons | VALIDATED DESKTOP | wrap identical; hard-light foreground clone |
| Hero ribbon (Three.js) | IMPLEMENTED | decoded shaders/config; time-driven; post pass on desktop |
| Customer logo strip | VALIDATED DESKTOP | 30px/s marquee, 18-logo loop, drag |
| Solutions bento layout | VALIDATED DESKTOP | 816/400/1232 cards, 676/450 heights |
| Payments graphic (terminal + checkout) | IMPLEMENTED | DOM port; official terminal raster + DOM screen |
| Billing graphic | IMPLEMENTED | DOM port |
| Agentic commerce graphic | IMPLEMENTED | DOM port + Three.js particle background port (`graphics/agentic`) |
| Issuing card | IMPLEMENTED | Three.js port (`graphics/issuing`), pointer tilt; official raster as fallback |
| Crypto globe | VALIDATED DESKTOP, VALIDATED MOBILE | Three.js port of chunk 38639 (dots, surface, halo, UI + simple arcs, wallet badges); frame-sampled vs live at 1440/390 + hover (`docs/design-references/crypto/side-*.png`) |
| Connect graphic | IMPLEMENTED | DOM port (captured animation state) |
| Query box | IMPLEMENTED | interactive counter/submit |
| Sessions banner | VALIDATED DESKTOP | |
| Global statistics | VALIDATED DESKTOP, VALIDATED MOBILE | Three.js data-viz port (module 40428: rays / globe lines / wave lines / splines, transitions, palettes) frame-matched vs live incl. stat switching, hover, night toggle (`docs/design-references/stats/`); heading nbsp wrap; non-desktop forces night/dark like live |
| Enterprise accordion | IMPLEMENTED | markup port + accordion interaction |
| Startups carousel + program cards | VALIDATED DESKTOP | nav/hover/drag measured against live (`Business/useCaseStudyCarousel.ts`) |
| Platforms graphic + testimonials | IMPLEMENTED | markup port + timeline hook (`usePlatformTimeline.ts`) |
| Developer systems diagram | IMPLEMENTED | DOM port |
| Developer scale wave (Three.js dark) | IMPLEMENTED | same renderer, developer config |
| Integration paths | IMPLEMENTED | |
| News squeezy carousel (canvas) | IMPLEMENTED | 1:1 port of chunk 22990 |
| Book of the week | VALIDATED DESKTOP | |
| Bottom CTA | VALIDATED DESKTOP | |
| Footer | VALIDATED DESKTOP | |

Page geometry at 1440: every top-level section top/height matches the reference topology
(`docs/research/stripe-live/topology-1440.json`) within 0.5px; full page 15186px.

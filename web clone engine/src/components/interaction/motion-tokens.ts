/** Values read from the public UIArc previews, not its registry/API. See docs/research/uiarc-interactions. */
export const interactionMotion = {
  instant: 120,
  fast: 160,
  standard: 240,
  spring: 580,
  exit: 130,
  stagger: 35,
  ease: "cubic-bezier(.22,1,.36,1)",
  enter: "cubic-bezier(.16,1,.3,1)",
  springEase: "linear(0,.0213,.0739,.1443,.2235,.305,.3849,.4606,.5305,.594,.6508,.7011,.7452,.7836,.8168,.8454,.8699,.8907,.9084,.9234,.9361,.9467,.9557,.9632,.9694,.9747,.979,.9826,.9857,.9882,.9902,.992,.9934,.9946,.9955,.9963,1)",
} as const;

export function springEasing() {
  return CSS.supports("animation-timing-function", interactionMotion.springEase) ? interactionMotion.springEase : interactionMotion.ease;
}

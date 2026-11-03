/**
 * A note passed from the loading field to the reveal: "a person has just been looking at a loading page". The reveal only plays after a
 * wait that was actually seen, so a page that opens at once (a second visit, a cached chunk) is not slowed down by an effect.
 * Module state only; nothing is stored or sent anywhere.
 */
let lastSeen = Number.NEGATIVE_INFINITY;

/** The loading field is on screen (call when it starts and again when it ends). */
export function noteWait() { lastSeen = performance.now(); }

/** True if a wait ended in the last `withinMs`; taking it clears it, so one wait produces one reveal. */
export function takeWait(withinMs = 1200): boolean {
  const recent = performance.now() - lastSeen < withinMs;
  lastSeen = Number.NEGATIVE_INFINITY;
  return recent;
}

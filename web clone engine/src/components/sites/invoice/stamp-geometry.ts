/**
 * The stamp as a solid, in the paper's own units (the paper is 560 × 790). x runs right, y down the paper, z up from the paper towards the camera.
 * From the bottom: the die, a small raised plate of rubber that prints (its size is the impression's); the sole, a wide black rubber plate the
 * die stands out of; and the housing, whose top face is the date picker. Seen from above, as the camera sees it, that is the picker, its white
 * wall, and the black rubber at its foot.
 */
export const DIE = { w: 213, h: 75.3, z0: 0, z1: 3, radius: 9 } as const;
export const SOLE = { w: 300, h: 174, z0: 3, z1: 21, radius: 22 } as const;
export const HANDLE = { w: 308, h: 182, z0: 21, z1: 81, radius: 26 } as const;
/** Height of the picker's face over the paper when the die sits on it. */
export const TOP_Z = HANDLE.z1;
/** The perspective of the scene's camera, in px. */
export const PERSPECTIVE = 860;
/** The scale at which the stamp's top face is as wide on screen as the picker's card (its top is nearer the camera, so it is drawn larger). */
export const PICK_SCALE = 1 / (1 + TOP_Z / PERSPECTIVE);

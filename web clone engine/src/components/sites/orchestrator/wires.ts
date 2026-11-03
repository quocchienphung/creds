/**
 * The connectors of the orchestrator block, from where its parts are on the page: a trunk from the lead down to the summary, a branch (and a port) into each
 * lane, and the routes a packet takes on dispatch and on return. Two layouts, as measured on the public preview: lanes stacked under one trunk in the lead's
 * column, or up to four side by side with a bus above them and a second bus below them. Pure, so node tests it against the recorded paths.
 */
export interface Rect { left: number; top: number; width: number; height: number }
export interface WireInput { leadMark: Rect; lead: Rect; lanes: Rect[]; summary: Rect; summaryMark: Rect }
export interface Wires {
  wide: boolean;
  trunk: string;
  branches: { d: string; lane: number; side: "in" | "out" }[];
  ports: { cx: number; cy: number; lane: number; side: "in" | "out" }[];
  /** the route of a packet from the lead into each lane, and from each lane to the summary */
  dispatch: string[];
  back: string[];
}

const RADIUS = 8, GUTTER_MARK = 6;
const n = (value: number) => (Math.round(value * 100) / 100).toString();

export function computeWires({ leadMark, lanes, summary, summaryMark }: WireInput): Wires | null {
  if (!lanes.length) return null;
  const wide = lanes.length >= 2 && Math.abs(lanes[0].top - lanes[1].top) < 4;
  const x = leadMark.left + leadMark.width / 2 + 0.5;
  const trunkTop = leadMark.top + leadMark.height + GUTTER_MARK, trunkBottom = summaryMark.top - GUTTER_MARK;
  const branches: Wires["branches"] = [], ports: Wires["ports"] = [], dispatch: string[] = [], back: string[] = [];
  if (!wide) {
    lanes.forEach((lane, index) => {
      const y = lane.top + 21.5;
      branches.push({ d: `M${n(x)} ${n(y)}H${n(lane.left)}`, lane: index, side: "in" });
      ports.push({ cx: lane.left + 0.5, cy: y, lane: index, side: "in" });
      dispatch.push(`M${n(x)} ${n(trunkTop)}V${n(y)}H${n(lane.left)}`);
      back.push(`M${n(lane.left)} ${n(y)}H${n(x)}V${n(trunkBottom)}`);
    });
    return { wide, trunk: `M${n(x)} ${n(trunkTop)}V${n(trunkBottom)}`, branches, ports, dispatch, back };
  }
  const laneTop = Math.min(...lanes.map(lane => lane.top));
  const topBus = laneTop - 19.5, botBus = summary.top - 19.5;
  const centres = lanes.map(lane => lane.left + lane.width / 2 + 0.5);
  const last = centres.length - 1, lastX = centres[last];
  // down the trunk, round the corner onto the top bus, along to the last lane's elbow; the merge bus mirrors it on the way back
  const trunk = `M${n(x)} ${n(trunkTop)}V${n(topBus - RADIUS)}Q${n(x)} ${n(topBus)} ${n(x + RADIUS)} ${n(topBus)}H${n(lastX - RADIUS)}`
    + `M${n(lastX - RADIUS)} ${n(botBus)}H${n(x + RADIUS)}Q${n(x)} ${n(botBus)} ${n(x)} ${n(botBus + RADIUS)}V${n(trunkBottom)}`;
  lanes.forEach((lane, index) => {
    const cx = centres[index], bottom = lane.top + lane.height;
    const lastLane = index === last;
    branches.push({ d: lastLane ? `M${n(cx - RADIUS)} ${n(topBus)}Q${n(cx)} ${n(topBus)} ${n(cx)} ${n(topBus + RADIUS)}V${n(lane.top)}` : `M${n(cx)} ${n(topBus)}V${n(lane.top)}`, lane: index, side: "in" });
    branches.push({ d: lastLane ? `M${n(cx)} ${n(bottom)}V${n(botBus - RADIUS)}Q${n(cx)} ${n(botBus)} ${n(cx - RADIUS)} ${n(botBus)}` : `M${n(cx)} ${n(bottom)}V${n(botBus)}`, lane: index, side: "out" });
    ports.push({ cx, cy: lane.top + 0.5, lane: index, side: "in" }, { cx, cy: bottom - 0.5, lane: index, side: "out" });
    const head = `M${n(x)} ${n(trunkTop)}V${n(topBus - RADIUS)}Q${n(x)} ${n(topBus)} ${n(x + RADIUS)} ${n(topBus)}`;
    dispatch.push(lastLane ? `${head}H${n(cx - RADIUS)}Q${n(cx)} ${n(topBus)} ${n(cx)} ${n(topBus + RADIUS)}V${n(lane.top)}` : `${head}H${n(cx)}V${n(lane.top)}`);
    const tail = `H${n(x + RADIUS)}Q${n(x)} ${n(botBus)} ${n(x)} ${n(botBus + RADIUS)}V${n(trunkBottom)}`;
    back.push(lastLane ? `M${n(cx)} ${n(bottom)}V${n(botBus - RADIUS)}Q${n(cx)} ${n(botBus)} ${n(cx - RADIUS)} ${n(botBus)}${tail}` : `M${n(cx)} ${n(bottom)}V${n(botBus)}${tail}`);
  });
  return { wide, trunk, branches, ports, dispatch, back };
}

/** The packet that runs a route: a dash of 18 px that travels the whole route (and a little past) in 460 ms on an in-out curve. */
export const PULSE = { duration: 460, easing: "cubic-bezier(.65,0,.35,1)", dash: 18 };

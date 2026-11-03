/**
 * Orchestrator, the parts that are not React: the sample run's script, a deterministic discrete-event simulation of a lead agent that plans, fans subtasks out to
 * worker lanes under a live concurrency limit and merges what returns, the reducer that turns its events into what the page shows, and the formatting.
 * Every duration and sentence comes from recordings of the public preview of UIArc's Agent orchestrator (docs/research/orchestrator/README.md). Pure, so node tests it.
 */

export type MarkName = "claude" | "gemini" | "openai";
export type ToolKind = "search" | "fetch" | "read" | "write";
export type LanePhase = "waiting" | "planned" | "queued" | "starting" | "working" | "approval" | "error" | "done" | "stopped";

export interface WorkerSpec { id: string; name: string; mark: MarkName; /** blended USD per million tokens (illustrative for non-Anthropic models, as in the preview) */ price: number }
export interface Step {
  tool: ToolKind;
  /** the verb the lane shows while it runs: "Web search", "Fetch page", "Read file", "Write findings" */
  label: string;
  target?: string;
  /** what the transcript says came back: "6 results", "Read 3,140 words" */
  detail?: string;
  ms: number;
  /** the streamed line of this step (it appears about 450 ms into the step) */
  line: string;
  /** a step that fails: after `ms` the lane shows the message, waits `retryMs`, and runs the step again as `retry` */
  fail?: { message: string; retryMs: number; retry: { ms: number; detail: string; line: string } };
}
export interface LaneScript {
  id: string; title: string; instruction: string; workerId: string;
  steps: Step[];
  /** cumulative tokens, `[ms after the lane starts working, tokens so far]` */
  usage: [number, number][];
  result: string;
}
export interface Scenario {
  goal: string;
  lead: { name: string; mark: MarkName; price: number };
  workers: WorkerSpec[];
  lanes: LaneScript[];
  summary: { chunks: string[]; bullets: string[]; lead: { planningTokens: number; summaryTokens: number } };
}

/** The preview's sample run. Company names, prices and pages are fictional there too. */
export const SAMPLE: Scenario = {
  goal: "Compare our pricing page with four competitors and suggest changes",
  lead: { name: "Claude Opus 5.5", mark: "claude", price: 5.5 },
  workers: [
    { id: "w1", name: "Claude Sonnet 5.5", mark: "claude", price: 2.52 },
    { id: "w2", name: "Claude Haiku 5.5", mark: "claude", price: 0.1 },
    { id: "w3", name: "Gemini 3.8 Flash", mark: "gemini", price: 0.41 },
    { id: "w4", name: "GPT-6 Luna", mark: "openai", price: 0.49 },
  ],
  lanes: [
    {
      id: "l1", title: "Notewise seat pricing", workerId: "w1", instruction: "Compare Notewise seat pricing and limits with our Team plan",
      steps: [
        { tool: "search", label: "Web search", target: "notewise pricing per seat 2026", detail: "6 results", ms: 1500, line: "The pricing page and a September changelog post are the top results" },
        { tool: "fetch", label: "Fetch page", target: "notewise.io/pricing", detail: "Read 3,140 words", ms: 2300, line: "Team is $10 per seat on yearly billing and includes unlimited guests" },
        { tool: "read", label: "Read file", target: "docs/pricing.md", detail: "Read 212 lines", ms: 1600, line: "Our Team plan is $12 per seat and caps guests at 5 per workspace" },
        { tool: "write", label: "Write findings", ms: 1900, line: "Notewise undercuts our Team plan by $2 per seat and adds unlimited guests" },
      ],
      usage: [[390, 1700], [1150, 2600], [1530, 3400], [2100, 7200], [2680, 11100], [3250, 14900], [3830, 20900], [4640, 23100], [5040, 25300], [5440, 27600], [5920, 28500], [6400, 29400], [6880, 30300], [7360, 31200]],
      result: "Notewise undercuts our Team plan by $2 per seat and adds unlimited guests.",
    },
    {
      id: "l2", title: "Paperlane free tier", workerId: "w2", instruction: "Check what the Paperlane free tier includes and caps",
      steps: [
        { tool: "fetch", label: "Fetch page", target: "paperlane.com/pricing", detail: "Read 2,260 words", ms: 1900, line: "The free plan allows 5 members, 2 GB of storage and 30 days of history" },
        { tool: "search", label: "Web search", target: "paperlane free plan limits", detail: "4 results", ms: 1500, line: "A help article confirms the free plan has no guest seats" },
        { tool: "read", label: "Read file", target: "docs/pricing.md", detail: "Read 212 lines", ms: 1300, line: "Our free plan stops at 3 members and 1 GB of storage" },
        { tool: "write", label: "Write findings", ms: 1600, line: "Paperlane fits 5 members on its free plan where ours stops at 3" },
      ],
      usage: [[480, 2500], [960, 4900], [1440, 7400], [1930, 10700], [2680, 11500], [3050, 12300], [3420, 13100], [3760, 14200], [4070, 16500], [4740, 17600], [5150, 18100], [5560, 18500], [5940, 19000], [6360, 19500]],
      result: "Paperlane fits 5 members on its free plan where ours stops at 3.",
    },
    {
      id: "l3", title: "Quillstack discounts", workerId: "w3", instruction: "Find the Quillstack annual discount and trial terms",
      steps: [
        { tool: "search", label: "Web search", target: "quillstack annual billing discount", detail: "5 results", ms: 1400, line: "The pricing page and a billing FAQ both cover yearly plans" },
        {
          tool: "fetch", label: "Fetch page", target: "quillstack.dev/pricing", ms: 1300, line: "Annual billing saves 20 percent and the trial runs for 14 days",
          fail: { message: "The page returned 503 Service Unavailable", retryMs: 2000, retry: { ms: 1700, detail: "Read 1,980 words", line: "Annual billing saves 20 percent and the trial runs for 14 days" } },
        },
        { tool: "write", label: "Write findings", ms: 1462, line: "Quillstack leads with a 20 percent yearly saving, and we never show ours" },
      ],
      usage: [[360, 1500], [980, 2300], [1410, 3100], [1840, 6300], [2260, 9500], [2690, 13200], [5120, 16400], [5550, 19600], [5980, 22800], [6400, 26000], [6780, 26700], [7150, 27500], [7540, 28200], [7910, 28900]],
      result: "Quillstack leads with a 20 percent yearly saving, and we never show ours.",
    },
    {
      id: "l4", title: "Driftboard add-ons", workerId: "w4", instruction: "Map the Driftboard business tier and its paid add-ons",
      steps: [
        { tool: "search", label: "Web search", target: "driftboard business plan sso", detail: "7 results", ms: 1400, line: "Found the pricing page and an add-ons comparison table" },
        { tool: "fetch", label: "Fetch page", target: "driftboard.app/pricing", detail: "Read 2,710 words", ms: 2100, line: "Business is $18 per seat, and SSO is a $4 add-on per seat" },
        { tool: "read", label: "Read file", target: "docs/pricing.md", detail: "Read 212 lines", ms: 1400, line: "We include SSO only on Enterprise, which has no public price" },
        { tool: "write", label: "Write findings", ms: 1700, line: "Driftboard sells SSO as a $4 add-on, while ours needs a sales call" },
      ],
      usage: [[360, 1600], [1070, 2400], [1420, 3200], [1940, 6600], [2470, 10000], [3000, 13300], [3540, 16700], [3890, 18000], [4190, 19400], [4590, 20700], [4940, 22100], [5380, 22700], [5800, 23400], [6230, 24100], [6670, 24700]],
      result: "Driftboard sells SSO as a $4 add-on, while ours needs a sales call.",
    },
  ],
  summary: {
    chunks: [
      "We charge more than ", "Notewise and Quillstack ", "for a smaller package, and ", "our free plan is ", "the tightest of the five. ", "Three changes would close the ", "gap:",
    ],
    bullets: [
      "Cut Team to $10 per seat on yearly billing to match Notewise.",
      "Raise the free plan from 3 to 5 members, as Paperlane does.",
      "Show the yearly saving on the page and sell SSO as a paid add-on.",
    ],
    lead: { planningTokens: 3200, summaryTokens: 12200 },
  },
};

/** Timings measured from the public preview (ms). */
export const TIMING = {
  /** the first plan item appears this long after Run, then one every `planStep` */
  planFirst: 410, planStep: 231, planReady: 1465,
  /** lanes are dispatched this far apart */
  dispatchStagger: 110,
  /** a packet crosses the connector in this long; the lane starts when it lands (cause before effect) */
  pulse: 460,
  /** a step's streamed line starts this long into the step */
  lineAfter: 450,
  /** a lane flips to "returned" this long after its last step */
  settle: 40,
  /** after the last lane returns, the lead says it is writing the summary this long after */
  mergeAfter: 608,
  /** one text chunk (a few words) every this long, each fading in over `chunkFade` */
  chunk: 36, chunkFade: 150,
  /** the summary has streamed and the status reads "Merged" this long after the merge started */
  finishAfterMerge: 587,
  /** the wall time the totals report runs a little past that: the lead's clock stops when its last word has settled */
  wallPad: 110,
  /** the totals row opens this long after the run ends */
  totalsAfter: 75,
};
export const CONCURRENCY = { min: 1, max: 4 };

// ---------------------------------------------------------------- events

export type SimEvent =
  | { at: number; type: "start" }
  | { at: number; type: "plan"; lane: number }
  | { at: number; type: "planReady" }
  | { at: number; type: "queued"; lane: number; place: number }
  | { at: number; type: "dispatch"; lane: number }
  | { at: number; type: "arrive"; lane: number }
  | { at: number; type: "step"; lane: number; step: number; attempt: number }
  | { at: number; type: "line"; lane: number; step: number; attempt: number }
  | { at: number; type: "usage"; lane: number; tokens: number }
  | { at: number; type: "fail"; lane: number; step: number; message: string; retryMs: number }
  | { at: number; type: "retry"; lane: number; step: number }
  | { at: number; type: "approval"; lane: number; step: number }
  | { at: number; type: "done"; lane: number; denied?: boolean }
  | { at: number; type: "return"; lane: number }
  | { at: number; type: "merge" }
  | { at: number; type: "summary"; chunk: number }
  | { at: number; type: "finish" }
  | { at: number; type: "totals" }
  /** Stop was pressed (the page, not the simulation, says so) */
  | { at: number; type: "stop" };

interface Task { at: number; order: number; lane?: number; run: (at: number) => void }

/**
 * A discrete-event simulation of one run. `advance(now)` returns every event up to `now`, in order; the concurrency limit can be changed at any time
 * (raising it releases queued lanes at once). No timers here: the page asks `nextAt()` and sleeps until then.
 */
export class RunSimulation {
  private tasks: Task[] = [];
  private order = 0;
  private events: SimEvent[] = [];
  private limit: number;
  private inFlight = 0;
  private waiting: number[] = [];
  private nextDispatchSlot = 0;
  private returned = 0;
  private planReadyDone = false;
  private stopped = false;
  private lastDone = 0;
  private approvals = false;
  private retryUntil = new Map<number, number>();
  private parked = new Map<number, { rel: number; run: (at: number) => void }[]>();

  readonly scenario: Scenario;

  constructor(scenario: Scenario = SAMPLE, concurrency = CONCURRENCY.max) {
    this.scenario = scenario;
    this.limit = clamp(concurrency);
    this.emit({ at: 0, type: "start" });
    scenario.lanes.forEach((_, lane) => this.at(TIMING.planFirst + TIMING.planStep * lane, at => this.emit({ at, type: "plan", lane })));
    this.at(TIMING.planReady, at => { this.planReadyDone = true; this.emit({ at, type: "planReady" }); this.waiting = scenario.lanes.map((_, lane) => lane); this.nextDispatchSlot = at; this.release(at); });
  }

  get concurrency() { return this.limit; }
  get running() { return this.inFlight; }
  get finished() { return this.stopped || this.tasks.length === 0; }

  setConcurrency(value: number, now: number) {
    this.limit = clamp(value);
    if (this.planReadyDone && !this.stopped) this.release(now);
  }
  stop(at: number) { this.stopped = true; this.tasks = []; this.waiting = []; this.parked.clear(); void at; }
  /** With approvals on, a lane waits before it writes its findings until `resolveApproval` is called. */
  setApprovals(on: boolean) { this.approvals = on; }
  /** Skips what is left of a failed lane's wait: everything that lane still has to do moves forward by what was left. Returns whether it did. */
  retryNow(lane: number, now: number): boolean {
    const until = this.retryUntil.get(lane);
    if (until === undefined || until <= now || this.stopped) return false;
    const delta = until - now;
    this.retryUntil.delete(lane);
    this.tasks.forEach(task => { if (task.lane === lane && task.at >= until - 1e-6) task.at -= delta; });
    this.tasks.sort((a, b) => a.at - b.at || a.order - b.order);
    return true;
  }
  pendingApprovals() { return [...this.parked.keys()]; }
  /** Allow lets the lane carry on from where it stopped; Deny ends it without writing: it returns what it has, as "gave up". */
  resolveApproval(lane: number, allow: boolean, now: number) {
    const parked = this.parked.get(lane);
    if (!parked || this.stopped) return;
    this.parked.delete(lane);
    if (allow) { for (const item of parked) this.at(now + item.rel, item.run, lane); return; }
    this.completeLane(lane, now, true);
  }
  nextAt(): number | null { return this.tasks.length ? this.tasks[0].at : null; }

  advance(now: number): SimEvent[] {
    while (this.tasks.length && this.tasks[0].at <= now) { const task = this.tasks.shift()!; task.run(task.at); }
    const out = this.events; this.events = []; return out;
  }
  /** Runs the whole simulation to its end on a virtual clock; for tests and the timeline's replay of a finished run. */
  runToEnd(): SimEvent[] {
    const all: SimEvent[] = [];
    let guard = 0;
    for (let next = this.nextAt(); next !== null && guard < 5000; next = this.nextAt(), guard += 1) all.push(...this.advance(next));
    all.push(...this.advance(Infinity));
    return all;
  }

  // ---- internals
  private at(at: number, run: (at: number) => void, lane?: number) {
    const task: Task = { at, order: (this.order += 1), lane, run: (when: number) => { if (!this.stopped) run(when); } };
    let index = this.tasks.length;
    while (index > 0 && (this.tasks[index - 1].at > at)) index -= 1;
    this.tasks.splice(index, 0, task);
  }
  private emit(event: SimEvent) { this.events.push(event); }

  /** Dispatches queued lanes while slots are free, one `dispatchStagger` after the one before; the rest show their place in line. */
  private release(now: number) {
    while (this.waiting.length && this.inFlight < this.limit) {
      const lane = this.waiting.shift()!;
      const at = Math.max(now, this.nextDispatchSlot);
      this.nextDispatchSlot = at + TIMING.dispatchStagger;
      this.inFlight += 1;
      this.at(at, when => this.dispatch(lane, when));
    }
    // the lanes that have to wait say so as the last free slot is taken (measured: 115 ms after the first dispatch at concurrency 2)
    if (this.waiting.length) this.at(Math.max(now, this.nextDispatchSlot - TIMING.dispatchStagger), when => this.waiting.forEach((lane, place) => this.emit({ at: when, type: "queued", lane, place })));
  }

  private dispatch(lane: number, at: number) {
    this.emit({ at, type: "dispatch", lane });
    this.at(at + TIMING.pulse, when => this.arrive(lane, when));
  }

  private arrive(lane: number, at: number) {
    const script = this.scenario.lanes[lane];
    this.emit({ at, type: "arrive", lane });
    let previous = 0;
    for (const [offset, total] of script.usage) { const delta = total - previous; previous = total; this.at(at + offset, when => this.emit({ at: when, type: "usage", lane, tokens: delta }), lane); }
    let cursor = at;
    script.steps.forEach((step, index) => {
      const begin = cursor;
      const start = (when: number) => this.emit({ at: when, type: "step", lane, step: index, attempt: 1 });
      if (step.tool === "write") this.at(begin, when => this.beforeWrite(lane, index, when, start), lane);
      else this.at(begin, start, lane);
      this.at(begin + TIMING.lineAfter, when => this.emit({ at: when, type: "line", lane, step: index, attempt: 1 }), lane);
      cursor = begin + step.ms;
      if (step.fail) {
        const failAt = cursor, fail = step.fail;
        this.at(failAt, when => { this.retryUntil.set(lane, when + fail.retryMs); this.emit({ at: when, type: "fail", lane, step: index, message: fail.message, retryMs: fail.retryMs }); }, lane);
        cursor = failAt + fail.retryMs;
        const retryAt = cursor;
        this.at(retryAt, when => { this.retryUntil.delete(lane); this.emit({ at: when, type: "retry", lane, step: index }); this.emit({ at: when, type: "step", lane, step: index, attempt: 2 }); }, lane);
        this.at(retryAt + TIMING.lineAfter, when => this.emit({ at: when, type: "line", lane, step: index, attempt: 2 }), lane);
        cursor = retryAt + fail.retry.ms;
      }
    });
    const stepsEnd = cursor;
    this.at(stepsEnd + TIMING.settle, when => this.finishLane(lane, when), lane);
  }

  /** The write step: with approvals on, everything the lane still has to do is parked until a person answers. */
  private beforeWrite(lane: number, step: number, at: number, start: (at: number) => void) {
    if (!this.approvals) { start(at); return; }
    const mine = this.tasks.filter(task => task.lane === lane);
    this.tasks = this.tasks.filter(task => task.lane !== lane);
    this.parked.set(lane, [{ rel: 0, run: start }, ...mine.map(task => ({ rel: task.at - at, run: task.run }))]);
    this.emit({ at, type: "approval", lane, step });
  }

  private finishLane(lane: number, at: number) { this.completeLane(lane, at, false); }

  private completeLane(lane: number, at: number, denied: boolean) {
    this.emit({ at, type: "done", lane, ...(denied ? { denied: true } : {}) });
    this.emit({ at: at + 5, type: "return", lane });
    this.returned += 1;
    this.inFlight -= 1;
    if (this.returned === this.scenario.lanes.length) this.at(at + TIMING.mergeAfter, when => this.merge(when));
    else this.release(at);
  }

  private merge(at: number) {
    this.emit({ at, type: "merge" });
    const chunks = this.scenario.summary.chunks.length + this.scenario.summary.bullets.length;
    for (let chunk = 0; chunk < chunks; chunk += 1) this.at(at + 12 + chunk * TIMING.chunk, when => this.emit({ at: when, type: "summary", chunk }));
    this.at(at + TIMING.finishAfterMerge, when => { this.emit({ at: when, type: "finish" }); this.at(when + TIMING.totalsAfter, then => this.emit({ at: then, type: "totals" })); });
  }
}

const clamp = (value: number) => Math.min(CONCURRENCY.max, Math.max(CONCURRENCY.min, Math.round(value)));

// ---------------------------------------------------------------- view state

export interface LogRow { id: string; tool: ToolKind | "retry" | "return"; title: string; target?: string; detail?: string; ms?: number; tone?: "danger" | "success" }
export interface LaneView {
  phase: LanePhase;
  title: string | null;
  /** 0 for the next in line, 1 for the second… while queued */
  place: number;
  /** how many of the script's steps have fully finished */
  stepsDone: number;
  /** what the lane is doing: the running step, or the failure */
  step: { index: number; attempt: number; tool: ToolKind; label: string; target?: string } | null;
  line: string;
  lineTone: "normal" | "muted" | "danger";
  lineKey: number;
  failure: string | null;
  retryAt: number | null;
  tokens: number;
  dispatchAt: number | null;
  doneAt: number | null;
  /** the lane's own time, dispatch to return, once it is done */
  ms: number | null;
  /** a person denied the lane's write: it returned what it had without saving */
  denied: boolean;
  toolCalls: number;
  log: LogRow[];
}
export interface RunView {
  status: "idle" | "planning" | "running" | "merging" | "done" | "stopped";
  plan: number;
  lanes: LaneView[];
  returned: number;
  summaryChunks: number;
  leadTokens: number;
  endedAt: number | null;
  totals: { tokens: number; cost: number; wall: number; sequential: number; speedup: number } | null;
  announce: string;
}

export const emptyLane = (): LaneView => ({ phase: "waiting", title: null, place: 0, stepsDone: 0, step: null, line: "", lineTone: "muted", lineKey: 0, failure: null, retryAt: null, tokens: 0, dispatchAt: null, doneAt: null, ms: null, denied: false, toolCalls: 0, log: [] });
export const emptyRun = (scenario: Scenario = SAMPLE): RunView => ({ status: "idle", plan: 0, lanes: scenario.lanes.map(emptyLane), returned: 0, summaryChunks: 0, leadTokens: 0, endedAt: null, totals: null, announce: "" });

const workerOf = (scenario: Scenario, lane: number) => scenario.workers.find(worker => worker.id === scenario.lanes[lane].workerId) ?? scenario.workers[lane];
export const ordinal = (n: number) => (n === 0 ? "next in line" : `${n + 1}${n + 1 === 2 ? "nd" : n + 1 === 3 ? "rd" : "th"} in line`);

/** What a lane's transcript shows for a finished step. */
function logFor(step: Step, index: number, attempt: number, failed: boolean, ms: number): LogRow {
  return { id: `${index}.${attempt}`, tool: step.tool, title: failed ? `${step.label} failed` : step.label, target: step.target, detail: failed ? step.fail?.message : attempt === 2 ? step.fail?.retry.detail : step.detail, ms, tone: failed ? "danger" : undefined };
}

/** The page's state after one more event. A new object only where something changed, so lanes that did not change do not re-render. */
export function applyEvent(view: RunView, event: SimEvent, scenario: Scenario = SAMPLE): RunView {
  const withLane = (lane: number, patch: Partial<LaneView>): RunView => ({ ...view, lanes: view.lanes.map((item, index) => (index === lane ? { ...item, ...patch } : item)) });
  switch (event.type) {
    case "start": return { ...emptyRun(scenario), status: "planning", announce: "Planning. This is a simulated run; nothing is sent." };
    case "plan": return { ...withLane(event.lane, { phase: "planned", title: scenario.lanes[event.lane].title, line: scenario.lanes[event.lane].instruction, lineTone: "muted", lineKey: view.lanes[event.lane].lineKey + 1 }), plan: view.plan + 1, leadTokens: view.leadTokens + Math.round(scenario.summary.lead.planningTokens / scenario.lanes.length) };
    case "planReady": return { ...view, status: "running", announce: `Plan ready. Dispatching ${scenario.lanes.length} subtasks.` };
    case "queued": return view.lanes[event.lane].phase === "planned" || view.lanes[event.lane].phase === "queued" ? withLane(event.lane, { phase: "queued", place: event.place }) : view;
    case "dispatch": return withLane(event.lane, { phase: "starting", dispatchAt: event.at, step: null });
    case "arrive": return withLane(event.lane, { phase: "working" });
    case "approval": return { ...withLane(event.lane, { phase: "approval", stepsDone: event.step, step: null, line: "Wants to write its findings", lineTone: "muted", lineKey: view.lanes[event.lane].lineKey + 1 }), announce: `${workerOf(scenario, event.lane).name} is waiting for approval to write.` };
    case "step": {
      const script = scenario.lanes[event.lane], step = script.steps[event.step];
      const next = withLane(event.lane, { phase: "working", stepsDone: event.step, step: { index: event.step, attempt: event.attempt, tool: step.tool, label: event.attempt === 2 ? `${step.label}, attempt 2` : step.label, target: step.target }, failure: null, retryAt: null, toolCalls: view.lanes[event.lane].toolCalls + 1 });
      return next;
    }
    case "line": {
      const script = scenario.lanes[event.lane], step = script.steps[event.step];
      const lane = view.lanes[event.lane];
      if (lane.phase === "error" || lane.phase === "done") return view;
      return withLane(event.lane, { line: event.attempt === 2 && step.fail ? step.fail.retry.line : step.line, lineTone: "normal", lineKey: lane.lineKey + 1 });
    }
    case "usage": {
      const lane = view.lanes[event.lane];
      if (lane.phase === "done") return view;
      return withLane(event.lane, { tokens: lane.tokens + event.tokens });
    }
    case "fail": {
      const lane = view.lanes[event.lane];
      return { ...withLane(event.lane, { phase: "error", failure: event.message, retryAt: event.at + event.retryMs, line: event.message, lineTone: "danger", lineKey: lane.lineKey + 1 }), announce: `${workerOf(scenario, event.lane).name} hit an error: ${event.message}. Retrying.` };
    }
    case "retry": {
      return { ...withLane(event.lane, { phase: "working", failure: null, retryAt: null }), announce: `${workerOf(scenario, event.lane).name} is retrying` };
    }
    case "done": {
      const script = scenario.lanes[event.lane], lane = view.lanes[event.lane];
      const denied = event.denied === true;
      // the transcript in script order: a failed step is logged, then the retry marker, then the step that worked; the return closes it
      const log: LogRow[] = [];
      for (const [index, step] of script.steps.entries()) {
        if (denied && step.tool === "write") { log.push({ id: `${index}.denied`, tool: "write", title: "Write findings denied", detail: "A person said no, so nothing was saved", tone: "danger" }); break; }
        if (step.fail) log.push(logFor(step, index, 1, true, step.ms), { id: `${index}.retry`, tool: "retry", title: "Retried", detail: "Attempt 2" }, logFor(step, index, 2, false, step.fail.retry.ms));
        else log.push(logFor(step, index, 1, false, step.ms));
      }
      const result = denied ? "Findings not saved: the write was denied." : script.result;
      log.push({ id: "return", tool: "return", title: "Returned to the lead", detail: result, tone: denied ? undefined : "success" });
      const returned = view.returned + 1;
      return { ...withLane(event.lane, { phase: "done", denied, step: null, line: result, lineTone: denied ? "muted" : "normal", lineKey: lane.lineKey + 1, doneAt: event.at, ms: event.at - (lane.dispatchAt ?? 0), tokens: denied ? lane.tokens : script.usage.at(-1)?.[1] ?? lane.tokens, log }), returned, announce: `${workerOf(scenario, event.lane).name} returned. ${returned} of ${scenario.lanes.length} done.` };
    }
    case "return": return view;
    case "merge": return { ...view, status: "merging", announce: "Every subagent returned. Writing the summary.", leadTokens: view.leadTokens };
    case "summary": return { ...view, summaryChunks: event.chunk + 1 };
    case "finish": {
      const leadTokens = view.leadTokens + scenario.summary.lead.summaryTokens;
      const tokens = view.lanes.reduce((sum, lane) => sum + lane.tokens, 0) + leadTokens;
      const cost = view.lanes.reduce((sum, lane, index) => sum + laneCost(scenario, index, lane.tokens), 0) + (leadTokens * scenario.lead.price) / 1e6;
      // the sequential estimate: the wall time minus the parallel stretch, plus every lane's own time from dispatch to return
      const dispatches = view.lanes.map(lane => lane.dispatchAt ?? 0), returns = view.lanes.map(lane => lane.doneAt ?? 0);
      const stretch = Math.max(...returns) - Math.min(...dispatches);
      const wall = event.at + TIMING.wallPad;
      const sequential = wall - stretch + view.lanes.reduce((sum, lane) => sum + (lane.ms ?? 0), 0);
      return { ...view, status: "done", endedAt: event.at, leadTokens, totals: { tokens, cost, wall, sequential, speedup: sequential / wall }, announce: `Done. ${formatTokens(tokens)} tokens, ${formatCost(cost, 2)}, ${formatSeconds(wall)}.` };
    }
    case "totals": return view;
    case "stop": return { ...view, status: "stopped", endedAt: event.at, lanes: view.lanes.map(lane => (lane.phase === "done" ? lane : { ...lane, phase: lane.phase === "waiting" ? lane.phase : "stopped", step: null, failure: null, retryAt: null })), announce: "Stopped." };
  }
}

/** A lane's transcript while it runs: what finished, in script order, then the step in progress (a failed one stays as a failure, the retry follows it). */
export function liveLog(scenario: Scenario, laneIndex: number, lane: LaneView): LogRow[] {
  if (lane.phase === "done") return lane.log;
  const script = scenario.lanes[laneIndex];
  const rows: LogRow[] = [];
  const running = (step: Step, index: number, attempt: number): LogRow => ({ id: `${index}.${attempt}`, tool: step.tool, title: step.label, target: step.target });
  const retried = (step: Step, index: number): LogRow[] => [logFor(step, index, 1, true, step.ms), { id: `${index}.retry`, tool: "retry", title: "Retried", detail: "Attempt 2" }];
  for (let index = 0; index < lane.stepsDone && index < script.steps.length; index += 1) {
    const step = script.steps[index];
    if (step.fail) rows.push(...retried(step, index), logFor(step, index, 2, false, step.fail.retry.ms));
    else rows.push(logFor(step, index, 1, false, step.ms));
  }
  const current = lane.step;
  if (current) {
    const step = script.steps[current.index];
    if (step.fail && current.attempt === 1) rows.push(lane.phase === "error" ? logFor(step, current.index, 1, true, step.ms) : running(step, current.index, 1));
    else if (step.fail) rows.push(...retried(step, current.index), running(step, current.index, 2));
    else rows.push(running(step, current.index, 1));
  }
  return rows;
}

// ---------------------------------------------------------------- formatting (tabular digits in the page)

export const formatSeconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
export const formatTokens = (n: number) => (n >= 1000 ? `${(Math.round(n / 100) / 10).toFixed(1)}k` : `${Math.round(n)}`);
export const formatCost = (usd: number, digits = 3) => `$${usd.toFixed(digits)}`;
/** 640ms or 1.2s, like the tool call row. */
export const formatDuration = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`);
export const workerName = (scenario: Scenario, lane: number) => workerOf(scenario, lane).name;
export const workerMark = (scenario: Scenario, lane: number) => workerOf(scenario, lane).mark;
export const workerPrice = (scenario: Scenario, lane: number) => workerOf(scenario, lane).price;
export const laneCost = (scenario: Scenario, lane: number, tokens: number) => (tokens * workerOf(scenario, lane).price) / 1e6;

/** How many lanes sit side by side: up to four above 720px of card width, stacked below. */
export const SIDE_BY_SIDE_MIN = 720;
export const sideBySide = (cardWidth: number, lanes: number) => cardWidth >= SIDE_BY_SIDE_MIN && lanes >= 2 && lanes <= 4;

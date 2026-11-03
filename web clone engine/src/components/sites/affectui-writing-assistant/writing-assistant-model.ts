/**
 * Pure logic of the Writing Assistant chat card: copy, timings, the sample writer and the message reducer.
 * Nothing here touches the DOM, so it is unit-tested directly (writing-assistant-model.test.mjs).
 *
 * Timings were measured on the public preview (docs/research/writing-assistant/README.md): a reply shows a shimmering
 * "Writing…" line for about 700ms, then streams one word every ~38ms; a simulated dictation take shows its first word
 * after ~260ms and one word every ~170ms.
 */

export type WritingAssistantContent = {
  name: string;
  tagline: string;
  greeting: string;
  placeholder: string;
  suggestions: readonly string[];
  /** The sentence a simulated dictation take speaks. */
  dictation: string;
};

export const defaultContent: WritingAssistantContent = {
  name: "Quill",
  tagline: "Your writing companion.",
  greeting: "What should we write?",
  placeholder: "Ask anything…",
  suggestions: ["Polish my email", "Make it shorter", "Fix the tone", "Draft a reply"],
  dictation: "Write a friendly reminder that the report is due on Friday",
};

export const timing = {
  /** How long "Writing…" shows before the first word. */
  writingMs: 700,
  /** Gap between streamed words. */
  wordMs: 38,
  /** A long reply never takes more than this to stream. */
  streamCapMs: 5000,
  dictationFirstMs: 260,
  dictationWordMs: 170,
  /** After the last dictated word the mic rests, then the sentence is sent. */
  dictationRestMs: 670,
  dictationSendMs: 454,
} as const;

/** What a caller supplies to answer a message; it may be async and may be cancelled through `signal`. */
export type Respond = (message: string, options: { signal: AbortSignal }) => string | Promise<string>;

/** Rules of the built-in sample writer, tried in order. Replace the whole thing with the `respond` prop. */
const sampleRules: readonly { test: RegExp; reply: string }[] = [
  { test: /remind|nudge/i, reply: "Hi team, just a friendly nudge: the report is due this Friday. If anything is holding you up, let me know today and we'll sort it out together. Thanks!" },
  { test: /short|tighten|trim|condense/i, reply: "Here's a tighter version: “Thanks for the quick turnaround – the new draft reads much better. Let's ship it Friday.”" },
  { test: /tone|soften|polite|formal/i, reply: "I softened the opening and swapped the direct ask for a question, so it sounds friendly but still clear about the deadline." },
  { test: /\breply\b/i, reply: "Hi Sam, thanks for the update! Thursday works for me – I'll bring the revised numbers so we can decide on the spot." },
  { test: /polish|proofread|email|typo|fix/i, reply: "I fixed two typos, split the long second paragraph and moved your main ask to the first line, so it's the first thing they read." },
];
const sampleFallback = "Got it. Here's a first draft – tell me if it should sound more formal, shorter or more playful, and I'll adjust it.";

export function sampleWriter(message: string): string {
  return sampleRules.find(rule => rule.test.test(message))?.reply ?? sampleFallback;
}

/** Words with their trailing whitespace, so revealing n tokens never changes how earlier text wraps. */
export function tokenize(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

/** Interval between streamed words, shortened for long replies so they stay within the cap. */
export function wordInterval(words: number): number {
  return words <= 0 ? timing.wordMs : Math.min(timing.wordMs, timing.streamCapMs / words);
}

export type UserMessage = { id: number; role: "user"; text: string };
export type AssistantMessage = {
  id: number;
  role: "assistant";
  status: "writing" | "streaming" | "done" | "error";
  tokens: readonly string[];
  shown: number;
};
export type ChatMessage = UserMessage | AssistantMessage;
export type ChatState = { messages: readonly ChatMessage[]; nextId: number };

export type ChatAction =
  | { type: "send"; text: string }
  /** The reply arrived; its first word shows at once. With `instant` the whole reply shows. */
  | { type: "reply"; text: string; instant?: boolean }
  | { type: "reveal"; count: number }
  | { type: "fail" }
  | { type: "reset" };

export const emptyChat: ChatState = { messages: [], nextId: 1 };

export function isBusy(state: ChatState): boolean {
  const last = state.messages[state.messages.length - 1];
  return !!last && last.role === "assistant" && (last.status === "writing" || last.status === "streaming");
}

export function visibleText(message: AssistantMessage): string {
  return message.tokens.slice(0, message.shown).join("");
}

function updateLast(state: ChatState, change: (last: AssistantMessage) => AssistantMessage): ChatState {
  const last = state.messages[state.messages.length - 1];
  if (!last || last.role !== "assistant") return state;
  const next = change(last);
  return next === last ? state : { ...state, messages: [...state.messages.slice(0, -1), next] };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "send": {
      const text = action.text.trim();
      if (!text || isBusy(state)) return state;
      return {
        messages: [
          ...state.messages,
          { id: state.nextId, role: "user", text },
          { id: state.nextId + 1, role: "assistant", status: "writing", tokens: [], shown: 0 },
        ],
        nextId: state.nextId + 2,
      };
    }
    case "reply":
      return updateLast(state, last => {
        if (last.status !== "writing") return last;
        const tokens = tokenize(action.text);
        if (!tokens.length) return { ...last, status: "done", tokens: [], shown: 0 };
        const shown = action.instant ? tokens.length : 1;
        return { ...last, status: shown >= tokens.length ? "done" : "streaming", tokens, shown };
      });
    case "reveal":
      return updateLast(state, last => {
        if (last.status !== "streaming") return last;
        const shown = Math.min(last.tokens.length, Math.max(last.shown, action.count));
        return { ...last, shown, status: shown >= last.tokens.length ? "done" : "streaming" };
      });
    case "fail":
      return updateLast(state, last => (last.status === "writing" || last.status === "streaming" ? { ...last, status: "error" } : last));
    case "reset":
      return emptyChat;
  }
}

/** The dictated words shown after `count` of them have been "heard". */
export function dictatedText(sentence: string, count: number): string {
  return sentence.split(/\s+/).filter(Boolean).slice(0, Math.max(0, count)).join(" ");
}

export function dictationWordCount(sentence: string): number {
  return sentence.split(/\s+/).filter(Boolean).length;
}

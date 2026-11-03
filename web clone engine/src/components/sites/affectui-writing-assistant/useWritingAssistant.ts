"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  chatReducer, dictatedText, dictationWordCount, emptyChat, isBusy, timing, tokenize, wordInterval,
  type ChatState, type Respond,
} from "./writing-assistant-model";

/** How dictation gets its words: the browser's speech recognition when present, else a short sample take. */
export type SpeechMode = "auto" | "simulate";

interface RecognitionResultLike { 0: { transcript: string } }
interface RecognitionEventLike { results: ArrayLike<RecognitionResultLike> }
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => RecognitionLike;

function recognitionConstructor(): RecognitionConstructor | null {
  const host = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const NOTICE_MS = 3200;

type Options = { respond: Respond; speech: SpeechMode; dictation: string };

/**
 * State machine of the chat card: sending, the Writing… beat, word-by-word streaming, and dictation. All timers and
 * the in-flight request are owned here and cancelled on New chat and unmount, so nothing runs after the card is gone.
 */
export function useWritingAssistant({ respond, speech, dictation }: Options) {
  const [chat, dispatch] = useReducer(chatReducer, emptyChat as ChatState);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState("");

  const busyRef = useRef(false);
  const listeningRef = useRef(false);
  const request = useRef<AbortController | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const dictationTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const heard = useRef(0);
  const recognition = useRef<RecognitionLike | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ respond, dictation });
  useEffect(() => { latest.current = { respond, dictation }; });

  const later = useCallback((bucket: typeof timers, run: () => void, ms: number) => {
    const id = setTimeout(() => { bucket.current.delete(id); run(); }, ms);
    bucket.current.add(id);
  }, []);
  const clearBucket = (bucket: typeof timers) => { bucket.current.forEach(clearTimeout); bucket.current.clear(); };

  const stopListening = useCallback(() => {
    clearBucket(dictationTimers);
    const live = recognition.current;
    recognition.current = null;
    if (live) { live.onresult = live.onerror = live.onend = null; try { live.abort(); } catch { /* already stopped */ } }
    listeningRef.current = false;
    setListening(false);
  }, []);

  const flash = useCallback((message: string) => {
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(""), NOTICE_MS);
  }, []);

  const stream = useCallback((reply: string) => {
    const tokens = tokenize(reply);
    if (tokens.length <= 1 || reducedMotion()) {
      dispatch({ type: "reply", text: reply, instant: true });
      busyRef.current = false;
      return;
    }
    dispatch({ type: "reply", text: reply });
    const interval = wordInterval(tokens.length);
    let count = 1;
    const tick = () => {
      count += 1;
      dispatch({ type: "reveal", count });
      if (count >= tokens.length) { busyRef.current = false; return; }
      later(timers, tick, interval);
    };
    later(timers, tick, interval);
  }, [later]);

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text || busyRef.current) return false;
    stopListening();
    busyRef.current = true;
    dispatch({ type: "send", text });
    setDraft("");
    setNotice("");
    const controller = new AbortController();
    request.current = controller;
    const beat = new Promise<void>(resolve => later(timers, resolve, timing.writingMs));
    const answer = Promise.resolve().then(() => latest.current.respond(text, { signal: controller.signal }));
    Promise.all([answer, beat]).then(([reply]) => {
      if (!controller.signal.aborted) stream(reply);
    }).catch(() => {
      if (controller.signal.aborted) return;
      busyRef.current = false;
      dispatch({ type: "fail" });
    });
    return true;
  }, [later, stopListening, stream]);

  const startSimulated = useCallback(() => {
    const sentence = latest.current.dictation;
    const total = dictationWordCount(sentence);
    heard.current = 0;
    const step = (delay: number) => later(dictationTimers, () => {
      heard.current += 1;
      setDraft(dictatedText(sentence, heard.current));
      if (heard.current < total) { step(timing.dictationWordMs); return; }
      later(dictationTimers, () => {
        listeningRef.current = false;
        setListening(false);
        later(dictationTimers, () => send(dictatedText(sentence, total)), timing.dictationSendMs);
      }, timing.dictationRestMs);
    }, delay);
    if (total === 0) { listeningRef.current = false; setListening(false); return; }
    step(timing.dictationFirstMs);
  }, [later, send]);

  const startRecognized = useCallback((Recognition: RecognitionConstructor) => {
    const engine = new Recognition();
    engine.lang = document.documentElement.lang || navigator.language || "en-US";
    engine.interimResults = true;
    engine.continuous = false;
    let transcript = "";
    engine.onresult = event => {
      transcript = Array.from(event.results, result => result[0].transcript).join(" ").replace(/\s+/g, " ").trim();
      setDraft(transcript);
    };
    engine.onerror = event => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      transcript = "";
      setDraft("");
      flash("Microphone unavailable");
    };
    engine.onend = () => {
      recognition.current = null;
      listeningRef.current = false;
      setListening(false);
      if (transcript) later(dictationTimers, () => send(transcript), timing.dictationSendMs);
    };
    recognition.current = engine;
    try { engine.start(); } catch { stopListening(); flash("Microphone unavailable"); }
  }, [flash, later, send, stopListening]);

  const startDictation = useCallback(() => {
    if (busyRef.current || listeningRef.current) return;
    clearBucket(dictationTimers);
    listeningRef.current = true;
    setListening(true);
    setDraft("");
    setNotice("");
    const Recognition = speech === "auto" ? recognitionConstructor() : null;
    if (Recognition) startRecognized(Recognition); else startSimulated();
  }, [speech, startRecognized, startSimulated]);

  /** Stop speaking: whatever was heard becomes the message; nothing heard sends nothing. */
  const stopDictation = useCallback(() => {
    if (!listeningRef.current) return;
    const live = recognition.current;
    if (live) { live.stop(); return; }
    const text = dictatedText(latest.current.dictation, heard.current);
    stopListening();
    if (text) send(text); else setDraft("");
  }, [send, stopListening]);

  const reset = useCallback(() => {
    request.current?.abort();
    request.current = null;
    clearBucket(timers);
    stopListening();
    busyRef.current = false;
    dispatch({ type: "reset" });
    setDraft("");
    setNotice("");
  }, [stopListening]);

  useEffect(() => {
    const pending = [timers.current, dictationTimers.current];
    return () => {
      request.current?.abort();
      pending.forEach(bucket => { bucket.forEach(clearTimeout); bucket.clear(); });
      clearTimeout(noticeTimer.current);
      const live = recognition.current;
      if (live) { live.onresult = live.onerror = live.onend = null; try { live.abort(); } catch { /* already stopped */ } }
    };
  }, []);

  return { chat, draft, setDraft, listening, notice, busy: isBusy(chat), send, reset, startDictation, stopDictation };
}

/** Browser speech recognition helpers (Web Speech API — no model download). */

export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

export type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: { transcript: string; confidence: number };
    };
  };
};

export type SpeechRecognitionErrorEventLike = {
  error: string;
  message?: string;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function createSpeechRecognition(): SpeechRecognitionLike | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;
  return new Ctor();
}

/** Join dictation chunk onto existing text with sensible spacing. */
export function appendDictation(existing: string, chunk: string): string {
  const piece = chunk.trim();
  if (!piece) return existing;
  if (!existing) return piece;
  const needsSpace = !/[\s\n]$/.test(existing) && !/^[.,!?;:]/.test(piece);
  return existing + (needsSpace ? " " : "") + piece;
}

export function speechErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission denied. Allow mic access for this site.";
    case "no-speech":
      return "No speech heard — try again a bit closer to the mic.";
    case "audio-capture":
      return "No microphone found on this device.";
    case "network":
      return "Speech service unavailable (network). Check connection and try again.";
    case "aborted":
      return "";
    default:
      return "Voice input stopped. You can try again.";
  }
}

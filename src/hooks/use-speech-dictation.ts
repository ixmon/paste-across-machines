import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendDictation,
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  speechErrorMessage,
  type SpeechRecognitionLike,
} from "@/lib/speech";

type UseSpeechDictationOptions = {
  /** Called with the new full text when a final phrase is recognized. */
  onFinal: (nextText: string) => void;
  /** Read latest editor text when committing a final phrase. */
  getText: () => string;
  lang?: string;
};

/**
 * Safari / WebKit usually does not stream interimResults (Chrome does).
 * We surface interim when available, otherwise the last committed phrase
 * so the toolbar always shows feedback while the mic is open.
 */
export function useSpeechDictation({ onFinal, getText, lang }: UseSpeechDictationOptions) {
  const [supported] = useState(() =>
    typeof window === "undefined" ? false : isSpeechRecognitionSupported(),
  );
  const [listening, setListening] = useState(false);
  /** Live partial text (Chrome/Edge). Empty on Safari. */
  const [interim, setInterim] = useState("");
  /** Last finalized phrase — Safari’s main feedback channel. */
  const [lastHeard, setLastHeard] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListen = useRef(false);
  const committedEnd = useRef(0);
  const onFinalRef = useRef(onFinal);
  const getTextRef = useRef(getText);
  onFinalRef.current = onFinal;
  getTextRef.current = getText;

  const stop = useCallback(() => {
    wantListen.current = false;
    setInterim("");
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    setError(null);
    setLastHeard("");
    setInterim("");
    committedEnd.current = 0;

    if (!supported) {
      setError("Voice input isn’t supported in this browser. Try Chrome, Edge, or Safari.");
      return;
    }

    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }

    const rec = createSpeechRecognition();
    if (!rec) {
      setError("Voice input isn’t supported in this browser. Try Chrome, Edge, or Safari.");
      return;
    }

    // continuous + interim: Chrome streams partials; Safari ignores interim but
    // still returns finals (often one phrase at a time).
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = lang || (typeof navigator !== "undefined" ? navigator.language : "en-US") || "en-US";

    rec.onstart = () => {
      setListening(true);
      setError(null);
    };

    rec.onresult = (event) => {
      // Walk the full result list: Safari sometimes resets indices oddly;
      // skip finals we already committed via committedEnd.
      let interimBuf = "";
      let newFinal = "";

      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = (result[0]?.transcript ?? "").trim();
        if (!text) continue;

        if (result.isFinal) {
          if (i >= committedEnd.current) {
            newFinal = newFinal ? `${newFinal} ${text}` : text;
            committedEnd.current = i + 1;
          }
        } else {
          interimBuf = interimBuf ? `${interimBuf} ${text}` : text;
        }
      }

      if (interimBuf) {
        setInterim(interimBuf);
      } else {
        setInterim("");
      }

      if (newFinal) {
        const next = appendDictation(getTextRef.current(), newFinal);
        onFinalRef.current(next);
        setLastHeard(newFinal);
        // Keep lastHeard visible; clear only when a new interim arrives or stop.
      }
    };

    rec.onerror = (event) => {
      const msg = speechErrorMessage(event.error);
      if (msg) setError(msg);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        wantListen.current = false;
        setListening(false);
      }
    };

    rec.onend = () => {
      // Engines (Chrome + Safari) often end mid-session; restart while armed.
      if (wantListen.current) {
        try {
          // Safari: result list resets on restart — allow new finals.
          committedEnd.current = 0;
          rec.start();
          return;
        } catch {
          /* fall through */
        }
      }
      setListening(false);
      setInterim("");
    };

    recRef.current = rec;
    wantListen.current = true;
    try {
      rec.start();
    } catch {
      wantListen.current = false;
      setListening(false);
      setError("Could not start the microphone. Check permissions and try again.");
    }
  }, [lang, supported]);

  const toggle = useCallback(() => {
    if (listening || wantListen.current) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => {
    return () => {
      wantListen.current = false;
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  /** Best available toolbar caption while the mic is open. */
  const preview = interim || lastHeard;

  return {
    supported,
    listening,
    interim,
    lastHeard,
    /** Prefer live interim; fall back to last finalized phrase (Safari). */
    preview,
    error,
    start,
    stop,
    toggle,
  };
}

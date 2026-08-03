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

export function useSpeechDictation({ onFinal, getText, lang }: UseSpeechDictationOptions) {
  const [supported] = useState(() =>
    typeof window === "undefined" ? false : isSpeechRecognitionSupported(),
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListen = useRef(false);
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
    if (!supported) {
      setError("Voice input isn’t supported in this browser. Try Chrome or Edge.");
      return;
    }

    // Recreate each session — some engines get stuck after stop.
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }

    const rec = createSpeechRecognition();
    if (!rec) {
      setError("Voice input isn’t supported in this browser. Try Chrome or Edge.");
      return;
    }

    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = lang || (typeof navigator !== "undefined" ? navigator.language : "en-US") || "en-US";

    rec.onstart = () => {
      setListening(true);
      setError(null);
    };

    rec.onresult = (event) => {
      let interimBuf = "";
      let finalBuf = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalBuf += text;
        else interimBuf += text;
      }
      setInterim(interimBuf.trim());
      if (finalBuf.trim()) {
        const next = appendDictation(getTextRef.current(), finalBuf);
        onFinalRef.current(next);
        setInterim("");
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
      // Chrome ends periodically in continuous mode — restart if user still wants it.
      if (wantListen.current) {
        try {
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

  return {
    supported,
    listening,
    interim,
    error,
    start,
    stop,
    toggle,
  };
}

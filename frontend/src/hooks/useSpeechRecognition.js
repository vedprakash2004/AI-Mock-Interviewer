import { useRef, useState, useCallback } from "react";

const SILENCE_TIMEOUT_MS = 5000; // 5s of silence → auto-stop

export function useSpeechRecognition({ onTranscript, onAutoStop }) {
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState("");

  const supported = "webkitSpeechRecognition" in window || "SpeechRecognition" in window;

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      stopListening();
      if (onAutoStop) onAutoStop();
    }, SILENCE_TIMEOUT_MS);
  }, [onAutoStop]);

  const startListening = useCallback(() => {
    if (!supported) {
      setError("Speech recognition not supported in this browser.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalTranscript = "";

    recognition.onstart = () => {
      setIsListening(true);
      setError("");
      resetSilenceTimer();
    };

    recognition.onresult = (e) => {
      resetSilenceTimer();
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalTranscript += t + " ";
        } else {
          interim += t;
        }
      }
      if (onTranscript) onTranscript(finalTranscript + interim, finalTranscript);
    };

    recognition.onerror = (e) => {
      if (e.error !== "no-speech") setError(`Speech error: ${e.error}`);
      setIsListening(false);
      clearSilenceTimer();
    };

    recognition.onend = () => {
      setIsListening(false);
      clearSilenceTimer();
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [supported, onTranscript, resetSilenceTimer]);

  const stopListening = useCallback(() => {
    clearSilenceTimer();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  return { isListening, startListening, stopListening, supported, error };
}

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { submitAnswer } from "../services/api";
import Editor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, Send, Code, FileText, AlertCircle, Loader2,
  ShieldAlert, Volume2, VolumeX, Timer, Eye, EyeOff,
  ChevronRight, Clock, Lightbulb
} from "lucide-react";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useCameraGuard } from "../hooks/useCameraGuard";
import { stopAllMediaTracks } from "../utils/mediaCleanup";

const languageFromTopic = (topic = "") => {
  const t = topic.toLowerCase();
  if (t.includes("python")) return "python";
  if (t.includes("java") && !t.includes("javascript")) return "java";
  if (t.includes("c++")) return "cpp";
  if (t.includes("javascript")) return "javascript";
  if (t.includes("sql")) return "sql";
  if (t.includes("node")) return "javascript";
  if (t.includes("flask") || t.includes("django")) return "python";
  return "plaintext";
};

const TOTAL_QUESTIONS = 5;
const QUESTION_TIME_LIMIT_SEC = 3 * 60;

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export default function Interview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [question, setQuestion] = useState("");
  const [textAnswer, setTextAnswer] = useState("");
  const [codeAnswer, setCodeAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("answer");

  const textAnswerRef = useRef("");
  const codeAnswerRef = useRef("");
  const activeTabRef = useRef("answer");
  useEffect(() => { textAnswerRef.current = textAnswer; }, [textAnswer]);
  useEffect(() => { codeAnswerRef.current = codeAnswer; }, [codeAnswer]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_LIMIT_SEC);
  const timerIntervalRef = useRef(null);
  const [showWarningToast, setShowWarningToast] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(true);

  const topic = sessionStorage.getItem("topic") || "";
  const language = sessionStorage.getItem("editor_language") || useMemo(() => languageFromTopic(topic), [topic]);

  const {
    videoRef, canvasRef, cameraActive, lookAwayCount, flagged,
    cameraError, startCamera, stopCamera
  } = useCameraGuard();

  // Toast on look-away
  useEffect(() => {
    if (lookAwayCount > 0) {
      setShowWarningToast(true);
      const t = setTimeout(() => setShowWarningToast(false), 4000);
      return () => clearTimeout(t);
    }
  }, [lookAwayCount]);

  const handleTranscript = useCallback((liveText) => {
    setTextAnswer(liveText);
  }, []);

  const submitRef = useRef(null);

  const handleAutoStop = useCallback(() => {
    submitRef.current?.(false);
  }, []);

  const { isListening, startListening, stopListening, supported: srSupported } =
    useSpeechRecognition({ onTranscript: handleTranscript, onAutoStop: handleAutoStop });

  const speakQuestion = useCallback((text) => {
    if (!ttsEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled]);

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const handleTimeUp = useCallback(() => {
    submitRef.current?.(true);
  }, []);

  const resetTimer = useCallback(() => {
    setTimeLeft(QUESTION_TIME_LIMIT_SEC);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [handleTimeUp]);

  useEffect(() => () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
  }, []);

  // Camera: start on mount, stop on unmount (kills stream so indicator goes off)
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      stopAllMediaTracks(); // Nuclear cleanup — kills everything
    };
  }, [startCamera, stopCamera]);

  // Load first question
  useEffect(() => {
    const q = sessionStorage.getItem("current_question");
    if (!q) { setError("Interview session expired. Please restart."); return; }
    setQuestion(q);
    setQuestionIndex(0);
    speakQuestion(q);
    resetTimer();
    return () => window.speechSynthesis.cancel();
  }, [speakQuestion, resetTimer]);

  const handleSubmit = async (isTimeout = false) => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (isListening) stopListening();
    stopSpeaking();

    const currentText = textAnswerRef.current;
    const currentCode = codeAnswerRef.current;
    const currentTab = activeTabRef.current;
    const activeAnswer = currentTab === "code" ? currentCode : currentText;

    if (!activeAnswer?.trim()) {
      if (isTimeout !== true) { setError("Please provide an answer before submitting."); return; }
    }

    setLoading(true);
    setError("");

    try {
      const combined = (currentText || "") + (currentCode ? "\n\n--- CODE ---\n" + currentCode : "");
      const safe = combined.replace(/undefined/g, "").trim() || "No answer provided.";

      const res = await submitAnswer({ session_id: sessionId, answer: safe, look_away_count: lookAwayCount, flagged });

      if (res.data.done) {
        stopCamera();
        stopAllMediaTracks();
        sessionStorage.removeItem("current_question");
        sessionStorage.setItem("final_report", res.data.report);
        sessionStorage.setItem("evaluation_history", JSON.stringify(res.data.evaluation_history));
        sessionStorage.setItem("look_away_count", lookAwayCount);
        sessionStorage.setItem("flagged", flagged ? "true" : "false");
        navigate(`/report/${sessionId}`);
        return;
      }

      sessionStorage.setItem("current_question", res.data.next_question);
      setQuestion(res.data.next_question);
      setTextAnswer("");
      setCodeAnswer("");
      setActiveTab("answer");
      setQuestionIndex((q) => q + 1);
      speakQuestion(res.data.next_question);
      resetTimer();
    } catch (err) {
      setError(err?.response?.data?.error || "Server error. Please try again.");
      resetTimer();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { submitRef.current = handleSubmit; });

  const toggleVoice = () => { isListening ? stopListening() : startListening(); };

  const progressPercent = Math.min((questionIndex / TOTAL_QUESTIONS) * 100, 100);
  const timerDanger = timeLeft < 30;
  const timerWarning = timeLeft < 60;

  return (
    <div className="flex h-screen max-h-screen bg-[#060710] text-slate-200 overflow-hidden" style={{ paddingTop: "0" }}>

      {/* ── SIDE PANEL (Question + Controls) ── */}
      <div className="w-[420px] shrink-0 flex flex-col border-r border-white/[0.06] bg-[#080a14]">

        {/* Top bar: session info */}
        <div className="shrink-0 px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Session</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span className="text-slate-400 font-semibold">{topic || "Interview"}</span>
          </div>
        </div>

        {/* Progress: question dots */}
        <div className="shrink-0 px-6 py-5 border-b border-white/[0.05]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Progress</span>
            <span className="text-xs text-slate-400 font-semibold">{questionIndex + 1} / {TOTAL_QUESTIONS}</span>
          </div>
          <div className="flex gap-2">
            {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
              <div key={i} className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${
                i < questionIndex ? "bg-violet-500" : i === questionIndex ? "bg-violet-400 animate-pulse" : "bg-slate-800"
              }`} />
            ))}
          </div>
        </div>

        {/* Question display */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-violet-500/15 text-violet-400 text-xs font-bold uppercase tracking-wider border border-violet-500/20">
              Q{questionIndex + 1}
            </span>
            {language !== "plaintext" && (
              <span className="px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 text-xs font-semibold border border-blue-500/20">
                {language}
              </span>
            )}
          </div>

          <div className="prose prose-invert prose-sm max-w-none text-slate-200 leading-relaxed">
            <ReactMarkdown>{question}</ReactMarkdown>
          </div>

          {/* Tips */}
          <div className="mt-8 p-4 bg-amber-500/5 border border-amber-500/15 rounded-xl">
            <div className="flex items-center gap-2 mb-2.5">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Interview Tips</span>
            </div>
            <ul className="space-y-1.5">
              {["Use the STAR method for behavioral answers.", "State complexity for code solutions.", "Think out loud — the process matters."].map((tip, i) => (
                <li key={i} className="text-xs text-slate-500 flex items-start gap-1.5">
                  <span className="text-amber-500/60 mt-0.5 shrink-0">•</span>{tip}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* TTS control */}
        <div className="shrink-0 px-6 py-4 border-t border-white/[0.05] flex items-center gap-3">
          <button
            onClick={() => { ttsEnabled ? (stopSpeaking(), setTtsEnabled(false)) : (setTtsEnabled(true), speakQuestion(question)); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              ttsEnabled ? "bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20" : "text-slate-500 border border-slate-700 hover:text-slate-300"
            }`}
          >
            {isSpeaking ? <Volume2 className="w-3.5 h-3.5 animate-pulse" /> : ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            {isSpeaking ? "Speaking..." : ttsEnabled ? "Audio On" : "Audio Off"}
          </button>

          {flagged && (
            <div className="flex items-center gap-1.5 ml-auto text-xs text-red-400 font-semibold">
              <ShieldAlert className="w-3.5 h-3.5" />
              Session Flagged
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN ANSWER AREA ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#060710]">

        {/* Top bar: timer + tab switcher + submit */}
        <div className="shrink-0 px-6 py-3 border-b border-white/[0.05] bg-[#07091200] flex items-center justify-between gap-4">

          {/* Tab switcher */}
          <div className="flex bg-[#0a0c18] border border-white/[0.06] p-1 rounded-xl gap-1">
            <button
              onClick={() => { setActiveTab("answer"); if (isListening) stopListening(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "answer" ? "bg-violet-600 text-white shadow-md shadow-violet-900/50" : "text-slate-500 hover:text-white"
              }`}
            >
              <FileText className="w-4 h-4" /> Explanation
            </button>
            <button
              onClick={() => { setActiveTab("code"); if (isListening) stopListening(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "code" ? "bg-blue-600 text-white shadow-md shadow-blue-900/50" : "text-slate-500 hover:text-white"
              }`}
            >
              <Code className="w-4 h-4" /> Code Editor
            </button>
          </div>

          {/* Timer */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-mono font-bold text-base transition-all ${
            timerDanger ? "bg-red-500/10 border-red-500/40 text-red-400" :
            timerWarning ? "bg-amber-500/10 border-amber-500/30 text-amber-400" :
            "bg-slate-800/40 border-slate-700/50 text-slate-300"
          }`}>
            <Timer className={`w-4 h-4 ${timerDanger ? "animate-pulse" : ""}`} />
            {formatTime(timeLeft)}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {activeTab === "answer" && srSupported && (
              <button
                onClick={toggleVoice}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                  isListening
                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                    : "bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
                }`}
              >
                {isListening ? (
                  <><span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" /> Stop</>
                ) : (
                  <><Mic className="w-4 h-4" /> Voice</>
                )}
              </button>
            )}

            <button
              onClick={() => handleSubmit(false)}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <><Send className="w-4 h-4" /> Submit Answer</>
              )}
            </button>
          </div>
        </div>

        {/* Answer Input */}
        <div className="flex-1 relative min-h-0">
          <AnimatePresence mode="wait">
            {activeTab === "answer" ? (
              <motion.div
                key="answer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col"
              >
                {/* Listening indicator bar */}
                {isListening && (
                  <div className="shrink-0 mx-6 mt-4 flex items-center gap-3 bg-violet-500/8 border border-violet-500/20 px-4 py-2.5 rounded-xl">
                    <div className="flex items-end gap-0.5">
                      {[1, 1.5, 2, 2.5, 3, 2.5, 2, 1.5, 1].map((h, i) => (
                        <motion.div
                          key={i}
                          animate={{ scaleY: [1, h, 1] }}
                          transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.06, ease: "easeInOut" }}
                          className="w-1 bg-violet-400 rounded-full origin-bottom"
                          style={{ height: 8 }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-violet-300 font-semibold">Listening — speak clearly. Auto-submits after 5s of silence.</span>
                  </div>
                )}
                <textarea
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  className={`flex-1 bg-transparent resize-none focus:outline-none text-slate-100 leading-relaxed text-[15px] font-sans placeholder:text-slate-700 px-8 py-6 ${isListening ? "voice-active-border rounded-none" : ""}`}
                  placeholder={isListening
                    ? "Your speech will appear here in real time..."
                    : "Type your answer here. Be clear and structured. You can also use Voice Answer above."
                  }
                />
              </motion.div>
            ) : (
              <motion.div
                key="code"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0"
              >
                <Editor
                  height="100%"
                  language={language}
                  theme="vs-dark"
                  value={codeAnswer}
                  onChange={(v) => setCodeAnswer(v || "")}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    padding: { top: 20, bottom: 20 },
                    fontFamily: "JetBrains Mono, Fira Code, Consolas, monospace",
                    wordWrap: "on",
                    renderLineHighlight: "gutter",
                    smoothScrolling: true,
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Error bar */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="shrink-0 mx-6 mb-4 flex items-center gap-3 bg-red-500/10 border border-red-500/25 text-red-300 px-4 py-3 rounded-xl text-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── PiP Camera (bottom-right) ── */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
        <AnimatePresence>
          {cameraVisible && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 20 }}
              className={`relative w-52 rounded-2xl overflow-hidden border shadow-2xl ${
                flagged ? "border-red-500/50 shadow-red-900/30" : "border-white/[0.12] shadow-black/50"
              }`}
            >
              <div style={{ aspectRatio: "4/3" }} className="relative bg-[#0a0c18]">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
                <canvas ref={canvasRef} className="hidden" />

                {!cameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-600">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                )}

                {/* REC badge */}
                {cameraActive && (
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-md rounded-full px-2.5 py-1">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-[9px] font-bold text-white tracking-widest">REC</span>
                  </div>
                )}

                {/* Flagged overlay */}
                {flagged && (
                  <div className="absolute top-2 right-2 bg-red-500/20 border border-red-500/40 px-2 py-0.5 rounded-full">
                    <span className="text-[9px] text-red-400 font-bold tracking-wider">FLAGGED</span>
                  </div>
                )}

                {/* Look-away counter */}
                {lookAwayCount > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2">
                    <span className={`text-[10px] font-bold ${flagged ? "text-red-400" : "text-amber-400"}`}>
                      {lookAwayCount} look-away{lookAwayCount !== 1 ? "s" : ""} logged
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setCameraVisible((v) => !v)}
          className="bg-[#0d0f1a]/90 hover:bg-[#131626] border border-white/[0.1] text-slate-400 hover:text-slate-200 p-2 rounded-full shadow-lg backdrop-blur-md transition-all"
          title={cameraVisible ? "Hide camera" : "Show camera"}
        >
          {cameraVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ── Warning Toast ── */}
      <AnimatePresence>
        {showWarningToast && (
          <motion.div
            initial={{ opacity: 0, y: -60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -60 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 bg-red-950/95 border border-red-500/40 text-red-100 px-6 py-3.5 rounded-2xl shadow-2xl shadow-red-900/40 backdrop-blur-md"
          >
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-bold">Proctoring Warning</p>
              <p className="text-xs text-red-300/80">Please keep your eyes on the screen at all times.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

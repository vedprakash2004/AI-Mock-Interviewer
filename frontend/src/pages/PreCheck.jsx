import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, Mic, CheckCircle, XCircle, AlertCircle,
  Shield, Wifi, RefreshCcw, ChevronRight
} from "lucide-react";

/* ─────────────────────────────────────────
   Sub-component: single check row
────────────────────────────────────────── */
function CheckRow({ icon: Icon, label, sublabel, status }) {
  // status: "idle" | "ok" | "fail"
  return (
    <div className={`flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-300 ${
      status === "ok"
        ? "bg-emerald-500/5 border-emerald-500/25"
        : status === "fail"
        ? "bg-red-500/5 border-red-500/20"
        : "bg-white/[0.02] border-white/[0.06]"
    }`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
        status === "ok" ? "bg-emerald-500/15 text-emerald-400"
        : status === "fail" ? "bg-red-500/15 text-red-400"
        : "bg-slate-800 text-slate-500"
      }`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm transition-colors ${
          status === "ok" ? "text-emerald-300"
          : status === "fail" ? "text-red-300"
          : "text-slate-400"
        }`}>{label}</p>
        <p className="text-xs text-slate-600 mt-0.5">{sublabel}</p>
      </div>
      {status === "ok" && <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />}
      {status === "fail" && <XCircle className="w-5 h-5 text-red-400 shrink-0" />}
      {status === "idle" && (
        <div className="w-5 h-5 rounded-full border-2 border-slate-700 border-t-slate-400 animate-spin shrink-0" />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   Mic level bars
────────────────────────────────────────── */
function MicMeter({ level }) {
  const BAR_COUNT = 12;
  return (
    <div className="flex items-end gap-1 h-8">
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        const threshold = (i / BAR_COUNT) * 100;
        const active = level > threshold;
        const color = level > 75 ? "bg-red-400" : level > 40 ? "bg-yellow-400" : "bg-emerald-400";
        const height = 8 + (i / (BAR_COUNT - 1)) * 24;
        return (
          <motion.div
            key={i}
            className={`flex-1 rounded-sm transition-colors duration-75 ${active ? color : "bg-slate-700/60"}`}
            style={{ height }}
          />
        );
      })}
    </div>
  );
}

const RULES = [
  "Keep your face clearly visible in the camera throughout the session.",
  "Avoid looking away from the screen — repeated look-aways will flag your session.",
  "Answer each of the 5 questions within the 3-minute time limit.",
  "You may type or speak your answers; coding questions require typing.",
  "Do not use external resources, tabs, or assistance of any kind.",
  "Maintain a quiet environment with your microphone active.",
];

export default function PreCheck() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animRef = useRef(null);

  const [cameraStatus, setCameraStatus] = useState("idle"); // idle | ok | fail
  const [micStatus, setMicStatus] = useState("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [checking, setChecking] = useState(false);

  const stopAllMedia = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const runChecks = useCallback(async () => {
    setChecking(true);
    setErrorMsg("");
    setCameraStatus("idle");
    setMicStatus("idle");
    setMicLevel(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      streamRef.current = stream;

      // Camera
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraStatus("ok");

      // Mic
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      setMicStatus("ok");

      // Animate mic level
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const low = data.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
        setMicLevel(Math.min(100, (low / 70) * 100));
        animRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setCameraStatus("fail");
      setMicStatus("fail");
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        setErrorMsg(
          "Camera and microphone access was denied. Click the lock icon in your browser address bar → allow camera & microphone → then retry."
        );
      } else if (e.name === "NotFoundError") {
        setErrorMsg("No camera or microphone detected. Please connect a device and retry.");
      } else {
        setErrorMsg(`Could not access devices: ${e.message}`);
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    runChecks();
    return stopAllMedia;
  }, []);

  const canBegin = cameraStatus === "ok" && micStatus === "ok" && agreed;

  const handleBegin = () => {
    // Stop mic analyser to free audio resources; interview page restarts camera via its own hook
    stopAllMedia();
    navigate(`/interview/${sessionId}`);
  };

  return (
    <div className="min-h-screen bg-[#070810] flex items-center justify-center p-4 md:p-8">
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-700/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-700/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-5xl">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold uppercase tracking-widest mb-4">
            <Shield className="w-3.5 h-3.5" />
            System Check
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">
            Before We Begin
          </h1>
          <p className="text-slate-400 mt-2 text-base">
            Your camera and microphone must be active to start the interview.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── LEFT: Camera + Mic Preview ── */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-4"
          >
            {/* Camera feed */}
            <div
              className="relative rounded-2xl overflow-hidden bg-[#0d0f1a] border border-white/[0.07]"
              style={{ aspectRatio: "4/3" }}
            >
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />

              {cameraStatus !== "ok" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-600">
                  <Camera className="w-14 h-14 opacity-20" />
                  <p className="text-sm">
                    {checking ? "Requesting camera access..." : "Camera not available"}
                  </p>
                </div>
              )}

              {/* LIVE badge */}
              {cameraStatus === "ok" && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-2.5 py-1">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-xs text-white font-semibold tracking-wide">LIVE</span>
                </div>
              )}

              {/* Mirrored label */}
              {cameraStatus === "ok" && (
                <div className="absolute bottom-3 right-3 bg-black/60 text-xs text-slate-400 px-2 py-0.5 rounded-lg backdrop-blur-sm">
                  Camera preview (mirrored)
                </div>
              )}
            </div>

            {/* Mic meter */}
            <div className="bg-[#0d0f1a] border border-white/[0.07] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Mic className={`w-4 h-4 ${micStatus === "ok" ? "text-emerald-400" : "text-slate-600"}`} />
                  <span className="text-sm font-medium text-slate-400">Microphone Level</span>
                </div>
                {micStatus === "ok" && (
                  <span className={`text-xs font-medium transition-colors ${
                    micLevel > 5 ? "text-emerald-400" : "text-slate-500"
                  }`}>
                    {micLevel > 5 ? "✓ Signal detected" : "Speak to test..."}
                  </span>
                )}
              </div>
              <MicMeter level={micLevel} />
            </div>

            {/* Error */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-red-500/8 border border-red-500/20 rounded-2xl p-4 flex gap-3"
                >
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-300 leading-relaxed">{errorMsg}</p>
                    <button
                      onClick={runChecks}
                      disabled={checking}
                      className="mt-2 flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" />
                      {checking ? "Retrying..." : "Retry"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* ── RIGHT: Checklist + Rules + Gate ── */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="flex flex-col gap-5"
          >
            {/* System requirements */}
            <div className="space-y-3">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest px-1">
                System Requirements
              </p>
              <CheckRow
                icon={Camera}
                label="Camera"
                sublabel="Required for proctoring and integrity monitoring"
                status={cameraStatus}
              />
              <CheckRow
                icon={Mic}
                label="Microphone"
                sublabel="Required for voice answers (optional per question)"
                status={micStatus}
              />
              <CheckRow
                icon={Wifi}
                label="Connection"
                sublabel="Stable internet connection for AI evaluation"
                status="ok"
              />
            </div>

            {/* Rules */}
            <div className="bg-[#0d0f1a] border border-white/[0.07] rounded-2xl p-5 flex-1">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-4 h-4 text-violet-400" />
                <p className="text-sm font-semibold text-slate-300">Interview Rules</p>
              </div>
              <ol className="space-y-2.5">
                {RULES.map((rule, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-slate-400 leading-relaxed">
                    <span className="text-violet-500 font-bold shrink-0 tabular-nums">{i + 1}.</span>
                    {rule}
                  </li>
                ))}
              </ol>
            </div>

            {/* Agreement */}
            <label className="flex items-start gap-3 cursor-pointer group select-none">
              <div
                className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                  agreed
                    ? "bg-violet-600 border-violet-600"
                    : "border-slate-600 group-hover:border-slate-500"
                }`}
                onClick={() => setAgreed((v) => !v)}
              >
                {agreed && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors leading-relaxed">
                I have read and agree to the interview rules. I understand my session will be monitored for integrity.
              </span>
            </label>

            {/* Begin button */}
            <motion.button
              whileHover={canBegin ? { scale: 1.015 } : {}}
              whileTap={canBegin ? { scale: 0.985 } : {}}
              onClick={canBegin ? handleBegin : undefined}
              disabled={!canBegin}
              className={`w-full py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-all duration-300 ${
                canBegin
                  ? "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_40px_rgba(124,58,237,0.35)] hover:shadow-[0_0_50px_rgba(124,58,237,0.5)]"
                  : "bg-slate-900 text-slate-600 cursor-not-allowed border border-slate-800"
              }`}
            >
              {!canBegin && (cameraStatus !== "ok" || micStatus !== "ok")
                ? "Waiting for Camera & Microphone..."
                : !agreed
                ? "Please accept the rules above"
                : (
                  <>
                    Begin Interview
                    <ChevronRight className="w-5 h-5" />
                  </>
                )
              }
            </motion.button>

            {canBegin && (
              <p className="text-center text-xs text-slate-600">
                Your camera will remain active throughout the 5-question session.
              </p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

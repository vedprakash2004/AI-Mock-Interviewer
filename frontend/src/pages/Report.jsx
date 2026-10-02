import React, { useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { downloadReportPdf } from "../services/api";
import { motion } from "framer-motion";
import { stopAllMediaTracks } from "../utils/mediaCleanup";
import {
  Download, RotateCcw, Award, CheckCircle2, AlertTriangle,
  Zap, Target, Brain, ShieldAlert, ShieldCheck, TrendingUp, ChevronRight, ExternalLink
} from "lucide-react";

function extractScore(report) {
  const match = report.match(/Final Score:\s*(\d+)/i) || report.match(/(\d+)\s*\/\s*10/);
  return match ? Math.min(10, Number(match[1])) : 0;
}

function getVerdict(score) {
  if (score >= 8) return { label: "Strong Hire ✓", ring: "stroke-emerald-400", text: "text-emerald-400", bg: "from-emerald-500/10", border: "border-emerald-500/25" };
  if (score >= 6) return { label: "Hire", ring: "stroke-green-400", text: "text-green-400", bg: "from-green-500/10", border: "border-green-500/25" };
  if (score >= 4) return { label: "Borderline", ring: "stroke-amber-400", text: "text-amber-400", bg: "from-amber-500/10", border: "border-amber-500/25" };
  return { label: "Needs Practice", ring: "stroke-red-400", text: "text-red-400", bg: "from-red-500/10", border: "border-red-500/25" };
}

function getPersona(score) {
  if (score >= 9) return { title: "The Architect", emoji: "🏗️", desc: "Deep technical mastery. System-level thinker." };
  if (score >= 7) return { title: "Senior Engineer", emoji: "⚙️", desc: "Solid problem solving and clear communication." };
  if (score >= 5) return { title: "Mid-Level Dev", emoji: "💻", desc: "Good foundation. Needs depth in edge cases." };
  if (score >= 3) return { title: "Junior Developer", emoji: "🌱", desc: "Growing knowledge. Focus on fundamentals." };
  return { title: "Aspiring Coder", emoji: "🚀", desc: "Early in the journey. Keep practicing!" };
}

function ScoreRing({ score }) {
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const pct = Math.min(score / 10, 1);
  const verdict = getVerdict(score);

  return (
    <div className="relative w-40 h-40 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <motion.circle
          cx="60" cy="60" r={radius} fill="none"
          strokeWidth="8" strokeLinecap="round"
          className={verdict.ring}
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct) }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className={`text-5xl font-extrabold ${verdict.text}`}
        >
          {score}
        </motion.span>
        <span className="text-slate-500 text-sm font-medium mt-0.5">/10</span>
      </div>
    </div>
  );
}

function ScoreBar({ score, label, delay = 0 }) {
  const color = score >= 7 ? "bg-emerald-500" : score >= 5 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-500 font-medium">{label}</span>
        <span className="text-xs font-bold text-slate-300">{score}/10</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${score * 10}%` }}
          transition={{ duration: 0.8, delay, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export default function Report() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // Nuclear cleanup — kill any dangling streams if user lands here with camera still on
  useEffect(() => {
    stopAllMediaTracks();
  }, []);

  const report = sessionStorage.getItem("final_report") || "";
  const historyStr = sessionStorage.getItem("evaluation_history");
  const lookAwayCount = parseInt(sessionStorage.getItem("look_away_count") || "0");
  const flagged = sessionStorage.getItem("flagged") === "true";

  const history = useMemo(() => {
    try { return historyStr ? JSON.parse(historyStr) : []; }
    catch (e) { return []; }
  }, [historyStr]);

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <div className="text-6xl">📋</div>
        <p className="text-xl font-semibold text-slate-300">No report found</p>
        <p className="text-slate-500">Complete an interview session first.</p>
        <button onClick={() => navigate("/")} className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-semibold transition-all mt-2">
          Go Home
        </button>
      </div>
    );
  }

  const score = extractScore(report);
  const verdict = getVerdict(score);
  const persona = getPersona(score);

  // Aggregate metrics from evaluation history
  const avgMetrics = useMemo(() => {
    if (!history.length) return { technical_accuracy: 0, communication_clarity: 0, problem_solving: 0 };
    const sum = history.reduce((acc, h) => ({
      technical_accuracy: acc.technical_accuracy + (h.technical_accuracy || 0),
      communication_clarity: acc.communication_clarity + (h.communication_clarity || 0),
      problem_solving: acc.problem_solving + (h.problem_solving || 0),
    }), { technical_accuracy: 0, communication_clarity: 0, problem_solving: 0 });
    return {
      technical_accuracy: Math.round(sum.technical_accuracy / history.length),
      communication_clarity: Math.round(sum.communication_clarity / history.length),
      problem_solving: Math.round(sum.problem_solving / history.length),
    };
  }, [history]);

  const handleDownload = async () => {
    const res = await downloadReportPdf(report);
    const blob = new Blob([res.data], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Interview_Report.pdf";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-4 md:px-8 py-12 space-y-10 pb-20">

      {/* ── HEADER ── */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-bold uppercase tracking-widest mb-2">
          <Award className="w-3.5 h-3.5" /> Interview Complete
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">Session Report</h1>
        <p className="text-slate-400 max-w-xl mx-auto">Here's how you performed. Review your strengths, gaps, and next steps.</p>
      </div>

      {/* ── FLAGGED ALERT ── */}
      {flagged && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 bg-red-950/60 border border-red-500/30 text-red-300 px-6 py-4 rounded-2xl"
        >
          <ShieldAlert className="w-6 h-6 text-red-400 shrink-0" />
          <div>
            <p className="font-bold text-red-300">Session Flagged for Suspicious Activity</p>
            <p className="text-sm text-red-400/80 mt-0.5">The candidate looked away {lookAwayCount} time(s), exceeding the allowed threshold. This has been noted in the report.</p>
          </div>
        </motion.div>
      )}

      {/* ── HERO METRICS ROW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Score ring card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`lg:col-span-4 bg-gradient-to-br ${verdict.bg} to-transparent border ${verdict.border} rounded-3xl p-8 flex flex-col items-center justify-center gap-5`}
        >
          <ScoreRing score={score} />
          <div className="text-center">
            <div className={`text-lg font-extrabold ${verdict.text} mb-1`}>{verdict.label}</div>
            <p className="text-slate-500 text-sm">Final Interview Score</p>
          </div>
        </motion.div>

        {/* Skill breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-4 bg-[#0b0c18] border border-white/[0.07] rounded-3xl p-8 flex flex-col justify-center gap-5"
        >
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Skill Breakdown</h3>
          </div>
          <ScoreBar score={avgMetrics.technical_accuracy} label="Technical Accuracy" delay={0.3} />
          <ScoreBar score={avgMetrics.communication_clarity} label="Communication Clarity" delay={0.4} />
          <ScoreBar score={avgMetrics.problem_solving} label="Problem Solving" delay={0.5} />
        </motion.div>

        {/* Persona + proctoring */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-4 flex flex-col gap-4"
        >
          {/* Persona */}
          <div className="flex-1 bg-[#0b0c18] border border-white/[0.07] rounded-3xl p-6 flex flex-col items-center justify-center text-center gap-3">
            <div className="text-4xl">{persona.emoji}</div>
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Level Achieved</p>
              <p className="text-xl font-extrabold text-white">{persona.title}</p>
              <p className="text-slate-500 text-sm mt-1">{persona.desc}</p>
            </div>
          </div>

          {/* Proctoring */}
          <div className={`bg-[#0b0c18] border rounded-2xl p-5 flex items-center gap-4 ${flagged ? "border-red-500/25" : "border-emerald-500/20"}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${flagged ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"}`}>
              {flagged ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-0.5">Proctoring</p>
              <p className={`font-bold text-base ${flagged ? "text-red-400" : "text-emerald-400"}`}>{flagged ? "Flagged" : "Clean Session"}</p>
              <p className="text-xs text-slate-500">{lookAwayCount} look-away{lookAwayCount !== 1 ? "s" : ""} recorded</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── QUESTION-BY-QUESTION ── */}
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Question Breakdown</h2>
          <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs font-bold border border-slate-700">{history.length} questions</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {history.map((item, idx) => {
            const qScore = item.score ?? 0;
            const scoreColor = qScore >= 7 ? "text-emerald-400" : qScore >= 5 ? "text-amber-400" : "text-red-400";
            const scoreBg = qScore >= 7 ? "bg-emerald-500/10 border-emerald-500/20" : qScore >= 5 ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/10 border-red-500/20";

            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + idx * 0.08 }}
                className="bg-[#0b0c18] border border-white/[0.07] rounded-2xl p-6 space-y-4 hover:border-white/[0.12] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-lg bg-slate-800 text-slate-400 text-xs font-bold border border-slate-700">
                    Question {idx + 1}
                  </span>
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${scoreBg} ${scoreColor}`}>
                    <span>{qScore}/10</span>
                  </div>
                </div>

                {/* Mini score bar */}
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${qScore >= 7 ? "bg-emerald-500" : qScore >= 5 ? "bg-amber-500" : "bg-red-500"}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${qScore * 10}%` }}
                    transition={{ duration: 0.7, delay: 0.3 + idx * 0.08 }}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex gap-3 items-start">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] uppercase text-slate-600 font-bold tracking-wider mb-0.5">Strengths</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{item.strengths || "—"}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] uppercase text-slate-600 font-bold tracking-wider mb-0.5">Improvements</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{item.weaknesses || "—"}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── FULL REPORT ── */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Full Written Report</h2>
        <div className="bg-[#0b0c18] border border-white/[0.07] rounded-3xl p-8">
          <div className="prose prose-invert prose-sm max-w-none text-slate-300 leading-loose">
            <ReactMarkdown
              components={{
                a: ({ node, ...props }) => (
                  <a
                    {...props}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-400 hover:text-violet-300 underline underline-offset-4 decoration-violet-500/40 hover:decoration-violet-400 font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    {props.children}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )
              }}
            >
              {report}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      {/* ── CTA BUTTONS ── */}
      <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
        <button
          onClick={handleDownload}
          className="flex items-center justify-center gap-2.5 px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white rounded-2xl font-bold text-sm transition-all shadow-[0_0_30px_rgba(124,58,237,0.3)] hover:shadow-[0_0_40px_rgba(124,58,237,0.5)]"
        >
          <Download className="w-4 h-4" /> Download PDF Report
        </button>
        <button
          onClick={() => navigate("/")}
          className="flex items-center justify-center gap-2.5 px-8 py-4 bg-[#0b0c18] hover:bg-[#111320] text-slate-200 border border-white/[0.1] hover:border-white/[0.2] rounded-2xl font-bold text-sm transition-all"
        >
          <RotateCcw className="w-4 h-4" /> Start New Interview
        </button>
      </div>
    </div>
  );
}

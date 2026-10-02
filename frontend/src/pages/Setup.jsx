import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../components/ui/Button";
import { fetchTopics, startInterview } from "../services/api";
import { Briefcase, User, Github, Upload, Loader2, Sparkles, Code2, BrainCircuit, FileText, ChevronRight, CheckCircle2 } from "lucide-react";

const DIFFICULTY_LABELS = {
    1: "Intern (Basic concepts)",
    2: "Junior (Fundamentals)",
    3: "Junior+ (Practical usage)",
    4: "Mid-Level (Applied knowledge)",
    5: "Mid-Level (Standard)",
    6: "Mid-Level+ (Edge cases)",
    7: "Senior (Architecture & Design)",
    8: "Senior+ (Deep reasoning)",
    9: "Staff (System trade-offs)",
    10: "Principal (Extreme edge cases)"
};

const POPULAR_TOPICS = ["Python", "JavaScript", "React", "Data Structures & Algorithms", "SQL", "Java"];

export default function Setup() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [topics, setTopics] = useState({});
    const [error, setError] = useState("");

    const [formData, setFormData] = useState({
        name: "",
        mode: "normal", // normal, project
        role: "Technical",
        topic: "Python",
        language: "python",
        confidence: 5,
        github: "",
        resume: null
    });

    useEffect(() => {
        fetchTopics().then((res) => {
            setTopics(res.data);
        }).catch(err => console.error("Failed to load topics", err));
    }, []);

    const handleStart = async () => {
        if (!formData.name.trim()) return setError("Please enter your name to begin.");
        if (formData.mode === "normal" && !formData.topic) return setError("Please select an interview topic.");
        if (formData.mode === "project" && !formData.github) return setError("Please provide a valid GitHub repository URL.");

        setLoading(true);
        setError("");

        try {
            const data = new FormData();
            data.append("name", formData.name.trim());
            data.append("mode", formData.mode);
            data.append("confidence", formData.confidence);
            
            // Only send explicit language if the topic is DSA, else the backend/frontend will infer it
            if (formData.topic === "Data Structures & Algorithms") {
                data.append("language", formData.language);
            }

            if (formData.mode === "normal") {
                data.append("role", formData.role);
                data.append("topic", formData.topic);
                if (formData.resume) data.append("resume", formData.resume);
            } else {
                data.append("github_url", formData.github);
            }

            const res = await startInterview(data);

            sessionStorage.setItem("session_id", res.data.session_id);
            sessionStorage.setItem("current_question", res.data.question);
            sessionStorage.setItem("topic", formData.topic || "Project"); 
            
            if (formData.topic === "Data Structures & Algorithms") {
                sessionStorage.setItem("editor_language", formData.language); 
            } else {
                sessionStorage.removeItem("editor_language");
            }

            navigate(`/precheck/${res.data.session_id}`);
        } catch (err) {
            setError(err.response?.data?.error || "Failed to initialize interview environment.");
        } finally {
            setLoading(false);
        }
    };

    const getTopicOptions = () => {
        let allTopics = [];
        Object.keys(topics).forEach(category => {
            topics[category].forEach(t => {
                if (!POPULAR_TOPICS.includes(t)) {
                    allTopics.push({ label: t, value: t });
                }
            });
        });
        return allTopics;
    };

    return (
        <div className="min-h-[85vh] flex items-center justify-center py-10 px-6 lg:px-12 relative overflow-hidden">
            
            {/* Background elements */}
            <div className="absolute -top-10 -left-10 w-96 h-96 bg-violet-600/15 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute -bottom-10 -right-10 w-[30rem] h-[30rem] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 relative z-10">
                
                {/* LEFT COLUMN - Header & Info */}
                <div className="lg:col-span-5 flex flex-col justify-center space-y-8 pr-4">
                    <div>
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-bold uppercase tracking-widest mb-8">
                            <Sparkles className="w-4 h-4" /> Session Config
                        </div>
                        <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-white tracking-tight leading-[1.1] mb-6">
                            Tailor your <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-blue-400">Mock Interview</span>
                        </h1>
                        <p className="text-slate-400 text-xl leading-relaxed max-w-md">
                            Configure the AI's persona, difficulty, and focus area to simulate your upcoming real-world interview.
                        </p>
                    </div>

                    <div className="bg-[#0b0c16]/80 backdrop-blur-md border border-white/[0.05] p-6 lg:p-8 rounded-3xl space-y-6 shadow-2xl">
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                                <BrainCircuit className="w-7 h-7" />
                            </div>
                            <div>
                                <p className="text-base font-semibold text-slate-200">Adaptive AI Interviewer</p>
                                <p className="text-sm text-slate-500 mt-1">Reacts dynamically to your specific answers and mistakes</p>
                            </div>
                        </div>
                        <div className="h-px w-full bg-white/[0.05]" />
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-400 shrink-0">
                                <CheckCircle2 className="w-7 h-7" />
                            </div>
                            <div>
                                <p className="text-base font-semibold text-slate-200">Real-time Evaluation</p>
                                <p className="text-sm text-slate-500 mt-1">Instant feedback and proctoring during the session</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN - Form */}
                <div className="lg:col-span-7 bg-[#0d0f1a]/80 backdrop-blur-2xl border border-white/[0.08] p-8 lg:p-12 rounded-[2rem] shadow-2xl relative">
                    
                    {/* Mode Toggle */}
                    <div className="flex bg-[#070810] p-1.5 rounded-xl border border-white/[0.05] mb-8 relative">
                        <button
                            onClick={() => setFormData({ ...formData, mode: "normal" })}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all relative z-10 ${formData.mode === "normal" ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
                        >
                            <User className="w-4 h-4" /> Standard Topic
                        </button>
                        <button
                            onClick={() => setFormData({ ...formData, mode: "project" })}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all relative z-10 ${formData.mode === "project" ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
                        >
                            <Github className="w-4 h-4" /> Codebase Review
                        </button>
                        {/* Animated pill background */}
                        <div 
                            className="absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-slate-800 rounded-lg shadow-md transition-all duration-300 ease-out border border-white/10"
                            style={{ left: formData.mode === "normal" ? "6px" : "calc(50% + 0px)" }}
                        />
                    </div>

                    <div className="space-y-6">
                        {/* Name Input */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Candidate Name</label>
                            <input
                                type="text"
                                placeholder="Enter your full name"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full bg-[#070810] border border-white/[0.08] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 text-white rounded-xl px-4 py-3.5 outline-none transition-all placeholder:text-slate-600"
                            />
                        </div>

                        <AnimatePresence mode="wait">
                            {formData.mode === "normal" ? (
                                <motion.div
                                    key="normal"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-6"
                                >
                                    {/* Topic Chips */}
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Interview Topic</label>
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {POPULAR_TOPICS.map(t => (
                                                <button
                                                    key={t}
                                                    onClick={() => setFormData({ ...formData, topic: t })}
                                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                                                        formData.topic === t 
                                                            ? "bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-900/30" 
                                                            : "bg-[#070810] border-white/[0.08] text-slate-400 hover:border-slate-600 hover:text-slate-200"
                                                    }`}
                                                >
                                                    {t}
                                                </button>
                                            ))}
                                        </div>
                                        <select
                                            value={POPULAR_TOPICS.includes(formData.topic) ? "" : formData.topic}
                                            onChange={e => setFormData({ ...formData, topic: e.target.value })}
                                            className="w-full bg-[#070810] border border-white/[0.08] focus:border-violet-500/50 text-white rounded-xl px-4 py-3.5 outline-none transition-all appearance-none"
                                        >
                                            <option value="" disabled>Other topics...</option>
                                            {getTopicOptions().map((opt, i) => (
                                                <option key={i} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Preferred Language - ONLY for DSA */}
                                    {formData.topic === "Data Structures & Algorithms" && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            className="space-y-2 mb-6"
                                        >
                                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Preferred Coding Language</label>
                                            <select
                                                value={formData.language}
                                                onChange={e => setFormData({ ...formData, language: e.target.value })}
                                                className="w-full bg-[#070810] border border-white/[0.08] focus:border-violet-500/50 text-white rounded-xl px-4 py-3.5 outline-none transition-all appearance-none"
                                            >
                                                <option value="python">Python</option>
                                                <option value="javascript">JavaScript / TypeScript</option>
                                                <option value="java">Java</option>
                                                <option value="cpp">C++</option>
                                                <option value="c">C</option>
                                                <option value="go">Go</option>
                                                <option value="rust">Rust</option>
                                            </select>
                                        </motion.div>
                                    )}

                                    {/* Optional Resume */}
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Resume Context (Optional)</label>
                                        <div className="relative overflow-hidden group">
                                            <input
                                                type="file"
                                                accept=".pdf,.docx,.txt"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                onChange={e => setFormData({ ...formData, resume: e.target.files[0] })}
                                            />
                                            <div className="flex items-center gap-4 bg-[#070810] border border-dashed border-white/[0.2] group-hover:border-violet-500/50 rounded-xl px-4 py-4 transition-all">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${formData.resume ? "bg-violet-500/20 text-violet-400" : "bg-white/[0.05] text-slate-500"}`}>
                                                    {formData.resume ? <FileText className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-medium truncate ${formData.resume ? "text-violet-300" : "text-slate-300"}`}>
                                                        {formData.resume ? formData.resume.name : "Upload your resume"}
                                                    </p>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        AI will tailor questions based on your experience.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="project"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-6"
                                >
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">GitHub Repository</label>
                                        <div className="relative">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                                                <Github className="w-5 h-5" />
                                            </div>
                                            <input
                                                type="url"
                                                placeholder="https://github.com/username/repo"
                                                value={formData.github}
                                                onChange={e => setFormData({ ...formData, github: e.target.value })}
                                                className="w-full bg-[#070810] border border-white/[0.08] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 text-white rounded-xl pl-12 pr-4 py-3.5 outline-none transition-all placeholder:text-slate-600"
                                            />
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2">The AI will analyze the README and ask architectural/technical questions about this project.</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Difficulty Slider */}
                        <div className="pt-2">
                            <div className="flex justify-between items-end mb-3">
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Interview Difficulty</label>
                                <span className="text-sm font-bold text-violet-400">{formData.confidence}/10</span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                value={formData.confidence}
                                onChange={e => setFormData({ ...formData, confidence: parseInt(e.target.value) })}
                                className="w-full h-2 bg-[#070810] rounded-lg appearance-none cursor-pointer accent-violet-600 hover:accent-violet-500"
                            />
                            <p className="text-xs font-medium text-slate-400 mt-2 text-center">
                                Persona: <span className="text-slate-200">{DIFFICULTY_LABELS[formData.confidence]}</span>
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="mt-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex justify-center">
                            {error}
                        </div>
                    )}

                    <div className="mt-8 pt-6 border-t border-white/[0.05]">
                        <button
                            onClick={handleStart}
                            disabled={loading}
                            className="w-full py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 transition-all duration-300 bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_30px_rgba(124,58,237,0.3)] hover:shadow-[0_0_40px_rgba(124,58,237,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Preparing Environment...</>
                            ) : (
                                <>Enter Pre-Check <ChevronRight className="w-5 h-5" /></>
                            )}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}

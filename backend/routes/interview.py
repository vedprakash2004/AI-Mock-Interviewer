from flask import Blueprint, request, jsonify, send_file
import uuid
import io
from flask_cors import cross_origin

from core.question_generator import generate_next_question
from core.evaluator import evaluate_answer
from core.competence_estimator import estimate_competence
from core.report_generator import generate_final_report
from utils.resume_validator import is_valid_resume
from utils.github_fetcher import (
    is_valid_github_url,
    fetch_readme,
    extract_repo_name
)

interview_bp = Blueprint("interview", __name__)

INTERVIEW_SESSIONS = {}
MAX_QUESTIONS = 5


# ======================================================
# START INTERVIEW
# ======================================================
@interview_bp.route("/start", methods=["POST"])
def start_interview():
    form = request.form

    name = form.get("name")
    interview_mode = form.get("mode", "normal")
    confidence = int(form.get("confidence", 5))
    explicit_language = form.get("language")

    if not name:
        return jsonify({"error": "Name is required"}), 400

    resume_text = ""
    project_readme = ""
    project_name = ""

    if interview_mode == "normal":
        role = form.get("role")
        topic = form.get("topic")

        if not role or not topic:
            return jsonify({"error": "Role and topic are required"}), 400

        resume_file = request.files.get("resume")
        if resume_file:
            ok, res = is_valid_resume(resume_file)
            if not ok:
                return jsonify({"error": res}), 400
            resume_text = res

    elif interview_mode == "project":
        github_url = form.get("github_url")

        if not github_url or not is_valid_github_url(github_url):
            return jsonify({"error": "Valid GitHub URL is required"}), 400

        project_readme = fetch_readme(github_url)
        if not project_readme:
            project_readme = "README not available. Ask high-level architecture questions."

        project_name = extract_repo_name(github_url)
        role = "Technical"
        topic = "Project"
        confidence = 0

    else:
        return jsonify({"error": "Invalid interview mode"}), 400

    language = explicit_language if explicit_language else topic

    session_id = str(uuid.uuid4())

    INTERVIEW_SESSIONS[session_id] = {
        "name": name,
        "interview_mode": interview_mode,
        "role": role,
        "topic": topic,
        "language": language,
        "confidence": confidence,
        "resume_text": resume_text,
        "project_readme": project_readme,
        "project_name": project_name,
        "qa_history": [],
        "evaluation_history": [],
        "question_count": 0,
        "current_question": None
    }

    first_question = generate_next_question(
        role=role,
        topic=topic,
        confidence=confidence,
        competence_summary="Interview started",
        qa_history=[],
        is_fresher=True,
        interview_mode=interview_mode,
        project_readme=project_readme,
        project_name=project_name,
        resume_text=resume_text,
        language=language
    )

    INTERVIEW_SESSIONS[session_id]["current_question"] = first_question

    return jsonify({
        "session_id": session_id,
        "question": first_question
    }), 200


# ======================================================
# ANSWER QUESTION
# ======================================================
@interview_bp.route("/answer", methods=["POST"])
def submit_answer():
    data = request.get_json(silent=True)

    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    session_id = data.get("session_id")
    answer = data.get("answer", "").strip()

    if not session_id:
        return jsonify({"error": "session_id missing"}), 400

    session = INTERVIEW_SESSIONS.get(session_id)
    if not session:
        return jsonify({"error": "Session expired. Please restart interview."}), 400

    question = session["current_question"]

    session["qa_history"].append({
        "question": question,
        "answer": answer or "Don't know"
    })

    evaluation = evaluate_answer(
        session["role"],
        session["topic"],
        question,
        answer
    )

    session["evaluation_history"].append(evaluation)
    session["question_count"] += 1

    competence = estimate_competence(
        session["topic"],
        session["confidence"],
        session["evaluation_history"]
    )

    if session["question_count"] >= MAX_QUESTIONS:
        report = generate_final_report(
            session["role"],
            session["topic"],
            session["confidence"],
            competence.get("estimated_competence"),
            session["qa_history"],
            session["name"]
        )
        return jsonify({
            "done": True, 
            "report": report,
            "evaluation_history": session["evaluation_history"]
        }), 200

    next_question = generate_next_question(
        role=session["role"],
        topic=session["topic"],
        confidence=session["confidence"],
        competence_summary=competence.get("reasoning", ""),
        qa_history=session["qa_history"],
        is_fresher=True,
        interview_mode=session["interview_mode"],
        project_readme=session["project_readme"],
        project_name=session["project_name"],
        resume_text=session["resume_text"],
        language=session.get("language", "python")
    )

    session["current_question"] = next_question

    return jsonify({
        "done": False,
        "next_question": next_question
    }), 200

# ======================================================
# DOWNLOAD REPORT PDF  (proper layout with ReportLab Platypus)
# ======================================================
@interview_bp.route("/report/pdf", methods=["POST"])
@cross_origin()
def download_report_pdf():
    import re
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT, TA_CENTER
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, HRFlowable,
        KeepTogether, Table, TableStyle
    )
    from reportlab.pdfgen import canvas as raw_canvas

    data = request.get_json(silent=True)
    if not data or "report" not in data:
        return jsonify({"error": "Report content missing"}), 400

    report_text = data["report"]

    # ── Colour palette ──────────────────────────────────────────────────
    VIOLET       = colors.HexColor("#7c3aed")
    VIOLET_LIGHT = colors.HexColor("#a78bfa")
    DARK_BG      = colors.HexColor("#0f0f1a")
    SLATE_700    = colors.HexColor("#334155")
    SLATE_400    = colors.HexColor("#94a3b8")
    WHITE        = colors.white
    TEXT_MAIN    = colors.HexColor("#e2e8f0")
    TEXT_MUTED   = colors.HexColor("#94a3b8")
    GREEN        = colors.HexColor("#10b981")
    RED          = colors.HexColor("#ef4444")

    # ── Styles ──────────────────────────────────────────────────────────
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle",
        fontName="Helvetica-Bold",
        fontSize=22,
        textColor=WHITE,
        spaceAfter=4,
        alignment=TA_CENTER,
        backColor=DARK_BG,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle",
        fontName="Helvetica",
        fontSize=10,
        textColor=SLATE_400,
        spaceAfter=0,
        alignment=TA_CENTER,
    )
    h1_style = ParagraphStyle(
        "H1",
        fontName="Helvetica-Bold",
        fontSize=13,
        textColor=VIOLET_LIGHT,
        spaceBefore=14,
        spaceAfter=4,
        leading=18,
    )
    h2_style = ParagraphStyle(
        "H2",
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=WHITE,
        spaceBefore=10,
        spaceAfter=3,
        leading=15,
    )
    body_style = ParagraphStyle(
        "Body",
        fontName="Helvetica",
        fontSize=9.5,
        textColor=TEXT_MAIN,
        spaceAfter=4,
        leading=14,
    )
    bullet_style = ParagraphStyle(
        "Bullet",
        fontName="Helvetica",
        fontSize=9.5,
        textColor=TEXT_MAIN,
        spaceAfter=2,
        leading=13,
        leftIndent=14,
        bulletIndent=4,
    )
    code_style = ParagraphStyle(
        "Code",
        fontName="Courier",
        fontSize=8.5,
        textColor=colors.HexColor("#c4b5fd"),
        spaceAfter=2,
        leading=12,
        leftIndent=16,
        backColor=colors.HexColor("#1e1b4b"),
    )
    muted_style = ParagraphStyle(
        "Muted",
        fontName="Helvetica-Oblique",
        fontSize=8.5,
        textColor=TEXT_MUTED,
        spaceAfter=2,
        leading=12,
    )

    # ── Markdown → Flowables ────────────────────────────────────────────
    def md_to_text(s):
        """Strip markdown formatting, escape XML for ReportLab."""
        s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)  # bold
        s = re.sub(r"\*(.+?)\*",     r"<i>\1</i>", s)  # italic
        s = re.sub(r"`(.+?)`",       r'<font name="Courier" color="#c4b5fd">\1</font>', s)
        s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<link href="\2"><font color="#a78bfa"><u>\1</u></font></link>', s) # links
        # Escape bare ampersands not already escaped
        s = re.sub(r"&(?!amp;|lt;|gt;|quot;)", "&amp;", s)
        return s

    def is_heading(line, level):
        return line.startswith("#" * level + " ") and not line.startswith("#" * (level + 1))

    in_code_block = False
    flowables = []

    lines = report_text.split("\n")
    i = 0
    while i < len(lines):
        raw = lines[i]
        stripped = raw.strip()

        # Code block fences
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            i += 1
            continue
        if in_code_block:
            flowables.append(Paragraph(raw.replace(" ", "&nbsp;"), code_style))
            i += 1
            continue

        # H1
        if stripped.startswith("# "):
            flowables.append(Spacer(1, 4))
            flowables.append(HRFlowable(width="100%", thickness=1, color=VIOLET, spaceAfter=6))
            flowables.append(Paragraph(md_to_text(stripped[2:]), h1_style))
            i += 1
            continue

        # H2
        if stripped.startswith("## "):
            flowables.append(Paragraph(md_to_text(stripped[3:]), h2_style))
            i += 1
            continue

        # H3
        if stripped.startswith("### "):
            flowables.append(Paragraph(md_to_text(stripped[4:]), h2_style))
            i += 1
            continue

        # Numbered list  e.g. "1. ..."
        m = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        if m:
            text = f"<b>{m.group(1)}.</b> {md_to_text(m.group(2))}"
            flowables.append(Paragraph(text, bullet_style))
            i += 1
            continue

        # Bullet points
        if stripped.startswith("- ") or stripped.startswith("* "):
            text = "• " + md_to_text(stripped[2:])
            flowables.append(Paragraph(text, bullet_style))
            i += 1
            continue

        # Markdown table rows (skip ugly pipe rendering, just show as muted text)
        if stripped.startswith("|"):
            # Skip separator rows like |---|---|
            if re.match(r"^[\|\-\s:]+$", stripped):
                i += 1
                continue
            # Strip pipes and format cells
            cells = [c.strip() for c in stripped.strip("|").split("|")]
            text = "  ·  ".join(md_to_text(c) for c in cells if c)
            flowables.append(Paragraph(text, muted_style))
            i += 1
            continue

        # Horizontal rule ---
        if re.match(r"^-{3,}$", stripped) or re.match(r"^_{3,}$", stripped):
            flowables.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_700, spaceAfter=4))
            i += 1
            continue

        # Empty line → small spacer
        if not stripped:
            flowables.append(Spacer(1, 5))
            i += 1
            continue

        # Regular paragraph
        flowables.append(Paragraph(md_to_text(stripped), body_style))
        i += 1

    # ── Header / footer callback ─────────────────────────────────────────
    def on_page(canvas_obj, doc):
        canvas_obj.saveState()
        w, h = A4
        # Top banner
        canvas_obj.setFillColor(DARK_BG)
        canvas_obj.rect(0, h - 38, w, 38, fill=1, stroke=0)
        canvas_obj.setFont("Helvetica-Bold", 11)
        canvas_obj.setFillColor(WHITE)
        canvas_obj.drawString(20*mm, h - 25, "AI Mock Interviewer — Session Report")
        canvas_obj.setFont("Helvetica", 9)
        canvas_obj.setFillColor(SLATE_400)
        from datetime import date
        canvas_obj.drawRightString(w - 20*mm, h - 25, str(date.today()))
        # Bottom footer
        canvas_obj.setFillColor(SLATE_700)
        canvas_obj.rect(0, 0, w, 20, fill=1, stroke=0)
        canvas_obj.setFont("Helvetica", 8)
        canvas_obj.setFillColor(SLATE_400)
        canvas_obj.drawCentredString(w / 2, 7, f"Page {doc.page} | Confidential — AI-generated evaluation")
        canvas_obj.restoreState()

    # ── Build PDF ────────────────────────────────────────────────────────
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=46, bottomMargin=28,
        title="Interview Report",
    )

    # Dark page background
    def on_page_bg(canvas_obj, doc):
        canvas_obj.saveState()
        canvas_obj.setFillColor(colors.HexColor("#09090f"))
        canvas_obj.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
        canvas_obj.restoreState()
        on_page(canvas_obj, doc)

    doc.build(flowables, onFirstPage=on_page_bg, onLaterPages=on_page_bg)
    buffer.seek(0)

    return send_file(
        buffer,
        as_attachment=True,
        download_name="Interview_Report.pdf",
        mimetype="application/pdf",
    )


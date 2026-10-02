from utils.llm_client import call_llm
from config.prompts import (
    QUESTION_GENERATION_PROMPT,
    RESUME_QUESTION_PROMPT,
    PROJECT_INTERVIEW_PROMPT
)


def sanitize_question(text: str) -> str:
    """
    Ensures interview questions are NEVER incomplete.
    - Preserves inline or block code
    - Preserves newlines when code is present
    - Never merges code into prose
    """

    if not text:
        return "Can you explain a key technical decision you made?"

    text = text.strip()

    # ---------- CODE DETECTION ----------
    code_indicators = [
        "def ",
        "class ",
        "for ",
        "while ",
        "=",
        "{",
        "}",
        "return ",
        "if ",
        "else",
        "print(",
    ]

    has_code = (
        "```" in text
        or any(ind in text for ind in code_indicators)
        and "\n" in text
    )

    # 🔥 If code detected → RETURN AS-IS
    if has_code:
        return text

    # ---------- CLEAN QUESTION ONLY ----------
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    cleaned_lines = []

    for line in lines:
        line = line.lstrip("0123456789.-) ").strip()
        cleaned_lines.append(line)

    final_text = " ".join(cleaned_lines)

    if not final_text.endswith("?"):
        final_text += "?"

    return final_text



def generate_next_question(
    role: str,
    topic: str,
    confidence: int,
    competence_summary: str,
    qa_history: list,
    is_fresher: bool,
    interview_mode: str = "normal",
    project_readme: str = "",
    project_name: str = "",
    resume_text: str = "",
    language: str = "python"
) -> str:

    question_number = len(qa_history) + 1

    # ---------------- PHASE ----------------
    if question_number <= 2:
        phase = "basic warm-up"
    elif question_number <= 4:
        phase = "intermediate"
    else:
        phase = "advanced probing"

    # ---------------- HISTORY ----------------
    history = "No previous questions."
    if qa_history:
        history = ""
        for i, qa in enumerate(qa_history, start=1):
            history += f"Q{i}: {qa['question']}\nA{i}: {qa['answer']}\n\n"

    # ==================================================
    # PROJECT INTERVIEW (TOP PRIORITY)
    # ==================================================
    if interview_mode == "project" and project_readme:
        import uuid
        prompt = PROJECT_INTERVIEW_PROMPT.format(
            project_name=project_name,
            readme=project_readme,
            phase=phase,
            history=history,
            random_seed=str(uuid.uuid4())
        )
        raw = call_llm(prompt)
        return sanitize_question(raw)

    # ==================================================
    # RESUME-BASED QUESTION
    # ==================================================
    if resume_text and question_number in (1, 3):
        import uuid as _uuid
        prompt = RESUME_QUESTION_PROMPT.format(
            resume_text=resume_text,
            history=history,
            random_seed=str(_uuid.uuid4())
        )
        raw = call_llm(prompt)
        return sanitize_question(raw)

    # ==================================================
    # NORMAL TOPIC QUESTION
    # ==================================================
    import uuid
    prompt = QUESTION_GENERATION_PROMPT.format(
        role=role,
        topic=topic,
        candidate_type="fresher" if is_fresher else "experienced",
        phase=phase,
        confidence=confidence,
        competence_summary=competence_summary,
        history=history,
        random_seed=str(uuid.uuid4()),
        language=language
    )

    raw = call_llm(prompt)
    return sanitize_question(raw)

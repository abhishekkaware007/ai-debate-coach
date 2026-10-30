import io
import json
import logging
import os
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, File, UploadFile
from groq import Groq
from pydantic import BaseModel
from pypdf import PdfReader

router = APIRouter()
logger = logging.getLogger("uvicorn.error")

INTERVIEWER_SYSTEM_PROMPT = (
    "You are an experienced, professional job interviewer conducting a live voice mock interview. "
    "CRITICAL RULES:\n"
    "1. Keep your response concise and conversational; ask only one short question at a time.\n"
    "2. After each candidate answer, briefly evaluate its correctness and quality against the resume and the question. Use plain evaluative language such as 'Strong answer', 'Partially aligned', or 'Needs more focus'. Mention one clear reason, not a long lecture.\n"
    "3. Focus on real interview quality: relevance to the job, clarity of examples, technical depth, ownership, and evidence from the resume.\n"
    "4. Move to a different topic grounded in the resume for each new question (for example, another role, project, skill, achievement, or challenge). Do not keep asking about the same project; ask at most one clarifying follow-up when needed.\n"
    "5. Conduct a thorough interview of about 10 to 12 questions covering different areas. After the final answer, give a short closing summary with overall performance, strengths, and one improvement area. Do not ask another question after that.\n"
    "6. Never give long lectures, preambles, or multi-part questions.\n"
    "7. IMPORTANT: Maintain the same quality, depth, and professionalism for EVERY question throughout the entire interview. Do not become repetitive, vague, or lazy in later turns. Each question should be as thoughtful and specific as the first one.\n"
    "8. Vary question types across the interview: mix behavioral, technical, situational, and resume-specific questions."
)


def get_groq_client():
    env_file = Path(__file__).resolve().parent.parent / ".env.local"
    if env_file.exists():
        load_dotenv(dotenv_path=env_file, override=True)
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
    if not api_key or api_key.lower() in ("placeholder", "paste-your-groq-api-key-here") or api_key.startswith("paste-"):
        return None, model
    try:
        return Groq(api_key=api_key), model
    except Exception as e:
        logger.warning(f"Failed to initialize Groq client: {e}")
        return None, model


def extract_resume_text(filename: Optional[str], raw: bytes) -> str:
    if filename and filename.lower().endswith(".pdf"):
        reader = PdfReader(io.BytesIO(raw))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    if filename and filename.lower().endswith(".docx"):
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            document = ET.fromstring(archive.read("word/document.xml"))
        namespace = {"word": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        paragraphs = [
            "".join(node.text or "" for node in paragraph.findall(".//word:t", namespace))
            for paragraph in document.findall(".//word:p", namespace)
        ]
        return "\n".join(paragraphs)
    return raw.decode("utf-8", errors="ignore")


def analyze_resume_keywords(text: str) -> dict:
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    candidate_name = lines[0] if lines else "Candidate"
    
    known_skills = [
        "Python", "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "FastAPI",
        "Django", "Flask", "C++", "Java", "Go", "Rust", "AWS", "Docker", "Kubernetes",
        "SQL", "PostgreSQL", "MongoDB", "Redis", "Machine Learning", "Deep Learning",
        "NLP", "PyTorch", "TensorFlow", "TailwindCSS", "GraphQL", "Git"
    ]
    detected_skills = []
    for skill in known_skills:
        if re.search(r'\b' + re.escape(skill) + r'\b', text, re.IGNORECASE):
            detected_skills.append(skill)
            
    # Extract likely project lines or headings
    projects = []
    for line in lines:
        if any(keyword in line.lower() for keyword in ["project", "developed", "built", "engineered", "designed", "implemented"]):
            clean_proj = re.sub(r'^[•\-\*\s]+', '', line).strip()
            if 15 <= len(clean_proj) <= 90:
                projects.append(clean_proj)
                if len(projects) >= 4:
                    break

    return {
        "candidate_name": candidate_name[:50],
        "skills": detected_skills,
        "projects": projects
    }


def generate_fallback_first_question(resume_text: str) -> str:
    analysis = analyze_resume_keywords(resume_text)
    if analysis["projects"]:
        proj = analysis["projects"][0]
        return f"To start off, could you walk me through your work on '{proj}' and explain your primary architectural decisions?"
    elif analysis["skills"]:
        top_skills = ", ".join(analysis["skills"][:2])
        return f"To begin our interview, could you share a complex project where you leveraged {top_skills} and what technical hurdles you solved?"
    return "To begin our interview, could you walk me through the most technically impactful project on your resume and your specific role in building it?"


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    history: list[Message]
    resume_context: Optional[str] = None
    skip_answer: bool = False
    turn_number: int = 0


class ChatResponse(BaseModel):
    reply: str


class AnswerAssessment(BaseModel):
    question: str
    status: str
    reason: str


class InterviewSummaryResponse(BaseModel):
    overall_score: int
    verdict: str
    strengths: list[str]
    gaps: list[str]
    answer_assessments: list[AnswerAssessment]


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    client, model = get_groq_client()
    messages = [{"role": m.role, "content": m.content} for m in req.history]
    if req.skip_answer:
        messages.append({
            "role": "user",
            "content": "The candidate did not answer. Briefly say, 'Okay, let's move to the next topic,' then ask one concise question about a different topic from their resume. Do not evaluate a missing answer.",
        })
    if not messages:
        messages = [{"role": "user", "content": "Let's begin the interview."}]

    if client:
        try:
            system_prompt = INTERVIEWER_SYSTEM_PROMPT
            if req.turn_number >= 12:
                system_prompt += " This is the final interview turn: give a brief closing summary and do not ask another question."
            if req.resume_context:
                system_prompt += (
                    f"\n\nCandidate's resume highlights:\n{req.resume_context[:2500]}\n"
                    "Use the resume and the full conversation history to track topics already covered. Make each question about a distinct relevant topic, and keep the interview varied and realistic."
                )

            response = client.chat.completions.create(
                model=model,
                max_tokens=500,
                temperature=0.7,
                messages=[{"role": "system", "content": system_prompt}, *messages],
            )
            reply = response.choices[0].message.content.strip()
            return ChatResponse(reply=reply)
        except Exception as e:
            logger.warning(f"Groq API call failed in /chat: {e}. Falling back to guided interview engine.")

    # Guided fallback interview engine
    analysis = analyze_resume_keywords(req.resume_context or "")
    skills = analysis["skills"]

    turn = req.turn_number
    if turn >= 10:
        return ChatResponse(
            reply="Strong interview overall. You articulated your technical background and rationale clearly throughout our discussion. That concludes our mock interview session!"
        )

    fallback_topics = [
        f"Strong answer. Regarding performance and scalability, what trade-offs did you make when designing your data flow?",
        f"Good explanation. Can you describe a critical bug or production incident you diagnosed in {skills[0] if skills else 'your previous projects'} and how you resolved it?",
        f"Solid point. How do you approach testing, CI/CD, and maintaining code reliability across your team?",
        f"Well reasoned. Tell me about a time when you received pushback on a technical proposal and how you brought alignment.",
        f"That makes sense. If you had to re-architect that solution today with newer tools or patterns, what would you do differently?",
        f"Clear response. How do you balance shipping fast vs paying down technical debt in a high-velocity environment?",
        f"Understood. Could you share an experience where you had to quickly ramp up on a technology you hadn't used before?",
    ]

    question_idx = (turn - 1) % len(fallback_topics)
    prefix = "Understood, moving to the next topic. " if req.skip_answer else "Strong answer. "
    reply = f"{prefix}{fallback_topics[question_idx]}"
    return ChatResponse(reply=reply)


class StartInterviewResponse(BaseModel):
    first_question: str
    resume_context: str


@router.post("/start-interview", response_model=StartInterviewResponse)
async def start_interview(file: UploadFile = File(...)):
    raw = await file.read()
    text = extract_resume_text(file.filename, raw)
    clean_text = text.strip()[:4000]

    client, model = get_groq_client()
    if client:
        try:
            prompt = (
                "Here is a candidate's resume:\n\n"
                f"{clean_text}\n\n"
                "You are conducting a real-time mock job interview. "
                "Ask your very first interview question directly based on their background in this resume. "
                "STRICT RULES:\n"
                "- The question must be short and direct (strictly 1 to 2 sentences maximum).\n"
                "- Do NOT include any greeting, preamble, or filler (do NOT say 'Welcome' or 'Hello').\n"
                "- Output ONLY the interview question."
            )

            response = client.chat.completions.create(
                model=model,
                max_tokens=500,
                temperature=0.7,
                messages=[{"role": "user", "content": prompt}],
            )
            first_question = (response.choices[0].message.content or "").strip().strip('"\'')
            if first_question:
                return StartInterviewResponse(first_question=first_question, resume_context=clean_text)
        except Exception as e:
            logger.warning(f"Groq API failed in /start-interview: {e}. Using resume fallback.")

    # Intelligent resume-tailored first question
    first_question = generate_fallback_first_question(clean_text)
    return StartInterviewResponse(first_question=first_question, resume_context=clean_text)


class QuestionsResponse(BaseModel):
    questions: list[str]


@router.post("/resume-questions", response_model=QuestionsResponse)
async def resume_questions(file: UploadFile = File(...)):
    raw = await file.read()
    text = extract_resume_text(file.filename, raw)

    client, model = get_groq_client()
    if client:
        try:
            prompt = (
                "Here is a candidate's resume:\n\n"
                f"{text[:3000]}\n\n"
                "Generate 5 short, direct interview questions tailored to this resume. "
                "Each question must be 1 to 2 sentences max. "
                "Return only the 5 questions, one per line, with no numbering or extra text."
            )

            response = client.chat.completions.create(
                model=model,
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}],
            )
            lines = response.choices[0].message.content.strip().split("\n")
            questions = [line.strip("-•. ").strip() for line in lines if line.strip()]
            if questions:
                return QuestionsResponse(questions=questions[:5])
        except Exception as e:
            logger.warning(f"Groq API failed in /resume-questions: {e}")

    analysis = analyze_resume_keywords(text)
    skills_str = ", ".join(analysis["skills"][:3]) if analysis["skills"] else "core technologies"
    questions = [
        f"Could you walk me through the architecture of your primary project and why you selected your tech stack?",
        f"How do you evaluate and optimize performance bottlenecks when working with {skills_str}?",
        f"Can you discuss a time when you solved a complex debugging challenge under tight deadlines?",
        f"How do you design scalable APIs and ensure data consistency across services?",
        f"What is one technical decision on your resume you would approach differently now?"
    ]
    return QuestionsResponse(questions=questions)


@router.post("/interview-summary", response_model=InterviewSummaryResponse)
def interview_summary(req: ChatRequest):
    if not req.history:
        return InterviewSummaryResponse(
            overall_score=60,
            verdict="Not enough interview data for a final verdict yet.",
            strengths=["Resume review started."],
            gaps=["Complete more interview questions to receive a full evaluation."],
            answer_assessments=[],
        )

    client, model = get_groq_client()
    conversation_text = "\n".join(f"{m.role}: {m.content}" for m in req.history)

    if client:
        try:
            prompt = (
                "You are an expert hiring manager and mock interview coach. "
                "Evaluate the interview against the candidate's resume and the Q&A history. "
                "Give a realistic verdict on whether each answer was correct, relevant, and complete.\n\n"
                f"Resume context:\n{(req.resume_context or '')[:2500]}\n\n"
                f"Interview history:\n{conversation_text}\n\n"
                "Return valid JSON only using this exact schema:\n"
                "{\n"
                "  \"overall_score\": 0-100,\n"
                "  \"verdict\": \"short verdict text\",\n"
                "  \"strengths\": [\"one\", \"two\"],\n"
                "  \"gaps\": [\"one\", \"two\"],\n"
                "  \"answer_assessments\": [\n"
                "    {\"question\": \"question text\", \"status\": \"Strong|Fair|Needs improvement\", \"reason\": \"reason\"},\n"
                "    {\"question\": \"question text\", \"status\": \"Strong|Fair|Needs improvement\", \"reason\": \"reason\"}\n"
                "  ]\n"
                "}\n"
                "Score based on whether the candidate answered the actual question, showed relevant experience, and provided concrete examples."
            )

            response = client.chat.completions.create(
                model=model,
                max_tokens=500,
                temperature=0.4,
                messages=[{"role": "user", "content": prompt}],
            )
            content = (response.choices[0].message.content or "").strip()
            data = json.loads(content)
            assessments = [
                AnswerAssessment(
                    question=str(item.get("question", "Question")),
                    status=str(item.get("status", "Fair")),
                    reason=str(item.get("reason", "Relevant but could be more concrete.")),
                )
                for item in data.get("answer_assessments", [])
            ]
            return InterviewSummaryResponse(
                overall_score=max(0, min(100, int(data.get("overall_score", 70)))),
                verdict=str(data.get("verdict", "Interview completed successfully.")),
                strengths=[str(x) for x in data.get("strengths", [])][:3],
                gaps=[str(x) for x in data.get("gaps", [])][:3],
                answer_assessments=assessments,
            )
        except Exception as e:
            logger.warning(f"Groq API failed in /interview-summary: {e}")

    # Fallback summary generation
    user_answers = [m.content for m in req.history if m.role == "user"]
    avg_length = sum(len(a.split()) for a in user_answers) / max(len(user_answers), 1)

    if avg_length > 40:
        score = 85
        verdict = "Strong interview performance. You provided detailed context and demonstrated good technical ownership."
        strengths = [
            "Gave thorough and substantive answers with relevant detail.",
            "Demonstrated clear technical vocabulary and system understanding.",
            "Connected answers back to practical project experience."
        ]
        gaps = ["Could tighten initial summaries before diving into technical depth."]
    else:
        score = 74
        verdict = "Solid foundation. Answers were concise, but adding more metrics and specific trade-offs will make your answers stand out."
        strengths = [
            "Clear and direct responses without unnecessary filler.",
            "Addressed the core question effectively."
        ]
        gaps = [
            "Include concrete examples or quantifiable metrics (e.g. latency improvements, user scale).",
            "Explain the 'why' behind architectural choices more explicitly."
        ]

    assessments = []
    questions = [m.content for m in req.history if m.role == "assistant"]
    for i, q in enumerate(questions[:len(user_answers)]):
        status = "Strong" if len(user_answers[i].split()) > 30 else "Fair"
        assessments.append(
            AnswerAssessment(
                question=q[:80] + ("..." if len(q) > 80 else ""),
                status=status,
                reason="Demonstrated relevant experience and clarity." if status == "Strong" else "Answer was relevant but could include deeper architectural details."
            )
        )

    return InterviewSummaryResponse(
        overall_score=score,
        verdict=verdict,
        strengths=strengths,
        gaps=gaps,
        answer_assessments=assessments,
    )
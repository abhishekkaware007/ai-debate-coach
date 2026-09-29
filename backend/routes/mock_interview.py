import io
import os

from fastapi import APIRouter, File, UploadFile
from groq import Groq
from pydantic import BaseModel
from pypdf import PdfReader

router = APIRouter()
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

INTERVIEWER_SYSTEM_PROMPT = (
    "You are an experienced interviewer conducting a mock job interview. "
    "Ask one question at a time. After the candidate answers, ask a natural, "
    "relevant follow-up question that digs into what they just said, rather "
    "than moving to an unrelated topic. Keep questions concise and realistic."
)


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    history: list[Message]


class ChatResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    messages = [{"role": m.role, "content": m.content} for m in req.history]
    if not messages:
        messages = [{"role": "user", "content": "Let's begin the interview."}]

    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=400,
        messages=[{"role": "system", "content": INTERVIEWER_SYSTEM_PROMPT}, *messages],
    )
    return ChatResponse(reply=response.choices[0].message.content)


class QuestionsResponse(BaseModel):
    questions: list[str]


@router.post("/resume-questions", response_model=QuestionsResponse)
async def resume_questions(file: UploadFile = File(...)):
    raw = await file.read()

    if file.filename and file.filename.lower().endswith(".pdf"):
        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    else:
        text = raw.decode("utf-8", errors="ignore")

    prompt = (
        "Here is a candidate's resume:\n\n"
        f"{text}\n\n"
        "Generate exactly 5 interview questions tailored to this resume. "
        "Return only the 5 questions, one per line, with no numbering or extra text."
    )

    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    lines = response.choices[0].message.content.strip().split("\n")
    questions = [line.strip("-•. ").strip() for line in lines if line.strip()]
    return QuestionsResponse(questions=questions[:5])
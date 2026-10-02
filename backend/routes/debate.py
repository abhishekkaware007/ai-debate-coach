import os

from fastapi import APIRouter
from groq import Groq
from pydantic import BaseModel

router = APIRouter()
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")


class Message(BaseModel):
    role: str
    content: str


class DebateRequest(BaseModel):
    topic: str
    history: list[Message]


class DebateResponse(BaseModel):
    reply: str


@router.post("/chat", response_model=DebateResponse)
def chat(req: DebateRequest):
    system_prompt = (
        f'The debate motion is: "{req.topic}". '
        "You are arguing the opposite side from the user. Respond directly to "
        "the user's specific point with a focused counter-argument rather than "
        "a generic rebuttal. Keep responses to 3-5 sentences."
    )

    messages = [{"role": m.role, "content": m.content} for m in req.history]
    if not messages:
        messages = [{"role": "user", "content": f"I'll start: {req.topic}."}]

    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=400,
        messages=[{"role": "system", "content": system_prompt}, *messages],
    )
    return DebateResponse(reply=response.choices[0].message.content)
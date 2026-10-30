import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter
from groq import Groq
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("uvicorn.error")


class Message(BaseModel):
    role: str
    content: str


class DebateRequest(BaseModel):
    topic: str
    history: list[Message]


class DebateResponse(BaseModel):
    reply: str


def get_groq_client():
    env_file = Path(__file__).resolve().parent.parent / ".env.local"
    if env_file.exists():
        load_dotenv(dotenv_path=env_file, override=True)
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()
    if not api_key or api_key.lower() in ("placeholder", "paste-your-groq-api-key-here") or api_key.startswith("paste-"):
        return None, model
    try:
        return Groq(api_key=api_key), model
    except Exception as e:
        logger.warning(f"Failed to initialize Groq client in debate: {e}")
        return None, model


@router.post("/chat", response_model=DebateResponse)
def chat(req: DebateRequest):
    client, model = get_groq_client()

    system_prompt = (
        f'The debate motion is: "{req.topic}". '
        "You are arguing the opposite side from the user. Respond directly to "
        "the user's specific point with a focused counter-argument rather than "
        "a generic rebuttal. Keep responses to 3-5 sentences."
    )

    messages = []
    for item in req.history:
        if hasattr(item, "role"):
            role = item.role
            content = item.content
        else:
            role = item.get("role")
            content = item.get("content", "")
        if role is not None:
            messages.append({"role": role, "content": content})

    if not messages:
        messages = [{"role": "user", "content": f"I'll start: {req.topic}."}]

    if client:
        try:
            response = client.chat.completions.create(
                model=model,
                max_tokens=400,
                messages=[{"role": "system", "content": system_prompt}, *messages],
            )
            return DebateResponse(reply=response.choices[0].message.content)
        except Exception as e:
            logger.warning(f"Groq debate error: {e}. Falling back to default counter-argument.")

    # Resilient fallback counter-argument
    last_user_msg = req.topic
    for message in reversed(messages):
        role = message.get("role") if isinstance(message, dict) else getattr(message, "role", None)
        content = message.get("content") if isinstance(message, dict) else getattr(message, "content", "")
        if role == "user" and content:
            last_user_msg = content
            break
    reply = (
        f"While you raise an interesting point regarding \"{last_user_msg[:60]}...\", "
        f"overlooking the systemic trade-offs and negative externalities makes that position difficult to sustain. "
        f"When evaluating the motion '{req.topic}', empirical evidence highlights unintended consequences that cannot be ignored. "
        f"How do you address the fundamental counter-evidence and long-term costs that contradict your stance?"
    )
    return DebateResponse(reply=reply)
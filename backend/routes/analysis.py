import os
import re
import json
import uuid
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from groq import Groq

try:
    import spacy
except ImportError:
    spacy = None

router = APIRouter()


@router.get("/test-llm")
def test_llm():
    """Send a short test prompt to Groq and return its reply."""
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL")

    if not api_key or not api_key.strip() or api_key.strip().lower().startswith("paste-"):
        return {"error": "GROQ_API_KEY is missing or still contains its placeholder. Add your Groq API key to backend/.env.local."}

    if not model or not model.strip() or model.strip().lower().startswith("paste-"):
        return {"error": "GROQ_MODEL is missing or still contains its placeholder. Add a current Groq model name to backend/.env.local."}

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Say hello in one short sentence."}],
            max_tokens=100,
        )
        reply = response.choices[0].message.content or ""
        return {"reply": reply}
    except Exception as error:
        # Report a safe category only; never include exception details that could expose credentials.
        status_code = getattr(error, "status_code", None)
        if status_code in (401, 403):
            return {"error": "Groq rejected the API key. Check the key in backend/.env.local."}
        if status_code == 404:
            return {"error": "Groq could not find that model. Check that GROQ_MODEL is current."}
        if status_code == 429:
            return {"error": "Groq rate limit reached. Wait briefly and try again."}
        if type(error).__name__ == "APIConnectionError":
            return {"error": "Could not connect to Groq. Check your internet connection."}
        return {"error": f"Groq request failed ({type(error).__name__}). Check the key, model, and network."}

# Load the language model only when spaCy is installed. Do not download it at startup.
nlp = None
if spacy is not None:
    try:
        nlp = spacy.load("en_core_web_sm")
    except Exception:
        # The API can still run; analysis will use its lightweight fallback instead.
        nlp = None

# Target filler words and hedge phrases
TARGET_FILLERS = ["um", "uh", "like", "you know", "basically"]
HEDGE_PHRASES = [
    "i think maybe",
    "i guess",
    "sort of",
    "kind of",
    "maybe",
    "perhaps",
    "i believe maybe",
    "probably",
    "it seems like"
]

class Scores(BaseModel):
    clarity: int = Field(..., ge=0, le=100)
    confidence: int = Field(..., ge=0, le=100)
    structure: int = Field(..., ge=0, le=100)
    fluency: int = Field(..., ge=0, le=100)
    engagement: int = Field(..., ge=0, le=100)

class AnalysisRequest(BaseModel):
    transcript: str
    session_id: Optional[str] = None

class AnalysisResponse(BaseModel):
    session_id: str
    scores: Scores
    tips: List[str]
    transcript: str


def run_spacy_sanity_check(text: str):
    """
    NLP Sanity-check pass using spaCy en_core_web_sm.
    Extracts sentence counts, filler word counts, hedge counts, and sentence length statistics.
    """
    if nlp is not None:
        doc = nlp(text)
        words = [token.text for token in doc if not token.is_punct and not token.is_space]
        word_count = len(words)
        sentences = list(doc.sents)
        sentence_count = max(len(sentences), 1)
    else:
        # Estimate basic counts without spaCy so analysis can still complete.
        words = re.findall(r"\b\w+\b", text)
        word_count = len(words)
        sentence_count = max(len(re.findall(r"[.!?]+", text)), 1)
    avg_sentence_len = word_count / sentence_count if word_count > 0 else 0
    
    # Check filler words using word-boundary regex
    filler_counts = {}
    total_fillers = 0
    lowered = text.lower()
    for filler in TARGET_FILLERS:
        pattern = r"\b" + re.escape(filler) + r"\b"
        matches = re.findall(pattern, lowered)
        count = len(matches)
        if count > 0:
            filler_counts[filler] = count
            total_fillers += count

    # Check hedge phrases
    hedge_counts = {}
    total_hedges = 0
    for hedge in HEDGE_PHRASES:
        pattern = r"\b" + re.escape(hedge) + r"\b"
        matches = re.findall(pattern, lowered)
        count = len(matches)
        if count > 0:
            hedge_counts[hedge] = count
            total_hedges += count

    filler_ratio = (total_fillers / max(word_count, 1)) * 100
    hedge_ratio = (total_hedges / max(word_count, 1)) * 100

    return {
        "word_count": word_count,
        "sentence_count": sentence_count,
        "avg_sentence_length": round(avg_sentence_len, 1),
        "total_fillers": total_fillers,
        "filler_counts": filler_counts,
        "total_hedges": total_hedges,
        "hedge_counts": hedge_counts,
        "filler_ratio": round(filler_ratio, 2),
        "hedge_ratio": round(hedge_ratio, 2),
    }


def deterministic_spacy_fallback(text: str, stats: dict) -> tuple[dict, list[str]]:
    """
    High-fidelity deterministic fallback scoring based on spaCy metrics
    used when Claude API key is unavailable or during offline testing.
    """
    word_count = stats["word_count"]
    total_fillers = stats["total_fillers"]
    total_hedges = stats["total_hedges"]
    avg_len = stats["avg_sentence_length"]

    if word_count == 0:
        return (
            {"clarity": 50, "confidence": 50, "structure": 50, "fluency": 50, "engagement": 50},
            [
                "Speak at least one complete sentence to receive comprehensive vocal delivery feedback.",
                "Maintain a steady speaking rhythm from the opening line.",
                "Structure your initial claim clearly to anchor your argument."
            ]
        )

    # Fluency: penalized heavily by filler words (um, uh, like, you know, basically)
    filler_penalty = min(total_fillers * 7, 60)
    fluency = max(30, min(95, int(92 - filler_penalty)))

    # Confidence: penalized by hedge phrases ('i think maybe') and fillers
    hedge_penalty = min(total_hedges * 9 + total_fillers * 4, 55)
    confidence = max(25, min(95, int(90 - hedge_penalty)))

    # Structure: ideal average sentence length between 12 and 22 words
    if 10 <= avg_len <= 24:
        structure = 88
    elif avg_len < 10:
        structure = max(55, int(75 - (10 - avg_len) * 3))
    else:
        structure = max(50, int(85 - (avg_len - 24) * 2))

    # Clarity: vocabulary richness and readability
    clarity = max(40, min(96, int(86 - (total_fillers * 3))))

    # Engagement: balanced pacing and assertiveness
    engagement = max(45, min(95, int(84 - total_hedges * 4 + min(word_count // 10, 10))))

    # Curate exactly 3 specific tips
    tips = []
    if total_fillers > 0:
        most_common_filler = max(stats["filler_counts"], key=stats["filler_counts"].get)
        tips.append(
            f"Reduce repetitive vocal pauses, especially '{most_common_filler}' ({stats['filler_counts'][most_common_filler]} instances); embrace brief silent pauses instead."
        )
    else:
        tips.append("Excellent fluency: you avoided verbal crutches like 'um' and 'like', giving your delivery crisp authority.")

    if total_hedges > 0:
        tips.append(
            "Replace tentative qualifiers such as 'I think maybe' with assertive, direct declarations to project confidence."
        )
    else:
        tips.append(
            "Strong assertive tone: state your core thesis within your opening 10 seconds to command audience focus."
        )

    if avg_len > 24:
        tips.append("Break down lengthy compound sentences into punchier, memorable points for greater rhetorical impact.")
    elif avg_len < 8:
        tips.append("Expand your assertions with supporting evidence or reasoning to give your argument greater analytical weight.")
    else:
        tips.append("Vary your vocal pacing across key points to emphasize debate claims and keep the evaluator engaged.")

    return (
        {
            "clarity": clarity,
            "confidence": confidence,
            "structure": structure,
            "fluency": fluency,
            "engagement": engagement,
        },
        tips[:3]
    )

def call_claude_scoring(transcript: str, stats: dict) -> tuple[dict, list[str]]:
    """
    Calls Anthropic Claude API (model: claude-sonnet-5) with a structured prompt.
    Falls back gracefully to spaCy metrics if key is missing or call fails.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return deterministic_spacy_fallback(transcript, stats)

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        prompt = f"""You are an elite speech, debate, and interview delivery coach.
Analyze the following speaker transcript and the spaCy NLP statistics:

TRANSCRIPT:
\"\"\"{transcript}\"\"\"

SPACY NLP SANITY STATS:
- Total words: {stats['word_count']}
- Sentence count: {stats['sentence_count']}
- Average sentence length: {stats['avg_sentence_length']} words
- Filler words identified: {json.dumps(stats['filler_counts'])} (Total: {stats['total_fillers']})
- Hedge phrases identified: {json.dumps(stats['hedge_counts'])} (Total: {stats['total_hedges']})

Evaluate the speaker's performance across 5 key dimensions (score each strictly 0-100 as an integer):
1. clarity: articulation, precision, absence of confusing phrasing
2. confidence: decisiveness, lack of tentative hedging ('I think maybe'), vocal authority
3. structure: logical progression, sentence boundaries, cohesive flow
4. fluency: smooth delivery, absence of vocal fillers ('um', 'uh', 'like', 'you know', 'basically')
5. engagement: persuasive power, vocal conviction cues, dynamic rhetoric

Also provide EXACTLY 3 specific, actionable, and constructive tips for the speaker.

Return ONLY a valid JSON object matching this schema with no extra conversational commentary:
{{
  "scores": {{
    "clarity": <int 0-100>,
    "confidence": <int 0-100>,
    "structure": <int 0-100>,
    "fluency": <int 0-100>,
    "engagement": <int 0-100>
  }},
  "tips": [
    "<specific actionable tip 1>",
    "<specific actionable tip 2>",
    "<specific actionable tip 3>"
  ]
}}"""

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=800,
            temperature=0.3,
            messages=[{"role": "user", "content": prompt}]
        )

        content_text = ""
        for block in response.content:
            if hasattr(block, "text"):
                content_text += block.text

        # Clean JSON markdown fences if present
        clean_json = re.sub(r"^```json\s*", "", content_text.strip(), flags=re.MULTILINE)
        clean_json = re.sub(r"```$", "", clean_json.strip(), flags=re.MULTILINE).strip()
        data = json.loads(clean_json)

        scores = data.get("scores", {})
        tips = data.get("tips", [])

        # Validate shape
        required_keys = ["clarity", "confidence", "structure", "fluency", "engagement"]
        for key in required_keys:
            scores[key] = int(max(0, min(100, scores.get(key, 75))))

        if len(tips) != 3:
            while len(tips) < 3:
                tips.append("Practice regular pacing to enhance speech cadence and clarity.")
            tips = tips[:3]

        return scores, tips
    except Exception as e:
        print(f"[Claude API fallback invoked due to: {e}]")
        return deterministic_spacy_fallback(transcript, stats)


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_speech(payload: AnalysisRequest):
    """
    POST /analyze
    Accepts full transcript, runs spaCy sanity check, queries Claude API for scoring,
    and returns exact expected schema.
    """
    transcript = (payload.transcript or "").strip()
    session_id = payload.session_id or f"session_{uuid.uuid4().hex[:8]}"

    # Step 1: spaCy sanity check
    stats = run_spacy_sanity_check(transcript)

    # Step 2: Claude API scoring (model: claude-sonnet-5)
    scores_dict, tips = call_claude_scoring(transcript, stats)

    # Step 3: Return exact JSON contract
    response_data = {
        "session_id": session_id,
        "scores": {
            "clarity": scores_dict["clarity"],
            "confidence": scores_dict["confidence"],
            "structure": scores_dict["structure"],
            "fluency": scores_dict["fluency"],
            "engagement": scores_dict["engagement"],
        },
        "tips": tips,
        "transcript": transcript,
    }

    return response_data

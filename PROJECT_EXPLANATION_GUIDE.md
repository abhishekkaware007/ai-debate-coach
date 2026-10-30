# AI Debate and Interview Coach

## Beginner-Friendly Project Explanation

**Audience:** Project professor, evaluator, and students preparing for a demonstration or viva

> **Accuracy note:** This guide describes the code in this project as it currently exists. Proposed improvements are marked as future scope. The project uses **Groq**, an AI service provider, for debate and interview conversations. It does not use **Grok**, the separate xAI model family.

## 1. Project Summary

AI Debate and Interview Coach is a web application for practicing spoken communication. It provides three activities:

1. **Speech practice:** The browser turns speech into text. The application checks the transcript for filler words and hesitant phrases, then returns scores and suggestions.
2. **AI debate:** The student enters a topic and exchanges text or spoken turns with an AI instructed to argue the opposite side.
3. **Mock interview:** The student uploads a resume. The backend extracts resume text and uses an AI interviewer to ask questions and assess answers.

The project has a web interface, a Python API server, external AI services, and a local database for speech-practice history. It is a student prototype, not a hiring system or a scientifically validated measure of communication ability.

### Short presentation introduction

> "Our project is a browser-based speaking practice tool with speech analysis, AI debate, and resume-based mock interviews. The frontend is built with Next.js and React. A FastAPI backend handles analysis, resume parsing, session history, and requests to AI services. The goal is to make practice accessible. The current version is a prototype, so its scores and emotion estimates should be treated as guidance rather than objective judgments."

## 2. Problem and Purpose

Students may have limited opportunities to practice interviews or structured speaking with immediate feedback. A human coach can be expensive or difficult to schedule. Practicing alone can also make it hard to notice repeated filler words or unclear answers.

This project aims to provide:

- A practice partner available through a web browser.
- Feedback on a transcript, including filler words and hedging language.
- An AI opponent for practicing a debate topic.
- Interview questions based on text extracted from a resume.
- A dashboard showing saved speech-analysis sessions.

The application supports practice. It cannot guarantee that someone will pass an interview, win a debate, or communicate effectively in every real-world situation.

## 3. System Architecture

```text
Student in browser
  |-- Next.js / React user interface
  |-- Browser speech recognition converts speech to text
  |-- Browser speech synthesis reads AI replies aloud
  |-- Optional webcam + face-api.js runs visual estimates in browser
  |
  | HTTP requests through Next.js rewrites
  v
Python FastAPI backend (normally http://127.0.0.1:8000)
  |-- Transcript analysis (regex, optional spaCy, optional Claude API)
  |-- Debate and interview requests (Groq API)
  |-- Resume text extraction (PDF, DOCX, or plain text)
  |-- Speech-analysis session history (SQLite)
  v
External AI services, when configured
  |-- Groq-hosted LLM for debate and interview responses
  |-- Optional Anthropic Claude API for transcript scoring
```

The browser sends text to the backend for AI conversations and transcript analysis. Webcam frames are processed in the browser and are not included in the speech-analysis request in the code. Browser speech recognition may use browser or operating-system services, so do not promise that microphone audio is always processed entirely offline or only on the device.

## 4. Technology Stack

### Frontend

| Technology | What it is | How this project uses it |
| --- | --- | --- |
| **Next.js 14** | A framework built on React for web applications. It adds file-based routing, build tools, and server features. | Provides pages such as `/practice`, `/debate`, `/mock-interview`, and `/dashboard`. Rewrite rules forward browser API paths to FastAPI. |
| **React 18** | A JavaScript library for building interfaces from reusable components. | Displays forms, chat messages, recording state, scores, charts, and other changing UI. |
| **TypeScript 5** | JavaScript with static type checking. Types can catch some mismatches during development. | Defines types for API responses, scores, chat messages, and component data. It cannot prevent every runtime error. |
| **Tailwind CSS 3** | A utility-based CSS framework. | Styles pages and responsive layouts using utility classes in the components. |
| **Browser Web Speech API** | Browser APIs for speech recognition and speech synthesis. Support and behavior vary by browser. | Recognition turns microphone speech into transcript text. Speech synthesis can read AI responses aloud. These are browser capabilities, not models hosted by this backend. |
| **Web Audio API** | Browser APIs for working with audio streams and nodes. | Creates a microphone waveform visualization. The backend does not analyze the raw waveform for pitch or tone. |
| **face-api.js** | A JavaScript library that runs face-detection, landmark, and expression models in the browser. | Uses model files in `frontend/public/models` to estimate face presence, landmarks, and expression labels while the camera is active. These are rough visual estimates. |
| **Recharts** | A charting library for React. | Displays score history and related charts on the dashboard. |

### Backend and data

| Technology | What it is | How this project uses it |
| --- | --- | --- |
| **Python** | A general-purpose programming language. | Implements the API and analysis logic. |
| **FastAPI** | A Python framework for building HTTP APIs. | Defines endpoints for analysis, sessions, debate, and interviews. It validates request and response data with Pydantic. |
| **Uvicorn** | An ASGI web server. | Runs the FastAPI application locally, on port 8000 by default. FastAPI is the application; Uvicorn serves it over HTTP. |
| **Pydantic** | A Python data-validation library used by FastAPI. | Defines request and response models, including scores constrained to the range 0 to 100. |
| **Groq API and Python SDK** | Groq is a cloud provider that serves language models. The backend calls it using the Groq SDK. | Generates debate replies, interview questions, and interview evaluations. The model is configured by `GROQ_MODEL`; the code defaults to `openai/gpt-oss-120b`. |
| **Large language model (LLM)** | An AI model trained to process and generate text. It can follow instructions, but can also make mistakes or invent information. | Receives prompts and conversation history to generate debate and interview text. It does not independently verify every claim. |
| **Regular expressions (regex)** | Text patterns used to find matching words or phrases. | Counts configured filler words and hedge phrases in a speech transcript. This is a rule-based check, not deep language understanding. |
| **spaCy (optional)** | An open-source Python natural-language-processing library. | If installed with its English model, it helps count words and sentences. If unavailable, the code uses a simpler regex fallback. spaCy is not listed in `backend/requirements.txt`. |
| **Anthropic Claude API (optional)** | A hosted LLM service from Anthropic. Claude is separate from Groq. | Transcript scoring tries Claude when `ANTHROPIC_API_KEY` is set and the `anthropic` Python package is installed. Otherwise, it falls back to locally calculated heuristic scores. The Anthropic package is not listed in `backend/requirements.txt`. |
| **SQLite** | A lightweight relational database stored in a local file. | Stores completed speech-analysis sessions, their scores, tips, transcript, and date. Debate and interview chats are not saved by the sessions route. |
| **pypdf** | A Python library for reading PDF files. | Extracts text from uploaded PDF resumes. |
| **Python standard library (`zipfile`, `xml.etree`)** | Modules included with Python for ZIP archives and XML. | Reads XML inside DOCX files and extracts paragraph text. Plain-text resumes are decoded as text. |
| **python-dotenv** | A library that reads environment values from a local `.env` file. | Loads backend settings such as API keys and model name from `backend/.env.local`. Never commit or display real API keys. |

### Groq, Grok, Claude, and LLM

- **Groq** is the service provider used by this project's debate and interview routes.
- **Grok** is a separate LLM family made by xAI. This project does not call xAI Grok.
- **Claude** is Anthropic's LLM family. It is an optional path for speech transcript scoring, not debate chat.
- **LLM** means large language model. It describes a kind of AI model, not one company or API.

The exact Groq model can be changed with `GROQ_MODEL`. Do not claim a specific model or response speed unless it has been checked in the environment used for the demonstration.

## 5. Main Workflows

### Speech practice and analysis

1. The student grants microphone permission and speaks in the browser.
2. The browser's Speech Recognition API produces a transcript. Interim and final text may be shown while recording.
3. The browser sends the final transcript to `POST /analyze` through the `/api/analyze` Next.js rewrite.
4. The backend counts words, sentences, configured filler words, and hedge phrases. spaCy may help with word and sentence counts; a basic fallback exists.
5. If configured and available, the backend asks Claude for scores and three tips. Otherwise, it calculates scores using fixed rules based on transcript statistics.
6. The backend stores the result in SQLite and returns it to the frontend.
7. The dashboard reads saved sessions from `GET /sessions` and plots score history.

The score categories are clarity, confidence, structure, fluency, and engagement. They are application-generated estimates. Several categories are inferred from written text and fixed rules; they do not precisely measure vocal tone, emotion, or communication ability. The returned pause duration is estimated from filler count, not measured from silence in audio.

### AI debate

1. The student enters a topic on the Debate page.
2. The frontend sends the topic and conversation history to `POST /api/debate/chat`.
3. The backend instructs the configured Groq-hosted LLM to argue the opposite position and respond to the student's point.
4. The reply appears in chat. The shared chat component can use browser speech recognition for input and speech synthesis for spoken replies.

The LLM is prompted to debate, but it is not connected to a verified fact database. Its arguments may be incomplete or incorrect.

### Resume-based mock interview

1. The student uploads a PDF, DOCX, or TXT resume.
2. FastAPI extracts text. The first interview question uses up to 4,000 characters; ongoing chat prompts use up to 2,500 characters of resume context.
3. The Groq-hosted LLM generates a first question and continues using the resume text and conversation history.
4. The interviewer is prompted to ask varied questions and conduct about 10 to 12 turns.
5. A separate endpoint can generate an interview summary and answer assessments from the conversation history.

The resume is processed by the backend. The project does not currently implement user accounts or secure document management, so use a sample or non-sensitive resume for demonstrations.

### Webcam estimates

The Practice and chat interfaces can run face-api.js models in the browser while the camera is active. The models estimate face presence, landmarks, and expression labels. Some UI logic estimates whether the face appears oriented toward the screen using landmark positions.

These are not validated measures of confidence, honesty, attention, or interview readiness. Facial-expression models can be inaccurate and vary with lighting, camera quality, and individual differences. Do not use them to make consequential decisions about a student.

## 6. Limitations and Resource Constraints

1. **External AI services:** Debate and interview responses require internet access and a working Groq API key. Availability, latency, rate limits, and model changes can affect the application.
2. **Optional Claude setup:** The Anthropic package is not in the current backend requirements file. Without that package and a valid `ANTHROPIC_API_KEY`, scoring uses the deterministic fallback. Confirm which mode is active before describing results.
3. **Browser speech support:** Recognition availability, accuracy, and language support differ by browser and device. Noise, accents, microphone quality, and specialized vocabulary can cause transcript errors.
4. **No dedicated speech-recognition model:** The project does not host Whisper or another server-side speech-to-text model. This reduces local infrastructure needs but makes the project dependent on browser support and behavior.
5. **Unvalidated scoring:** Rule-based scores use hand-chosen penalties and thresholds. Optional LLM scores are subjective too. There is no formal rubric validation, calibrated training dataset, or user study proving the scores reliably represent communication skill.
6. **Text-only speech scoring:** The analysis endpoint receives a transcript, not raw audio. It cannot assess actual speaking rate, loudness, pitch, vocal variety, pronunciation, or real pauses. The waveform is a visualization, not an audio score.
7. **Limited facial analysis:** Face and expression detections can fail or mislabel expressions. Landmark-based screen direction is not precise eye tracking and can be affected by lighting or camera placement.
8. **Local SQLite storage:** History is stored in a local file. This is suitable for a prototype, but does not provide managed backups, access controls, or a production multi-user deployment strategy.
9. **No accounts or user separation:** There is no authentication, role management, or per-user privacy control.
10. **Resume parsing limits:** Text extraction may fail for scanned PDFs, image-only documents, unusual layouts, or encoding problems. Only an excerpt of the resume is sent in prompts, so details can be omitted.
11. **No guaranteed factual correctness:** Debate and interview responses come from an LLM. There is no retrieval or fact-checking pipeline, so feedback and claims may be wrong or generic.
12. **Local-development assumptions:** Next.js rewrites target FastAPI on port 8000. Some practice-page error and fallback messages still mention port 8001, which can confuse setup and debugging.

### What makes the project imperfect

- Automated end-to-end tests for browser, API, and scoring behavior are limited.
- Transcript mistakes directly affect feedback.
- Scores look precise because they are numbers from 0 to 100, but they are not standardized assessment results.
- Emotion labels and screen-direction estimates can overstate what a webcam model can know about a person's internal state.
- LLM feedback can vary and miss context even with a careful prompt.
- The prototype lacks authentication, cloud deployment, durable backups, multi-student privacy controls, and instructor administration tools.
- The optional Claude path is not included in the listed Python dependencies, making setup less obvious and potentially resulting in fallback scores.

These are appropriate limitations to acknowledge in an academic presentation. Do not claim that the system detects a person's true confidence or objectively grades their ability.

## 7. Future Scope

1. **Improve reliability:** Align port messages, document all optional packages and environment variables, and add tests for API schemas, filler counts, fallback scoring, and session persistence.
2. **Make scoring transparent:** Explain how each score is calculated, use a documented rubric, compare feedback with human evaluations, and communicate uncertainty.
3. **Improve speech recognition:** Offer a consistent transcription option, such as a hosted or locally deployable speech-recognition service, while documenting cost, privacy, language, and latency trade-offs.
4. **Add audio features:** Measure speaking rate, pause duration, and vocal variation only after obtaining consent and evaluating the reliability of those measurements.
5. **Improve resume handling:** Support scanned documents with OCR, handle longer resumes with structured extraction, and add data-retention and deletion controls.
6. **Improve persistence and privacy:** Add authentication, per-user data separation, explicit deletion, backups, and a managed database such as PostgreSQL before multi-user deployment.
7. **Ground AI feedback in references:** Add a curated interview or debate reference collection and retrieve relevant sources. This is called retrieval-augmented generation (RAG): relevant reference text is supplied to an LLM with the prompt.
8. **Evaluate webcam features responsibly:** Test across devices and lighting, keep camera use optional and clear, and avoid treating expression estimates as psychological truth.
9. **Support instructors:** Add opt-in class groups, progress summaries, accessibility features, and report exports with student privacy controls.

These are proposals, not finished features. Each would need implementation, testing, and privacy review.

## 8. Run and Configuration Notes

For a local demonstration, both the frontend and backend must be running. Next.js rewrites forward API requests to `http://127.0.0.1:8000`.

The backend reads settings from `backend/.env.local`. Common settings are:

```text
GROQ_API_KEY=your_groq_key
GROQ_MODEL=openai/gpt-oss-120b
ANTHROPIC_API_KEY=your_anthropic_key  # Optional; used only for Claude transcript scoring
```

Use valid credentials locally, but never put real API keys in this document, screenshots, a public repository, or presentation slides. If the optional Anthropic package is not installed, speech scoring falls back to local rules. Backend dependencies are listed in `backend/requirements.txt`; frontend dependencies and scripts are in `frontend/package.json`.

## 9. Viva Questions and Suggested Answers

**What is the project?**

It is a web-based communication practice prototype with transcript feedback, an AI debate opponent, and a resume-based mock interview.

**What does LLM mean?**

LLM means large language model. It is an AI model that processes and generates text. We call an LLM through an API to generate debate and interview responses. Its output can be mistaken, so it is not treated as guaranteed fact.

**Are you using Grok?**

No. Groq is the API provider used for debate and interview chat. Grok is a different model family from xAI. Claude from Anthropic is an optional service for speech transcript scoring.

**Why use Next.js and FastAPI together?**

Next.js and React handle the browser interface and pages. FastAPI handles Python API endpoints, resume extraction, transcript analysis, database access, and AI-service requests. The separation lets the frontend and backend be developed independently.

**How are filler words found?**

The backend checks the transcript against a configured list using regular expressions. This is useful for simple counts, but can miscount a word when it is used with a different meaning.

**Are the scores objective?**

No. They are coaching estimates based on transcript rules or optional LLM feedback. They have not been scientifically validated and cannot measure the full quality of spoken delivery.

**Does the project upload webcam video?**

The face-analysis feature runs in the browser, and the speech-analysis request contains the transcript rather than video frames. Microphone speech recognition is provided by the browser, whose processing behavior depends on the browser and device, so we do not claim all audio is always processed locally.

**What is the biggest limitation?**

Transcript-based scores and webcam estimates are approximate. They can provide practice suggestions, but should not be treated as reliable measurements or used for high-stakes decisions.

**What would you improve first?**

I would add tests and clear setup documentation, fix the inconsistent port messaging, and validate the scoring rubric with human reviewers. Then I would improve speech recognition, privacy controls, and multi-user storage.

## 10. Key Terms

- **API:** A defined way for software components to exchange requests and responses.
- **Backend:** Server-side code that handles application logic, data, and external services.
- **Frontend:** The part of an application displayed and used in a browser.
- **HTTP request:** A message sent from the frontend to a server to request work or data.
- **JSON:** A common text format for structured data exchanged by APIs.
- **Regex:** A pattern used to search or match text.
- **Database:** Organized storage that lets an application save and retrieve information.
- **Environment variable:** A configuration value supplied to a program at runtime, often used for API keys or model names.
- **Fallback:** A simpler alternative used when a preferred service or library is unavailable.
- **Inference:** Using a trained AI model to generate an output from an input, such as a response to a prompt.
- **RAG:** Retrieval-augmented generation. It supplies an LLM with relevant reference material to help ground its answer; it is a proposed improvement, not a current feature.
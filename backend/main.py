from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load settings from this backend folder's local environment file.
load_dotenv(dotenv_path=Path(__file__).with_name(".env.local"))

try:
    from .routes.analysis import router as analysis_router
    from .routes.debate import router as debate_router
    from .routes.mock_interview import router as mock_interview_router
    from .routes.sessions import router as sessions_router
except ImportError:  # pragma: no cover - supports running as a script from the backend dir
    from routes.analysis import router as analysis_router
    from routes.debate import router as debate_router
    from routes.mock_interview import router as mock_interview_router
    from routes.sessions import router as sessions_router

app = FastAPI(title="AI Debate & Interview Coach - Voice Engine Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router)
app.include_router(debate_router, prefix="/api/debate")
app.include_router(mock_interview_router, prefix="/api/mock-interview")
app.include_router(sessions_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)


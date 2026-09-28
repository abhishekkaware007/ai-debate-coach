from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.sessions import router as sessions_router

app = FastAPI(title="Orator Track C API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(sessions_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

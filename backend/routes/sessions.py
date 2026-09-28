"""Track C session API placeholder.

The static frontend currently uses the contract-shaped fakeSessions array in app.js.
Replace that source with GET /sessions once the shared backend is available.
"""

# Expected response shape:
# {
#   "session_id": "demo1",
#   "scores": {"clarity": 78, "confidence": 65, "structure": 82, "fluency": 70, "engagement": 60},
#   "tips": ["Slow down slightly"],
#   "transcript": "This is a sample answer...",
#   "date": "2026-08-01"
# }
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import JSON, Date, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

DATABASE_URL = "sqlite:///./sessions.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
	pass


class SessionRecord(Base):
	__tablename__ = "sessions"

	session_id: Mapped[str] = mapped_column(String, primary_key=True)
	user_id: Mapped[str] = mapped_column(String, index=True)
	title: Mapped[str] = mapped_column(String)
	type: Mapped[str] = mapped_column(String)
	scores: Mapped[dict[str, int]] = mapped_column(JSON)
	tips: Mapped[list[str]] = mapped_column(JSON)
	transcript: Mapped[str] = mapped_column(String)
	date: Mapped[date] = mapped_column(Date)


Base.metadata.create_all(engine)
router = APIRouter(prefix="/sessions", tags=["sessions"])


class SessionPayload(BaseModel):
	session_id: str
	title: str = "Practice session"
	type: str = "Interview"
	scores: dict[str, int] = Field(default_factory=dict)
	tips: list[str] = Field(default_factory=list)
	transcript: str = ""
	date: date


def get_db():
	db = SessionLocal()
	try:
		yield db
	finally:
		db.close()


def serialize(record: SessionRecord) -> dict[str, Any]:
	return {
		"session_id": record.session_id,
		"title": record.title,
		"type": record.type,
		"scores": record.scores,
		"tips": record.tips,
		"transcript": record.transcript,
		"date": record.date.isoformat(),
	}


@router.get("")
def list_sessions(user_id: str = Query(...), db: Session = Depends(get_db)):
	records = db.scalars(
		select(SessionRecord)
		.where(SessionRecord.user_id == user_id)
		.order_by(SessionRecord.date.desc())
	).all()
	return [serialize(record) for record in records]


@router.post("", status_code=201)
def create_session(payload: SessionPayload, user_id: str = Query(...), db: Session = Depends(get_db)):
	record = SessionRecord(user_id=user_id, **payload.model_dump())
	db.merge(record)
	db.commit()
	return serialize(record)

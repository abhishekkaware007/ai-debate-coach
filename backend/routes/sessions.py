import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter

router = APIRouter()
DATABASE_PATH = Path(__file__).resolve().parents[1] / "sessions.db"


def ensure_sessions_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            scores TEXT NOT NULL,
            tips TEXT NOT NULL,
            transcript TEXT NOT NULL
        )"""
    )


def save_session(session: dict) -> None:
    with sqlite3.connect(DATABASE_PATH) as connection:
        ensure_sessions_table(connection)
        connection.execute(
            """INSERT OR REPLACE INTO sessions
                (session_id, date, scores, tips, transcript)
                VALUES (?, ?, ?, ?, ?)""",
            (
                session["session_id"],
                datetime.now(timezone.utc).isoformat(),
                json.dumps(session["scores"]),
                json.dumps(session["tips"]),
                session["transcript"],
            ),
        )


@router.get("/sessions")
def list_sessions() -> list[dict]:
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.row_factory = sqlite3.Row
        ensure_sessions_table(connection)
        rows = connection.execute(
            "SELECT * FROM sessions ORDER BY date DESC"
        ).fetchall()

    return [
        {
            "session_id": row["session_id"],
            "date": row["date"],
            "scores": json.loads(row["scores"]),
            "tips": json.loads(row["tips"]),
            "transcript": row["transcript"],
        }
        for row in rows
    ]

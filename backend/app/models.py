"""Request/response contracts for the WatSwipe backend.

These mirror the ``JobPosting`` shape used by the extension
(``extension/src/lib/schema.js``) and the frontend (``frontend/src/lib/db.js``).
Only the fields needed for ranking are accepted — the backend never stores or
echoes back full postings, only computed scores.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class PostingIn(BaseModel):
    """A single posting, trimmed to the fields used for text ranking."""

    id: str
    title: str = ""
    description: str = ""
    tags: list[str] = Field(default_factory=list)


class RankRequest(BaseModel):
    query: str
    postings: list[PostingIn]


class Score(BaseModel):
    id: str
    score: float


class RankResponse(BaseModel):
    """Scores only — no posting text is returned, by design (privacy)."""

    scores: list[Score]

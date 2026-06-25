"""POST /rank — stateless relevance scoring for a batch of postings."""

from __future__ import annotations

from fastapi import APIRouter

from app.models import RankRequest, RankResponse
from app.services.ranking import rank

router = APIRouter()


@router.post("/rank", response_model=RankResponse)
def rank_postings(request: RankRequest) -> RankResponse:
    """Score postings against a free-text query.

    The request body (which may contain non-public posting text) is used only to
    compute scores in-memory and is never persisted or logged.
    """
    scores = rank(request.query, request.postings)
    return RankResponse(scores=scores)

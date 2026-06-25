"""Stateless TF-IDF relevance ranking.

Pure function, no I/O, no global mutable state. A fresh ``TfidfVectorizer`` is
fit per request over (query + postings), so the service is safe to run behind any
number of workers / replicas with no shared state — the scaling story for 200+
concurrent users. Nothing here is persisted or logged.
"""

from __future__ import annotations

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.models import PostingIn, Score


def _document(posting: PostingIn) -> str:
    """Flatten a posting's text fields into a single searchable document."""
    return " ".join([posting.title, posting.description, " ".join(posting.tags)]).strip()


def rank(query: str, postings: list[PostingIn]) -> list[Score]:
    """Score each posting's relevance to ``query`` in [0, 1], sorted descending.

    Returns scores in the same id-space as the input. An empty query or empty
    posting list yields zero-scores (still a valid, deterministic response).
    """
    if not postings:
        return []

    documents = [_document(p) for p in postings]
    query = (query or "").strip()

    # With no usable query text there's nothing to rank against — return neutral
    # zero scores rather than raising, so the client deck stays usable.
    if not query or not any(documents):
        return [Score(id=p.id, score=0.0) for p in postings]

    # Fit over query + documents together so the vocabulary covers the query terms.
    vectorizer = TfidfVectorizer(stop_words="english")
    matrix = vectorizer.fit_transform([query, *documents])

    query_vec = matrix[0]
    posting_vecs = matrix[1:]
    similarities = cosine_similarity(query_vec, posting_vecs)[0]

    scores = [Score(id=p.id, score=float(s)) for p, s in zip(postings, similarities)]
    scores.sort(key=lambda s: s.score, reverse=True)
    return scores

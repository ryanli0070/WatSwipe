"""Tests for the stateless /rank endpoint and ranking service."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.models import PostingIn
from app.services.ranking import rank

client = TestClient(app)


SAMPLE = {
    "query": "machine learning python data",
    "postings": [
        {
            "id": "a",
            "title": "Machine Learning Engineer",
            "description": "Build ML models in Python with pandas and scikit-learn.",
            "tags": ["python", "ml", "data"],
        },
        {
            "id": "b",
            "title": "Front-End Web Developer",
            "description": "React and CSS for marketing pages.",
            "tags": ["react", "css"],
        },
    ],
}


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_relevant_posting_outranks_irrelevant():
    res = client.post("/rank", json=SAMPLE)
    assert res.status_code == 200
    scores = res.json()["scores"]
    # Sorted descending; the ML posting must come first and beat the web posting.
    assert scores[0]["id"] == "a"
    by_id = {s["id"]: s["score"] for s in scores}
    assert by_id["a"] > by_id["b"]


def test_stateless_identical_requests_identical_output():
    first = client.post("/rank", json=SAMPLE).json()
    second = client.post("/rank", json=SAMPLE).json()
    assert first == second


def test_empty_postings_returns_empty():
    res = client.post("/rank", json={"query": "anything", "postings": []})
    assert res.json() == {"scores": []}


def test_empty_query_returns_zero_scores():
    postings = [PostingIn(id="x", title="Something", description="Words")]
    scores = rank("", postings)
    assert len(scores) == 1
    assert scores[0].score == 0.0

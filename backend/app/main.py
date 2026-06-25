"""WatSwipe backend — a stateless text-utility worker.

Deliberately minimal: no database, no auth, no session handling, no job storage.
The only mutable thing in the process is per-request memory. This is what lets the
service scale horizontally for 200+ concurrent users without a DB bottleneck.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import rank

# Origins allowed to call the API. The frontend dev server and (later) the
# production app origin. CORS is the only place an origin is trusted server-side.
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app = FastAPI(
    title="WatSwipe Backend",
    description="Stateless text-utility worker. No persistence, no auth, no PII storage.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,  # no cookies/sessions — we never authenticate users
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(rank.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

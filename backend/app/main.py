"""FastAPI entrypoint for the Bias Detection & Fairness Audit backend."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import CORS_ORIGINS
from app.routers import analyze, mitigate, model_audit, report, samples, upload
from app.services.sample_data import ensure_samples

logger = logging.getLogger("fairaudit")
logging.basicConfig(level=logging.INFO)


app = FastAPI(
    title="AI Bias Detection & Fairness Audit",
    version="0.1.0",
    description=(
        "Upload a dataset or hand us a trained model and we will measure "
        "demographic parity, equalised odds, disparate impact, predictive "
        "parity and individual fairness — then suggest concrete mitigations."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    try:
        ensure_samples()
        logger.info("Sample datasets and demo models ready.")
    except Exception as exc:  # pragma: no cover - non-fatal
        logger.warning("Could not pre-build sample data: %s", exc)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def root() -> JSONResponse:
    return JSONResponse(
        {
            "service": "AI Bias Detection & Fairness Audit",
            "endpoints": [
                "POST /upload",
                "POST /analyze",
                "POST /mitigate",
                "GET  /report/{id}",
                "GET  /report/{id}/pdf",
                "POST /model-audit",
                "GET  /samples",
                "POST /samples/{name}/load",
            ],
        }
    )


app.include_router(upload.router)
app.include_router(samples.router)
app.include_router(analyze.router)
app.include_router(mitigate.router)
app.include_router(report.router)
app.include_router(model_audit.router)

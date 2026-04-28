"""Report retrieval, listing, and PDF export."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.services.report import render_pdf
from app.services.store import store

router = APIRouter(tags=["report"])


@router.get("/report")
def list_reports() -> dict[str, Any]:
    reports = store.list_reports()
    return {
        "reports": [
            {
                "report_id": r.report_id,
                "dataset_id": r.dataset_id,
                "created_at": r.created_at,
                "outcome_column": r.payload.get("outcome_column"),
                "protected_attributes": r.payload.get("protected_attributes", []),
                "severity_summary": r.payload.get("severity_summary", {}),
            }
            for r in reports
        ]
    }


@router.get("/report/{report_id}")
def get_report(report_id: str) -> dict[str, Any]:
    entry = store.get_report(report_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return {
        "report_id": entry.report_id,
        "dataset_id": entry.dataset_id,
        "created_at": entry.created_at,
        **entry.payload,
    }


@router.get("/report/{report_id}/pdf")
def get_report_pdf(report_id: str) -> Response:
    entry = store.get_report(report_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Report not found")
    pdf_bytes = render_pdf(entry.payload)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="bias-audit-{report_id}.pdf"',
        },
    )

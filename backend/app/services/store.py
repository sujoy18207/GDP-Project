"""Tiny in-memory store for datasets and reports.

For a hackathon prototype we keep things in RAM (with a CSV/JSON copy on disk
for reload). A production version would back this with Redis/Postgres.
"""
from __future__ import annotations

import json
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import pandas as pd

from app.config import REPORTS_DIR, UPLOADS_DIR


@dataclass
class DatasetEntry:
    dataset_id: str
    filename: str
    df: pd.DataFrame
    profile: dict[str, Any]
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


@dataclass
class ReportEntry:
    report_id: str
    dataset_id: str
    payload: dict[str, Any]
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class _Store:
    def __init__(self) -> None:
        self._datasets: dict[str, DatasetEntry] = {}
        self._reports: dict[str, ReportEntry] = {}
        self._lock = threading.Lock()

    # ----- datasets -----
    def add_dataset(
        self, df: pd.DataFrame, filename: str, profile: dict[str, Any]
    ) -> DatasetEntry:
        dataset_id = uuid.uuid4().hex[:12]
        with self._lock:
            entry = DatasetEntry(
                dataset_id=dataset_id, filename=filename, df=df, profile=profile
            )
            self._datasets[dataset_id] = entry
            try:
                (UPLOADS_DIR / f"{dataset_id}.csv").write_text(
                    df.to_csv(index=False), encoding="utf-8"
                )
            except Exception:
                pass
            return entry

    def get_dataset(self, dataset_id: str) -> Optional[DatasetEntry]:
        with self._lock:
            entry = self._datasets.get(dataset_id)
        if entry is not None:
            return entry
        # Lazy reload from disk
        path = UPLOADS_DIR / f"{dataset_id}.csv"
        if path.exists():
            df = pd.read_csv(path)
            return DatasetEntry(
                dataset_id=dataset_id,
                filename=path.name,
                df=df,
                profile={},
            )
        return None

    # ----- reports -----
    def add_report(self, dataset_id: str, payload: dict[str, Any]) -> ReportEntry:
        report_id = uuid.uuid4().hex[:12]
        entry = ReportEntry(
            report_id=report_id, dataset_id=dataset_id, payload=payload
        )
        with self._lock:
            self._reports[report_id] = entry
        try:
            path = REPORTS_DIR / f"{report_id}.json"
            path.write_text(
                json.dumps(
                    {
                        "report_id": report_id,
                        "dataset_id": dataset_id,
                        "created_at": entry.created_at,
                        "payload": payload,
                    },
                    indent=2,
                    default=_json_default,
                ),
                encoding="utf-8",
            )
        except Exception:
            pass
        return entry

    def get_report(self, report_id: str) -> Optional[ReportEntry]:
        with self._lock:
            entry = self._reports.get(report_id)
        if entry is not None:
            return entry
        path = REPORTS_DIR / f"{report_id}.json"
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            return ReportEntry(
                report_id=report_id,
                dataset_id=data.get("dataset_id", ""),
                payload=data.get("payload", {}),
                created_at=data.get("created_at", ""),
            )
        return None

    def list_reports(self) -> list[ReportEntry]:
        with self._lock:
            mem_reports = list(self._reports.values())
        seen = {r.report_id for r in mem_reports}
        for path in sorted(Path(REPORTS_DIR).glob("*.json")):
            rid = path.stem
            if rid in seen:
                continue
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                mem_reports.append(
                    ReportEntry(
                        report_id=rid,
                        dataset_id=data.get("dataset_id", ""),
                        payload=data.get("payload", {}),
                        created_at=data.get("created_at", ""),
                    )
                )
            except Exception:
                continue
        return sorted(mem_reports, key=lambda r: r.created_at, reverse=True)


def _json_default(obj: Any) -> Any:
    import numpy as np

    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    return str(obj)


store = _Store()

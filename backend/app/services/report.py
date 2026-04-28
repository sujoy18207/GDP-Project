"""Generate executive summaries, findings, and PDF reports."""
from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


SUGGESTION_LIBRARY = {
    "demographic_parity": [
        "reweight",
        "resample",
        "fairness_constraint",
        "threshold_adjust",
    ],
    "disparate_impact": [
        "resample",
        "drop_proxy",
        "threshold_adjust",
    ],
    "equalized_odds": [
        "fairness_constraint",
        "threshold_adjust",
    ],
    "predictive_parity": [
        "threshold_adjust",
        "fairness_constraint",
    ],
    "individual_fairness": [
        "drop_proxy",
        "fairness_constraint",
    ],
}


def _severity(metric_name: str, status: str) -> str:
    if status == "fail":
        return "critical"
    if status == "warning":
        return "warning"
    return "info"


def _metric_key(name: str) -> str:
    name_l = name.lower()
    if "demographic" in name_l:
        return "demographic_parity"
    if "disparate" in name_l:
        return "disparate_impact"
    if "equalized" in name_l or "odds" in name_l:
        return "equalized_odds"
    if "predictive" in name_l:
        return "predictive_parity"
    if "individual" in name_l:
        return "individual_fairness"
    return "demographic_parity"


def build_findings(
    metrics_per_attribute: dict[str, list[dict[str, Any]]],
    feature_importance: list[dict[str, Any]],
    df: pd.DataFrame,
    outcome_column: str,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for attr, metrics in metrics_per_attribute.items():
        for m in metrics:
            status = m.get("status", "pass")
            if status == "pass":
                continue
            severity = _severity(m["name"], status)
            by_group = m.get("by_group", []) or []
            affected = sorted(
                [g["group"] for g in by_group],
                key=lambda g: next(
                    (x["positive_rate"] for x in by_group if x["group"] == g), 0
                ),
            )
            impact_size = round(float(m.get("value", 0.0)), 4)
            findings.append(
                {
                    "severity": severity,
                    "title": f"{m['name']} on '{attr}'",
                    "description": _describe_finding(attr, m, by_group),
                    "affected_groups": affected,
                    "impact_size": impact_size,
                    "metric": m["name"],
                    "suggestion_keys": SUGGESTION_LIBRARY.get(
                        _metric_key(m["name"]), []
                    ),
                }
            )

    for fi in feature_importance:
        if fi.get("is_protected") and fi.get("importance", 0) > 0.05:
            findings.append(
                {
                    "severity": "warning",
                    "title": f"Protected feature drives predictions: {fi['feature']}",
                    "description": (
                        f"The protected attribute or its proxy '{fi['feature']}' has "
                        f"a feature importance of {fi['importance']:.2f}, meaning it "
                        "materially shapes the model's decisions. Consider removing it "
                        "or applying a fairness constraint."
                    ),
                    "affected_groups": [],
                    "impact_size": float(fi["importance"]),
                    "metric": "Feature Importance",
                    "suggestion_keys": ["drop_proxy", "fairness_constraint"],
                }
            )

    return sorted(
        findings, key=lambda f: ({"critical": 0, "warning": 1, "info": 2}[f["severity"]], -f["impact_size"])
    )


def _describe_finding(
    attr: str, metric: dict[str, Any], by_group: list[dict[str, Any]]
) -> str:
    name = metric["name"]
    val = metric["value"]
    threshold = metric["threshold"]
    if not by_group:
        return (
            f"{name} on '{attr}' is {val:.3f} (threshold {threshold:.3f}). "
            "Group-level breakdown unavailable."
        )
    sorted_g = sorted(by_group, key=lambda g: g.get("positive_rate", 0))
    low = sorted_g[0]
    high = sorted_g[-1]
    return (
        f"{name} on '{attr}' is {val:.3f} (threshold {threshold:.3f}). "
        f"Group '{low['group']}' has a positive-outcome rate of "
        f"{low['positive_rate']:.1%} while '{high['group']}' is at "
        f"{high['positive_rate']:.1%} — a gap large enough to warrant remediation."
    )


def severity_summary(findings: list[dict[str, Any]]) -> dict[str, int]:
    summary = {"critical": 0, "warning": 0, "info": 0}
    for f in findings:
        summary[f["severity"]] = summary.get(f["severity"], 0) + 1
    return summary


def executive_summary(
    findings: list[dict[str, Any]],
    df: pd.DataFrame,
    outcome_column: str,
    protected_attributes: list[str],
) -> str:
    crit = [f for f in findings if f["severity"] == "critical"]
    warn = [f for f in findings if f["severity"] == "warning"]
    rows = len(df)
    if not findings:
        return (
            f"We audited {rows:,} records across {len(protected_attributes)} "
            f"protected attribute(s) and the dataset passes every fairness check. "
            "Continue monitoring as the data and model evolve."
        )
    parts: list[str] = []
    parts.append(
        f"We audited {rows:,} records across {len(protected_attributes)} "
        f"protected attribute(s) using the outcome '{outcome_column}'."
    )
    if crit:
        parts.append(
            f"There are {len(crit)} critical fairness issues. The most pressing is: "
            f"{crit[0]['title']}. {crit[0]['description']}"
        )
    if warn:
        parts.append(
            f"There are also {len(warn)} warning-level findings worth addressing "
            "before deployment."
        )
    parts.append(
        "Recommended next steps include rebalancing under-represented groups, "
        "removing proxy features that leak protected information, and applying a "
        "fairness constraint or per-group threshold tuning before launch."
    )
    return " ".join(parts)


def find_biased_segments(
    intersectional: list[dict[str, Any]], top_n: int = 5
) -> list[dict[str, Any]]:
    if not intersectional:
        return []
    rates = [c["positive_rate"] for c in intersectional]
    if not rates:
        return []
    overall = sum(c["positive_rate"] * c["n"] for c in intersectional) / max(
        1, sum(c["n"] for c in intersectional)
    )
    flagged = sorted(
        intersectional,
        key=lambda c: -abs(c["positive_rate"] - overall),
    )
    return [
        {
            "keys": c["keys"],
            "n": c["n"],
            "positive_rate": c["positive_rate"],
            "delta_vs_overall": round(c["positive_rate"] - overall, 4),
        }
        for c in flagged[:top_n]
    ]


# ---------- PDF rendering ----------

def render_pdf(report_payload: dict[str, Any]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=LETTER,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
        title="Bias Audit Report",
    )
    styles = getSampleStyleSheet()
    h1 = styles["Heading1"]
    h2 = styles["Heading2"]
    body = styles["BodyText"]
    small = ParagraphStyle("small", parent=body, fontSize=9, leading=11)

    story: list[Any] = []
    story.append(Paragraph("AI Bias & Fairness Audit Report", h1))
    story.append(
        Paragraph(
            f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            small,
        )
    )
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("Executive Summary", h2))
    story.append(Paragraph(report_payload.get("executive_summary", ""), body))
    story.append(Spacer(1, 0.15 * inch))

    sev = report_payload.get("severity_summary", {})
    story.append(
        Paragraph(
            f"<b>Severity counts</b> &nbsp;&nbsp; "
            f"<font color='#dc2626'>Critical: {sev.get('critical', 0)}</font> &nbsp;|&nbsp; "
            f"<font color='#d97706'>Warning: {sev.get('warning', 0)}</font> &nbsp;|&nbsp; "
            f"<font color='#16a34a'>Info: {sev.get('info', 0)}</font>",
            body,
        )
    )
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("Findings", h2))
    findings = report_payload.get("findings", [])
    if not findings:
        story.append(Paragraph("No bias findings detected.", body))
    else:
        rows = [["Severity", "Title", "Impact", "Affected groups"]]
        for f in findings[:25]:
            rows.append(
                [
                    f["severity"].upper(),
                    f["title"],
                    f"{f['impact_size']:.3f}",
                    ", ".join(f.get("affected_groups", [])[:6]) or "—",
                ]
            )
        table = Table(rows, colWidths=[0.9 * inch, 3.2 * inch, 0.8 * inch, 2.3 * inch])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5f5")),
                ]
            )
        )
        story.append(table)
    story.append(Spacer(1, 0.25 * inch))

    metrics_per = report_payload.get("metrics_per_attribute", {})
    for attr, metrics in metrics_per.items():
        story.append(Paragraph(f"Metrics for protected attribute: {attr}", h2))
        rows = [["Metric", "Value", "Threshold", "Status"]]
        for m in metrics:
            rows.append(
                [
                    m["name"],
                    f"{m['value']:.3f}",
                    f"{m['threshold']:.3f}",
                    m["status"].upper(),
                ]
            )
        table = Table(rows, colWidths=[3.2 * inch, 1.0 * inch, 1.0 * inch, 1.0 * inch])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5f5")),
                ]
            )
        )
        story.append(table)
        story.append(Spacer(1, 0.2 * inch))

    biased_segments = report_payload.get("biased_segments", [])
    if biased_segments:
        story.append(Paragraph("Most-biased intersectional segments", h2))
        rows = [["Segment", "Rows", "Positive rate", "Δ vs overall"]]
        for seg in biased_segments:
            keys = " × ".join(f"{k}={v}" for k, v in seg["keys"].items())
            rows.append(
                [
                    keys,
                    str(seg["n"]),
                    f"{seg['positive_rate']:.1%}",
                    f"{seg['delta_vs_overall']:+.1%}",
                ]
            )
        table = Table(rows, colWidths=[3.6 * inch, 0.7 * inch, 1.2 * inch, 1.0 * inch])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#cbd5f5")),
                ]
            )
        )
        story.append(table)

    doc.build(story)
    return buffer.getvalue()

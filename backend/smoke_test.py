"""Quick end-to-end smoke test for the bias-detection backend.

Run from the backend directory:

    python smoke_test.py
"""
from __future__ import annotations

import json
import sys

import pandas as pd

from app.services.bias_metrics import compute_all_metrics
from app.services.mitigation import apply_mitigation
from app.services.profiling import profile_dataframe
from app.services.report import (
    build_findings,
    executive_summary,
    find_biased_segments,
    severity_summary,
)
from app.services.sample_data import generate_hiring


def main() -> int:
    df = generate_hiring()
    print(f"[1/4] Generated hiring dataset: {df.shape}")

    profile = profile_dataframe(df, "hiring.csv")
    suggested = profile["suggested_protected"]
    outcome = profile["suggested_outcome"]
    print(
        "[2/4] Profile detected outcome=%s, protected=%s"
        % (outcome, suggested)
    )
    assert outcome == "hired", outcome
    assert "gender" in suggested and "race" in suggested

    pkg = compute_all_metrics(
        df,
        outcome_column=outcome,
        positive_label=1,
        protected_attributes=["gender", "race"],
    )
    print("[3/4] Metric snapshot:")
    for attr, metrics in pkg["metrics_per_attribute"].items():
        for m in metrics:
            print(
                f"     {attr:>8s}  {m['name']:<35s} value={m['value']:.3f} "
                f"thr={m['threshold']:.2f}  status={m['status']}"
            )

    findings = build_findings(
        pkg["metrics_per_attribute"], pkg["feature_importance"], df, outcome
    )
    sev = severity_summary(findings)
    summary = executive_summary(findings, df, outcome, ["gender", "race"])
    biased = find_biased_segments(pkg["intersectional"])
    assert sev["critical"] + sev["warning"] >= 1, "Expected biased dataset"
    print(f"[3/4] Severity summary: {sev}")
    print(f"      Top finding: {findings[0]['title']}")
    print(f"      Executive: {summary[:140]}…")
    print(f"      Biased segments: {len(biased)}")

    mit = apply_mitigation(
        df,
        outcome_column=outcome,
        positive_label=1,
        protected_attribute="gender",
        strategy="reweight",
    )
    print("[4/4] Mitigation deltas (reweight on gender):")
    for k, v in mit["delta_summary"].items():
        print(f"      {k}: {v:+.3f}")

    print("\nAll smoke checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

# FairAudit · AI Bias Detection & Fairness Audit

A full-stack prototype for auditing datasets and machine-learning models for
bias against protected groups (gender, race, age, zip code, …).

The app walks you through five steps:

```
Upload → Profile → Analyze → Report → Mitigate
```

…plus a bonus **Model Audit** mode that takes a pickled scikit-learn model and
runs the same fairness suite on its predictions.

```
┌─────────────┐        REST        ┌────────────────────┐
│  React + TS │  ───────────────▶  │  FastAPI + Pandas  │
│  Tailwind   │                    │  Fairlearn + sklearn│
│  Recharts   │                    │  ReportLab (PDF)    │
└─────────────┘                    └────────────────────┘
```

## What's inside

| Folder      | Purpose                                                                                |
| ----------- | -------------------------------------------------------------------------------------- |
| `backend/`  | FastAPI app: upload, profiling, fairness metrics, mitigation, PDF reports, model audit |
| `frontend/` | React + TypeScript dashboard (Vite, Tailwind, Recharts)                                |
| `data/`     | Auto-generated, intentionally-biased sample datasets (hiring + loan)                   |
| `models/`   | Auto-trained baseline scikit-learn pipelines for the bonus model audit                 |
| `reports/`  | Generated audit reports (JSON, lazily persisted)                                       |

The `data/` and `models/` folders are populated automatically the first time
the backend boots — no manual setup needed.

## Bias metrics implemented

| Metric                                  | Why it matters                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| **Demographic Parity Difference**       | Are favourable outcomes distributed equally across groups?                      |
| **Disparate Impact Ratio (80% rule)**   | EEOC test — flags when the lowest group's positive rate is < 80% of the highest |
| **Equalized Odds Difference**           | Largest gap in TPR or FPR between groups                                        |
| **Predictive Parity Difference**        | Does a positive prediction mean the same thing across groups (precision)?       |
| **Individual Fairness (Inconsistency)** | k-NN consistency: similar individuals should get similar predictions            |

For each metric the dashboard shows the value, threshold, pass/warning/fail
badge, plain-English explanation tooltip, and a per-group breakdown.

## Mitigations implemented

Pre-processing

- **Reweighting** – Kamiran-Calders style instance weighting
- **Resampling** – oversample under-represented (group, outcome) cells
- **Drop proxy features** – remove proxies that leak protected info

In-processing

- **Fairness constraint** – fairlearn `ExponentiatedGradient` with
  `DemographicParity` (with a graceful fallback if fairlearn isn't installed)

Post-processing

- **Per-group threshold tuning** – calibrate the decision threshold separately
  per protected group

The Mitigate page shows before/after metrics so you can compare the trade-off.

---

## Quick start

### 1. Backend

Requires Python 3.10+.

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
python run.py            # serves http://127.0.0.1:8000
```

The first time it runs the backend will populate `data/` with two
intentionally-biased sample CSVs (`hiring.csv`, `loan.csv`) and train baseline
sklearn pipelines into `models/`.

Browse the API at <http://127.0.0.1:8000/docs>.

### 2. Frontend

Requires Node.js 18+.

```bash
cd frontend
npm install
npm run dev              # Vite dev server on http://localhost:5173
```

Vite proxies `/api/*` to the FastAPI backend on port 8000, so just open
<http://localhost:5173>.

### 3. Run the demo

1. Open <http://localhost:5173>
2. Click **“Hiring (engineering applicants) – biased on purpose”** on the upload page
3. Inspect the column profile — protected attributes (gender, race, age, zip_code) are auto-flagged
4. Click **Run fairness audit** in the Analyze tab — disparate impact and predictive parity should fail
5. Pop into **Mitigate**, choose a strategy (e.g. threshold tuning) and click _Simulate fix_ to see metrics improve
6. Open **Report** and download a JSON or PDF audit
7. Try **Model Audit** with the bundled hiring model to see the accuracy-vs-fairness trade-off curve

## GCP deployment

The cleanest GCP setup is two Cloud Run services behind the same frontend origin:

1. Build and deploy the backend container from [backend/Dockerfile](backend/Dockerfile) as a Cloud Run service.
2. Build and deploy the frontend container from [frontend/Dockerfile](frontend/Dockerfile) as a second Cloud Run service.
3. Set the frontend service environment variable `BACKEND_UPSTREAM` to the backend service URL, for example `https://fairaudit-backend-xxxxx.a.run.app`.
4. Keep the frontend service public. The browser hits the frontend origin, and nginx proxies `/api/*` to the backend service.

If you prefer one command for local verification, use `docker compose up --build` from the repo root. The compose file mirrors the same proxy setup used in Cloud Run.

## API reference

All endpoints live at the root of the FastAPI service.

| Method | Path                         | Purpose                                                         |
| ------ | ---------------------------- | --------------------------------------------------------------- |
| POST   | `/upload`                    | Upload CSV / JSON / JSONL → profile + protected attribute hints |
| GET    | `/samples`                   | List bundled biased sample datasets                             |
| POST   | `/samples/{name}/load`       | Load `hiring` / `loan` directly into the store                  |
| POST   | `/analyze`                   | Run all fairness metrics on a stored dataset                    |
| POST   | `/mitigate`                  | Apply a mitigation strategy and return before/after metrics     |
| GET    | `/report/{id}`               | Full report payload (JSON)                                      |
| GET    | `/report/{id}/pdf`           | Same report as a downloadable PDF                               |
| POST   | `/model-audit`               | Audit an uploaded `.pkl` model on a labelled test dataset       |
| POST   | `/model-audit/sample/{name}` | Audit a bundled demo model + dataset                            |

`POST /analyze` body shape:

```json
{
  "dataset_id": "abc123…",
  "outcome_column": "hired",
  "positive_label": 1,
  "protected_attributes": ["gender", "race", "age"],
  "train_quick_model": true
}
```

`POST /mitigate` body shape:

```json
{
  "dataset_id": "abc123…",
  "outcome_column": "hired",
  "positive_label": 1,
  "protected_attribute": "gender",
  "strategy": "threshold_adjust",
  "proxy_features": []
}
```

## Why we don't use AIF360 directly

IBM's AIF360 has heavy native dependencies (cvxpy, tensorflow, BLAS) that are
hard to install on every machine — especially on Windows during a hackathon.
We instead implement the well-known group-fairness metrics directly on top of
NumPy/Pandas and use Fairlearn (which is pip-friendly) for the in-processing
mitigation. The metric definitions and thresholds match the AIF360 / Fairlearn
conventions.

## License

MIT — built for the hackathon, fork and remix freely.

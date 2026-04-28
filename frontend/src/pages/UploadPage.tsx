import { useEffect, useState, type DragEvent, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";

import { api } from "../api";
import { Spinner } from "../components/Loader";
import { useDataset } from "../store/DatasetContext";
import type { SamplesManifest } from "../types";

export function UploadPage() {
  const navigate = useNavigate();
  const { setProfile } = useDataset();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [samples, setSamples] = useState<SamplesManifest["samples"] | null>(
    null,
  );

  useEffect(() => {
    api
      .listSamples()
      .then((res) => setSamples(res.samples))
      .catch(() => setSamples(null));
  }, []);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const profile = await api.upload(file);
      setProfile(profile);
      navigate("/profile");
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSample(name: string) {
    setBusy(true);
    setError(null);
    try {
      const profile = await api.loadSample(name);
      setProfile(profile);
      navigate("/profile");
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold text-ink-900">
          Audit a dataset for bias
        </h2>
        <p className="text-sm text-ink-500">
          Drop a CSV or JSON file. We'll auto-detect protected attributes,
          profile every column, and run a complete fairness audit.
        </p>
      </header>

      <label
        htmlFor="file-input"
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white p-12 text-center transition",
          drag
            ? "border-brand-500 bg-brand-50/40"
            : "border-ink-300 hover:border-brand-400",
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-6 w-6"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M12 5v10" strokeLinecap="round" />
            <path d="m8 9 4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 19h14" strokeLinecap="round" />
          </svg>
        </div>
        <p className="mt-4 text-base font-medium text-ink-900">
          Drag &amp; drop a dataset to upload
        </p>
        <p className="mt-1 text-sm text-ink-500">
          CSV, TSV, JSON or JSONL · we never store anything beyond this session
        </p>
        <span className="mt-5 inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white">
          {busy ? <Spinner /> : null}
          Choose a file
        </span>
        <input
          id="file-input"
          type="file"
          className="hidden"
          accept=".csv,.tsv,.json,.jsonl,.ndjson"
          onChange={onChange}
        />
      </label>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Or try a bundled sample dataset
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {samples ? (
            Object.entries(samples).map(([key, meta]) => (
              <button
                key={key}
                disabled={busy}
                onClick={() => handleSample(key)}
                className="card-pad text-left transition hover:border-brand-400 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">
                      {meta.name}
                    </p>
                    <p className="text-xs text-ink-500">
                      Outcome:{" "}
                      <code className="rounded bg-ink-100 px-1 py-0.5 text-[11px]">
                        {meta.outcome}
                      </code>{" "}
                      · {meta.protected.join(", ")}
                    </p>
                  </div>
                  <span className="pill bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200">
                    Biased on purpose
                  </span>
                </div>
                <p className="mt-3 text-xs text-ink-500">
                  Click to load · perfect for a 30-second demo of the dashboard.
                </p>
              </button>
            ))
          ) : (
            <p className="text-sm text-ink-500">
              Sample datasets unavailable — make sure the backend is running.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

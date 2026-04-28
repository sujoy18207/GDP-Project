import type {
  AnalyzeResponse,
  DatasetProfile,
  MitigateResponse,
  ModelAuditResponse,
  SamplesManifest,
} from "./types";

const BASE = "/api";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.detail) detail = data.detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export const api = {
  async health(): Promise<{ status: string }> {
    const res = await fetch(`${BASE}/health`);
    return handle(res);
  },

  async upload(file: File): Promise<DatasetProfile> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/upload`, { method: "POST", body: fd });
    return handle(res);
  },

  async listSamples(): Promise<SamplesManifest> {
    const res = await fetch(`${BASE}/samples`);
    return handle(res);
  },

  async loadSample(name: string): Promise<DatasetProfile> {
    const res = await fetch(`${BASE}/samples/${name}/load`, { method: "POST" });
    return handle(res);
  },

  async analyze(req: {
    dataset_id: string;
    outcome_column: string;
    positive_label: unknown;
    protected_attributes: string[];
    train_quick_model?: boolean;
  }): Promise<AnalyzeResponse> {
    const res = await fetch(`${BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ train_quick_model: true, ...req }),
    });
    return handle(res);
  },

  async mitigate(req: {
    dataset_id: string;
    outcome_column: string;
    positive_label: unknown;
    protected_attribute: string;
    strategy: string;
    proxy_features?: string[];
  }): Promise<MitigateResponse> {
    const res = await fetch(`${BASE}/mitigate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proxy_features: [], ...req }),
    });
    return handle(res);
  },

  async getReport(reportId: string): Promise<AnalyzeResponse> {
    const res = await fetch(`${BASE}/report/${reportId}`);
    return handle(res);
  },

  reportPdfUrl(reportId: string): string {
    return `${BASE}/report/${reportId}/pdf`;
  },

  async auditSampleModel(name: string): Promise<ModelAuditResponse> {
    const res = await fetch(`${BASE}/model-audit/sample/${name}`, {
      method: "POST",
    });
    return handle(res);
  },

  async auditModel(args: {
    modelFile: File;
    datasetFile: File;
    outcomeColumn: string;
    positiveLabel: string;
    protectedAttributes: string[];
  }): Promise<ModelAuditResponse> {
    const fd = new FormData();
    fd.append("model_file", args.modelFile);
    fd.append("dataset_file", args.datasetFile);
    fd.append("outcome_column", args.outcomeColumn);
    fd.append("positive_label", args.positiveLabel);
    fd.append("protected_attributes", args.protectedAttributes.join(","));
    const res = await fetch(`${BASE}/model-audit`, {
      method: "POST",
      body: fd,
    });
    return handle(res);
  },
};

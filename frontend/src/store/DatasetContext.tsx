import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { AnalyzeResponse, DatasetProfile } from "../types";

interface DatasetContextValue {
  profile: DatasetProfile | null;
  setProfile: (profile: DatasetProfile | null) => void;
  outcomeColumn: string | null;
  setOutcomeColumn: (col: string | null) => void;
  positiveLabel: unknown;
  setPositiveLabel: (val: unknown) => void;
  protectedAttributes: string[];
  setProtectedAttributes: (cols: string[]) => void;
  analysis: AnalyzeResponse | null;
  setAnalysis: (res: AnalyzeResponse | null) => void;
  reset: () => void;
}

const DatasetContext = createContext<DatasetContextValue | undefined>(undefined);

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileRaw] = useState<DatasetProfile | null>(null);
  const [outcomeColumn, setOutcomeColumn] = useState<string | null>(null);
  const [positiveLabel, setPositiveLabel] = useState<unknown>(1);
  const [protectedAttributes, setProtectedAttributes] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);

  const setProfile = useCallback((p: DatasetProfile | null) => {
    setProfileRaw(p);
    if (p) {
      setOutcomeColumn(p.suggested_outcome ?? null);
      setPositiveLabel(p.suggested_positive_label ?? 1);
      setProtectedAttributes(p.suggested_protected ?? []);
      setAnalysis(null);
    }
  }, []);

  const reset = useCallback(() => {
    setProfileRaw(null);
    setOutcomeColumn(null);
    setPositiveLabel(1);
    setProtectedAttributes([]);
    setAnalysis(null);
  }, []);

  const value = useMemo<DatasetContextValue>(
    () => ({
      profile,
      setProfile,
      outcomeColumn,
      setOutcomeColumn,
      positiveLabel,
      setPositiveLabel,
      protectedAttributes,
      setProtectedAttributes,
      analysis,
      setAnalysis,
      reset,
    }),
    [
      profile,
      setProfile,
      outcomeColumn,
      positiveLabel,
      protectedAttributes,
      analysis,
      reset,
    ],
  );

  return (
    <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>
  );
}

export function useDataset(): DatasetContextValue {
  const ctx = useContext(DatasetContext);
  if (!ctx) {
    throw new Error("useDataset must be used within DatasetProvider");
  }
  return ctx;
}

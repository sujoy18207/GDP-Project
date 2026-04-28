import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { Sidebar } from "./components/Sidebar";
import { AnalyzePage } from "./pages/AnalyzePage";
import { MitigatePage } from "./pages/MitigatePage";
import { ModelAuditPage } from "./pages/ModelAuditPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ReportPage } from "./pages/ReportPage";
import { UploadPage } from "./pages/UploadPage";

export default function App() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-ink-50">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          <Routes>
            <Route path="/" element={<Navigate to="/upload" replace />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/analyze" element={<AnalyzePage />} />
            <Route path="/mitigate" element={<MitigatePage />} />
            <Route path="/report" element={<ReportPage />} />
            <Route path="/report/:reportId" element={<ReportPage />} />
            <Route path="/model-audit" element={<ModelAuditPage />} />
            <Route path="*" element={<Navigate to="/upload" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-200 bg-white/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        className="btn-ghost lg:hidden"
        onClick={onOpenMenu}
        aria-label="Open navigation"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-5 w-5"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold text-ink-900">
          AI Bias Detection &amp; Fairness Audit
        </h1>
        <p className="truncate text-xs text-ink-500">
          Upload → Profile → Analyze → Report → Mitigate
        </p>
      </div>
      <div className="ml-auto hidden items-center gap-2 text-xs text-ink-500 sm:flex">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        Connected to backend
      </div>
    </header>
  );
}

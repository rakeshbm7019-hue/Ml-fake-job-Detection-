import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FileText,
  Globe,
  Loader2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Upload,
} from 'lucide-react';
import type {
  BatchScanResponse,
  DatasetStatistics,
  IngestionListenerState,
  JobPostingInput,
  ModelSummary,
  PredictionRecord,
  WordContribution,
} from '../types.ts';
import {
  SAMPLE_POSTINGS,
  downloadBatchScanCsv,
  downloadPredictionJson,
  downloadPredictionMarkdown,
} from '../utils/samples.ts';
import { HorizontalWeightBars } from './Charts.tsx';

interface JobAnalyzerViewProps {
  mode: 'single' | 'batch';
  onModeChange: (mode: 'single' | 'batch') => void;
  activeResult: PredictionRecord | null;
  onAnalysisComplete: (record: PredictionRecord) => void;
  onBatchComplete: () => void;
  onFeedbackApplied: (
    updatedRecord: PredictionRecord,
    datasetStats: DatasetStatistics,
    modelSummary: ModelSummary
  ) => void;
}

interface LivePreviewState {
  ready: boolean;
  verdict?: 'Genuine' | 'Potentially Fake';
  riskLevel?: 'Low' | 'Medium' | 'High';
  riskPercentage?: number;
  genuineProbability?: number;
  fakeProbability?: number;
  topSuspiciousWords?: WordContribution[];
  metadataSignals?: string[];
}

const INITIAL_FORM: JobPostingInput = {
  title: '',
  companyName: '',
  companyWebsite: '',
  location: '',
  salary: '',
  description: '',
  requiredSkills: '',
  employmentType: 'Full-time',
  experienceLevel: 'Mid-Senior level',
};

export const JobAnalyzerView: React.FC<JobAnalyzerViewProps> = ({
  mode,
  onModeChange,
  activeResult,
  onAnalysisComplete,
  onBatchComplete,
  onFeedbackApplied,
}) => {
  const [form, setForm] = useState<JobPostingInput>(
    activeResult ? activeResult.input : INITIAL_FORM
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNlpTrace, setShowNlpTrace] = useState(true);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);

  // Real-time SSE backend ingestion listener state
  const [ingestionState, setIngestionState] = useState<IngestionListenerState | null>(null);
  const [ingestionActionLoading, setIngestionActionLoading] = useState(false);
  const [ingestionError, setIngestionError] = useState<string | null>(null);
  const [showExpandedStream, setShowExpandedStream] = useState(false);
  const prevHighRiskRef = useRef<number | null>(null);

  // Real-time live preview state
  const [livePreview, setLivePreview] = useState<LivePreviewState>({ ready: false });
  const [previewing, setPreviewing] = useState(false);

  // Batch Import state
  const batchFileInputRef = useRef<HTMLInputElement | null>(null);
  const [batchSaveToHistory, setBatchSaveToHistory] = useState(true);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<BatchScanResponse | null>(null);

  useEffect(() => {
    let active = true;

    const applyState = (next: IngestionListenerState) => {
      if (!active) return;
      setIngestionState(next);
      if (
        prevHighRiskRef.current !== null &&
        next.autoSaveHighRisk &&
        next.highRiskDetected > prevHighRiskRef.current
      ) {
        onBatchComplete();
      }
      prevHighRiskRef.current = next.highRiskDetected;
    };

    // Initial authoritative snapshot
    fetch('/api/ingestion/state')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: IngestionListenerState | null) => {
        if (data) applyState(data);
      })
      .catch(() => {
        // SSE stream below will sync on connect
      });

    const eventSource = new EventSource('/api/ingestion/stream');
    const handleEvent = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data) as IngestionListenerState;
        applyState(parsed);
        setIngestionError(null);
      } catch {
        // Ignore malformed frame
      }
    };

    eventSource.addEventListener('init', handleEvent as EventListener);
    eventSource.addEventListener('state', handleEvent as EventListener);
    eventSource.onerror = () => {
      // Browser EventSource handles automatic reconnect
    };

    return () => {
      active = false;
      eventSource.removeEventListener('init', handleEvent as EventListener);
      eventSource.removeEventListener('state', handleEvent as EventListener);
      eventSource.close();
    };
  }, [onBatchComplete]);

  useEffect(() => {
    if (mode !== 'single') return;
    if (form.title.trim().length < 2 && form.description.trim().length < 8) {
      setLivePreview({ ready: false });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await fetch('/api/analyze/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as LivePreviewState;
          setLivePreview(data);
        }
      } catch {
        // Ignore abort errors on rapid typing
      } finally {
        setPreviewing(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form, mode]);

  const handleChange = (field: keyof JobPostingInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleLoadSample = (presetId: string) => {
    const found = SAMPLE_POSTINGS.find((s) => s.id === presetId);
    if (found) {
      setForm(found.data);
      setErrorMsg(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!form.title.trim()) {
      setErrorMsg('Please enter a job title.');
      return;
    }
    if (form.description.trim().length < 8) {
      setErrorMsg('Please enter a job description of at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Analysis failed.');
      }
      onAnalysisComplete(payload as PredictionRecord);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error during job analysis.');
    } finally {
      setSubmitting(false);
    }
  };

  const runBatchCsv = async (csvText: string, fileName: string) => {
    setBatchLoading(true);
    setBatchError(null);
    try {
      const res = await fetch('/api/analyze/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv: csvText,
          fileName,
          saveToHistory: batchSaveToHistory,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Batch scan failed.');
      }
      setBatchResult(payload as BatchScanResponse);
      if (batchSaveToHistory) {
        onBatchComplete();
      }
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Batch upload failed.');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleToggleListener = async () => {
    setIngestionActionLoading(true);
    setIngestionError(null);
    try {
      const endpoint = ingestionState?.running ? '/api/ingestion/stop' : '/api/ingestion/start';
      const res = await fetch(endpoint, { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to toggle ingestion listener.');
      setIngestionState(payload as IngestionListenerState);
    } catch (err) {
      setIngestionError(err instanceof Error ? err.message : 'Unable to update listener state.');
    } finally {
      setIngestionActionLoading(false);
    }
  };

  const handleManualPoll = async () => {
    setIngestionActionLoading(true);
    setIngestionError(null);
    try {
      const res = await fetch('/api/ingestion/poll', { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to poll live job aggregators.');
      setIngestionState(payload as IngestionListenerState);
    } catch (err) {
      setIngestionError(err instanceof Error ? err.message : 'Manual poll failed.');
    } finally {
      setIngestionActionLoading(false);
    }
  };

  const handleUpdateIngestionConfig = async (patch: {
    intervalSeconds?: number;
    autoSaveHighRisk?: boolean;
  }) => {
    setIngestionError(null);
    try {
      const res = await fetch('/api/ingestion/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to update listener config.');
      setIngestionState(payload as IngestionListenerState);
    } catch (err) {
      setIngestionError(err instanceof Error ? err.message : 'Failed to update configuration.');
    }
  };

  const handleFeedback = async (confirmedVerdict: 'Genuine' | 'Potentially Fake') => {
    if (!activeResult) return;
    setFeedbackSubmitting(true);
    setFeedbackStatus(null);
    try {
      const res = await fetch(`/api/predictions/${encodeURIComponent(activeResult.id)}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict: confirmedVerdict }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to apply feedback.');
      }
      onFeedbackApplied(payload.record, payload.datasetStats, payload.modelSummary);
      setFeedbackStatus(
        `Saved "${confirmedVerdict}" label to live corpus and retrained classifier in ${payload.modelSummary.metrics.trainingDurationMs}ms.`
      );
    } catch (err) {
      setFeedbackStatus(err instanceof Error ? err.message : 'Feedback submission failed.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleBatchFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await runBatchCsv(text, file.name);
    if (batchFileInputRef.current) batchFileInputRef.current.value = '';
  };

  const handleRunLiveBatchScan = async () => {
    setBatchLoading(true);
    setBatchError(null);
    try {
      const res = await fetch('/api/analyze/batch-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 25,
          saveToHistory: batchSaveToHistory,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Live batch scan failed.');
      }
      setBatchResult(payload as BatchScanResponse);
      if (batchSaveToHistory) {
        onBatchComplete();
      }
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Live feed batch scan failed.');
    } finally {
      setBatchLoading(false);
    }
  };

  const result = activeResult;

  return (
    <div className="space-y-6">
      {/* Mode Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-[#0F172A] border border-slate-800/80 p-4">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
          <button
            type="button"
            onClick={() => onModeChange('single')}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              mode === 'single'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Single Posting (Real-Time)
          </button>
          <button
            type="button"
            onClick={() => onModeChange('batch')}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              mode === 'batch'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Batch CSV Import
          </button>
        </div>

        <span className="text-xs text-slate-400">
          {mode === 'single'
            ? 'Live ML scoring updates automatically as you type; click Analyze Job for full Gemini report'
            : 'Screen up to 500 CSV job postings simultaneously with the trained Logistic Regression model'}
        </span>
      </div>

      {mode === 'batch' ? (
        /* BATCH IMPORT MODE */
        <div className="space-y-6">
          <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-sky-400" />
                  Batch CSV Job Posting Import & Scanner
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Upload any CSV containing <code className="text-indigo-300">title</code> and{' '}
                  <code className="text-indigo-300">description</code> columns (optional:{' '}
                  <code className="text-indigo-300">company_name, website, location, salary</code>)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={batchLoading}
                  onClick={handleRunLiveBatchScan}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-indigo-500/60 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  {batchLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-sky-400" />
                  )}
                  Scan 25 Live Internet Jobs
                </button>

                <input
                  ref={batchFileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleBatchFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={batchLoading}
                  onClick={() => batchFileInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-60 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  {batchLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  Upload CSV for Batch Scan
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-[#070B14] border border-slate-800/80 px-4 py-2.5 text-xs">
              <span className="text-slate-300">
                Each row runs through the NLP preprocessing, TF-IDF vectorization, and calibrated Logistic Regression pipeline.
              </span>
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer shrink-0 ml-3">
                <input
                  type="checkbox"
                  checked={batchSaveToHistory}
                  onChange={(e) => setBatchSaveToHistory(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-600"
                />
                Save results to History
              </label>
            </div>

            {batchError && (
              <div className="rounded-lg bg-rose-950/50 border border-rose-500/40 px-4 py-3 text-xs text-rose-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{batchError}</span>
              </div>
            )}
          </div>

          {batchResult && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-4">
                  <div className="text-xs text-slate-400">Total Scanned</div>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-slate-100 mt-1">
                    {batchResult.totalRows}
                  </div>
                </div>
                <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-4">
                  <div className="text-xs text-slate-400">Genuine</div>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-emerald-400 mt-1">
                    {batchResult.genuineCount}
                  </div>
                </div>
                <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-4">
                  <div className="text-xs text-slate-400">Potentially Fake</div>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-rose-400 mt-1">
                    {batchResult.fakeCount}
                  </div>
                </div>
                <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-4">
                  <div className="text-xs text-slate-400">High Risk (&ge;70%)</div>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-amber-400 mt-1">
                    {batchResult.highRiskCount}
                  </div>
                </div>
                <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-4">
                  <div className="text-xs text-slate-400">Average Risk</div>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-slate-100 mt-1">
                    {batchResult.averageRiskScore}%
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-100">
                      Batch Classification Results ({batchResult.fileName})
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Scanned {new Date(batchResult.scannedAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      downloadBatchScanCsv(batchResult.results, batchResult.fileName)
                    }
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-indigo-500/60 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Batch CSV
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800/80 text-slate-400 bg-slate-900/40">
                        <th className="py-3 px-4 font-medium">#</th>
                        <th className="py-3 px-4 font-medium">Job Title & Company</th>
                        <th className="py-3 px-4 font-medium">Verdict</th>
                        <th className="py-3 px-4 font-medium text-right">Risk %</th>
                        <th className="py-3 px-6 font-medium">Detected Indicators</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {batchResult.results.map((r) => (
                        <tr key={r.rowIndex} className="hover:bg-slate-800/30">
                          <td className="py-3 px-4 font-mono tabular-nums text-slate-400">
                            {r.rowIndex}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-100 text-sm">{r.title}</div>
                            <div className="text-slate-400">
                              {r.companyName || 'Undisclosed'} · {r.location || 'Unspecified'}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 font-medium ${
                                r.verdict === 'Potentially Fake'
                                  ? 'text-rose-400'
                                  : 'text-emerald-400'
                              }`}
                            >
                              {r.verdict === 'Potentially Fake' ? (
                                <ShieldAlert className="w-3.5 h-3.5" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                              {r.verdict}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-100 text-sm">
                            {r.riskPercentage.toFixed(1)}%
                          </td>
                          <td className="py-3 px-6 text-slate-300 max-w-md">
                            {r.indicators.slice(0, 2).join(' · ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        /* SINGLE POSTING REAL-TIME DETECTION MODE */
        <>
          {/* Real-Time Backend Ingestion Listener & Red-Team Stress Tests */}
          <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Radio
                    className={`w-4 h-4 shrink-0 ${
                      ingestionState?.running ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  />
                  <h2 className="text-sm font-semibold text-slate-100">
                    Real-Time Job Aggregator Listener
                  </h2>
                  <span
                    className={`text-xs font-mono font-medium ${
                      ingestionState?.polling
                        ? 'text-sky-400'
                        : ingestionState?.running
                          ? 'text-emerald-400'
                          : 'text-slate-400'
                    }`}
                  >
                    {ingestionState?.polling
                      ? 'Polling aggregators...'
                      : ingestionState?.running
                        ? 'Listening'
                        : 'Paused'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Streams live postings from Arbeitnow, Remotive, Jobicy, and RemoteOK for instant ML classification.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={ingestionActionLoading}
                  onClick={handleToggleListener}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-indigo-500/60 disabled:opacity-60 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  {ingestionState?.running ? (
                    <>
                      <Pause className="w-3.5 h-3.5 text-amber-400" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      Resume
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={ingestionActionLoading || ingestionState?.polling}
                  onClick={handleManualPoll}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  {ingestionState?.polling ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Poll Now
                </button>

                <select
                  aria-label="Poll interval"
                  value={ingestionState?.intervalSeconds ?? 45}
                  onChange={(e) =>
                    handleUpdateIngestionConfig({ intervalSeconds: Number(e.target.value) })
                  }
                  className="rounded-lg bg-[#070B14] border border-slate-800 px-2.5 py-1.5 text-xs text-slate-200 font-mono tabular-nums focus:outline-none focus:border-indigo-500"
                >
                  <option value={30}>Every 30s</option>
                  <option value={45}>Every 45s</option>
                  <option value={60}>Every 60s</option>
                  <option value={120}>Every 120s</option>
                </select>

                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer px-2 py-1">
                  <input
                    type="checkbox"
                    checked={ingestionState?.autoSaveHighRisk ?? true}
                    onChange={(e) =>
                      handleUpdateIngestionConfig({ autoSaveHighRisk: e.target.checked })
                    }
                    className="rounded border-slate-700 bg-slate-900 text-indigo-600"
                  />
                  Auto-save High Risk
                </label>
              </div>
            </div>

            {/* Listener Metrics & Aggregator Health Strip */}
            {ingestionState && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#070B14] border border-slate-800/80 px-4 py-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-5 font-mono tabular-nums text-slate-300">
                  <span>
                    Polls: <strong className="text-slate-100">{ingestionState.totalPolls}</strong>
                  </span>
                  <span>
                    Ingested: <strong className="text-slate-100">{ingestionState.totalIngested}</strong>
                  </span>
                  <span>
                    High-Risk (&ge;70%):{' '}
                    <strong className="text-rose-400">{ingestionState.highRiskDetected}</strong>
                  </span>
                  {ingestionState.lastPollAt && (
                    <span className="text-slate-400">
                      Last Poll: {new Date(ingestionState.lastPollAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono tabular-nums">
                  {ingestionState.sourceHealth.map((src) => (
                    <span
                      key={src.source}
                      className={src.status === 'ok' ? 'text-slate-300' : 'text-rose-400'}
                      title={src.lastError || `${src.fetchedCount} fetched`}
                    >
                      {src.source.replace(' Live', '')}:{' '}
                      <strong className={src.status === 'ok' ? 'text-emerald-400' : 'text-rose-400'}>
                        {src.status === 'ok' ? `${src.fetchedCount}` : 'err'}
                      </strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {ingestionError && (
              <div className="text-xs text-rose-300">{ingestionError}</div>
            )}

            {/* Newly Ingested Classified Jobs Grid */}
            {ingestionState && ingestionState.recentItems.length > 0 && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {ingestionState.recentItems
                    .slice(0, showExpandedStream ? 16 : 8)
                    .map((job) => (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => {
                          setForm(job.input);
                          setErrorMsg(null);
                          setFeedbackStatus(null);
                        }}
                        className="text-left rounded-lg bg-[#070B14] border border-slate-800 hover:border-indigo-500/60 p-3 space-y-1 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                          <span className="text-sky-400 truncate">
                            {job.source.replace(' Live', '')}
                            {job.isNew ? ' · NEW' : ''}
                          </span>
                          <span
                            className={
                              job.verdict === 'Potentially Fake'
                                ? 'text-rose-400 tabular-nums'
                                : 'text-emerald-400 tabular-nums'
                            }
                          >
                            {job.riskPercentage.toFixed(1)}% risk
                          </span>
                        </div>
                        <div className="text-xs font-medium text-slate-100 truncate">
                          {job.input.title}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {job.input.companyName || 'Undisclosed'} · {job.input.location}
                        </div>
                      </button>
                    ))}
                </div>

                {ingestionState.recentItems.length > 8 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowExpandedStream((prev) => !prev)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      {showExpandedStream
                        ? 'Show Fewer Live Postings'
                        : `Show All ${Math.min(16, ingestionState.recentItems.length)} Live Postings`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Quick Red-Team Fraud Stress Tests & Clear */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800/80">
              <span className="text-xs text-slate-400">
                Click any live ingested posting above to load it into the inspector, or run a fraud stress test:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {SAMPLE_POSTINGS.filter((s) => s.expectedClass === 'Fake').map((scamTest) => (
                  <button
                    key={scamTest.id}
                    type="button"
                    onClick={() => handleLoadSample(scamTest.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-rose-500/30 text-rose-200 hover:border-rose-400 transition-colors whitespace-nowrap shrink-0"
                  >
                    {scamTest.label.replace('Fake:', 'Red-Team:')}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setForm(INITIAL_FORM);
                    setErrorMsg(null);
                    setLivePreview({ ready: false });
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap shrink-0"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Real-Time Live Risk Preview Bar */}
          <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center shrink-0">
                <Activity className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                  <span>Real-Time Detector Monitor</span>
                  {previewing && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
                </div>
                <div className="text-xs text-slate-400">
                  {livePreview.ready
                    ? livePreview.metadataSignals && livePreview.metadataSignals.length > 0
                      ? livePreview.metadataSignals.slice(0, 2).join(' · ')
                      : 'No structural anomaly flags triggered in current draft'
                    : 'Start typing job title and description to stream instant ML risk classification'}
                </div>
              </div>
            </div>

            {livePreview.ready && livePreview.riskPercentage !== undefined ? (
              <div className="flex flex-wrap items-center gap-5 shrink-0">
                <div className="w-40 space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                    <span
                      className={
                        livePreview.verdict === 'Potentially Fake'
                          ? 'text-rose-400 font-semibold'
                          : 'text-emerald-400 font-semibold'
                      }
                    >
                      {livePreview.verdict}
                    </span>
                    <span className="text-slate-100">
                      {livePreview.riskPercentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        livePreview.riskPercentage >= 70
                          ? 'bg-rose-500'
                          : livePreview.riskPercentage >= 40
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                      style={{ width: `${livePreview.riskPercentage}%` }}
                    />
                  </div>
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-400">
                  {livePreview.riskLevel} Risk
                </div>
              </div>
            ) : (
              <div className="text-xs font-mono text-slate-500">Awaiting input</div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left Column: Job Detection Form */}
            <form
              onSubmit={handleSubmit}
              className="xl:col-span-6 rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-5"
            >
              <div>
                <h2 className="text-base font-semibold text-slate-100">Job Posting Details</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Enter posting metadata and text for NLP preprocessing, TF-IDF scoring, and Logistic Regression classification
                </p>
              </div>

              {errorMsg && (
                <div className="rounded-lg bg-rose-950/50 border border-rose-500/40 px-4 py-3 text-xs text-rose-200 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Job Title <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                    placeholder="e.g., Senior Backend Software Engineer"
                    className="w-full rounded-lg bg-[#070B14] border border-slate-800 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={(e) => handleChange('companyName', e.target.value)}
                    placeholder="e.g., Northstar Cloud Systems"
                    className="w-full rounded-lg bg-[#070B14] border border-slate-800 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Company Website
                  </label>
                  <input
                    type="text"
                    value={form.companyWebsite}
                    onChange={(e) => handleChange('companyWebsite', e.target.value)}
                    placeholder="e.g., https://northstarcloud.io"
                    className="w-full rounded-lg bg-[#070B14] border border-slate-800 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Job Location
                  </label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => handleChange('location', e.target.value)}
                    placeholder="e.g., San Francisco, CA or Remote"
                    className="w-full rounded-lg bg-[#070B14] border border-slate-800 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Salary
                  </label>
                  <input
                    type="text"
                    value={form.salary}
                    onChange={(e) => handleChange('salary', e.target.value)}
                    placeholder="e.g., $130,000 - $165,000 / year"
                    className="w-full rounded-lg bg-[#070B14] border border-slate-800 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Employment Type
                  </label>
                  <select
                    value={form.employmentType}
                    onChange={(e) => handleChange('employmentType', e.target.value)}
                    className="w-full rounded-lg bg-[#070B14] border border-slate-800 px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Temporary">Temporary</option>
                    <option value="Internship">Internship</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Experience Level
                  </label>
                  <select
                    value={form.experienceLevel}
                    onChange={(e) => handleChange('experienceLevel', e.target.value)}
                    className="w-full rounded-lg bg-[#070B14] border border-slate-800 px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Internship">Internship</option>
                    <option value="Entry level">Entry level</option>
                    <option value="Associate">Associate</option>
                    <option value="Mid-Senior level">Mid-Senior level</option>
                    <option value="Director">Director</option>
                    <option value="Executive">Executive</option>
                    <option value="Not Applicable">Not Applicable</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Required Skills
                  </label>
                  <input
                    type="text"
                    value={form.requiredSkills}
                    onChange={(e) => handleChange('requiredSkills', e.target.value)}
                    placeholder="e.g., TypeScript, PostgreSQL, Kubernetes, REST APIs"
                    className="w-full rounded-lg bg-[#070B14] border border-slate-800 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Job Description <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    required
                    rows={7}
                    value={form.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Paste the complete job posting description, responsibilities, compensation instructions, and contact details..."
                    className="w-full rounded-lg bg-[#070B14] border border-slate-800 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 leading-relaxed"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  {form.description.length} chars
                </span>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-60 transition-all flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Running NLP & Classifier...
                    </>
                  ) : (
                    'Analyze Job'
                  )}
                </button>
              </div>
            </form>

            {/* Right Column: Prediction Results */}
            <div className="xl:col-span-6 space-y-6">
              {!result ? (
                <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-10 text-center space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto">
                    <FileText className="w-6 h-6 text-indigo-400" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-100">
                    Ready for Full Classification & Report
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    The Real-Time Detector Monitor above scores your draft live as you type. Click Analyze Job to save the scan, inspect full TF-IDF weights, and generate a Gemini explanation.
                  </p>
                </div>
              ) : (
                <>
                  {/* Verdict & Probability Card */}
                  <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                            result.verdict === 'Potentially Fake'
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          }`}
                        >
                          {result.verdict === 'Potentially Fake' ? (
                            <ShieldAlert className="w-6 h-6" />
                          ) : (
                            <ShieldCheck className="w-6 h-6" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span>Primary ML Verdict</span>
                            <span aria-hidden="true">·</span>
                            <span>{result.riskLevel} Risk</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{result.modelVersionId}</span>
                          </div>
                          <h3
                            className={`text-2xl font-semibold mt-0.5 font-display ${
                              result.verdict === 'Potentially Fake'
                                ? 'text-rose-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {result.verdict}
                          </h3>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-slate-400">Risk Percentage</div>
                        <div className="text-3xl font-semibold text-slate-50 font-mono tabular-nums">
                          {result.riskPercentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    {/* Probability Bars */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-emerald-400 font-medium">Genuine Probability</span>
                          <span className="font-mono tabular-nums text-slate-100">
                            {result.genuineProbability.toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                            style={{ width: `${result.genuineProbability}%` }}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-rose-400 font-medium">Fake Probability</span>
                          <span className="font-mono tabular-nums text-slate-100">
                            {result.fakeProbability.toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-rose-500 rounded-full transition-all duration-300"
                            style={{ width: `${result.fakeProbability}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Export & Human-in-the-Loop Feedback Actions */}
                    <div className="space-y-3 pt-3 border-t border-slate-800/80">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs text-slate-400 font-mono tabular-nums">
                          ID: {result.id}
                          {result.userFeedback ? ` · Verified: ${result.userFeedback}` : ''}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => downloadPredictionMarkdown(result)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-indigo-500/60 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download Report (.md)
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadPredictionJson(result)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-indigo-500/60 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            JSON
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#070B14] border border-slate-800/80 px-3.5 py-2.5">
                        <span className="text-xs text-slate-300">
                          Continuous Learning: Verify label to retrain classifier
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={feedbackSubmitting}
                            onClick={() => handleFeedback('Genuine')}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                              result.userFeedback === 'Genuine'
                                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-emerald-500/60 hover:text-emerald-300'
                            }`}
                          >
                            <ThumbsUp className="w-3 h-3" />
                            Confirm Genuine
                          </button>
                          <button
                            type="button"
                            disabled={feedbackSubmitting}
                            onClick={() => handleFeedback('Potentially Fake')}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                              result.userFeedback === 'Potentially Fake'
                                ? 'bg-rose-600/20 border-rose-500 text-rose-300'
                                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-rose-500/60 hover:text-rose-300'
                            }`}
                          >
                            <ThumbsDown className="w-3 h-3" />
                            Flag as Fake
                          </button>
                        </div>
                      </div>

                      {feedbackStatus && (
                        <div className="text-xs text-emerald-300">{feedbackStatus}</div>
                      )}
                    </div>
                  </div>

                  {/* Explanation & Indicators Card */}
                  <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        Prediction Explanation & Indicators
                      </h4>
                      <span className="text-xs text-slate-400 font-mono">
                        {result.geminiAnalysis.status === 'ok'
                          ? `ML + ${result.geminiAnalysis.model}`
                          : 'Trained ML Model'}
                      </span>
                    </div>

                    <p className="text-sm text-slate-200 leading-relaxed">{result.explanation}</p>

                    {result.geminiAnalysis.status === 'error' &&
                      result.geminiAnalysis.errorMessage && (
                        <div className="rounded-lg bg-amber-950/40 border border-amber-500/30 px-3.5 py-2.5 text-xs text-amber-200">
                          Gemini notice: {result.geminiAnalysis.errorMessage}
                        </div>
                      )}

                    <div className="space-y-2">
                      <div className="text-xs font-medium text-slate-400">Detected Indicators</div>
                      <ul className="space-y-1.5">
                        {result.suspiciousIndicators.map((ind, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs text-slate-200">
                            {result.verdict === 'Potentially Fake' ? (
                              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            )}
                            <span>{ind}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {result.geminiAnalysis.verificationChecklist.length > 0 && (
                      <div className="space-y-2 pt-3 border-t border-slate-800/80">
                        <div className="text-xs font-medium text-slate-400">
                          Candidate Verification Checklist
                        </div>
                        <ul className="space-y-1.5">
                          {result.geminiAnalysis.verificationChecklist.map((step, idx) => (
                            <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                              <span className="font-mono text-indigo-400">{idx + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Important Suspicious Words & Genuine Signals */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-5 space-y-3">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-100">
                          Important Suspicious Words
                        </h4>
                        <p className="text-xs text-slate-400">
                          Tokens increasing fraud log-odds (TF-IDF x weight)
                        </p>
                      </div>
                      <HorizontalWeightBars
                        barColor="#F43F5E"
                        emptyText="No positive fraud-weighted terms matched."
                        items={result.topSuspiciousWords.map((w) => ({
                          label: w.term,
                          value: w.contribution,
                          subtitle: `TF-IDF ${w.tfidf.toFixed(2)}`,
                        }))}
                      />
                    </div>

                    <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-5 space-y-3">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-100">
                          Legitimacy Signal Words
                        </h4>
                        <p className="text-xs text-slate-400">
                          Tokens reducing fraud log-odds
                        </p>
                      </div>
                      <HorizontalWeightBars
                        barColor="#10B981"
                        emptyText="No strong genuine-weighted terms matched."
                        items={result.topGenuineSignals.map((w) => ({
                          label: w.term,
                          value: w.contribution,
                          subtitle: `TF-IDF ${w.tfidf.toFixed(2)}`,
                        }))}
                      />
                    </div>
                  </div>

                  {/* NLP Pipeline Trace Inspector */}
                  <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowNlpTrace((v) => !v)}
                      className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
                    >
                      <div>
                        <h4 className="text-sm font-semibold text-slate-100">
                          NLP Preprocessing & TF-IDF Trace
                        </h4>
                        <p className="text-xs text-slate-400">
                          {result.nlpTrace.tokenCount} tokens ·{' '}
                          {result.nlpTrace.stopWordsRemovedCount} stop-words removed ·{' '}
                          {result.nlpTrace.tfidfNonZeroCount} active TF-IDF dimensions
                        </p>
                      </div>
                      {showNlpTrace ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    {showNlpTrace && (
                      <div className="px-6 pb-5 pt-2 border-t border-slate-800/80 space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-2.5">
                            <div className="text-slate-400">Raw Chars</div>
                            <div className="text-sm font-mono tabular-nums text-slate-100 mt-0.5">
                              {result.nlpTrace.rawLength}
                            </div>
                          </div>
                          <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-2.5">
                            <div className="text-slate-400">Stop-Words Removed</div>
                            <div className="text-sm font-mono tabular-nums text-slate-100 mt-0.5">
                              {result.nlpTrace.stopWordsRemovedCount}
                            </div>
                          </div>
                          <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-2.5">
                            <div className="text-slate-400">Bigrams</div>
                            <div className="text-sm font-mono tabular-nums text-slate-100 mt-0.5">
                              {result.nlpTrace.bigramCount}
                            </div>
                          </div>
                          <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-2.5">
                            <div className="text-slate-400">TF-IDF Non-Zero</div>
                            <div className="text-sm font-mono tabular-nums text-slate-100 mt-0.5">
                              {result.nlpTrace.tfidfNonZeroCount}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-400 mb-1.5">
                            Normalized Tokens Sample (After Lowercasing, Stop-word Removal & Stemming)
                          </div>
                          <div className="rounded-lg bg-[#070B14] border border-slate-800 p-3 text-xs font-mono text-indigo-300 leading-relaxed">
                            {result.nlpTrace.normalizedTokensSample.join(' · ')}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-400 mb-1.5">
                            Cleaned & Lowercased Text
                          </div>
                          <div className="rounded-lg bg-[#070B14] border border-slate-800 p-3 text-xs font-mono text-slate-300 leading-relaxed max-h-28 overflow-y-auto">
                            {result.nlpTrace.cleanedText}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

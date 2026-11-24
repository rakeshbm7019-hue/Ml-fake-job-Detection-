import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  Loader2,
  RefreshCw,
  Sliders,
  Upload,
} from 'lucide-react';
import type { DatasetStatistics, ModelSummary, TrainingConfig } from '../types.ts';
import { HorizontalWeightBars, LossCurveChart } from './Charts.tsx';

interface ModelTrainingViewProps {
  modelSummary: ModelSummary | null;
  datasetStats: DatasetStatistics | null;
  onModelUpdated: (model: ModelSummary) => void;
  onDatasetUpdated: (stats: DatasetStatistics, model?: ModelSummary | null) => void;
}

export const ModelTrainingView: React.FC<ModelTrainingViewProps> = ({
  modelSummary,
  datasetStats,
  onModelUpdated,
  onDatasetUpdated,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [config, setConfig] = useState<TrainingConfig>({
    testSplitRatio: modelSummary?.config.testSplitRatio ?? 0.2,
    epochs: modelSummary?.config.epochs ?? 80,
    learningRate: modelSummary?.config.learningRate ?? 0.15,
    l2Lambda: modelSummary?.config.l2Lambda ?? 0.001,
    maxFeatures: modelSummary?.config.maxFeatures ?? 2500,
  });

  const [syncMode, setSyncMode] = useState<'balanced' | 'full'>('balanced');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [training, setTraining] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleTrain = async () => {
    setTraining(true);
    setStatusMessage(null);
    try {
      const response = await fetch('/api/model/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Training failed.');
      }
      onModelUpdated(payload as ModelSummary);
      setStatusMessage({
        type: 'success',
        text: `Model retrained in ${payload.metrics.trainingDurationMs}ms (${(payload.metrics.f1Score * 100).toFixed(1)}% F1-score).`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to train model.',
      });
    } finally {
      setTraining(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSyncing(true);
    setStatusMessage(null);
    try {
      const csvText = await file.text();
      const response = await fetch('/api/dataset/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          csv: csvText,
          autoTrain: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to parse CSV dataset.');
      }
      onDatasetUpdated(payload.stats, payload.modelSummary);
      setStatusMessage({
        type: 'success',
        text: `Loaded "${file.name}" (${payload.stats.totalRows.toLocaleString()} rows) and retrained classifier.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to upload CSV dataset.',
      });
    } finally {
      setSyncing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSyncRealtimeDataset = async () => {
    setSyncing(true);
    setStatusMessage(null);
    try {
      const response = await fetch('/api/dataset/sync-realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: syncMode }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to sync real-time dataset.');
      }
      onDatasetUpdated(payload.stats, payload.modelSummary);
      setStatusMessage({
        type: 'success',
        text: `Synced ${payload.liveFetchedCount} live postings + ${payload.emscadUsedCount.toLocaleString()} EMSCAD rows and retrained in ${payload.modelSummary.metrics.trainingDurationMs}ms.`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Real-time sync failed.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const metrics = modelSummary?.metrics;
  const cm = metrics?.confusionMatrix;
  const busy = syncing || training;

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div
          className={`rounded-xl px-4 py-3 text-xs flex items-center gap-2.5 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Top Row: Simple Dataset + Model Controls */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Real-Time Dataset Card */}
        <div className="xl:col-span-7 rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 flex flex-col justify-between space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" />
                Real-Time Dataset
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {datasetStats?.datasetName || 'Live public job feeds + authentic EMSCAD corpus'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleSyncRealtimeDataset}
                className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-indigo-500/60 hover:text-white disabled:opacity-60 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {syncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Sync Live Dataset
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload CSV
              </button>
            </div>
          </div>

          {datasetStats && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-[#070B14] border border-slate-800/80 p-3.5">
                  <div className="text-xs text-slate-400">Total Postings</div>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-slate-100 mt-0.5">
                    {datasetStats.totalRows.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg bg-[#070B14] border border-slate-800/80 p-3.5">
                  <div className="text-xs text-slate-400">Genuine</div>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-emerald-400 mt-0.5">
                    {datasetStats.genuineCount.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg bg-[#070B14] border border-slate-800/80 p-3.5">
                  <div className="text-xs text-slate-400">Fraudulent ({datasetStats.fraudRatePercent}%)</div>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-rose-400 mt-0.5">
                    {datasetStats.fakeCount.toLocaleString()}
                  </div>
                </div>
              </div>

              {datasetStats.sourceBreakdown && datasetStats.sourceBreakdown.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 pt-1">
                  <span className="text-slate-300 font-medium">Sources:</span>
                  {datasetStats.sourceBreakdown.map((src) => (
                    <span key={src.source} className="font-mono tabular-nums">
                      {src.source}: <strong className="text-slate-100">{src.count.toLocaleString()}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Classifier Card */}
        <div className="xl:col-span-5 rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  Classifier Model
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Logistic Regression with TF-IDF &amp; balanced class weights
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={handleTrain}
                className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-60 flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {training ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Training...
                  </>
                ) : (
                  'Retrain Model'
                )}
              </button>
            </div>

            {metrics && modelSummary && (
              <div className="rounded-lg bg-[#070B14] border border-slate-800/80 p-3.5 text-xs text-slate-300 space-y-1.5 font-mono tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Model ID</span>
                  <span className="text-slate-100">{modelSummary.modelId}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Train / Test Split</span>
                  <span className="text-slate-100">
                    {metrics.trainSamples.toLocaleString()} / {metrics.testSamples.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">ROC-AUC · Speed</span>
                  <span className="text-sky-300">
                    {metrics.rocAuc.toFixed(3)} · {metrics.trainingDurationMs}ms
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                Advanced Settings
              </span>
              {showAdvanced ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-2 gap-3 pt-4">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Test Split</label>
                  <select
                    value={config.testSplitRatio}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, testSplitRatio: Number(e.target.value) }))
                    }
                    className="w-full rounded-lg bg-[#070B14] border border-slate-800 px-2.5 py-1.5 text-xs font-mono text-slate-100"
                  >
                    <option value={0.15}>15% Test</option>
                    <option value={0.2}>20% Test</option>
                    <option value={0.25}>25% Test</option>
                    <option value={0.3}>30% Test</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Epochs</label>
                  <input
                    type="number"
                    min={20}
                    max={250}
                    step={10}
                    value={config.epochs}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, epochs: Number(e.target.value) || 80 }))
                    }
                    className="w-full rounded-lg bg-[#070B14] border border-slate-800 px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Learning Rate</label>
                  <input
                    type="number"
                    min={0.01}
                    max={0.5}
                    step={0.01}
                    value={config.learningRate}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, learningRate: Number(e.target.value) || 0.15 }))
                    }
                    className="w-full rounded-lg bg-[#070B14] border border-slate-800 px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">TF-IDF Features</label>
                  <select
                    value={config.maxFeatures}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, maxFeatures: Number(e.target.value) }))
                    }
                    className="w-full rounded-lg bg-[#070B14] border border-slate-800 px-2.5 py-1.5 text-xs font-mono text-slate-100"
                  >
                    <option value={1500}>1,500 features</option>
                    <option value={2500}>2,500 features</option>
                    <option value={3500}>3,500 features</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] text-slate-400 mb-1">Live Sync Corpus Size</label>
                  <select
                    value={syncMode}
                    onChange={(e) => setSyncMode(e.target.value as 'balanced' | 'full')}
                    className="w-full rounded-lg bg-[#070B14] border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100"
                  >
                    <option value="balanced">Balanced Live + EMSCAD (~3,180 rows · Fast)</option>
                    <option value="full">Full Live + 17,880 EMSCAD (~18,200 rows)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Core Evaluation Metrics */}
      {metrics && cm && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-5">
              <div className="text-xs text-slate-400">Test Accuracy</div>
              <div className="text-2xl font-semibold text-slate-50 font-mono tabular-nums mt-1">
                {(metrics.accuracy * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-5">
              <div className="text-xs text-slate-400">Precision (Fake)</div>
              <div className="text-2xl font-semibold text-indigo-400 font-mono tabular-nums mt-1">
                {(metrics.precision * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-5">
              <div className="text-xs text-slate-400">Recall (Fake)</div>
              <div className="text-2xl font-semibold text-sky-400 font-mono tabular-nums mt-1">
                {(metrics.recall * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-5">
              <div className="text-xs text-slate-400">F1-Score</div>
              <div className="text-2xl font-semibold text-emerald-400 font-mono tabular-nums mt-1">
                {(metrics.f1Score * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Loss Curve + Confusion Matrix */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Training &amp; Test Loss Curve
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Log-loss convergence across {modelSummary.config.epochs} epochs
                </p>
              </div>
              <LossCurveChart data={metrics.lossHistory} />
            </div>

            <div className="lg:col-span-5 rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Confusion Matrix
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Held-out evaluation on {metrics.testSamples} unseen postings
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-lg bg-emerald-950/30 border border-emerald-500/30 p-4">
                  <div className="text-xs text-emerald-300">True Genuine</div>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-slate-50 mt-1">
                    {cm.tn}
                  </div>
                </div>
                <div className="rounded-lg bg-amber-950/30 border border-amber-500/30 p-4">
                  <div className="text-xs text-amber-300">False Positive</div>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-slate-50 mt-1">
                    {cm.fp}
                  </div>
                </div>
                <div className="rounded-lg bg-rose-950/30 border border-rose-500/30 p-4">
                  <div className="text-xs text-rose-300">False Negative</div>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-slate-50 mt-1">
                    {cm.fn}
                  </div>
                </div>
                <div className="rounded-lg bg-indigo-950/40 border border-indigo-500/40 p-4">
                  <div className="text-xs text-indigo-300">True Fake</div>
                  <div className="text-2xl font-semibold font-mono tabular-nums text-slate-50 mt-1">
                    {cm.tp}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Learned Feature Weights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Top Fraud Indicators
                </h3>
                <p className="text-xs text-slate-400">
                  Highest positive logistic weights pushing risk toward Fake
                </p>
              </div>
              <HorizontalWeightBars
                barColor="#F43F5E"
                items={modelSummary.topFraudFeatures.slice(0, 6).map((f) => ({
                  label: f.term.replace(/_/g, ' '),
                  value: f.weight,
                }))}
              />
            </div>

            <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Top Genuine Indicators
                </h3>
                <p className="text-xs text-slate-400">
                  Strongest negative weights confirming legitimate postings
                </p>
              </div>
              <HorizontalWeightBars
                barColor="#10B981"
                items={modelSummary.topGenuineFeatures.slice(0, 6).map((f) => ({
                  label: f.term.replace(/_/g, ' '),
                  value: f.weight,
                }))}
              />
            </div>
          </div>
        </>
      )}

      {/* Simple Dataset Preview Table */}
      {datasetStats && datasetStats.samplePreview.length > 0 && (
        <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800/80">
            <h3 className="text-base font-semibold text-slate-100">
              Dataset Preview
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Recent labeled postings across live job feeds and EMSCAD
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800/80 text-slate-400 bg-slate-900/40">
                  <th className="py-3 px-6 font-medium">Job Title</th>
                  <th className="py-3 px-4 font-medium">Source</th>
                  <th className="py-3 px-6 font-medium text-right">Label</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {datasetStats.samplePreview.slice(0, 8).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-6 text-slate-100 font-medium">{row.title}</td>
                    <td className="py-2.5 px-4 text-sky-300 font-mono">{row.source}</td>
                    <td
                      className={`py-2.5 px-6 text-right font-mono font-medium ${
                        row.fraudulent === 1 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {row.fraudulent === 1 ? 'Fake' : 'Genuine'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

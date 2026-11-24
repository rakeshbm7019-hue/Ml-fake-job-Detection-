import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  FileSearch,
  FileSpreadsheet,
  FileText,
  ScanSearch,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import type { DashboardSummary, PredictionRecord } from '../types.ts';
import {
  DistributionRingChart,
  HorizontalWeightBars,
  LossCurveChart,
  TimelineBarChart,
} from './Charts.tsx';

interface DashboardViewProps {
  summary: DashboardSummary | null;
  loading: boolean;
  onNavigate: (tab: 'analyze' | 'model' | 'history', options?: { analyzeMode?: 'single' | 'batch' }) => void;
  onInspectPrediction: (record: PredictionRecord) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  summary,
  loading,
  onNavigate,
  onInspectPrediction,
}) => {
  const [chartTab, setChartTab] = useState<'timeline' | 'loss'>('loss');

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl bg-[#0F172A] border border-slate-800/80 animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 rounded-xl bg-[#0F172A] border border-slate-800/80 animate-pulse" />
          <div className="h-72 rounded-xl bg-[#0F172A] border border-slate-800/80 animate-pulse" />
        </div>
      </div>
    );
  }

  const totalAnalyzed = summary?.totalAnalyzed ?? 0;
  const genuineDetected = summary?.genuineDetected ?? 0;
  const fakeDetected = summary?.fakeDetected ?? 0;
  const highRiskDetected = summary?.highRiskDetected ?? 0;
  const modelMetrics = summary?.modelSummary?.metrics;

  const kpis = [
    {
      label: 'Total Jobs Analyzed',
      value: String(totalAnalyzed),
      meta: totalAnalyzed > 0 ? `Avg Risk ${summary?.averageRiskScore ?? 0}%` : 'Ready for first scan',
      icon: FileSearch,
      accent: 'text-indigo-400',
    },
    {
      label: 'Genuine Jobs Detected',
      value: String(genuineDetected),
      meta:
        totalAnalyzed > 0
          ? `${((genuineDetected / totalAnalyzed) * 100).toFixed(1)}% of analyzed`
          : '0.0% share',
      icon: CheckCircle2,
      accent: 'text-emerald-400',
    },
    {
      label: 'Fake Jobs Detected',
      value: String(fakeDetected),
      meta:
        totalAnalyzed > 0
          ? `${((fakeDetected / totalAnalyzed) * 100).toFixed(1)}% flagged`
          : '0.0% share',
      icon: ShieldAlert,
      accent: 'text-rose-400',
    },
    {
      label: 'High-Risk Postings',
      value: String(highRiskDetected),
      meta: 'Risk score >= 70%',
      icon: AlertTriangle,
      accent: 'text-amber-400',
    },
    {
      label: 'Model Performance',
      value: modelMetrics ? `${(modelMetrics.f1Score * 100).toFixed(1)}%` : '--',
      meta: modelMetrics
        ? `F1 · Acc ${(modelMetrics.accuracy * 100).toFixed(1)}%`
        : 'Not trained',
      icon: Cpu,
      accent: 'text-sky-400',
    },
  ];

  const quickActions = [
    {
      id: 'single-scan',
      title: 'Real-Time Job Scan',
      description: 'Inspect a job posting with live risk scoring, TF-IDF attribution, and Gemini analysis.',
      actionLabel: 'Open Detector',
      icon: ScanSearch,
      iconTone: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
      onClick: () => onNavigate('analyze', { analyzeMode: 'single' }),
    },
    {
      id: 'batch-import',
      title: 'Batch Import',
      description: 'Upload an unlabeled CSV of job listings to run automated bulk fraud screening.',
      actionLabel: 'Import CSV Batch',
      icon: FileSpreadsheet,
      iconTone: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
      onClick: () => onNavigate('analyze', { analyzeMode: 'batch' }),
    },
    {
      id: 'report-generation',
      title: 'Report Generation',
      description: 'Export consolidated Markdown audit summaries or CSV logs from prediction history.',
      actionLabel: 'Generate Reports',
      icon: FileText,
      iconTone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
      onClick: () => onNavigate('history'),
    },
    {
      id: 'model-training',
      title: 'Live Dataset & Model',
      description: 'Sync live public job feeds + authentic EMSCAD corpus and retrain Logistic Regression.',
      actionLabel: 'Open Trainer',
      icon: Cpu,
      iconTone: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
      onClick: () => onNavigate('model'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-5 flex flex-col justify-between gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{kpi.label}</span>
                <Icon className={`w-4 h-4 ${kpi.accent}`} />
              </div>
              <div>
                <div className="text-2xl font-semibold text-slate-50 tabular-nums font-display">
                  {kpi.value}
                </div>
                <div className="text-xs text-slate-400 mt-1 tabular-nums">{kpi.meta}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions Section */}
      <section aria-label="Quick Actions" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Quick Actions</h2>
          <span className="text-xs text-slate-400">
            Jump directly to a detection, batch, or reporting workflow
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                className="group text-left rounded-xl bg-[#0F172A] border border-slate-800/80 hover:border-indigo-500/50 hover:bg-slate-900/90 p-5 flex flex-col justify-between gap-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <div className="space-y-3">
                  <div
                    className={`w-9 h-9 rounded-lg border flex items-center justify-center ${action.iconTone}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100 group-hover:text-white">
                      {action.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {action.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-400 group-hover:text-indigo-300">
                  <span>{action.actionLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Interactive Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Prediction Distribution */}
        <div className="lg:col-span-5 rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Prediction Distribution</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Risk tier breakdown across analyzed postings
              </p>
            </div>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>

          <DistributionRingChart
            centerValue={String(totalAnalyzed)}
            centerLabel="Total Scans"
            segments={[
              {
                label: 'Low Risk (Genuine)',
                value: summary?.riskDistribution.low ?? 0,
                color: '#10B981',
              },
              {
                label: 'Medium Risk (Review)',
                value: summary?.riskDistribution.medium ?? 0,
                color: '#F59E0B',
              },
              {
                label: 'High Risk (Fake)',
                value: summary?.riskDistribution.high ?? 0,
                color: '#EF4444',
              },
            ]}
          />
        </div>

        {/* Interactive Chart Switcher: Model Loss Curve or Daily Detection Timeline */}
        <div className="lg:col-span-7 rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                {chartTab === 'loss'
                  ? 'Logistic Regression Optimization Curve'
                  : 'Daily Detection Activity'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {chartTab === 'loss'
                  ? 'Cross-entropy log-loss evaluated on stratified train/test split'
                  : 'Genuine vs potentially fake classifications by date'}
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setChartTab('loss')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  chartTab === 'loss'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Model Loss
              </button>
              <button
                type="button"
                onClick={() => setChartTab('timeline')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  chartTab === 'timeline'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Scan Timeline
              </button>
            </div>
          </div>

          {chartTab === 'loss' ? (
            <LossCurveChart data={modelMetrics?.lossHistory ?? []} />
          ) : (
            <TimelineBarChart series={summary?.timelineSeries ?? []} />
          )}
        </div>
      </div>

      {/* Second Row: Top Model/Detected Fraud Signals + Active Dataset & Model Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                {summary && summary.topTriggeredTerms.length > 0
                  ? 'Top Triggered Risk Terms'
                  : 'Top Learned Fraud Indicators (TF-IDF)'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {summary && summary.topTriggeredTerms.length > 0
                  ? 'Most frequent positive log-odds contributors in analyzed jobs'
                  : 'Highest positive weights learned from the labeled training corpus'}
              </p>
            </div>
            <TrendingUp className="w-4 h-4 text-rose-400" />
          </div>

          <HorizontalWeightBars
            barColor="#F43F5E"
            items={
              summary && summary.topTriggeredTerms.length > 0
                ? summary.topTriggeredTerms.map((t) => ({
                    label: t.term,
                    value: t.avgContribution,
                    subtitle: `${t.count} hit${t.count > 1 ? 's' : ''}`,
                  }))
                : (summary?.modelSummary?.topFraudFeatures ?? []).slice(0, 8).map((f) => ({
                    label: f.term.replace(/_/g, ' '),
                    value: f.weight,
                    subtitle: `IDF ${f.idf.toFixed(2)}`,
                  }))
            }
          />
        </div>

        <div className="lg:col-span-6 rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  Active Classifier & Dataset Summary
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {summary?.datasetStats?.datasetName || 'Real-Time Job Feeds + Authentic EMSCAD Corpus'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('model')}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                Model Console
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {modelMetrics ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-3">
                  <div className="text-xs text-slate-400">Accuracy</div>
                  <div className="text-lg font-semibold text-slate-100 font-mono tabular-nums mt-0.5">
                    {(modelMetrics.accuracy * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-3">
                  <div className="text-xs text-slate-400">Precision</div>
                  <div className="text-lg font-semibold text-slate-100 font-mono tabular-nums mt-0.5">
                    {(modelMetrics.precision * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-3">
                  <div className="text-xs text-slate-400">Recall</div>
                  <div className="text-lg font-semibold text-slate-100 font-mono tabular-nums mt-0.5">
                    {(modelMetrics.recall * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-lg bg-slate-900/70 border border-slate-800/80 p-3">
                  <div className="text-xs text-slate-400">ROC-AUC</div>
                  <div className="text-lg font-semibold text-slate-100 font-mono tabular-nums mt-0.5">
                    {modelMetrics.rocAuc.toFixed(3)}
                  </div>
                </div>
              </div>
            ) : null}

            {summary?.datasetStats ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 pt-1 tabular-nums">
                <span>{summary.datasetStats.totalRows.toLocaleString()} labeled rows</span>
                <span aria-hidden="true">·</span>
                <span>{summary.datasetStats.genuineCount.toLocaleString()} genuine</span>
                <span aria-hidden="true">·</span>
                <span>{summary.datasetStats.fakeCount.toLocaleString()} fraudulent</span>
                <span aria-hidden="true">·</span>
                <span>{modelMetrics?.vocabularySize ?? 0} TF-IDF features</span>
                {modelMetrics?.trainingDurationMs ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Trained in {modelMetrics.trainingDurationMs}ms</span>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800/80">
            <span className="text-xs text-slate-400">
              Primary predictions use trained Logistic Regression + Gemini explanation.
            </span>
            <button
              type="button"
              onClick={() => onNavigate('analyze', { analyzeMode: 'single' })}
              className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 transition-colors whitespace-nowrap shrink-0"
            >
              Analyze New Posting
            </button>
          </div>
        </div>
      </div>

      {/* Recent Predictions Table */}
      <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Recent Job Analyses</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Click any record to inspect full NLP tokens, feature weights, and Gemini reasoning
            </p>
          </div>
          {totalAnalyzed > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              View All History
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {summary && summary.recentPredictions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 text-xs text-slate-400 bg-slate-900/40">
                  <th className="py-3 px-6 font-medium">Job Title & Company</th>
                  <th className="py-3 px-4 font-medium">Location</th>
                  <th className="py-3 px-4 font-medium">Verdict</th>
                  <th className="py-3 px-4 font-medium text-right">Risk Score</th>
                  <th className="py-3 px-6 font-medium text-right">Analyzed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {summary.recentPredictions.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onInspectPrediction(item)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-6">
                      <div className="font-medium text-slate-100">{item.input.title}</div>
                      <div className="text-xs text-slate-400">
                        {item.input.companyName || 'Undisclosed company'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-300">
                      {item.input.location || 'Unspecified'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          item.verdict === 'Potentially Fake'
                            ? 'text-rose-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {item.verdict === 'Potentially Fake' ? (
                          <ShieldAlert className="w-3.5 h-3.5" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        {item.verdict}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-100">
                      {item.riskPercentage.toFixed(1)}%
                    </td>
                    <td className="py-3 px-6 text-right text-xs text-slate-400 tabular-nums font-mono">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-300">
              No job postings have been analyzed yet.
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Pull live public job postings or enter a job description in the Job Detection Module to populate real-time prediction analytics.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate('analyze', { analyzeMode: 'single' })}
                className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
              >
                Open Job Detection Module
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Cpu,
  History,
  LayoutDashboard,
  Menu,
  ScanSearch,
  Shield,
  X,
} from 'lucide-react';
import type {
  DashboardSummary,
  DatasetStatistics,
  ModelSummary,
  PredictionRecord,
} from './types.ts';
import { DashboardView } from './components/DashboardView.tsx';
import { DocumentationView } from './components/DocumentationView.tsx';
import { HistoryView } from './components/HistoryView.tsx';
import { JobAnalyzerView } from './components/JobAnalyzerView.tsx';
import { ModelTrainingView } from './components/ModelTrainingView.tsx';

type NavTab = 'dashboard' | 'analyze' | 'model' | 'history' | 'docs';

const NAV_ITEMS: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'analyze', label: 'Analyze Job', icon: ScanSearch },
  { id: 'model', label: 'Model & Dataset', icon: Cpu },
  { id: 'history', label: 'History', icon: History },
  { id: 'docs', label: 'Documentation', icon: BookOpen },
];

const TAB_TITLES: Record<NavTab, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Detection Overview',
    subtitle: 'Real-time classification statistics, risk distributions, and model metrics',
  },
  analyze: {
    title: 'Job Detection Module',
    subtitle: 'NLP preprocessing, TF-IDF vectorization, Logistic Regression & Gemini analysis',
  },
  model: {
    title: 'Model Training & Dataset',
    subtitle: 'Live job feed sync, authentic EMSCAD ingestion, stratified splitting, and classifier evaluation',
  },
  history: {
    title: 'Prediction History',
    subtitle: 'Search, filter, inspect, and export stored job fraud analyses',
  },
  docs: {
    title: 'Technical Documentation',
    subtitle: 'Architecture, mathematical foundations, and evaluation reference',
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [analyzeMode, setAnalyzeMode] = useState<'single' | 'batch'>('single');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [modelSummary, setModelSummary] = useState<ModelSummary | null>(null);
  const [datasetStats, setDatasetStats] = useState<DatasetStatistics | null>(null);
  const [activeResult, setActiveResult] = useState<PredictionRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAllData = useCallback(async () => {
    try {
      const [dashRes, predRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/predictions'),
      ]);
      if (dashRes.ok) {
        const dashData = (await dashRes.json()) as DashboardSummary;
        setDashboard(dashData);
        setModelSummary(dashData.modelSummary);
        setDatasetStats(dashData.datasetStats);
      }
      if (predRes.ok) {
        const predData = (await predRes.json()) as PredictionRecord[];
        setPredictions(predData);
      }
    } catch (err) {
      console.error('Failed to load initial system state:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAllData();
  }, [refreshAllData]);

  const handleAnalysisComplete = (record: PredictionRecord) => {
    setActiveResult(record);
    setPredictions((prev) => [record, ...prev]);
    void refreshAllData();
  };

  const handleInspectPrediction = (record: PredictionRecord) => {
    setActiveResult(record);
    setAnalyzeMode('single');
    setActiveTab('analyze');
  };

  const handleNavigate = (
    tab: 'analyze' | 'model' | 'history',
    options?: { analyzeMode?: 'single' | 'batch' }
  ) => {
    if (tab === 'analyze' && options?.analyzeMode) {
      setAnalyzeMode(options.analyzeMode);
    }
    setActiveTab(tab);
  };

  const handleDeletePrediction = async (id: string) => {
    const res = await fetch(`/api/predictions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setPredictions((prev) => prev.filter((p) => p.id !== id));
      if (activeResult?.id === id) {
        setActiveResult(null);
      }
      void refreshAllData();
    }
  };

  const handleClearHistory = async () => {
    const res = await fetch('/api/predictions', { method: 'DELETE' });
    if (res.ok) {
      setPredictions([]);
      setActiveResult(null);
      void refreshAllData();
    }
  };

  const handleModelUpdated = (model: ModelSummary) => {
    setModelSummary(model);
    void refreshAllData();
  };

  const handleDatasetUpdated = (
    stats: DatasetStatistics,
    updatedModel?: ModelSummary | null
  ) => {
    setDatasetStats(stats);
    if (updatedModel) {
      setModelSummary(updatedModel);
    }
    void refreshAllData();
  };

  const handleFeedbackApplied = (
    updatedRecord: PredictionRecord,
    updatedStats: DatasetStatistics,
    updatedModel: ModelSummary
  ) => {
    setPredictions((prev) =>
      prev.map((p) => (p.id === updatedRecord.id ? updatedRecord : p))
    );
    if (activeResult?.id === updatedRecord.id) {
      setActiveResult(updatedRecord);
    }
    setDatasetStats(updatedStats);
    setModelSummary(updatedModel);
    void refreshAllData();
  };

  const headerInfo = TAB_TITLES[activeTab];

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0B1120] border-r border-slate-800/80 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-slate-50 font-display whitespace-nowrap">
              Fake Job Detection
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1 text-slate-400 hover:text-slate-200"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Model Footer */}
        <div className="p-4 m-3 rounded-xl bg-[#0F172A] border border-slate-800/80 space-y-2 text-xs">
          <div className="text-slate-400 font-medium">Active Classifier</div>
          <div className="text-slate-100 font-medium truncate">
            Logistic Regression (TF-IDF)
          </div>
          {modelSummary ? (
            <div className="flex items-center justify-between text-slate-400 font-mono tabular-nums pt-1 border-t border-slate-800/80">
              <span>Acc {(modelSummary.metrics.accuracy * 100).toFixed(1)}%</span>
              <span>F1 {(modelSummary.metrics.f1Score * 100).toFixed(1)}%</span>
            </div>
          ) : (
            <div className="text-slate-500">Initializing model...</div>
          )}
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-[#070B14]/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-slate-50 font-display truncate">
                {headerInfo.title}
              </h1>
              <p className="text-xs text-slate-400 truncate hidden sm:block">
                {headerInfo.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeTab !== 'analyze' && (
              <button
                type="button"
                onClick={() => setActiveTab('analyze')}
                className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 transition-colors whitespace-nowrap shrink-0"
              >
                Analyze Job
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              summary={dashboard}
              loading={loading}
              onNavigate={handleNavigate}
              onInspectPrediction={handleInspectPrediction}
            />
          )}

          {activeTab === 'analyze' && (
            <JobAnalyzerView
              mode={analyzeMode}
              onModeChange={setAnalyzeMode}
              activeResult={activeResult}
              onAnalysisComplete={handleAnalysisComplete}
              onBatchComplete={refreshAllData}
              onFeedbackApplied={handleFeedbackApplied}
            />
          )}

          {activeTab === 'model' && (
            <ModelTrainingView
              modelSummary={modelSummary}
              datasetStats={datasetStats}
              onModelUpdated={handleModelUpdated}
              onDatasetUpdated={handleDatasetUpdated}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView
              predictions={predictions}
              loading={loading}
              onInspect={handleInspectPrediction}
              onDeleteOne={handleDeletePrediction}
              onClearAll={handleClearHistory}
            />
          )}

          {activeTab === 'docs' && <DocumentationView />}
        </main>
      </div>
    </div>
  );
}

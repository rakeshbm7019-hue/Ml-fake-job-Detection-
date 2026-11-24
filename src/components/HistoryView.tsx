import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type { PredictionRecord } from '../types.ts';
import {
  downloadConsolidatedReportCsv,
  downloadConsolidatedReportMarkdown,
  downloadPredictionJson,
  downloadPredictionMarkdown,
} from '../utils/samples.ts';

interface HistoryViewProps {
  predictions: PredictionRecord[];
  loading: boolean;
  onInspect: (record: PredictionRecord) => void;
  onDeleteOne: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  predictions,
  loading,
  onInspect,
  onDeleteOne,
  onClearAll,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [verdictFilter, setVerdictFilter] = useState<'all' | 'genuine' | 'fake'>('all');
  const [riskFilter, setRiskFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = predictions.filter((item) => {
    if (verdictFilter === 'genuine' && item.verdict !== 'Genuine') return false;
    if (verdictFilter === 'fake' && item.verdict !== 'Potentially Fake') return false;
    if (riskFilter !== 'all' && item.riskLevel.toLowerCase() !== riskFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hay = `${item.input.title} ${item.input.companyName} ${item.input.location} ${item.input.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Consolidated Report Generation */}
      <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Report Generation</h2>
            <p className="text-xs text-slate-400">
              Export consolidated audit reports across {filtered.length} filtered prediction{filtered.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={filtered.length === 0}
            onClick={() => downloadConsolidatedReportMarkdown(filtered)}
            className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-indigo-500/60 disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export Audit Report (.md)
          </button>
          <button
            type="button"
            disabled={filtered.length === 0}
            onClick={() => downloadConsolidatedReportCsv(filtered)}
            className="px-3.5 py-2 rounded-lg text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export History (.csv)
          </button>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search job title, company, location, or keywords..."
            className="w-full rounded-lg bg-[#070B14] border border-slate-800 pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
            {(['all', 'genuine', 'fake'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVerdictFilter(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  verdictFilter === v
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {v === 'all' ? 'All Verdicts' : v === 'genuine' ? 'Genuine' : 'Potentially Fake'}
              </button>
            ))}
          </div>

          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value as 'all' | 'high' | 'medium' | 'low')}
            className="rounded-lg bg-[#070B14] border border-slate-800 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Risk Tiers</option>
            <option value="high">High Risk (70%+)</option>
            <option value="medium">Medium Risk (40–69%)</option>
            <option value="low">Low Risk (&lt;40%)</option>
          </select>

          {predictions.length > 0 && (
            <>
              {!confirmClear ? (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-rose-400 hover:border-rose-500/50 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear History
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await onClearAll();
                      setConfirmClear(false);
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-medium bg-rose-600 text-white hover:bg-rose-500 whitespace-nowrap shrink-0"
                  >
                    Confirm Delete All
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 whitespace-nowrap shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* History Table */}
      <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span>
            Showing <strong className="text-slate-100 tabular-nums">{filtered.length}</strong> of{' '}
            <strong className="text-slate-100 tabular-nums">{predictions.length}</strong> stored predictions
          </span>
          <span className="font-mono">Persistent Server Storage</span>
        </div>

        {loading && predictions.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            Loading prediction history...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm text-slate-300">
              {predictions.length === 0
                ? 'No job prediction records stored yet.'
                : 'No records match your current search and filters.'}
            </p>
            <p className="text-xs text-slate-500">
              Analyze a job posting in the Detection Module to save predictions and export reports.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 text-xs text-slate-400 bg-slate-900/40">
                  <th className="py-3 px-6 font-medium">Job Title & Company</th>
                  <th className="py-3 px-4 font-medium">Verdict</th>
                  <th className="py-3 px-4 font-medium text-right">Risk %</th>
                  <th className="py-3 px-4 font-medium text-right">Genuine / Fake</th>
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-6 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/35 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="font-medium text-slate-100">{item.input.title}</div>
                      <div className="text-xs text-slate-400">
                        {item.input.companyName || 'Undisclosed company'} ·{' '}
                        {item.input.location || 'Unspecified'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
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
                      {item.userFeedback && (
                        <div className="text-[11px] text-sky-400 mt-0.5 font-mono">
                          Verified: {item.userFeedback}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-100">
                      {item.riskPercentage.toFixed(1)}%
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-300">
                      {item.genuineProbability.toFixed(1)}% / {item.fakeProbability.toFixed(1)}%
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-slate-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-6">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onInspect(item)}
                          title="Inspect full prediction report"
                          className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadPredictionMarkdown(item)}
                          title="Download Markdown Report"
                          className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadPredictionJson(item)}
                          title="Download JSON Report"
                          className="px-2 py-1 rounded-md text-[11px] font-mono text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                        >
                          JSON
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteOne(item.id)}
                          title="Delete prediction"
                          className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import { BookOpen, Cpu, Database, FileCode2, Layers, ShieldCheck } from 'lucide-react';

export const DocumentationView: React.FC = () => {
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-3">
        <div className="flex items-center gap-2.5 text-indigo-400 text-xs font-medium">
          <BookOpen className="w-4 h-4" />
          Technical Reference & Engineering Evaluation Guide
        </div>
        <h2 className="text-xl font-semibold text-slate-50 font-display">
          Fake Job Detection System – AI & NLP Based
        </h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          This system combines deterministic Natural Language Processing (NLP), TF-IDF feature engineering, a trainable L2-regularized Logistic Regression classifier trained on EMSCAD-schema labeled data, and server-side Gemini natural-language explainability. The trained ML classifier acts as the authoritative decision engine, while Gemini translates feature weights and structural anomalies into actionable guidance for job seekers.
        </p>
      </div>

      {/* Architecture & Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Layers className="w-4 h-4 text-sky-400" />
            1. NLP Preprocessing Pipeline
          </div>
          <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
            <li>
              <strong className="text-slate-100">Text Cleaning:</strong> Strips HTML tags, URLs, Unicode diacritics, punctuation, and normalizes currency values (<code className="text-indigo-300">currencyamount</code>) and email addresses (<code className="text-indigo-300">emailtoken</code>).
            </li>
            <li>
              <strong className="text-slate-100">Lowercase Conversion:</strong> Normalizes lexical casing across titles, skills, and descriptions.
            </li>
            <li>
              <strong className="text-slate-100">Tokenization:</strong> Extracts word boundaries (&ge; 2 characters) and informative adjacent bigrams (e.g., <code className="text-indigo-300">wire_transfer</code>, <code className="text-indigo-300">gift_card</code>).
            </li>
            <li>
              <strong className="text-slate-100">Stop-Word Removal:</strong> Filters 170+ high-frequency English stop words to isolate discriminative domain vocabulary.
            </li>
            <li>
              <strong className="text-slate-100">Text Normalization:</strong> Deterministic suffix stemming reduces inflectional variants (e.g., <em>transfers / transferring / transferred</em>).
            </li>
            <li>
              <strong className="text-slate-100">Metadata Signals:</strong> Injects structural indicators such as missing company website, free webmail recruiter domains, and off-platform messaging redirects.
            </li>
          </ol>
        </div>

        <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Cpu className="w-4 h-4 text-indigo-400" />
            2. TF-IDF & Logistic Regression Model
          </div>
          <div className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
            <p>
              <strong className="text-slate-100">Sublinear TF-IDF Vectorization:</strong> Vocabulary is fitted strictly on the training split to prevent test-set leakage. Each term weight combines sublinear term frequency <code className="text-indigo-300">1 + ln(tf)</code> with smoothed inverse document frequency <code className="text-indigo-300">ln((1+N)/(1+df)) + 1</code>, followed by L2 unit-norm scaling.
            </p>
            <p>
              <strong className="text-slate-100">Balanced Binary Cross-Entropy:</strong> Because employment scam datasets exhibit class imbalance, training examples are weighted inversely proportional to class frequency so minority fraud patterns achieve strong Recall and F1-score.
            </p>
            <p>
              <strong className="text-slate-100">Optimization & Evaluation:</strong> Trained using Adam gradient descent with L2 weight decay. Metrics (Accuracy, Precision, Recall, F1-Score, ROC-AUC, and Confusion Matrix) are computed strictly on the stratified held-out test set.
            </p>
          </div>
        </div>
      </div>

      {/* EMSCAD & Hybrid Gemini */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Database className="w-4 h-4 text-emerald-400" />
            3. Real-Time Ingestion Listener &amp; EMSCAD Corpus
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            A persistent server-side ingestion listener continuously polls four live job aggregator APIs (<strong className="text-slate-100">Arbeitnow</strong>, <strong className="text-slate-100">Remotive</strong>, <strong className="text-slate-100">Jobicy</strong>, and <strong className="text-slate-100">RemoteOK</strong>), deduplicates incoming postings, scores them instantaneously via the trained ML classifier, streams updates over Server-Sent Events (SSE), and pairs them with the 17,880-row EMSCAD corpus and custom RFC-4180 CSV uploads.
          </p>
        </div>

        <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 p-6 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            4. Hybrid ML + Gemini Explainability
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            For each submitted job posting, the backend computes exact linear contributions <code className="text-indigo-300">w_i * x_i</code> per TF-IDF feature to determine the Genuine/Fake probabilities. Those top contributing tokens and structural metadata signals are passed server-side to Gemini (<code className="text-indigo-300">gemini-4-hydrogen</code>) via <code className="text-indigo-300">@google/genai</code> to synthesize human-readable risk indicators and candidate verification steps.
          </p>
        </div>
      </div>

      {/* API Reference */}
      <div className="rounded-xl bg-[#0F172A] border border-slate-800/80 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center gap-2 text-sm font-semibold text-slate-100">
          <FileCode2 className="w-4 h-4 text-indigo-400" />
          5. Server REST API Endpoints
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800/80 text-slate-400 bg-slate-900/40">
                <th className="py-3 px-6 font-medium">Method & Route</th>
                <th className="py-3 px-6 font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              <tr>
                <td className="py-2.5 px-6 text-indigo-300">GET /api/dashboard</td>
                <td className="py-2.5 px-6 font-sans text-slate-300">
                  Aggregates total analyzed jobs, risk counts, timeline series, active model summary, and dataset statistics.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-6 text-indigo-300">POST /api/analyze &amp; /preview</td>
                <td className="py-2.5 px-6 font-sans text-slate-300">
                  Runs real-time NLP preprocessing, TF-IDF vectorization, calibrated Logistic Regression prediction, and Gemini explanation.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-6 text-indigo-300">GET /api/ingestion/stream</td>
                <td className="py-2.5 px-6 font-sans text-slate-300">
                  Server-Sent Events (SSE) stream pushing newly ingested and classified jobs from Arbeitnow, Remotive, Jobicy, and RemoteOK.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-6 text-indigo-300">POST /api/ingestion/poll | start | stop</td>
                <td className="py-2.5 px-6 font-sans text-slate-300">
                  Triggers an immediate aggregator poll or pauses/resumes the background ingestion worker (<code className="text-indigo-300">PATCH /api/ingestion/config</code> tunes interval and auto-save).
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-6 text-indigo-300">GET /api/live-jobs</td>
                <td className="py-2.5 px-6 font-sans text-slate-300">
                  On-demand snapshot interleaved across Arbeitnow, Remotive, Jobicy, and RemoteOK APIs and scored in real time.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-6 text-indigo-300">POST /api/dataset/sync-realtime</td>
                <td className="py-2.5 px-6 font-sans text-slate-300">
                  Synchronizes live job feeds with the authentic 17,880-row EMSCAD corpus and retrains the classifier.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-6 text-indigo-300">POST /api/dataset/upload</td>
                <td className="py-2.5 px-6 font-sans text-slate-300">
                  Parses uploaded EMSCAD/labeled CSV dataset, computes statistics, and optionally retrains the classifier.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-6 text-indigo-300">POST /api/model/train</td>
                <td className="py-2.5 px-6 font-sans text-slate-300">
                  Performs stratified train/test split, fits TF-IDF + vectorized Float64Array Logistic Regression, and persists weights.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-6 text-indigo-300">POST /api/predictions/:id/feedback</td>
                <td className="py-2.5 px-6 font-sans text-slate-300">
                  Records verified Genuine/Fake label feedback into the training corpus and immediately retrains the model.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

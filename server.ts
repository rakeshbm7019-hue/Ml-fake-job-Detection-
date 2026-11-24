import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type {
  BatchScanResponse,
  BatchScanRowResult,
  IngestionListenerState,
  JobPostingInput,
  LiveJobFeedItem,
  PredictionRecord,
  TrainingConfig,
} from './src/types.ts';
import { parseJobDatasetCsv, parseUnlabeledBatchCsv } from './server/dataset.ts';
import { generateGeminiJobExplanation } from './server/gemini.ts';
import { ingestionListener } from './server/ingestionListener.ts';
import { predictWithModel, toModelSummary, trainLogisticRegressionModel } from './server/ml.ts';
import { fetchLivePublicJobFeeds, type RealtimeCorpusMode } from './server/realtimeDataset.ts';
import {
  applyPredictionFeedbackAndRetrain,
  buildDashboardSummary,
  clearAllPredictions,
  DEFAULT_TRAINING_CONFIG,
  deletePredictionById,
  ensureBootstrappedSystem,
  loadActiveDataset,
  loadPredictions,
  loadTrainedModel,
  saveActiveDataset,
  savePrediction,
  saveTrainedModel,
  syncRealtimeDataset,
} from './server/storage.ts';

const PORT = 3000;

async function createApp() {
  // Bootstrap real-time dataset & Logistic Regression model on startup
  await ensureBootstrappedSystem();

  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.text({ limit: '50mb', type: 'text/csv' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const model = loadTrainedModel();
    const dataset = loadActiveDataset();
    res.json({
      status: 'ok',
      modelLoaded: Boolean(model),
      datasetLoaded: Boolean(dataset),
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ),
    });
  });

  app.get('/api/dashboard', (_req: Request, res: Response) => {
    try {
      const summary = buildDashboardSummary();
      res.json(summary);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to build dashboard summary',
      });
    }
  });

  app.get('/api/model', (_req: Request, res: Response) => {
    const model = loadTrainedModel();
    if (!model) {
      res.status(404).json({ error: 'No trained model found. Upload a dataset and train the classifier.' });
      return;
    }
    res.json(toModelSummary(model));
  });

  app.post('/api/model/train', (req: Request, res: Response) => {
    try {
      const dataset = loadActiveDataset();
      if (!dataset || dataset.rows.length === 0) {
        res.status(400).json({ error: 'No active dataset loaded. Upload a labeled CSV dataset first.' });
        return;
      }

      const body = (req.body || {}) as Partial<TrainingConfig>;
      const testSplitRatio = Math.min(0.45, Math.max(0.1, Number(body.testSplitRatio) || DEFAULT_TRAINING_CONFIG.testSplitRatio));
      const epochs = Math.min(250, Math.max(20, Math.round(Number(body.epochs) || DEFAULT_TRAINING_CONFIG.epochs)));
      const learningRate = Math.min(0.5, Math.max(0.01, Number(body.learningRate) || DEFAULT_TRAINING_CONFIG.learningRate));
      const l2Lambda = Math.min(0.1, Math.max(0, Number(body.l2Lambda ?? DEFAULT_TRAINING_CONFIG.l2Lambda)));
      const maxFeatures = Math.min(5000, Math.max(200, Math.round(Number(body.maxFeatures) || DEFAULT_TRAINING_CONFIG.maxFeatures)));

      const config: TrainingConfig = {
        testSplitRatio,
        epochs,
        learningRate,
        l2Lambda,
        maxFeatures,
      };

      const model = trainLogisticRegressionModel(dataset.rows, dataset.datasetName, config);
      saveTrainedModel(model);
      res.json(toModelSummary(model));
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to train Logistic Regression model.',
      });
    }
  });

  app.get('/api/dataset', (_req: Request, res: Response) => {
    const dataset = loadActiveDataset();
    if (!dataset) {
      res.status(404).json({ error: 'No dataset loaded.' });
      return;
    }
    res.json(dataset.stats);
  });

  app.post('/api/dataset/upload', (req: Request, res: Response) => {
    try {
      let csvText = '';
      let datasetName = 'uploaded_dataset.csv';

      if (typeof req.body === 'string') {
        csvText = req.body;
      } else if (req.body && typeof req.body === 'object') {
        csvText = String((req.body as { csv?: string }).csv || '');
        if ((req.body as { fileName?: string }).fileName) {
          datasetName = String((req.body as { fileName?: string }).fileName);
        }
      }

      if (!csvText.trim()) {
        res.status(400).json({ error: 'Uploaded CSV content is empty.' });
        return;
      }

      const rows = parseJobDatasetCsv(csvText);
      const saved = saveActiveDataset(datasetName, rows);

      // Automatically retrain if requested
      const autoTrain =
        typeof req.body === 'object' && req.body !== null
          ? Boolean((req.body as { autoTrain?: boolean }).autoTrain)
          : false;

      let modelSummary = null;
      if (autoTrain) {
        const model = trainLogisticRegressionModel(
          saved.rows,
          saved.datasetName,
          DEFAULT_TRAINING_CONFIG
        );
        saveTrainedModel(model);
        modelSummary = toModelSummary(model);
      }

      res.json({
        stats: saved.stats,
        modelSummary,
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid CSV dataset format.',
      });
    }
  });

  app.post('/api/dataset/sync-realtime', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { mode?: RealtimeCorpusMode };
      const mode: RealtimeCorpusMode = body.mode === 'full' ? 'full' : 'balanced';
      const synced = await syncRealtimeDataset(mode);
      res.json({
        stats: synced.dataset.stats,
        modelSummary: toModelSummary(synced.model),
        liveFetchedCount: synced.liveFetchedCount,
        emscadUsedCount: synced.emscadUsedCount,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to sync real-time dataset.',
      });
    }
  });

  app.post('/api/dataset/reset', async (_req: Request, res: Response) => {
    try {
      const synced = await syncRealtimeDataset('balanced');
      res.json({
        stats: synced.dataset.stats,
        modelSummary: toModelSummary(synced.model),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to sync real-time dataset.',
      });
    }
  });

  app.get('/api/live-jobs', async (req: Request, res: Response) => {
    try {
      const model = loadTrainedModel();
      if (!model) {
        res.status(400).json({ error: 'Trained ML model is unavailable.' });
        return;
      }

      const limit = Math.min(30, Math.max(4, Number(req.query.limit) || 12));
      const feed = await fetchLivePublicJobFeeds();

      // Interleave across all 4 aggregators cleanly
      const arbeitnow = feed.entries.filter((e) => e.source === 'Arbeitnow Live');
      const remotive = feed.entries.filter((e) => e.source === 'Remotive Live');
      const jobicy = feed.entries.filter((e) => e.source === 'Jobicy Live');
      const remoteOk = feed.entries.filter((e) => e.source === 'RemoteOK Live');
      const mixed = [];
      let ai = 0;
      let ri = 0;
      let ji = 0;
      let ki = 0;
      while (
        mixed.length < limit &&
        (ai < arbeitnow.length || ri < remotive.length || ji < jobicy.length || ki < remoteOk.length)
      ) {
        if (ri < remotive.length && mixed.length < limit) mixed.push(remotive[ri++]);
        if (ji < jobicy.length && mixed.length < limit) mixed.push(jobicy[ji++]);
        if (ki < remoteOk.length && mixed.length < limit) mixed.push(remoteOk[ki++]);
        if (ai < arbeitnow.length && mixed.length < limit) mixed.push(arbeitnow[ai++]);
      }

      const items: LiveJobFeedItem[] = mixed.map((entry) => {
        const ml = predictWithModel(entry.input, model);
        return {
          id: entry.id,
          source: entry.source,
          url: entry.url,
          publishedAt: entry.publishedAt,
          input: entry.input,
          verdict: ml.verdict,
          riskLevel: ml.riskLevel,
          riskPercentage: ml.riskPercentage,
          indicators:
            ml.nlpTrace.metadataSignals.length > 0
              ? ml.nlpTrace.metadataSignals.slice(0, 3)
              : ml.topSuspiciousWords.slice(0, 3).map((w) => w.term),
        };
      });

      res.json({
        fetchedAt: new Date().toISOString(),
        arbeitnowTotal: feed.arbeitnowCount,
        remotiveTotal: feed.remotiveCount,
        jobicyTotal: feed.jobicyCount,
        remoteOkTotal: feed.remoteOkCount,
        items,
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to fetch live job feeds.',
      });
    }
  });

  // Real-Time Backend Ingestion Listener Routes & SSE Stream
  app.get('/api/ingestion/state', (_req: Request, res: Response) => {
    res.json(ingestionListener.getState());
  });

  app.get('/api/ingestion/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (eventName: string, payload: IngestionListenerState) => {
      res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    sendEvent('init', ingestionListener.getState());

    const onUpdate = (state: IngestionListenerState) => {
      sendEvent('state', state);
    };
    ingestionListener.on('update', onUpdate);

    const heartbeat = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      ingestionListener.off('update', onUpdate);
    });
  });

  app.post('/api/ingestion/start', (_req: Request, res: Response) => {
    res.json(ingestionListener.start());
  });

  app.post('/api/ingestion/stop', (_req: Request, res: Response) => {
    res.json(ingestionListener.stop());
  });

  app.post('/api/ingestion/poll', async (_req: Request, res: Response) => {
    const state = await ingestionListener.pollNow();
    res.json(state);
  });

  app.patch('/api/ingestion/config', (req: Request, res: Response) => {
    const body = (req.body || {}) as {
      intervalSeconds?: number;
      autoSaveHighRisk?: boolean;
    };
    res.json(ingestionListener.updateConfig(body));
  });

  app.post('/api/analyze', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Partial<JobPostingInput>;
      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();

      if (!title || title.length < 2) {
        res.status(400).json({ error: 'Job title is required (minimum 2 characters).' });
        return;
      }
      if (!description || description.length < 8) {
        res.status(400).json({ error: 'Job description is required (minimum 8 characters) for NLP feature extraction.' });
        return;
      }

      const input: JobPostingInput = {
        title,
        companyName: String(body.companyName || '').trim(),
        companyWebsite: String(body.companyWebsite || '').trim(),
        location: String(body.location || '').trim(),
        salary: String(body.salary || '').trim(),
        description,
        requiredSkills: String(body.requiredSkills || '').trim(),
        employmentType: String(body.employmentType || 'Full-time').trim(),
        experienceLevel: String(body.experienceLevel || 'Associate').trim(),
      };

      const model = loadTrainedModel();
      if (!model) {
        res.status(400).json({ error: 'Trained ML model is unavailable. Please train the classifier first.' });
        return;
      }

      // 1. Primary ML Prediction (NLP Preprocessing + TF-IDF + Logistic Regression)
      const mlResult = predictWithModel(input, model);

      // 2. Gemini API Natural-Language Explanation
      const geminiAnalysis = await generateGeminiJobExplanation(input, mlResult);

      // Merge structural indicators + Gemini linguistic indicators without duplication
      const combinedIndicators = Array.from(
        new Set([
          ...mlResult.nlpTrace.metadataSignals,
          ...geminiAnalysis.suspiciousIndicators,
        ])
      ).slice(0, 7);

      const record: PredictionRecord = {
        id: `scan-${crypto.randomBytes(5).toString('hex')}`,
        createdAt: new Date().toISOString(),
        input,
        verdict: mlResult.verdict,
        riskLevel: mlResult.riskLevel,
        riskPercentage: mlResult.riskPercentage,
        genuineProbability: mlResult.genuineProbability,
        fakeProbability: mlResult.fakeProbability,
        suspiciousIndicators:
          combinedIndicators.length > 0
            ? combinedIndicators
            : mlResult.verdict === 'Genuine'
              ? ['Consistent professional role scope and standard compensation structure']
              : ['High positive TF-IDF weight density across fraud-associated tokens'],
        explanation:
          geminiAnalysis.status === 'ok'
            ? `${mlResult.mlExplanation} ${geminiAnalysis.summaryExplanation}`
            : mlResult.mlExplanation,
        topSuspiciousWords: mlResult.topSuspiciousWords,
        topGenuineSignals: mlResult.topGenuineSignals,
        nlpTrace: mlResult.nlpTrace,
        geminiAnalysis,
        modelVersionId: model.modelId,
      };

      savePrediction(record);
      res.json(record);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to analyze job posting.',
      });
    }
  });

  app.post('/api/analyze/preview', (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Partial<JobPostingInput>;
      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();
      if (title.length < 2 && description.length < 8) {
        res.json({ ready: false });
        return;
      }

      const model = loadTrainedModel();
      if (!model) {
        res.status(400).json({ error: 'Trained ML model is unavailable.' });
        return;
      }

      const input: JobPostingInput = {
        title: title || 'Untitled',
        companyName: String(body.companyName || '').trim(),
        companyWebsite: String(body.companyWebsite || '').trim(),
        location: String(body.location || '').trim(),
        salary: String(body.salary || '').trim(),
        description: description || title,
        requiredSkills: String(body.requiredSkills || '').trim(),
        employmentType: String(body.employmentType || 'Full-time').trim(),
        experienceLevel: String(body.experienceLevel || 'Associate').trim(),
      };

      const mlResult = predictWithModel(input, model);
      res.json({
        ready: true,
        verdict: mlResult.verdict,
        riskLevel: mlResult.riskLevel,
        riskPercentage: mlResult.riskPercentage,
        genuineProbability: mlResult.genuineProbability,
        fakeProbability: mlResult.fakeProbability,
        topSuspiciousWords: mlResult.topSuspiciousWords.slice(0, 5),
        metadataSignals: mlResult.nlpTrace.metadataSignals.slice(0, 5),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Preview analysis failed.',
      });
    }
  });

  app.post('/api/analyze/batch', (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        csv?: string;
        fileName?: string;
        saveToHistory?: boolean;
      };
      const csvText = String(body.csv || '');
      const fileName = String(body.fileName || 'batch_postings.csv');
      const saveToHistory = Boolean(body.saveToHistory);

      if (!csvText.trim()) {
        res.status(400).json({ error: 'Uploaded CSV content is empty.' });
        return;
      }

      const model = loadTrainedModel();
      if (!model) {
        res.status(400).json({ error: 'Trained ML model is unavailable.' });
        return;
      }

      const parsedRows = parseUnlabeledBatchCsv(csvText);
      const results: BatchScanRowResult[] = [];
      let genuineCount = 0;
      let fakeCount = 0;
      let highRiskCount = 0;
      let riskSum = 0;

      for (let i = 0; i < parsedRows.length; i++) {
        const input = parsedRows[i];
        const mlResult = predictWithModel(input, model);

        if (mlResult.verdict === 'Genuine') genuineCount++;
        else fakeCount++;
        if (mlResult.riskPercentage >= 70) highRiskCount++;
        riskSum += mlResult.riskPercentage;

        const indicators =
          mlResult.nlpTrace.metadataSignals.length > 0
            ? mlResult.nlpTrace.metadataSignals
            : mlResult.verdict === 'Genuine'
              ? ['Standard corporate phrasing and consistent job structure']
              : ['Positive TF-IDF log-odds fraud pattern'];

        results.push({
          rowIndex: i + 1,
          title: input.title,
          companyName: input.companyName,
          location: input.location,
          verdict: mlResult.verdict,
          riskLevel: mlResult.riskLevel,
          riskPercentage: mlResult.riskPercentage,
          genuineProbability: mlResult.genuineProbability,
          fakeProbability: mlResult.fakeProbability,
          indicators,
          topSuspiciousTerms: mlResult.topSuspiciousWords.slice(0, 4).map((w) => w.term),
        });

        if (saveToHistory) {
          const record: PredictionRecord = {
            id: `scan-${crypto.randomBytes(5).toString('hex')}`,
            createdAt: new Date().toISOString(),
            input,
            verdict: mlResult.verdict,
            riskLevel: mlResult.riskLevel,
            riskPercentage: mlResult.riskPercentage,
            genuineProbability: mlResult.genuineProbability,
            fakeProbability: mlResult.fakeProbability,
            suspiciousIndicators: indicators,
            explanation: mlResult.mlExplanation,
            topSuspiciousWords: mlResult.topSuspiciousWords,
            topGenuineSignals: mlResult.topGenuineSignals,
            nlpTrace: mlResult.nlpTrace,
            geminiAnalysis: {
              status: 'unavailable',
              model: 'gemini-4-hydrogen',
              summaryExplanation:
                'Batch import scan evaluated directly by the trained Logistic Regression + TF-IDF classifier.',
              suspiciousIndicators: indicators,
              verificationChecklist: [
                'Verify the company domain and official careers listing before applying.',
                'Never pay upfront fees or share banking details during recruitment.',
              ],
            },
            modelVersionId: model.modelId,
          };
          savePrediction(record);
        }
      }

      const payload: BatchScanResponse = {
        fileName,
        scannedAt: new Date().toISOString(),
        totalRows: results.length,
        genuineCount,
        fakeCount,
        highRiskCount,
        averageRiskScore: Number((riskSum / results.length).toFixed(1)),
        results,
      };

      res.json(payload);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Batch CSV analysis failed.',
      });
    }
  });

  app.post('/api/analyze/batch-live', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as { limit?: number; saveToHistory?: boolean };
      const limit = Math.min(60, Math.max(5, Number(body.limit) || 25));
      const saveToHistory = Boolean(body.saveToHistory);

      const model = loadTrainedModel();
      if (!model) {
        res.status(400).json({ error: 'Trained ML model is unavailable.' });
        return;
      }

      const feed = await fetchLivePublicJobFeeds();
      const selected = feed.entries.slice(0, limit);
      if (selected.length === 0) {
        res.status(502).json({ error: 'No live postings returned from external job feeds.' });
        return;
      }

      const results: BatchScanRowResult[] = [];
      let genuineCount = 0;
      let fakeCount = 0;
      let highRiskCount = 0;
      let riskSum = 0;

      for (let i = 0; i < selected.length; i++) {
        const entry = selected[i];
        const mlResult = predictWithModel(entry.input, model);

        if (mlResult.verdict === 'Genuine') genuineCount++;
        else fakeCount++;
        if (mlResult.riskPercentage >= 70) highRiskCount++;
        riskSum += mlResult.riskPercentage;

        const indicators =
          mlResult.nlpTrace.metadataSignals.length > 0
            ? mlResult.nlpTrace.metadataSignals
            : mlResult.verdict === 'Genuine'
              ? ['Standard corporate phrasing and verified live job source']
              : ['Positive TF-IDF log-odds fraud pattern'];

        results.push({
          rowIndex: i + 1,
          title: entry.input.title,
          companyName: entry.input.companyName,
          location: entry.input.location,
          verdict: mlResult.verdict,
          riskLevel: mlResult.riskLevel,
          riskPercentage: mlResult.riskPercentage,
          genuineProbability: mlResult.genuineProbability,
          fakeProbability: mlResult.fakeProbability,
          indicators,
          topSuspiciousTerms: mlResult.topSuspiciousWords.slice(0, 4).map((w) => w.term),
        });

        if (saveToHistory) {
          const record: PredictionRecord = {
            id: `scan-${crypto.randomBytes(5).toString('hex')}`,
            createdAt: new Date().toISOString(),
            input: entry.input,
            verdict: mlResult.verdict,
            riskLevel: mlResult.riskLevel,
            riskPercentage: mlResult.riskPercentage,
            genuineProbability: mlResult.genuineProbability,
            fakeProbability: mlResult.fakeProbability,
            suspiciousIndicators: indicators,
            explanation: `${mlResult.mlExplanation} Sourced live from ${entry.source}.`,
            topSuspiciousWords: mlResult.topSuspiciousWords,
            topGenuineSignals: mlResult.topGenuineSignals,
            nlpTrace: mlResult.nlpTrace,
            geminiAnalysis: {
              status: 'unavailable',
              model: 'gemini-4-hydrogen',
              summaryExplanation: `Live feed batch scan sourced from ${entry.source} and scored by Logistic Regression + TF-IDF.`,
              suspiciousIndicators: indicators,
              verificationChecklist: [
                'Verify the company domain and official careers listing before applying.',
                'Never pay upfront fees or share banking details during recruitment.',
              ],
            },
            modelVersionId: model.modelId,
          };
          savePrediction(record);
        }
      }

      const payload: BatchScanResponse = {
        fileName: `live_job_feeds_${new Date().toISOString().slice(0, 10)}.json`,
        scannedAt: new Date().toISOString(),
        totalRows: results.length,
        genuineCount,
        fakeCount,
        highRiskCount,
        averageRiskScore: Number((riskSum / results.length).toFixed(1)),
        results,
      };

      res.json(payload);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Live job feed batch scan failed.',
      });
    }
  });

  app.get('/api/predictions', (req: Request, res: Response) => {
    const all = loadPredictions();
    const q = String(req.query.q || '').trim().toLowerCase();
    const verdict = String(req.query.verdict || 'all').toLowerCase();
    const risk = String(req.query.risk || 'all').toLowerCase();

    const filtered = all.filter((item) => {
      if (verdict === 'fake' && item.verdict !== 'Potentially Fake') return false;
      if (verdict === 'genuine' && item.verdict !== 'Genuine') return false;
      if (risk !== 'all' && item.riskLevel.toLowerCase() !== risk) return false;
      if (q) {
        const hay = `${item.input.title} ${item.input.companyName} ${item.input.location} ${item.input.description} ${item.verdict}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    res.json(filtered);
  });

  app.post('/api/predictions/:id/feedback', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id || '');
      const verdict = (req.body as { verdict?: string })?.verdict;
      if (verdict !== 'Genuine' && verdict !== 'Potentially Fake') {
        res.status(400).json({ error: 'Feedback verdict must be "Genuine" or "Potentially Fake".' });
        return;
      }
      const result = applyPredictionFeedbackAndRetrain(id, verdict);
      if (!result) {
        res.status(404).json({ error: 'Prediction record not found.' });
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to apply feedback and retrain.',
      });
    }
  });

  app.delete('/api/predictions/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '');
    const deleted = deletePredictionById(id);
    if (!deleted) {
      res.status(404).json({ error: 'Prediction record not found.' });
      return;
    }
    res.json({ deleted: true, id });
  });

  app.delete('/api/predictions', (_req: Request, res: Response) => {
    clearAllPredictions();
    res.json({ cleared: true });
  });

  // Serve Vite middleware in development or static dist in production
  const isProduction = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProduction || !fs.existsSync(distDir)) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response, next: NextFunction) => {
      if (_req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Fake Job Detection System listening on http://0.0.0.0:${PORT}`);
    ingestionListener.start();
  });
}

createApp().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

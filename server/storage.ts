import fs from 'node:fs';
import path from 'node:path';
import type {
  DashboardSummary,
  DatasetRow,
  DatasetStatistics,
  ModelSummary,
  PredictionRecord,
  SerializedModel,
  TrainingConfig,
} from '../src/types.ts';
import { computeDatasetStatistics } from './dataset.ts';
import { toModelSummary, trainLogisticRegressionModel } from './ml.ts';
import {
  buildRealtimeCombinedDataset,
  type RealtimeCorpusMode,
} from './realtimeDataset.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const MODEL_FILE = path.join(DATA_DIR, 'trained_model.json');
const DATASET_FILE = path.join(DATA_DIR, 'active_dataset.json');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'predictions.json');

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  testSplitRatio: 0.2,
  epochs: 80,
  learningRate: 0.15,
  l2Lambda: 0.001,
  maxFeatures: 2500,
};

interface StoredDatasetPayload {
  datasetName: string;
  uploadedAt: string;
  rows: DatasetRow[];
  stats: DatasetStatistics;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function writeJsonAtomic(filePath: string, data: unknown, compact = false): void {
  ensureDataDir();
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(
    tmpPath,
    compact ? JSON.stringify(data) : JSON.stringify(data, null, 2),
    'utf-8'
  );
  fs.renameSync(tmpPath, filePath);
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadActiveDataset(): StoredDatasetPayload | null {
  return readJsonSafe<StoredDatasetPayload>(DATASET_FILE);
}

export function saveActiveDataset(
  datasetName: string,
  rows: DatasetRow[]
): StoredDatasetPayload {
  const uploadedAt = new Date().toISOString();
  const stats = computeDatasetStatistics(rows, datasetName, uploadedAt);
  const payload: StoredDatasetPayload = { datasetName, uploadedAt, rows, stats };
  writeJsonAtomic(DATASET_FILE, payload, true);
  return payload;
}

/**
 * Sync active dataset from real-time public job feeds (Arbeitnow & Remotive)
 * combined with the authentic 17,880-row EMSCAD corpus and any user-verified feedback.
 */
export async function syncRealtimeDataset(
  mode: RealtimeCorpusMode = 'balanced'
): Promise<{
  dataset: StoredDatasetPayload;
  model: SerializedModel;
  liveFetchedCount: number;
  emscadUsedCount: number;
}> {
  const existing = loadActiveDataset();
  const preservedFeedback = existing
    ? existing.rows.filter((r) => r.source === 'User Feedback')
    : [];

  const built = await buildRealtimeCombinedDataset(mode, preservedFeedback);
  const dataset = saveActiveDataset(built.datasetName, built.rows);
  const model = trainLogisticRegressionModel(
    dataset.rows,
    dataset.datasetName,
    DEFAULT_TRAINING_CONFIG
  );
  saveTrainedModel(model);

  return {
    dataset,
    model,
    liveFetchedCount: built.liveFetchedCount,
    emscadUsedCount: built.emscadUsedCount,
  };
}

export function loadTrainedModel(): SerializedModel | null {
  const model = readJsonSafe<SerializedModel>(MODEL_FILE);
  if (
    !model ||
    !Number.isFinite(model.bias) ||
    !Array.isArray(model.weights) ||
    model.weights.length === 0 ||
    model.weights.some((w) => typeof w !== 'number' || !Number.isFinite(w))
  ) {
    return null;
  }
  return model;
}

export function saveTrainedModel(model: SerializedModel): void {
  writeJsonAtomic(MODEL_FILE, model, true);
}

export function loadPredictions(): PredictionRecord[] {
  const data = readJsonSafe<PredictionRecord[]>(PREDICTIONS_FILE);
  return Array.isArray(data) ? data : [];
}

export function savePrediction(record: PredictionRecord): void {
  const existing = loadPredictions();
  const updated = [record, ...existing];
  writeJsonAtomic(PREDICTIONS_FILE, updated, false);
}

export function deletePredictionById(id: string): boolean {
  const existing = loadPredictions();
  const filtered = existing.filter((p) => p.id !== id);
  if (filtered.length === existing.length) return false;
  writeJsonAtomic(PREDICTIONS_FILE, filtered, false);
  return true;
}

export function clearAllPredictions(): void {
  writeJsonAtomic(PREDICTIONS_FILE, [], false);
}

/**
 * Apply human-in-the-loop label verification to a prediction, append it to the
 * active training dataset, and retrain the Logistic Regression classifier immediately.
 */
export function applyPredictionFeedbackAndRetrain(
  predictionId: string,
  confirmedVerdict: 'Genuine' | 'Potentially Fake'
): {
  record: PredictionRecord;
  datasetStats: DatasetStatistics;
  modelSummary: ModelSummary;
} | null {
  const predictions = loadPredictions();
  const idx = predictions.findIndex((p) => p.id === predictionId);
  if (idx === -1) return null;

  const updatedRecord: PredictionRecord = {
    ...predictions[idx],
    userFeedback: confirmedVerdict,
  };
  predictions[idx] = updatedRecord;
  writeJsonAtomic(PREDICTIONS_FILE, predictions, false);

  const active = loadActiveDataset();
  const currentRows = active ? [...active.rows] : [];
  const feedbackRowId = `fb-${predictionId}`;
  const newRow: DatasetRow = {
    id: feedbackRowId,
    title: updatedRecord.input.title,
    companyName: updatedRecord.input.companyName,
    companyWebsite: updatedRecord.input.companyWebsite,
    location: updatedRecord.input.location,
    salary: updatedRecord.input.salary,
    description: updatedRecord.input.description,
    requiredSkills: updatedRecord.input.requiredSkills,
    employmentType: updatedRecord.input.employmentType || 'Unspecified',
    experienceLevel: updatedRecord.input.experienceLevel || 'Unspecified',
    telecommuting: /remote|anywhere|wfh/i.test(
      `${updatedRecord.input.location} ${updatedRecord.input.title}`
    )
      ? 1
      : 0,
    hasCompanyLogo: updatedRecord.input.companyWebsite ? 1 : 0,
    hasQuestions: 0,
    fraudulent: confirmedVerdict === 'Potentially Fake' ? 1 : 0,
    source: 'User Feedback',
  };

  const existingRowIdx = currentRows.findIndex((r) => r.id === feedbackRowId);
  if (existingRowIdx >= 0) {
    currentRows[existingRowIdx] = newRow;
  } else {
    currentRows.unshift(newRow);
  }

  const datasetName = active?.datasetName || 'Real-Time Dataset';
  const savedDataset = saveActiveDataset(datasetName, currentRows);
  const existingModel = loadTrainedModel();
  const config = existingModel?.config || DEFAULT_TRAINING_CONFIG;

  const retrained = trainLogisticRegressionModel(savedDataset.rows, savedDataset.datasetName, config);
  saveTrainedModel(retrained);

  return {
    record: updatedRecord,
    datasetStats: savedDataset.stats,
    modelSummary: toModelSummary(retrained),
  };
}

/**
 * Bootstrap dataset & trained Logistic Regression model from real-time job feeds
 * and authentic EMSCAD corpus on startup.
 */
export async function ensureBootstrappedSystem(): Promise<{
  dataset: StoredDatasetPayload;
  model: SerializedModel;
}> {
  ensureDataDir();

  let dataset = loadActiveDataset();
  const isLegacySample =
    dataset && dataset.datasetName.toLowerCase().includes('emscad sample');

  if (!dataset || isLegacySample) {
    const synced = await syncRealtimeDataset('balanced');
    if (!fs.existsSync(PREDICTIONS_FILE)) {
      writeJsonAtomic(PREDICTIONS_FILE, [], false);
    }
    return { dataset: synced.dataset, model: synced.model };
  }

  let model = loadTrainedModel();
  if (!model || isLegacySample) {
    model = trainLogisticRegressionModel(
      dataset.rows,
      dataset.datasetName,
      DEFAULT_TRAINING_CONFIG
    );
    saveTrainedModel(model);
  }

  if (!fs.existsSync(PREDICTIONS_FILE)) {
    writeJsonAtomic(PREDICTIONS_FILE, [], false);
  }

  return { dataset, model };
}

export function buildDashboardSummary(): DashboardSummary {
  const predictions = loadPredictions();
  const model = loadTrainedModel();
  const dataset = loadActiveDataset();

  const totalAnalyzed = predictions.length;
  const genuineDetected = predictions.filter((p) => p.verdict === 'Genuine').length;
  const fakeDetected = predictions.filter((p) => p.verdict === 'Potentially Fake').length;
  const highRiskDetected = predictions.filter((p) => p.riskPercentage >= 70).length;
  const averageRiskScore =
    totalAnalyzed > 0
      ? Number(
          (
            predictions.reduce((sum, p) => sum + p.riskPercentage, 0) / totalAnalyzed
          ).toFixed(1)
        )
      : 0;

  const riskDistribution = {
    low: predictions.filter((p) => p.riskLevel === 'Low').length,
    medium: predictions.filter((p) => p.riskLevel === 'Medium').length,
    high: predictions.filter((p) => p.riskLevel === 'High').length,
  };

  // Group predictions by date (YYYY-MM-DD) for timeline chart
  const dateBuckets = new Map<string, { genuine: number; fake: number }>();
  const chronological = [...predictions].reverse();
  for (const p of chronological) {
    const label = p.createdAt.slice(0, 10);
    const bucket = dateBuckets.get(label) || { genuine: 0, fake: 0 };
    if (p.verdict === 'Genuine') bucket.genuine++;
    else bucket.fake++;
    dateBuckets.set(label, bucket);
  }
  const timelineSeries = Array.from(dateBuckets.entries())
    .slice(-10)
    .map(([label, counts]) => ({ label, ...counts }));

  // Aggregate top triggered suspicious terms across analyzed postings
  const termAgg = new Map<string, { count: number; totalContribution: number }>();
  for (const p of predictions) {
    for (const word of p.topSuspiciousWords.slice(0, 5)) {
      const curr = termAgg.get(word.term) || { count: 0, totalContribution: 0 };
      curr.count++;
      curr.totalContribution += word.contribution;
      termAgg.set(word.term, curr);
    }
  }
  const topTriggeredTerms = Array.from(termAgg.entries())
    .map(([term, info]) => ({
      term,
      count: info.count,
      avgContribution: Number((info.totalContribution / info.count).toFixed(3)),
    }))
    .sort((a, b) => b.count - a.count || b.avgContribution - a.avgContribution)
    .slice(0, 8);

  return {
    totalAnalyzed,
    genuineDetected,
    fakeDetected,
    highRiskDetected,
    averageRiskScore,
    modelSummary: model ? toModelSummary(model) : null,
    datasetStats: dataset ? dataset.stats : null,
    recentPredictions: predictions.slice(0, 8),
    riskDistribution,
    timelineSeries,
    topTriggeredTerms,
  };
}

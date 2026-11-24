import crypto from 'node:crypto';
import type {
  ConfusionMatrix,
  DatasetRow,
  FeatureWeightItem,
  JobPostingInput,
  ModelEvaluationMetrics,
  ModelSummary,
  NlpPipelineTrace,
  SerializedModel,
  TrainingConfig,
  TrainingEpochMetric,
  WordContribution,
} from '../src/types.ts';
import {
  fitTfidfVectorizer,
  preprocessJobPosting,
  transformToTfidf,
} from './nlp.ts';
import type { SparseVector } from './nlp.ts';

function sigmoid(z: number): number {
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

function createSeededRng(seed = 42): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffleWithRng<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Stratified Train/Test Split ensuring both Genuine (0) and Fake (1)
 * maintain identical proportions in train and test sets.
 */
export function stratifiedTrainTestSplit(
  rows: DatasetRow[],
  testRatio: number,
  seed = 2026
): { trainRows: DatasetRow[]; testRows: DatasetRow[] } {
  const rng = createSeededRng(seed);
  const genuine = shuffleWithRng(
    rows.filter((r) => r.fraudulent === 0),
    rng
  );
  const fake = shuffleWithRng(
    rows.filter((r) => r.fraudulent === 1),
    rng
  );

  const testGenCount = Math.max(1, Math.round(genuine.length * testRatio));
  const testFakeCount = Math.max(1, Math.round(fake.length * testRatio));

  const testRows = shuffleWithRng(
    [...genuine.slice(0, testGenCount), ...fake.slice(0, testFakeCount)],
    rng
  );
  const trainRows = shuffleWithRng(
    [...genuine.slice(testGenCount), ...fake.slice(testFakeCount)],
    rng
  );

  return { trainRows, testRows };
}

function computeLossAndProbs(
  vectors: SparseVector[],
  labels: (0 | 1)[],
  weights: Float64Array,
  bias: number,
  l2Lambda: number,
  posWeight: number,
  negWeight: number
): { loss: number; probs: number[] } {
  const n = vectors.length;
  const probs = new Array<number>(n);
  let totalLoss = 0;
  let totalWeight = 0;

  for (let i = 0; i < n; i++) {
    const vec = vectors[i];
    const indices = vec.indices;
    const values = vec.values;
    let z = bias;
    for (let k = 0; k < indices.length; k++) {
      z += weights[indices[k]] * values[k];
    }
    const p = sigmoid(z);
    probs[i] = p;
    const clamped = p < 1e-12 ? 1e-12 : p > 1 - 1e-12 ? 1 - 1e-12 : p;
    const y = labels[i];
    const sampleW = y === 1 ? posWeight : negWeight;
    totalWeight += sampleW;
    totalLoss += -sampleW * (y === 1 ? Math.log(clamped) : Math.log(1 - clamped));
  }

  let l2Penalty = 0;
  for (let j = 0; j < weights.length; j++) {
    l2Penalty += weights[j] * weights[j];
  }

  const meanLoss = (totalWeight > 0 ? totalLoss / totalWeight : 0) + 0.5 * l2Lambda * l2Penalty;
  return { loss: meanLoss, probs };
}

function computeRocAuc(probs: number[], labels: (0 | 1)[]): number {
  const pairs = probs.map((p, idx) => ({ p, y: labels[idx] }));
  pairs.sort((a, b) => b.p - a.p);

  const totalPos = labels.filter((l) => l === 1).length;
  const totalNeg = labels.length - totalPos;
  if (totalPos === 0 || totalNeg === 0) return 0.5;

  let tp = 0;
  let fp = 0;
  let prevTpr = 0;
  let prevFpr = 0;
  let auc = 0;

  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].y === 1) tp++;
    else fp++;

    const tpr = tp / totalPos;
    const fpr = fp / totalNeg;
    auc += ((fpr - prevFpr) * (tpr + prevTpr)) / 2;
    prevTpr = tpr;
    prevFpr = fpr;
  }

  return Number(auc.toFixed(4));
}

function computeClassificationMetrics(
  probs: number[],
  labels: (0 | 1)[],
  threshold = 0.5
): {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
  confusionMatrix: ConfusionMatrix;
} {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (let i = 0; i < probs.length; i++) {
    const pred = probs[i] >= threshold ? 1 : 0;
    const actual = labels[i];
    if (pred === 1 && actual === 1) tp++;
    else if (pred === 1 && actual === 0) fp++;
    else if (pred === 0 && actual === 0) tn++;
    else fn++;
  }

  const total = tp + fp + tn + fn || 1;
  const accuracy = (tp + tn) / total;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const rocAuc = computeRocAuc(probs, labels);

  return {
    accuracy: Number(accuracy.toFixed(4)),
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1Score: Number(f1Score.toFixed(4)),
    rocAuc,
    confusionMatrix: { tp, fp, tn, fn },
  };
}

/**
 * Train an L2-regularized Logistic Regression classifier with Adam optimization
 * and balanced class weights on TF-IDF features extracted from labeled job postings.
 */
export function trainLogisticRegressionModel(
  rows: DatasetRow[],
  datasetName: string,
  config: TrainingConfig
): SerializedModel {
  const tStart = Date.now();
  if (rows.length < 10) {
    throw new Error('Dataset must contain at least 10 labeled rows to train and evaluate.');
  }

  const fakeTotal = rows.filter((r) => r.fraudulent === 1).length;
  const genTotal = rows.length - fakeTotal;
  if (fakeTotal < 2 || genTotal < 2) {
    throw new Error('Dataset must contain at least 2 genuine and 2 fraudulent samples for stratified splitting.');
  }

  const { trainRows, testRows } = stratifiedTrainTestSplit(rows, config.testSplitRatio, 2026);

  // Preprocess training & test corpora
  const trainDocs = trainRows.map((r) => preprocessJobPosting(r).terms);
  const trainLabels = trainRows.map((r) => r.fraudulent);

  const testDocs = testRows.map((r) => preprocessJobPosting(r).terms);
  const testLabels = testRows.map((r) => r.fraudulent);

  // Fit TF-IDF strictly on training data (prevents data leakage!)
  const { vocabulary, idf } = fitTfidfVectorizer(trainDocs, trainLabels, config.maxFeatures);
  const numFeatures = idf.length;

  const trainVectors = trainDocs.map((terms) => transformToTfidf(terms, vocabulary, idf));
  const testVectors = testDocs.map((terms) => transformToTfidf(terms, vocabulary, idf));

  const trainFakeCount = trainLabels.filter((l) => l === 1).length;
  const trainGenCount = trainLabels.length - trainFakeCount;
  const testFakeCount = testLabels.filter((l) => l === 1).length;

  // Class-balanced sample weights
  const nTrain = trainVectors.length;
  const posWeight = trainFakeCount > 0 ? nTrain / (2 * trainFakeCount) : 1;
  const negWeight = trainGenCount > 0 ? nTrain / (2 * trainGenCount) : 1;

  const weights = new Float64Array(numFeatures);
  const gradW = new Float64Array(numFeatures);
  let bias = 0;

  // Adam optimizer state
  const mW = new Float64Array(numFeatures);
  const vW = new Float64Array(numFeatures);
  let mB = 0;
  let vB = 0;
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;

  const lossHistory: TrainingEpochMetric[] = [];
  const sampleInterval = Math.max(1, Math.floor(config.epochs / 10));

  for (let epoch = 1; epoch <= config.epochs; epoch++) {
    gradW.fill(0);
    let gradB = 0;
    let weightSum = 0;

    for (let i = 0; i < nTrain; i++) {
      const vec = trainVectors[i];
      const indices = vec.indices;
      const values = vec.values;
      let z = bias;
      for (let k = 0; k < indices.length; k++) {
        z += weights[indices[k]] * values[k];
      }
      const p = sigmoid(z);
      const y = trainLabels[i];
      const sw = y === 1 ? posWeight : negWeight;
      weightSum += sw;
      const err = sw * (p - y);

      gradB += err;
      for (let k = 0; k < indices.length; k++) {
        gradW[indices[k]] += err * values[k];
      }
    }

    const invW = weightSum > 0 ? 1 / weightSum : 1;
    const b1Pow = 1 - Math.pow(beta1, epoch);
    const b2Pow = 1 - Math.pow(beta2, epoch);
    const invB1 = 1 / b1Pow;
    const invB2 = 1 / b2Pow;

    // Update bias
    const gB = gradB * invW;
    mB = beta1 * mB + (1 - beta1) * gB;
    vB = beta2 * vB + (1 - beta2) * gB * gB;
    bias -= (config.learningRate * (mB * invB1)) / (Math.sqrt(vB * invB2) + eps);

    // Update weights with L2 regularization
    for (let j = 0; j < numFeatures; j++) {
      const w = weights[j];
      const g = gradW[j] * invW + config.l2Lambda * w;
      const nextM = beta1 * mW[j] + (1 - beta1) * g;
      const nextV = beta2 * vW[j] + (1 - beta2) * g * g;
      mW[j] = nextM;
      vW[j] = nextV;
      weights[j] = w - (config.learningRate * (nextM * invB1)) / (Math.sqrt(nextV * invB2) + eps);
    }

    if (epoch === 1 || epoch === config.epochs || epoch % sampleInterval === 0) {
      const trainEval = computeLossAndProbs(
        trainVectors,
        trainLabels,
        weights,
        bias,
        config.l2Lambda,
        posWeight,
        negWeight
      );
      const testEval = computeLossAndProbs(
        testVectors,
        testLabels,
        weights,
        bias,
        config.l2Lambda,
        1,
        1
      );
      const testClass = computeClassificationMetrics(testEval.probs, testLabels, 0.5);
      lossHistory.push({
        epoch,
        trainLoss: Number(trainEval.loss.toFixed(4)),
        testLoss: Number(testEval.loss.toFixed(4)),
        testAccuracy: testClass.accuracy,
      });
    }
  }

  // Final evaluation on held-out test set
  const finalTest = computeLossAndProbs(testVectors, testLabels, weights, bias, config.l2Lambda, 1, 1);
  const evalMetrics = computeClassificationMetrics(finalTest.probs, testLabels, 0.5);
  const trainingDurationMs = Math.max(1, Date.now() - tStart);

  const metrics: ModelEvaluationMetrics = {
    ...evalMetrics,
    trainSamples: trainRows.length,
    testSamples: testRows.length,
    trainFakeCount,
    testFakeCount,
    vocabularySize: numFeatures,
    trainingDurationMs,
    lossHistory,
  };

  // Extract global feature weights
  const reverseVocab = Object.entries(vocabulary).map(([term, idx]) => ({
    term,
    weight: Number(weights[idx].toFixed(4)),
    idf: Number(idf[idx].toFixed(4)),
  }));

  const topFraudFeatures: FeatureWeightItem[] = [...reverseVocab]
    .filter((f) => f.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 15);

  const topGenuineFeatures: FeatureWeightItem[] = [...reverseVocab]
    .filter((f) => f.weight < 0)
    .sort((a, b) => a.weight - b.weight)
    .slice(0, 15);

  return {
    modelId: `lr-tfidf-${crypto.randomBytes(4).toString('hex')}`,
    algorithm: 'L2-Regularized Logistic Regression (TF-IDF + Balanced Class Weights)',
    trainedAt: new Date().toISOString(),
    datasetName,
    config,
    vocabulary,
    idf,
    weights: Array.from(weights),
    bias,
    metrics,
    topFraudFeatures,
    topGenuineFeatures,
  };
}

export function toModelSummary(model: SerializedModel): ModelSummary {
  return {
    modelId: model.modelId,
    algorithm: model.algorithm,
    trainedAt: model.trainedAt,
    datasetName: model.datasetName,
    config: model.config,
    metrics: model.metrics,
    topFraudFeatures: model.topFraudFeatures,
    topGenuineFeatures: model.topGenuineFeatures,
  };
}

export interface MlPredictionOutput {
  verdict: 'Genuine' | 'Potentially Fake';
  riskLevel: 'Low' | 'Medium' | 'High';
  riskPercentage: number;
  genuineProbability: number;
  fakeProbability: number;
  topSuspiciousWords: WordContribution[];
  topGenuineSignals: WordContribution[];
  nlpTrace: NlpPipelineTrace;
  mlExplanation: string;
}

function formatReadableTerm(term: string): string {
  const map: Record<string, string> = {
    meta_missing_company: 'Undisclosed company name',
    meta_missing_website: 'Missing company website',
    meta_unverified_website: 'Unverified/free-hosted or risky domain',
    meta_free_email_contact: 'Free webmail contact address',
    meta_messaging_app_interview: 'Off-platform messaging interview',
    meta_financial_request: 'Upfront fee / banking / PII request',
    meta_unrealistic_promise: 'Unrealistic income / urgency claim',
    meta_unrealistic_salary: 'Anomalous salary rate',
    meta_low_quality_posting: 'Brief or low-quality description',
    meta_explicit_fraud_marker: 'Explicit fraud phrasing',
    meta_missing_salary: 'Salary omitted',
    meta_remote_role: 'Remote / WFH indicator',
    meta_no_company_logo: 'No verified company logo',
    meta_short_description: 'Short / vague description',
    currencyamount: 'Currency amount ($)',
    emailtoken: 'Email address mention',
  };
  return map[term] || term.replace(/_/g, ' ');
}

/**
 * Predict job posting authenticity using the trained Logistic Regression model
 * calibrated with structural/linguistic anomaly signals for realistic real-time detection.
 */
export function predictWithModel(
  input: JobPostingInput,
  model: SerializedModel
): MlPredictionOutput {
  const preprocessed = preprocessJobPosting(input);
  const vector = transformToTfidf(preprocessed.terms, model.vocabulary, model.idf);

  const indexToTerm = new Map<number, string>();
  for (const [term, idx] of Object.entries(model.vocabulary)) {
    indexToTerm.set(idx, term);
  }

  let logit = model.bias;
  const contributions: WordContribution[] = [];

  for (let k = 0; k < vector.indices.length; k++) {
    const idx = vector.indices[k];
    const tfidf = vector.values[k];
    const weight = model.weights[idx];
    const contribution = tfidf * weight;
    logit += contribution;

    const rawTerm = indexToTerm.get(idx);
    if (rawTerm) {
      contributions.push({
        term: formatReadableTerm(rawTerm),
        tfidf: Number(tfidf.toFixed(4)),
        weight: Number(weight.toFixed(4)),
        contribution: Number(contribution.toFixed(4)),
      });
    }
  }

  const mlFakeProb = sigmoid(logit);
  // Calibrate with structural anomaly signals when strong red flags or gibberish are detected
  let calibratedFakeProb = mlFakeProb;
  if (preprocessed.structuralRiskBoost >= 0.25) {
    // Noisy-OR fusion keeps genuine corporate postings untouched while catching unseen scam/wrong postings
    const noisyOr = 1 - (1 - mlFakeProb) * (1 - preprocessed.structuralRiskBoost);
    calibratedFakeProb = Math.max(mlFakeProb, noisyOr);
  }

  const fakeProb = Math.min(0.999, Math.max(0.001, calibratedFakeProb));
  const genuineProb = 1 - fakeProb;
  const riskPercentage = Number((fakeProb * 100).toFixed(1));
  const verdict: 'Genuine' | 'Potentially Fake' = fakeProb >= 0.5 ? 'Potentially Fake' : 'Genuine';

  let riskLevel: 'Low' | 'Medium' | 'High' = 'Low';
  if (riskPercentage >= 70) riskLevel = 'High';
  else if (riskPercentage >= 40) riskLevel = 'Medium';

  const topSuspiciousWords = [...contributions]
    .filter((c) => c.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 10);

  const topGenuineSignals = [...contributions]
    .filter((c) => c.contribution < 0)
    .sort((a, b) => a.contribution - b.contribution)
    .slice(0, 8);

  const nlpTrace: NlpPipelineTrace = {
    ...preprocessed.trace,
    tfidfNonZeroCount: vector.indices.length,
  };

  const topSusList = topSuspiciousWords.slice(0, 4).map((w) => `"${w.term}"`).join(', ');
  const topGenList = topGenuineSignals.slice(0, 4).map((w) => `"${w.term}"`).join(', ');

  const mlExplanation =
    verdict === 'Potentially Fake'
      ? `The Logistic Regression classifier assigned a ${riskPercentage}% fraud risk score (${vector.indices.length} matched TF-IDF features). Primary risk contributors included ${topSusList || preprocessed.trace.metadataSignals.slice(0, 3).join(', ') || 'structural metadata anomalies'}.`
      : `The Logistic Regression classifier evaluated this posting as Genuine with ${(genuineProb * 100).toFixed(1)}% confidence (${vector.indices.length} matched TF-IDF features). Legitimacy-weighted terms such as ${topGenList || 'standard professional role terminology'} outweighed risk indicators.`;

  return {
    verdict,
    riskLevel,
    riskPercentage,
    genuineProbability: Number((genuineProb * 100).toFixed(2)),
    fakeProbability: Number((fakeProb * 100).toFixed(2)),
    topSuspiciousWords,
    topGenuineSignals,
    nlpTrace,
    mlExplanation,
  };
}

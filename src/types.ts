export interface JobPostingInput {
  title: string;
  companyName: string;
  companyWebsite: string;
  location: string;
  salary: string;
  description: string;
  requiredSkills: string;
  employmentType: string;
  experienceLevel: string;
}

export interface NlpPipelineTrace {
  rawLength: number;
  cleanedText: string;
  tokenCount: number;
  stopWordsRemovedCount: number;
  normalizedTokensSample: string[];
  bigramCount: number;
  tfidfNonZeroCount: number;
  metadataSignals: string[];
}

export interface WordContribution {
  term: string;
  tfidf: number;
  weight: number;
  contribution: number;
}

export interface GeminiAnalysisResult {
  status: 'ok' | 'unavailable' | 'error';
  model: string;
  summaryExplanation: string;
  suspiciousIndicators: string[];
  verificationChecklist: string[];
  errorMessage?: string;
}

export interface PredictionRecord {
  id: string;
  createdAt: string;
  input: JobPostingInput;
  verdict: 'Genuine' | 'Potentially Fake';
  riskLevel: 'Low' | 'Medium' | 'High';
  riskPercentage: number;
  genuineProbability: number;
  fakeProbability: number;
  suspiciousIndicators: string[];
  explanation: string;
  topSuspiciousWords: WordContribution[];
  topGenuineSignals: WordContribution[];
  nlpTrace: NlpPipelineTrace;
  geminiAnalysis: GeminiAnalysisResult;
  modelVersionId: string;
  userFeedback?: 'Genuine' | 'Potentially Fake';
}

export interface ConfusionMatrix {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface TrainingEpochMetric {
  epoch: number;
  trainLoss: number;
  testLoss: number;
  testAccuracy: number;
}

export interface ModelEvaluationMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
  trainSamples: number;
  testSamples: number;
  trainFakeCount: number;
  testFakeCount: number;
  vocabularySize: number;
  trainingDurationMs: number;
  confusionMatrix: ConfusionMatrix;
  lossHistory: TrainingEpochMetric[];
}

export interface FeatureWeightItem {
  term: string;
  weight: number;
  idf: number;
}

export interface TrainingConfig {
  testSplitRatio: number;
  epochs: number;
  learningRate: number;
  l2Lambda: number;
  maxFeatures: number;
}

export interface SerializedModel {
  modelId: string;
  algorithm: string;
  trainedAt: string;
  datasetName: string;
  config: TrainingConfig;
  vocabulary: Record<string, number>;
  idf: number[];
  weights: number[];
  bias: number;
  metrics: ModelEvaluationMetrics;
  topFraudFeatures: FeatureWeightItem[];
  topGenuineFeatures: FeatureWeightItem[];
}

export interface ModelSummary {
  modelId: string;
  algorithm: string;
  trainedAt: string;
  datasetName: string;
  config: TrainingConfig;
  metrics: ModelEvaluationMetrics;
  topFraudFeatures: FeatureWeightItem[];
  topGenuineFeatures: FeatureWeightItem[];
}

export interface DatasetRow {
  id: string;
  title: string;
  companyName: string;
  companyWebsite: string;
  location: string;
  salary: string;
  description: string;
  requiredSkills: string;
  employmentType: string;
  experienceLevel: string;
  telecommuting: number;
  hasCompanyLogo: number;
  hasQuestions: number;
  fraudulent: 0 | 1;
  source?: string;
}

export interface DatasetSourceCount {
  source: string;
  count: number;
}

export interface DatasetStatistics {
  datasetName: string;
  uploadedAt: string;
  totalRows: number;
  genuineCount: number;
  fakeCount: number;
  fraudRatePercent: number;
  missingSalaryPercent: number;
  missingCompanyPercent: number;
  telecommutingFakePercent: number;
  telecommutingGenuinePercent: number;
  sourceBreakdown: DatasetSourceCount[];
  employmentTypeBreakdown: { label: string; genuine: number; fake: number }[];
  experienceLevelBreakdown: { label: string; genuine: number; fake: number }[];
  samplePreview: {
    id: string;
    title: string;
    location: string;
    employmentType: string;
    source: string;
    fraudulent: 0 | 1;
  }[];
}

export interface DashboardSummary {
  totalAnalyzed: number;
  genuineDetected: number;
  fakeDetected: number;
  highRiskDetected: number;
  averageRiskScore: number;
  modelSummary: ModelSummary | null;
  datasetStats: DatasetStatistics | null;
  recentPredictions: PredictionRecord[];
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
  };
  timelineSeries: {
    label: string;
    genuine: number;
    fake: number;
  }[];
  topTriggeredTerms: {
    term: string;
    count: number;
    avgContribution: number;
  }[];
}

export interface BatchScanRowResult {
  rowIndex: number;
  title: string;
  companyName: string;
  location: string;
  verdict: 'Genuine' | 'Potentially Fake';
  riskLevel: 'Low' | 'Medium' | 'High';
  riskPercentage: number;
  genuineProbability: number;
  fakeProbability: number;
  indicators: string[];
  topSuspiciousTerms: string[];
}

export interface BatchScanResponse {
  fileName: string;
  scannedAt: string;
  totalRows: number;
  genuineCount: number;
  fakeCount: number;
  highRiskCount: number;
  averageRiskScore: number;
  results: BatchScanRowResult[];
}

export type LiveAggregatorSource =
  | 'Arbeitnow Live'
  | 'Remotive Live'
  | 'Jobicy Live'
  | 'RemoteOK Live';

export interface LiveJobFeedItem {
  id: string;
  source: LiveAggregatorSource;
  url: string;
  publishedAt: string;
  input: JobPostingInput;
  verdict: 'Genuine' | 'Potentially Fake';
  riskLevel: 'Low' | 'Medium' | 'High';
  riskPercentage: number;
  indicators: string[];
}

export interface IngestedJobEvent extends LiveJobFeedItem {
  ingestedAt: string;
  isNew: boolean;
}

export interface IngestionSourceHealth {
  source: LiveAggregatorSource;
  status: 'ok' | 'error';
  fetchedCount: number;
  newCount: number;
  lastError?: string;
}

export interface IngestionListenerState {
  running: boolean;
  polling: boolean;
  intervalSeconds: number;
  autoSaveHighRisk: boolean;
  totalPolls: number;
  totalIngested: number;
  highRiskDetected: number;
  lastPollAt: string | null;
  nextPollAt: string | null;
  sourceHealth: IngestionSourceHealth[];
  recentItems: IngestedJobEvent[];
}

import { EventEmitter } from 'node:events';
import type {
  IngestedJobEvent,
  IngestionListenerState,
  IngestionSourceHealth,
  LiveAggregatorSource,
  PredictionRecord,
} from '../src/types.ts';
import { predictWithModel } from './ml.ts';
import { fetchLivePublicJobFeeds, type LiveFeedEntry } from './realtimeDataset.ts';
import { loadPredictions, loadTrainedModel, savePrediction } from './storage.ts';

const MAX_RECENT_ITEMS = 32;
const DEFAULT_INTERVAL_SECONDS = 45;

class RealtimeIngestionListener extends EventEmitter {
  private running = false;
  private polling = false;
  private intervalSeconds = DEFAULT_INTERVAL_SECONDS;
  private autoSaveHighRisk = true;
  private totalPolls = 0;
  private totalIngested = 0;
  private highRiskDetected = 0;
  private lastPollAt: string | null = null;
  private nextPollAt: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private seenIds = new Set<string>();
  private recentItems: IngestedJobEvent[] = [];
  private sourceHealth: IngestionSourceHealth[] = [
    { source: 'Arbeitnow Live', status: 'ok', fetchedCount: 0, newCount: 0 },
    { source: 'Remotive Live', status: 'ok', fetchedCount: 0, newCount: 0 },
    { source: 'Jobicy Live', status: 'ok', fetchedCount: 0, newCount: 0 },
    { source: 'RemoteOK Live', status: 'ok', fetchedCount: 0, newCount: 0 },
  ];

  public getState(): IngestionListenerState {
    return {
      running: this.running,
      polling: this.polling,
      intervalSeconds: this.intervalSeconds,
      autoSaveHighRisk: this.autoSaveHighRisk,
      totalPolls: this.totalPolls,
      totalIngested: this.totalIngested,
      highRiskDetected: this.highRiskDetected,
      lastPollAt: this.lastPollAt,
      nextPollAt: this.nextPollAt,
      sourceHealth: [...this.sourceHealth],
      recentItems: [...this.recentItems],
    };
  }

  public start(): IngestionListenerState {
    if (this.running) {
      return this.getState();
    }
    this.running = true;
    this.emitUpdate();

    if (this.totalPolls === 0) {
      void this.pollNow();
    } else {
      this.scheduleNextPoll();
    }
    return this.getState();
  }

  public stop(): IngestionListenerState {
    this.running = false;
    this.nextPollAt = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.emitUpdate();
    return this.getState();
  }

  public updateConfig(opts: {
    intervalSeconds?: number;
    autoSaveHighRisk?: boolean;
  }): IngestionListenerState {
    if (opts.intervalSeconds !== undefined) {
      this.intervalSeconds = Math.min(300, Math.max(15, Math.round(opts.intervalSeconds)));
    }
    if (opts.autoSaveHighRisk !== undefined) {
      this.autoSaveHighRisk = Boolean(opts.autoSaveHighRisk);
    }
    if (this.running && !this.polling) {
      this.scheduleNextPoll();
    } else {
      this.emitUpdate();
    }
    return this.getState();
  }

  private scheduleNextPoll(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.running) {
      this.nextPollAt = null;
      return;
    }
    const ms = this.intervalSeconds * 1000;
    this.nextPollAt = new Date(Date.now() + ms).toISOString();
    this.timer = setTimeout(() => {
      void this.pollNow();
    }, ms);
    this.emitUpdate();
  }

  private interleaveEntries(entries: LiveFeedEntry[]): LiveFeedEntry[] {
    const bySource = new Map<LiveAggregatorSource, LiveFeedEntry[]>();
    for (const e of entries) {
      const list = bySource.get(e.source) || [];
      list.push(e);
      bySource.set(e.source, list);
    }

    const order: LiveAggregatorSource[] = [
      'Remotive Live',
      'Jobicy Live',
      'RemoteOK Live',
      'Arbeitnow Live',
    ];
    const indices = new Map<LiveAggregatorSource, number>();
    const mixed: LiveFeedEntry[] = [];
    let added = true;

    while (added && mixed.length < 120) {
      added = false;
      for (const src of order) {
        const list = bySource.get(src) || [];
        const idx = indices.get(src) || 0;
        if (idx < list.length) {
          mixed.push(list[idx]);
          indices.set(src, idx + 1);
          added = true;
        }
      }
    }
    return mixed;
  }

  public async pollNow(): Promise<IngestionListenerState> {
    if (this.polling) {
      return this.getState();
    }

    this.polling = true;
    this.emitUpdate();

    try {
      const model = loadTrainedModel();
      const feed = await fetchLivePublicJobFeeds();
      const nowIso = new Date().toISOString();
      this.totalPolls++;
      this.lastPollAt = nowIso;

      const newCountBySource = new Map<LiveAggregatorSource, number>();
      const newlyAnalyzed: IngestedJobEvent[] = [];

      if (model) {
        const interleaved = this.interleaveEntries(feed.entries);
        const existingHistoryIds = new Set(loadPredictions().map((p) => p.id));

        for (const entry of interleaved) {
          if (this.seenIds.has(entry.id)) continue;
          this.seenIds.add(entry.id);

          const ml = predictWithModel(entry.input, model);
          const indicators =
            ml.nlpTrace.metadataSignals.length > 0
              ? ml.nlpTrace.metadataSignals.slice(0, 3)
              : ml.topSuspiciousWords.slice(0, 3).map((w) => w.term);

          const item: IngestedJobEvent = {
            id: entry.id,
            source: entry.source,
            url: entry.url,
            publishedAt: entry.publishedAt,
            input: entry.input,
            verdict: ml.verdict,
            riskLevel: ml.riskLevel,
            riskPercentage: ml.riskPercentage,
            indicators,
            ingestedAt: nowIso,
            isNew: true,
          };

          newlyAnalyzed.push(item);
          this.totalIngested++;
          newCountBySource.set(entry.source, (newCountBySource.get(entry.source) || 0) + 1);

          if (ml.riskPercentage >= 70) {
            this.highRiskDetected++;
            const recordId = `ing-${entry.id}`;
            if (this.autoSaveHighRisk && !existingHistoryIds.has(recordId)) {
              existingHistoryIds.add(recordId);
              const record: PredictionRecord = {
                id: recordId,
                createdAt: nowIso,
                input: entry.input,
                verdict: ml.verdict,
                riskLevel: ml.riskLevel,
                riskPercentage: ml.riskPercentage,
                genuineProbability: ml.genuineProbability,
                fakeProbability: ml.fakeProbability,
                suspiciousIndicators:
                  indicators.length > 0
                    ? indicators
                    : ['Flagged during real-time aggregator ingestion'],
                explanation: `${ml.mlExplanation} Ingested live from ${entry.source}.`,
                topSuspiciousWords: ml.topSuspiciousWords,
                topGenuineSignals: ml.topGenuineSignals,
                nlpTrace: ml.nlpTrace,
                geminiAnalysis: {
                  status: 'unavailable',
                  model: 'gemini-4-hydrogen',
                  summaryExplanation: `Automatically screened during real-time ${entry.source} ingestion.`,
                  suspiciousIndicators: indicators,
                  verificationChecklist: [
                    'Verify the hiring company website directly before applying.',
                    'Do not share banking details or send upfront payments.',
                  ],
                },
                modelVersionId: model.modelId,
              };
              savePrediction(record);
            }
          }
        }
      }

      // Mark older items as no longer fresh-this-poll and prepend newly ingested items
      const previous = this.recentItems.map((item) => ({ ...item, isNew: false }));
      this.recentItems = [...newlyAnalyzed, ...previous].slice(0, MAX_RECENT_ITEMS);

      this.sourceHealth = feed.reports.map((rep) => ({
        source: rep.source,
        status: rep.status,
        fetchedCount: rep.fetchedCount,
        newCount: newCountBySource.get(rep.source) || 0,
        lastError: rep.error,
      }));
    } catch (err) {
      console.error('Ingestion listener poll failed:', err);
    } finally {
      this.polling = false;
      if (this.running) {
        this.scheduleNextPoll();
      } else {
        this.emitUpdate();
      }
    }

    return this.getState();
  }

  private emitUpdate(): void {
    this.emit('update', this.getState());
  }
}

export const ingestionListener = new RealtimeIngestionListener();

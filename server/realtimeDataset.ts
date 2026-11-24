import fs from 'node:fs';
import path from 'node:path';
import type {
  DatasetRow,
  JobPostingInput,
  LiveAggregatorSource,
} from '../src/types.ts';
import { parseJobDatasetCsv } from './dataset.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const EMSCAD_CACHE_FILE = path.join(DATA_DIR, 'emscad_cache.json');

const EMSCAD_MIRRORS = [
  'https://raw.githubusercontent.com/abbylmm/fake_job_posting/main/data/fake_job_postings.csv',
  'https://raw.githubusercontent.com/rohankokkula/Fraudulent-Job-Post-Prediction/master/fake_job_postings.csv',
  'https://raw.githubusercontent.com/Binita-Sharma/fake_job_detection/main/fake_job_postings.csv',
];

const ARBEITNOW_URL = 'https://www.arbeitnow.com/api/job-board-api';
const REMOTIVE_URL = 'https://remotive.com/api/remote-jobs?limit=50';
const JOBICY_URL = 'https://jobicy.com/api/v2/remote-jobs?count=25';
const REMOTEOK_URL = 'https://remoteok.com/api';

export interface LiveFeedEntry {
  id: string;
  source: LiveAggregatorSource;
  url: string;
  publishedAt: string;
  input: JobPostingInput;
  telecommuting: number;
}

export interface AggregatorFetchReport {
  source: LiveAggregatorSource;
  status: 'ok' | 'error';
  fetchedCount: number;
  error?: string;
}

function stripHtmlEntities(raw: string): string {
  return String(raw || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function mapArbeitnowJob(job: Record<string, unknown>, idx: number): LiveFeedEntry | null {
  const title = String(job.title || '').trim();
  const desc = stripHtmlEntities(String(job.description || ''));
  if (!title || desc.length < 30) return null;

  const companyName = String(job.company_name || '').trim();
  const url = String(job.url || '').trim();
  let companyWebsite = url;
  try {
    if (url) {
      const parsed = new URL(url);
      companyWebsite = parsed.origin;
    }
  } catch {
    companyWebsite = url;
  }

  const tags = Array.isArray(job.tags) ? job.tags.map(String).filter(Boolean).join(', ') : '';
  const jobTypes = Array.isArray(job.job_types)
    ? job.job_types.map(String).filter(Boolean)
    : [];
  const location = String(job.location || (job.remote ? 'Remote' : 'Unspecified')).trim();
  const createdUnix = Number(job.created_at || 0);
  const publishedAt =
    createdUnix > 0 ? new Date(createdUnix * 1000).toISOString() : new Date().toISOString();

  return {
    id: `arb-${String(job.slug || idx)}`.slice(0, 64),
    source: 'Arbeitnow Live',
    url,
    publishedAt,
    telecommuting: job.remote ? 1 : 0,
    input: {
      title,
      companyName,
      companyWebsite: url || companyWebsite,
      location: job.remote && !location.toLowerCase().includes('remote') ? `${location} (Remote)` : location,
      salary: '',
      description: desc.slice(0, 3500),
      requiredSkills: tags,
      employmentType: jobTypes[0] || 'Full-time',
      experienceLevel: 'Mid-Senior level',
    },
  };
}

function mapRemotiveJob(job: Record<string, unknown>, idx: number): LiveFeedEntry | null {
  const title = String(job.title || '').trim();
  const desc = stripHtmlEntities(String(job.description || ''));
  if (!title || desc.length < 30) return null;

  const companyName = String(job.company_name || '').trim();
  const url = String(job.url || '').trim();
  const tags = Array.isArray(job.tags) ? job.tags.map(String).filter(Boolean).join(', ') : '';
  const category = String(job.category || '').trim();
  const salary = String(job.salary || '').trim();
  const location = String(job.candidate_required_location || 'Worldwide (Remote)').trim();
  const rawType = String(job.job_type || 'full_time').toLowerCase();
  const employmentType = rawType.includes('part')
    ? 'Part-time'
    : rawType.includes('contract') || rawType.includes('freelance')
      ? 'Contract'
      : rawType.includes('intern')
        ? 'Internship'
        : 'Full-time';

  return {
    id: `rem-${String(job.id || idx)}`,
    source: 'Remotive Live',
    url,
    publishedAt: String(job.publication_date || new Date().toISOString()),
    telecommuting: 1,
    input: {
      title,
      companyName,
      companyWebsite: url,
      location,
      salary,
      description: desc.slice(0, 3500),
      requiredSkills: tags || category,
      employmentType,
      experienceLevel: 'Mid-Senior level',
    },
  };
}

function mapJobicyJob(job: Record<string, unknown>, idx: number): LiveFeedEntry | null {
  const title = stripHtmlEntities(String(job.jobTitle || ''));
  const desc = stripHtmlEntities(String(job.jobDescription || job.jobExcerpt || ''));
  if (!title || desc.length < 30) return null;

  const companyName = stripHtmlEntities(String(job.companyName || ''));
  const url = String(job.url || '').trim();
  const minSal = Number(job.salaryMin || 0);
  const maxSal = Number(job.salaryMax || 0);
  const curr = String(job.salaryCurrency || 'USD').trim();
  const period = String(job.salaryPeriod || 'year').trim();
  const salary =
    minSal > 0 && maxSal >= minSal
      ? `${curr} ${minSal.toLocaleString()} - ${maxSal.toLocaleString()} / ${period}`
      : '';

  const industries = Array.isArray(job.jobIndustry)
    ? job.jobIndustry.map((s) => stripHtmlEntities(String(s))).filter(Boolean).join(', ')
    : '';
  const jobTypes = Array.isArray(job.jobType) ? job.jobType.map(String) : [String(job.jobType || '')];
  const rawType = jobTypes.join(' ').toLowerCase();
  const employmentType = rawType.includes('part')
    ? 'Part-time'
    : rawType.includes('contract')
      ? 'Contract'
      : rawType.includes('intern')
        ? 'Internship'
        : 'Full-time';

  return {
    id: `jcy-${String(job.id || idx)}`,
    source: 'Jobicy Live',
    url,
    publishedAt: String(job.pubDate || new Date().toISOString()),
    telecommuting: 1,
    input: {
      title,
      companyName,
      companyWebsite: url,
      location: String(job.jobGeo || 'Remote').trim(),
      salary,
      description: desc.slice(0, 3500),
      requiredSkills: industries,
      employmentType,
      experienceLevel: String(job.jobLevel || 'Mid-Senior level').trim() || 'Mid-Senior level',
    },
  };
}

function mapRemoteOkJob(job: Record<string, unknown>, idx: number): LiveFeedEntry | null {
  const title = stripHtmlEntities(String(job.position || ''));
  const desc = stripHtmlEntities(String(job.description || ''));
  if (!title || desc.length < 30) return null;

  const companyName = stripHtmlEntities(String(job.company || ''));
  const url = String(job.apply_url || job.url || '').trim();
  const minSal = Number(job.salary_min || 0);
  const maxSal = Number(job.salary_max || 0);
  const salary =
    minSal > 0 && maxSal >= minSal
      ? `$${minSal.toLocaleString()} - $${maxSal.toLocaleString()} / year`
      : '';
  const tags = Array.isArray(job.tags) ? job.tags.map(String).filter(Boolean).join(', ') : '';

  return {
    id: `rok-${String(job.id || idx)}`,
    source: 'RemoteOK Live',
    url,
    publishedAt: String(job.date || new Date().toISOString()),
    telecommuting: 1,
    input: {
      title,
      companyName,
      companyWebsite: url,
      location: String(job.location || 'Remote').trim() || 'Remote',
      salary,
      description: desc.slice(0, 3500),
      requiredSkills: tags,
      employmentType: 'Full-time',
      experienceLevel: 'Mid-Senior level',
    },
  };
}

/**
 * Fetch live job postings right now from Arbeitnow, Remotive, Jobicy, and RemoteOK APIs.
 */
export async function fetchLivePublicJobFeeds(): Promise<{
  entries: LiveFeedEntry[];
  arbeitnowCount: number;
  remotiveCount: number;
  jobicyCount: number;
  remoteOkCount: number;
  reports: AggregatorFetchReport[];
}> {
  const entries: LiveFeedEntry[] = [];
  let arbeitnowCount = 0;
  let remotiveCount = 0;
  let jobicyCount = 0;
  let remoteOkCount = 0;
  const reports: AggregatorFetchReport[] = [];

  const [arbResult, remResult, jcyResult, rokResult] = await Promise.allSettled([
    fetch(ARBEITNOW_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'FakeJobDetector/1.0' },
      signal: AbortSignal.timeout(8000),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as { data?: Record<string, unknown>[] };
    }),
    fetch(REMOTIVE_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'FakeJobDetector/1.0' },
      signal: AbortSignal.timeout(8000),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as { jobs?: Record<string, unknown>[] };
    }),
    fetch(JOBICY_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'FakeJobDetector/1.0' },
      signal: AbortSignal.timeout(8000),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as { jobs?: Record<string, unknown>[] };
    }),
    fetch(REMOTEOK_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'FakeJobDetector/1.0' },
      signal: AbortSignal.timeout(8000),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as Record<string, unknown>[];
    }),
  ]);

  if (arbResult.status === 'fulfilled' && Array.isArray(arbResult.value.data)) {
    for (let i = 0; i < arbResult.value.data.length; i++) {
      const mapped = mapArbeitnowJob(arbResult.value.data[i], i);
      if (mapped) {
        entries.push(mapped);
        arbeitnowCount++;
      }
    }
    reports.push({ source: 'Arbeitnow Live', status: 'ok', fetchedCount: arbeitnowCount });
  } else {
    reports.push({
      source: 'Arbeitnow Live',
      status: 'error',
      fetchedCount: 0,
      error: arbResult.status === 'rejected' ? String(arbResult.reason) : 'Invalid response',
    });
  }

  if (remResult.status === 'fulfilled' && Array.isArray(remResult.value.jobs)) {
    for (let i = 0; i < remResult.value.jobs.length; i++) {
      const mapped = mapRemotiveJob(remResult.value.jobs[i], i);
      if (mapped) {
        entries.push(mapped);
        remotiveCount++;
      }
    }
    reports.push({ source: 'Remotive Live', status: 'ok', fetchedCount: remotiveCount });
  } else {
    reports.push({
      source: 'Remotive Live',
      status: 'error',
      fetchedCount: 0,
      error: remResult.status === 'rejected' ? String(remResult.reason) : 'Invalid response',
    });
  }

  if (jcyResult.status === 'fulfilled' && Array.isArray(jcyResult.value.jobs)) {
    for (let i = 0; i < jcyResult.value.jobs.length; i++) {
      const mapped = mapJobicyJob(jcyResult.value.jobs[i], i);
      if (mapped) {
        entries.push(mapped);
        jobicyCount++;
      }
    }
    reports.push({ source: 'Jobicy Live', status: 'ok', fetchedCount: jobicyCount });
  } else {
    reports.push({
      source: 'Jobicy Live',
      status: 'error',
      fetchedCount: 0,
      error: jcyResult.status === 'rejected' ? String(jcyResult.reason) : 'Invalid response',
    });
  }

  if (rokResult.status === 'fulfilled' && Array.isArray(rokResult.value)) {
    for (let i = 0; i < rokResult.value.length && remoteOkCount < 40; i++) {
      const item = rokResult.value[i];
      if (!item || typeof item !== 'object' || !item.position) continue;
      const mapped = mapRemoteOkJob(item, i);
      if (mapped) {
        entries.push(mapped);
        remoteOkCount++;
      }
    }
    reports.push({ source: 'RemoteOK Live', status: 'ok', fetchedCount: remoteOkCount });
  } else {
    reports.push({
      source: 'RemoteOK Live',
      status: 'error',
      fetchedCount: 0,
      error: rokResult.status === 'rejected' ? String(rokResult.reason) : 'Invalid response',
    });
  }

  return { entries, arbeitnowCount, remotiveCount, jobicyCount, remoteOkCount, reports };
}

/**
 * Load authentic 17,880-row EMSCAD corpus from local cache or download live from GitHub mirror.
 */
export async function loadAuthenticEmscadRows(forceRefresh = false): Promise<DatasetRow[]> {
  if (!forceRefresh && fs.existsSync(EMSCAD_CACHE_FILE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(EMSCAD_CACHE_FILE, 'utf-8')) as DatasetRow[];
      if (Array.isArray(cached) && cached.length >= 1000) {
        return cached;
      }
    } catch {
      // Cache unreadable, re-fetch
    }
  }

  let lastErr: Error | null = null;
  for (const url of EMSCAD_MIRRORS) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'FakeJobDetector/1.0' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }
      const csvText = await res.text();
      const parsed = parseJobDatasetCsv(csvText, 'EMSCAD Authentic');
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmp = `${EMSCAD_CACHE_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(parsed), 'utf-8');
      fs.renameSync(tmp, EMSCAD_CACHE_FILE);
      return parsed;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastErr || new Error('Unable to fetch authentic EMSCAD dataset from mirrors.');
}

function deterministicSample<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = items.length / count;
  const result: T[] = [];
  for (let i = 0; i < count; i++) {
    result.push(items[Math.floor(i * step)]);
  }
  return result;
}

export type RealtimeCorpusMode = 'balanced' | 'full';

/**
 * Assemble a real-time, production dataset combining:
 * 1. Live public job feeds (Arbeitnow + Remotive)
 * 2. Authentic EMSCAD real-world dataset (17,880 rows: 866 fraud + genuine)
 * 3. Any verified User Feedback rows preserved from prior sessions
 */
export async function buildRealtimeCombinedDataset(
  mode: RealtimeCorpusMode = 'balanced',
  preservedFeedbackRows: DatasetRow[] = []
): Promise<{
  datasetName: string;
  rows: DatasetRow[];
  liveFetchedCount: number;
  emscadUsedCount: number;
}> {
  const [emscadResult, liveResult] = await Promise.allSettled([
    loadAuthenticEmscadRows(false),
    fetchLivePublicJobFeeds(),
  ]);

  const emscadRows = emscadResult.status === 'fulfilled' ? emscadResult.value : [];
  const liveEntries = liveResult.status === 'fulfilled' ? liveResult.value.entries : [];

  if (emscadRows.length === 0) {
    throw new Error(
      emscadResult.status === 'rejected'
        ? `Failed to retrieve authentic EMSCAD corpus: ${emscadResult.reason}`
        : 'Authentic EMSCAD corpus returned 0 rows.'
    );
  }

  const liveRows: DatasetRow[] = liveEntries.map((entry) => ({
    id: entry.id,
    title: entry.input.title,
    companyName: entry.input.companyName,
    companyWebsite: entry.input.companyWebsite,
    location: entry.input.location,
    salary: entry.input.salary,
    description: entry.input.description,
    requiredSkills: entry.input.requiredSkills,
    employmentType: entry.input.employmentType,
    experienceLevel: entry.input.experienceLevel,
    telecommuting: entry.telecommuting,
    hasCompanyLogo: 1,
    hasQuestions: 0,
    fraudulent: 0,
    source: entry.source,
  }));

  const emscadFake = emscadRows.filter((r) => r.fraudulent === 1);
  const emscadGenuine = emscadRows.filter((r) => r.fraudulent === 0);

  const selectedEmscad =
    mode === 'full'
      ? [...emscadFake, ...emscadGenuine]
      : [...emscadFake, ...deterministicSample(emscadGenuine, 2000)];

  // Deduplicate feedback rows by id
  const seenIds = new Set<string>();
  const combined: DatasetRow[] = [];

  for (const r of [...preservedFeedbackRows, ...liveRows, ...selectedEmscad]) {
    if (!seenIds.has(r.id)) {
      seenIds.add(r.id);
      combined.push(r);
    }
  }

  const syncDate = new Date().toISOString().slice(0, 10);
  const datasetName =
    mode === 'full'
      ? `Real-Time Feeds (${liveRows.length}) + Full EMSCAD (${selectedEmscad.length}) [${syncDate}]`
      : `Real-Time Feeds (${liveRows.length}) + Authentic EMSCAD (${selectedEmscad.length}) [${syncDate}]`;

  return {
    datasetName,
    rows: combined,
    liveFetchedCount: liveRows.length,
    emscadUsedCount: selectedEmscad.length,
  };
}

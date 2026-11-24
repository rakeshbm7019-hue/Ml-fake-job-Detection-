import { parse } from 'csv-parse/sync';
import type { DatasetRow, DatasetStatistics } from '../src/types.ts';

function normalizeLabel(val: unknown): 0 | 1 | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'fake' || s === 'fraudulent' || s === 'scam') {
    return 1;
  }
  if (s === '0' || s === 'false' || s === 'no' || s === 'genuine' || s === 'real' || s === 'legitimate') {
    return 0;
  }
  return null;
}

function normalizeFlag(val: unknown, defaultVal = 0): number {
  if (val === undefined || val === null || String(val).trim() === '') return defaultVal;
  const s = String(val).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return 1;
  if (s === '0' || s === 'false' || s === 'no') return 0;
  return defaultVal;
}

function getField(record: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    if (record[k] !== undefined && String(record[k]).trim() !== '') {
      return String(record[k]).trim();
    }
  }
  return '';
}

/**
 * Parse a CSV buffer/string in EMSCAD or custom labeled job-posting format.
 */
export function parseJobDatasetCsv(csvContent: string, defaultSource = 'Uploaded CSV'): DatasetRow[] {
  const cleanCsv = csvContent.replace(/^\uFEFF/, '');
  const records = parse(cleanCsv, {
    columns: (header: string[]) => header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_')),
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  }) as Record<string, string>[];

  if (!records || records.length === 0) {
    throw new Error('CSV file contains no data rows.');
  }

  const rows: DatasetRow[] = [];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const rawLabel =
      rec.fraudulent ??
      rec.is_fake ??
      rec.fake ??
      rec.label ??
      rec.class ??
      rec.target;

    const fraudulent = normalizeLabel(rawLabel);
    if (fraudulent === null) continue;

    const title = getField(rec, ['title', 'job_title', 'role', 'position']);
    const description = getField(rec, ['description', 'job_description', 'text', 'summary']);
    const companyProfile = getField(rec, ['company_profile', 'company_name', 'company', 'organization']);
    const requirements = getField(rec, ['requirements', 'required_skills', 'skills', 'qualifications']);
    const benefits = getField(rec, ['benefits', 'perks']);

    if (!title && !description) continue;

    const fullDescription = [description, requirements, benefits].filter(Boolean).join(' ');

    rows.push({
      id: getField(rec, ['job_id', 'id']) || `row-${i + 1}`,
      title: title || 'Untitled Posting',
      companyName: getField(rec, ['company_name', 'company', 'organization']) || (companyProfile ? companyProfile.slice(0, 80) : ''),
      companyWebsite: getField(rec, ['company_website', 'website', 'url']),
      location: getField(rec, ['location', 'job_location', 'city']),
      salary: getField(rec, ['salary_range', 'salary', 'compensation']),
      description: fullDescription || title,
      requiredSkills: requirements || getField(rec, ['function', 'department', 'industry']),
      employmentType: getField(rec, ['employment_type', 'type']) || 'Unspecified',
      experienceLevel: getField(rec, ['required_experience', 'experience_level', 'experience']) || 'Unspecified',
      telecommuting: normalizeFlag(rec.telecommuting, 0),
      hasCompanyLogo: normalizeFlag(rec.has_company_logo, 1),
      hasQuestions: normalizeFlag(rec.has_questions, 0),
      fraudulent,
      source: getField(rec, ['source']) || defaultSource,
    });
  }

  if (rows.length < 10) {
    throw new Error(
      `Only ${rows.length} valid labeled rows found. Ensure CSV includes a "fraudulent" (0/1) or "label" column along with "title" and "description".`
    );
  }

  return rows;
}

/**
 * Parse an unlabeled (or labeled) CSV file of job postings for Batch Import scanning.
 */
export function parseUnlabeledBatchCsv(csvContent: string): {
  title: string;
  companyName: string;
  companyWebsite: string;
  location: string;
  salary: string;
  description: string;
  requiredSkills: string;
  employmentType: string;
  experienceLevel: string;
}[] {
  const cleanCsv = csvContent.replace(/^\uFEFF/, '');
  const records = parse(cleanCsv, {
    columns: (header: string[]) => header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_')),
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  }) as Record<string, string>[];

  if (!records || records.length === 0) {
    throw new Error('Batch CSV file contains no rows.');
  }

  const results = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const title = getField(rec, ['title', 'job_title', 'role', 'position']);
    const description = getField(rec, ['description', 'job_description', 'text', 'summary']);
    const requirements = getField(rec, ['requirements', 'required_skills', 'skills', 'qualifications']);
    if (!title && !description) continue;

    results.push({
      title: title || `Job Row #${i + 1}`,
      companyName: getField(rec, ['company_name', 'company', 'organization', 'company_profile']).slice(0, 120),
      companyWebsite: getField(rec, ['company_website', 'website', 'url']),
      location: getField(rec, ['location', 'job_location', 'city']),
      salary: getField(rec, ['salary_range', 'salary', 'compensation']),
      description: [description, requirements].filter(Boolean).join(' ') || title,
      requiredSkills: requirements || getField(rec, ['function', 'department', 'industry']),
      employmentType: getField(rec, ['employment_type', 'type']) || 'Full-time',
      experienceLevel: getField(rec, ['required_experience', 'experience_level', 'experience']) || 'Associate',
    });
  }

  if (results.length === 0) {
    throw new Error('No valid job postings found. Include at least "title" or "description" columns.');
  }

  return results.slice(0, 500);
}

export function computeDatasetStatistics(
  rows: DatasetRow[],
  datasetName: string,
  uploadedAt: string
): DatasetStatistics {
  const totalRows = rows.length || 1;
  const fakeRows = rows.filter((r) => r.fraudulent === 1);
  const genuineRows = rows.filter((r) => r.fraudulent === 0);

  const missingSalaryCount = rows.filter((r) => !r.salary || r.salary.trim() === '').length;
  const missingCompanyCount = rows.filter((r) => !r.companyName || r.companyName.trim() === '').length;

  const teleFakeCount = fakeRows.filter((r) => r.telecommuting === 1).length;
  const teleGenuineCount = genuineRows.filter((r) => r.telecommuting === 1).length;

  const empMap = new Map<string, { genuine: number; fake: number }>();
  const expMap = new Map<string, { genuine: number; fake: number }>();
  const sourceMap = new Map<string, number>();

  for (const r of rows) {
    const emp = r.employmentType || 'Unspecified';
    const empEntry = empMap.get(emp) || { genuine: 0, fake: 0 };
    if (r.fraudulent === 1) empEntry.fake++;
    else empEntry.genuine++;
    empMap.set(emp, empEntry);

    const exp = r.experienceLevel || 'Unspecified';
    const expEntry = expMap.get(exp) || { genuine: 0, fake: 0 };
    if (r.fraudulent === 1) expEntry.fake++;
    else expEntry.genuine++;
    expMap.set(exp, expEntry);

    const src = r.source || 'Dataset';
    sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
  }

  const sourceBreakdown = Array.from(sourceMap.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  const employmentTypeBreakdown = Array.from(empMap.entries())
    .map(([label, counts]) => ({ label, ...counts }))
    .sort((a, b) => b.genuine + b.fake - (a.genuine + a.fake))
    .slice(0, 6);

  const experienceLevelBreakdown = Array.from(expMap.entries())
    .map(([label, counts]) => ({ label, ...counts }))
    .sort((a, b) => b.genuine + b.fake - (a.genuine + a.fake))
    .slice(0, 6);

  // Interleave genuine and fake rows in preview so evaluators see both classes clearly
  const preview: DatasetStatistics['samplePreview'] = [];
  const maxPreview = 12;
  let gi = 0;
  let fi = 0;
  while (preview.length < maxPreview && (gi < genuineRows.length || fi < fakeRows.length)) {
    if (gi < genuineRows.length) {
      const r = genuineRows[gi++];
      preview.push({
        id: r.id,
        title: r.title,
        location: r.location || 'Remote / Unspecified',
        employmentType: r.employmentType,
        source: r.source || 'Dataset',
        fraudulent: r.fraudulent,
      });
    }
    if (preview.length < maxPreview && fi < fakeRows.length) {
      const r = fakeRows[fi++];
      preview.push({
        id: r.id,
        title: r.title,
        location: r.location || 'Remote / Unspecified',
        employmentType: r.employmentType,
        source: r.source || 'Dataset',
        fraudulent: r.fraudulent,
      });
    }
  }

  return {
    datasetName,
    uploadedAt,
    totalRows: rows.length,
    genuineCount: genuineRows.length,
    fakeCount: fakeRows.length,
    fraudRatePercent: Number(((fakeRows.length / totalRows) * 100).toFixed(1)),
    missingSalaryPercent: Number(((missingSalaryCount / totalRows) * 100).toFixed(1)),
    missingCompanyPercent: Number(((missingCompanyCount / totalRows) * 100).toFixed(1)),
    telecommutingFakePercent:
      fakeRows.length > 0 ? Number(((teleFakeCount / fakeRows.length) * 100).toFixed(1)) : 0,
    telecommutingGenuinePercent:
      genuineRows.length > 0 ? Number(((teleGenuineCount / genuineRows.length) * 100).toFixed(1)) : 0,
    sourceBreakdown,
    employmentTypeBreakdown,
    experienceLevelBreakdown,
    samplePreview: preview,
  };
}

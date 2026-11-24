import type { JobPostingInput, PredictionRecord } from '../types.ts';

export interface SamplePostingPreset {
  id: string;
  label: string;
  expectedClass: 'Genuine' | 'Fake';
  data: JobPostingInput;
}

export const SAMPLE_POSTINGS: SamplePostingPreset[] = [
  {
    id: 'genuine-swe',
    label: 'Genuine: Senior Backend Engineer',
    expectedClass: 'Genuine',
    data: {
      title: 'Senior Backend Software Engineer',
      companyName: 'Northstar Cloud Systems',
      companyWebsite: 'https://northstarcloud.io',
      location: 'San Francisco, CA (Hybrid)',
      salary: '$145,000 - $185,000 / year',
      employmentType: 'Full-time',
      experienceLevel: 'Mid-Senior level',
      requiredSkills: 'Go, TypeScript, PostgreSQL, Kubernetes, Distributed Systems, CI/CD',
      description:
        'Design and maintain high-throughput telemetry ingestion microservices in Go and TypeScript. Collaborate closely with SRE and product engineering teams on API latency budgets, zero-downtime PostgreSQL schema migrations, and automated integration testing pipelines. Candidates will participate in structured technical architecture interviews with engineering leadership. Comprehensive medical, dental, and vision coverage, 401(k) matching, annual learning stipend, and flexible PTO included.',
    },
  },
  {
    id: 'fake-data-entry',
    label: 'Fake: Urgent WFH Data Entry Scam',
    expectedClass: 'Fake',
    data: {
      title: 'Urgent Work From Home Data Entry Clerk - Immediate Start',
      companyName: 'Global Payroll Solutions',
      companyWebsite: '',
      location: 'Remote, Anywhere',
      salary: '$3,500 - $5,000 weekly',
      employmentType: 'Full-time',
      experienceLevel: 'Entry level',
      requiredSkills: 'Basic typing, Smartphone or Laptop, WhatsApp or Telegram',
      description:
        'Immediate hiring! Earn $3,500 to $5,000 per week typing simple forms from home. No experience required and no interview needed! Company will send an onboarding check to purchase your MacBook and software kit from our designated vendor before day one. Reply to fast.payroll.hr2026@gmail.com or message our hiring agent on WhatsApp and Telegram for instant activation and weekly bank wire transfer setup. Guaranteed unlimited earning potential!',
    },
  },
  {
    id: 'fake-reshipping',
    label: 'Fake: Package Reshipping Mule Scam',
    expectedClass: 'Fake',
    data: {
      title: 'Home-Based Package Inspection & Forwarding Coordinator',
      companyName: 'Confidential Express Logistics',
      companyWebsite: 'https://express-parcel-jobs.blogspot.com',
      location: 'Remote, US',
      salary: '$4,200 / month + $100 per parcel bonus',
      employmentType: 'Part-time',
      experienceLevel: 'Not Applicable',
      requiredSkills: 'Home address, Printer, WhatsApp, Active bank account',
      description:
        'Work from home receiving international e-commerce packages at your residence, verifying box contents, printing prepaid FedEx labels, and forwarding parcels to regional clients. No warehouse commute required! Must submit a small refundable $75 security deposit via gift card or Zelle for barcode scanner activation and provide your bank routing number for weekly direct deposit. Contact @parcel_recruiter on Telegram today.',
    },
  },
  {
    id: 'genuine-clinical',
    label: 'Genuine: Clinical Oncology Pharmacist',
    expectedClass: 'Genuine',
    data: {
      title: 'Clinical Pharmacist - Outpatient Oncology',
      companyName: 'Gulf Coast Cancer Institute',
      companyWebsite: 'https://gulfcoastcancer.org',
      location: 'Houston, TX',
      salary: '$135,000 - $158,000 / year',
      employmentType: 'Full-time',
      experienceLevel: 'Mid-Senior level',
      requiredSkills: 'PharmD, Active State Pharmacist License, PGY1/PGY2 Residency, USP 800',
      description:
        'Verify chemotherapy dosing protocols, counsel oncology patients on supportive care regimens, participate in daily multidisciplinary hematology rounds, and ensure USP 800 sterile compounding compliance across infusion clinics. Requires PharmD degree, active state licensure in good standing, and PGY1 or PGY2 oncology residency. Full malpractice insurance, CME allowance, medical/dental benefits, and retirement matching provided.',
    },
  },
];

export function downloadPredictionJson(record: PredictionRecord): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  triggerDownload(blob, `job-analysis-${record.id}.json`);
}

export function downloadPredictionMarkdown(record: PredictionRecord): void {
  const lines = [
    `# Fake Job Detection Analysis Report`,
    ``,
    `- **Report ID:** ${record.id}`,
    `- **Analyzed At:** ${new Date(record.createdAt).toLocaleString()}`,
    `- **Model Version:** ${record.modelVersionId}`,
    ``,
    `## Verdict Summary`,
    `- **Classification:** ${record.verdict}`,
    `- **Risk Level:** ${record.riskLevel}`,
    `- **Fraud Risk Score:** ${record.riskPercentage}%`,
    `- **Genuine Probability:** ${record.genuineProbability}%`,
    `- **Fake Probability:** ${record.fakeProbability}%`,
    ``,
    `## Job Posting Details`,
    `- **Job Title:** ${record.input.title}`,
    `- **Company Name:** ${record.input.companyName || 'Not provided'}`,
    `- **Company Website:** ${record.input.companyWebsite || 'Not provided'}`,
    `- **Location:** ${record.input.location || 'Not provided'}`,
    `- **Salary:** ${record.input.salary || 'Not provided'}`,
    `- **Employment Type:** ${record.input.employmentType || 'Not provided'}`,
    `- **Experience Level:** ${record.input.experienceLevel || 'Not provided'}`,
    `- **Required Skills:** ${record.input.requiredSkills || 'Not provided'}`,
    ``,
    `## Explanation`,
    record.explanation,
    ``,
    `## Key Indicators`,
    ...record.suspiciousIndicators.map((ind) => `- ${ind}`),
    ``,
    `## Top Weighted Suspicious Words (TF-IDF x Weight)`,
    ...(record.topSuspiciousWords.length > 0
      ? record.topSuspiciousWords.map(
          (w) =>
            `- **${w.term}** — Contribution: +${w.contribution.toFixed(4)} (TF-IDF: ${w.tfidf.toFixed(3)}, Weight: +${w.weight.toFixed(3)})`
        )
      : ['- No significant positive fraud-weighted terms detected.']),
    ``,
    `## Gemini Natural-Language Analysis (${record.geminiAnalysis.status})`,
    record.geminiAnalysis.summaryExplanation,
    ``,
    `### Verification Checklist`,
    ...record.geminiAnalysis.verificationChecklist.map((step) => `- [ ] ${step}`),
    ``,
    `## NLP Pipeline Trace`,
    `- Raw Character Count: ${record.nlpTrace.rawLength}`,
    `- Token Count: ${record.nlpTrace.tokenCount}`,
    `- Stop-words Removed: ${record.nlpTrace.stopWordsRemovedCount}`,
    `- Bigrams Generated: ${record.nlpTrace.bigramCount}`,
    `- Matched TF-IDF Features: ${record.nlpTrace.tfidfNonZeroCount}`,
  ];

  const blob = new Blob([lines.join('\n')], {
    type: 'text/markdown;charset=utf-8',
  });
  triggerDownload(blob, `job-analysis-${record.id}.md`);
}

export function downloadConsolidatedReportMarkdown(records: PredictionRecord[]): void {
  const total = records.length;
  const fakeCount = records.filter((r) => r.verdict === 'Potentially Fake').length;
  const genuineCount = total - fakeCount;
  const highRiskCount = records.filter((r) => r.riskPercentage >= 70).length;
  const avgRisk =
    total > 0
      ? (records.reduce((s, r) => s + r.riskPercentage, 0) / total).toFixed(1)
      : '0.0';

  const lines = [
    `# Consolidated Fake Job Detection Audit Report`,
    ``,
    `- **Generated At:** ${new Date().toLocaleString()}`,
    `- **Total Postings Analyzed:** ${total}`,
    `- **Genuine Postings:** ${genuineCount}`,
    `- **Potentially Fake Postings:** ${fakeCount}`,
    `- **High-Risk Postings (>= 70%):** ${highRiskCount}`,
    `- **Average Fraud Risk Score:** ${avgRisk}%`,
    ``,
    `## Analyzed Job Postings`,
    ``,
    `| ID | Job Title | Company | Verdict | Risk % | Key Indicators |`,
    `|---|---|---|---|---:|---|`,
    ...records.map(
      (r) =>
        `| ${r.id} | ${r.input.title.replace(/\|/g, '/')} | ${(r.input.companyName || 'Undisclosed').replace(/\|/g, '/')} | ${r.verdict} | ${r.riskPercentage.toFixed(1)}% | ${r.suspiciousIndicators.slice(0, 2).join('; ').replace(/\|/g, '/')} |`
    ),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  triggerDownload(blob, `fake-job-audit-report-${new Date().toISOString().slice(0, 10)}.md`);
}

export function downloadConsolidatedReportCsv(records: PredictionRecord[]): void {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = [
    'ID',
    'Analyzed At',
    'Title',
    'Company',
    'Website',
    'Location',
    'Salary',
    'Verdict',
    'Risk Level',
    'Risk %',
    'Genuine %',
    'Fake %',
    'Indicators',
  ].join(',');

  const rows = records.map((r) =>
    [
      esc(r.id),
      esc(r.createdAt),
      esc(r.input.title),
      esc(r.input.companyName),
      esc(r.input.companyWebsite),
      esc(r.input.location),
      esc(r.input.salary),
      esc(r.verdict),
      esc(r.riskLevel),
      r.riskPercentage,
      r.genuineProbability,
      r.fakeProbability,
      esc(r.suspiciousIndicators.join('; ')),
    ].join(',')
  );

  const blob = new Blob([[header, ...rows].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  triggerDownload(blob, `fake-job-history-${new Date().toISOString().slice(0, 10)}.csv`);
}

export function downloadBatchScanCsv(
  results: {
    rowIndex: number;
    title: string;
    companyName: string;
    location: string;
    verdict: string;
    riskLevel: string;
    riskPercentage: number;
    indicators: string[];
  }[],
  fileName: string
): void {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = 'Row,Job Title,Company,Location,Verdict,Risk Level,Risk %,Indicators';
  const rows = results.map((r) =>
    [
      r.rowIndex,
      esc(r.title),
      esc(r.companyName),
      esc(r.location),
      esc(r.verdict),
      esc(r.riskLevel),
      r.riskPercentage,
      esc(r.indicators.join('; ')),
    ].join(',')
  );
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, `batch-scan-${fileName.replace(/\.csv$/i, '')}.csv`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

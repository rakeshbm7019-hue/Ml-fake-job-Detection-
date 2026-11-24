import type { NlpPipelineTrace } from '../src/types.ts';

export const STOP_WORDS = new Set<string>([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'arent', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'below', 'between', 'both', 'but', 'by', 'can', 'cannot', 'could', 'couldnt',
  'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during',
  'each', 'few', 'for', 'from', 'further', 'had', 'hadnt', 'has', 'hasnt',
  'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here',
  'heres', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows', 'i',
  'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is', 'isnt', 'it', 'its',
  'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor',
  'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shant', 'she', 'shed',
  'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such', 'than', 'that',
  'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there',
  'theres', 'these', 'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this',
  'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
  'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'what', 'whats', 'when',
  'whens', 'where', 'wheres', 'which', 'while', 'who', 'whos', 'whom', 'why',
  'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd', 'youll', 'youre',
  'youve', 'your', 'yours', 'yourself', 'yourselves', 'also', 'via', 'per',
  'within', 'across', 'including', 'using', 'based', 'role', 'position', 'job',
  'work', 'working', 'team', 'company', 'will', 'looking', 'seeking', 'candidate',
]);

export interface DocumentInputFields {
  title: string;
  companyName: string;
  companyWebsite: string;
  location: string;
  salary: string;
  description: string;
  requiredSkills: string;
  employmentType: string;
  experienceLevel: string;
  telecommuting?: number;
  hasCompanyLogo?: number;
}

/**
 * Step 1 & 2: Clean HTML/URLs/punctuation and convert to lowercase.
 */
export function cleanAndLowercase(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, ' emailtoken ')
    .replace(/[$€£₹]\s?\d[\d,]*(?:\.\d+)?/g, ' currencyamount ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Step 5: Lightweight deterministic suffix normalization (Porter-style).
 */
export function normalizeToken(token: string): string {
  if (token.length <= 3) return token;

  if (token.startsWith('meta_') || token === 'emailtoken' || token === 'currencyamount') {
    return token;
  }

  let w = token;
  if (w.endsWith('ies') && w.length > 4) {
    w = w.slice(0, -3) + 'y';
  } else if (w.endsWith('sses') && w.length > 5) {
    w = w.slice(0, -2);
  } else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) {
    w = w.slice(0, -1);
  }

  if (w.endsWith('ational') && w.length > 8) {
    w = w.slice(0, -5) + 'e';
  } else if (w.endsWith('ization') && w.length > 8) {
    w = w.slice(0, -5) + 'e';
  } else if (w.endsWith('ment') && w.length > 6) {
    w = w.slice(0, -4);
  } else if (w.endsWith('ness') && w.length > 6) {
    w = w.slice(0, -4);
  } else if (w.endsWith('ingly') && w.length > 7) {
    w = w.slice(0, -5);
  } else if (w.endsWith('edly') && w.length > 6) {
    w = w.slice(0, -4);
  } else if (w.endsWith('ing') && w.length > 5) {
    w = w.slice(0, -3);
  } else if (w.endsWith('ed') && w.length > 4) {
    w = w.slice(0, -2);
  } else if (w.endsWith('ly') && w.length > 4) {
    w = w.slice(0, -2);
  }

  return w;
}

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'mail.com',
  'yandex.com',
  'gmx.com',
  'icloud.com',
  'zoho.com',
]);

const PLACEHOLDER_NAMES = new Set([
  'unknown',
  'confidential',
  'n/a',
  'na',
  'none',
  'null',
  'test',
  'fake',
  'company',
  'xyz',
  'abc',
  'tbd',
  'private',
  'hidden',
]);

function looksLikeGibberish(text: string): boolean {
  const words = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (words.length < 5) return true;

  let suspiciousWords = 0;
  for (const w of words) {
    // Excessive repeated character or no vowels in long ASCII word
    if (/(.)\1{3,}/.test(w)) suspiciousWords++;
    else if (w.length >= 7 && !/[aeiouy]/.test(w)) suspiciousWords++;
    else if (w.length >= 22) suspiciousWords++;
  }

  return suspiciousWords / words.length >= 0.3;
}

export function extractMetadataSignals(fields: DocumentInputFields): {
  metaTokens: string[];
  humanSignals: string[];
  structuralRiskBoost: number;
} {
  const metaTokens: string[] = [];
  const humanSignals: string[] = [];
  let structuralRiskBoost = 0;

  const fullText = `${fields.title} ${fields.companyName} ${fields.companyWebsite} ${fields.salary} ${fields.requiredSkills} ${fields.description}`.toLowerCase();
  const website = (fields.companyWebsite || '').trim().toLowerCase();
  const company = (fields.companyName || '').trim().toLowerCase();
  const salary = (fields.salary || '').trim().toLowerCase();
  const desc = (fields.description || '').trim();

  // 1. Missing or placeholder company name
  if (!company || PLACEHOLDER_NAMES.has(company) || company.length < 2) {
    metaTokens.push('meta_missing_company');
    humanSignals.push('Missing, placeholder, or undisclosed company name');
    structuralRiskBoost += 0.1;
  }

  // 2. Website validation & suspicious hosting/TLD detection
  if (!website || website === 'n/a' || website === 'none' || website === 'na') {
    metaTokens.push('meta_missing_website');
    humanSignals.push('No verifiable corporate website provided');
    structuralRiskBoost += 0.08;
  } else {
    const hasEmailInUrl = /@/.test(website);
    const isFreeOrRedirect =
      website.includes('blogspot.') ||
      website.includes('wordpress.com') ||
      website.includes('wixsite.') ||
      website.includes('weebly.') ||
      website.includes('sites.google.') ||
      website.includes('carrd.co') ||
      website.includes('t.me/') ||
      website.includes('wa.me/') ||
      website.includes('bit.ly/') ||
      website.includes('tinyurl.');
    const hasRiskyTld = /\.(xyz|top|click|tk|ml|ga|cf|gq|buzz|loan|work)(\/|$)/i.test(website);
    const hasValidDomainFormat = /\.[a-z]{2,}/i.test(website) && !/\s/.test(website);

    if (hasEmailInUrl || isFreeOrRedirect || hasRiskyTld || !hasValidDomainFormat) {
      metaTokens.push('meta_unverified_website');
      humanSignals.push('Website URL is invalid, uses free hosting, or points to a high-risk domain');
      structuralRiskBoost += 0.25;
    }
  }

  // 3. Free webmail recruiter domain check
  const emailMatches = fullText.match(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/g) || [];
  for (const email of emailMatches) {
    const domain = email.split('@')[1];
    if (domain && FREE_EMAIL_DOMAINS.has(domain)) {
      metaTokens.push('meta_free_email_contact');
      humanSignals.push(`Recruiter contact uses free webmail domain (@${domain})`);
      structuralRiskBoost += 0.28;
      break;
    }
  }

  // 4. Off-platform messaging app interviews
  if (
    /\b(whatsapp|telegram|signal|hangouts|kik|dm me|dm us|inbox me|text only|wa\.me|t\.me)\b/i.test(
      fullText
    )
  ) {
    metaTokens.push('meta_messaging_app_interview');
    humanSignals.push('Directs applicants to off-platform messaging (WhatsApp/Telegram/DM)');
    structuralRiskBoost += 0.34;
  }

  // 5. Financial requests, upfront fees, or sensitive PII harvesting
  if (
    /\b(bank account|bank details|routing number|iban|ssn|social security|aadhaar|aadhar|pan card|passport copy|driver license|otp|cvv|credit card|wire transfer|western union|moneygram|gift card|crypto wallet|bitcoin|usdt|upi|zelle|cashapp|venmo|security deposit|registration fee|registration charge|training fee|activation fee|verification fee|courier fee|starter kit|pay fee|pay \$\d+|pay rs|deposit|advance check|cashier check|check cashing|approved vendor|purchase equipment|buy equipment|send money)\b/i.test(
      fullText
    )
  ) {
    metaTokens.push('meta_financial_request');
    humanSignals.push('Requests upfront fees, banking/PII details, gift cards, or money transfers');
    structuralRiskBoost += 0.55;
  }

  // 6. Unrealistic income claims, urgency, and zero-barrier scam phrases
  if (
    /\b(no experience|no interview|no resume|zero experience|zero skills|earn \$?\d{3,5}\s*(per|a|\/)\s*(day|week|hr|hour)|earn \d{4,6}\s*(daily|weekly)|guaranteed income|guaranteed pay|guaranteed placement|unlimited earning|fast cash|easy money|passive income|immediate hire|immediate joining|direct joining|urgent hiring|apply today|100% guaranteed|copy paste|captcha|form filling|envelope stuffer|stuffing envelopes|click ads|like videos|liking videos|mystery shopper|parcel forwarding|reshipping|check verification)\b/i.test(
      fullText
    )
  ) {
    metaTokens.push('meta_unrealistic_promise');
    humanSignals.push('Contains unrealistic pay promises, no-interview claims, or known scam task patterns');
    structuralRiskBoost += 0.35;
  }

  // 7. Unrealistic salary heuristic
  const weeklyOrDailyPay = salary.match(/(\d[\d,]*)\s*(?:\/|\s*per\s*|\s+)(week|weekly|day|daily)/i);
  const hourlyPay = salary.match(/(\d[\d,]*)\s*(?:\/|\s*per\s*|\s+)(hr|hour|hourly)/i);
  const bigRawNumber = salary.match(/\b(\d{6,9})\b/);
  if (
    (weeklyOrDailyPay && Number(weeklyOrDailyPay[1].replace(/,/g, '')) >= 1200) ||
    (hourlyPay &&
      Number(hourlyPay[1].replace(/,/g, '')) >= 50 &&
      /\b(entry|intern|clerk|typist|data entry|assistant|shopper|survey)\b/i.test(fullText)) ||
    (bigRawNumber && Number(bigRawNumber[1]) >= 450000)
  ) {
    metaTokens.push('meta_unrealistic_salary');
    humanSignals.push('Compensation figure is anomalously high for the stated role or pay cadence');
    structuralRiskBoost += 0.25;
  }

  // 8. Low-quality, gibberish, or fake-test posting detection
  const wordCount = desc.split(/\s+/).filter((w) => w.length >= 2).length;
  if (desc.length < 100 || wordCount < 15 || looksLikeGibberish(`${fields.title} ${desc}`)) {
    metaTokens.push('meta_low_quality_posting');
    humanSignals.push('Posting text is abnormally short, lacks genuine job duties, or contains gibberish');
    structuralRiskBoost += 0.28;
  }

  if (/\b(fake job|scam job|fraudulent job|test scam|dummy job)\b/i.test(fullText)) {
    metaTokens.push('meta_explicit_fraud_marker');
    humanSignals.push('Posting contains explicit fake/scam indicator phrasing');
    structuralRiskBoost += 0.5;
  }

  return {
    metaTokens,
    humanSignals,
    structuralRiskBoost: Math.min(0.95, Number(structuralRiskBoost.toFixed(3))),
  };
}

export interface PreprocessedDocument {
  cleanedText: string;
  terms: string[];
  trace: NlpPipelineTrace;
  structuralRiskBoost: number;
}

/**
 * Full NLP Preprocessing Pipeline:
 * 1. Text cleaning
 * 2. Lowercase conversion
 * 3. Tokenization
 * 4. Stop-word removal
 * 5. Text normalization
 * 6. Bigram & structural metadata token enrichment
 */
export function preprocessJobPosting(fields: DocumentInputFields): PreprocessedDocument {
  // Focus lexical TF-IDF on job content fields so geography/dropdowns don't cause false positives
  const combinedRaw = [
    fields.title,
    fields.companyName,
    fields.salary,
    fields.requiredSkills,
    fields.description,
  ]
    .filter(Boolean)
    .join(' ');

  const cleanedText = cleanAndLowercase(combinedRaw);
  const rawTokens = cleanedText.split(/\s+/).filter((t) => t.length >= 2 && !/^\d+$/.test(t));

  let stopWordsRemovedCount = 0;
  const normalizedUnigrams: string[] = [];

  for (const tok of rawTokens) {
    if (STOP_WORDS.has(tok)) {
      stopWordsRemovedCount++;
      continue;
    }
    const norm = normalizeToken(tok);
    if (norm.length >= 2 && !STOP_WORDS.has(norm)) {
      normalizedUnigrams.push(norm);
    } else {
      stopWordsRemovedCount++;
    }
  }

  const bigrams: string[] = [];
  for (let i = 0; i < normalizedUnigrams.length - 1; i++) {
    const a = normalizedUnigrams[i];
    const b = normalizedUnigrams[i + 1];
    if (a !== b) {
      bigrams.push(`${a}_${b}`);
    }
  }

  const { metaTokens, humanSignals, structuralRiskBoost } = extractMetadataSignals(fields);
  const terms = [...normalizedUnigrams, ...bigrams, ...metaTokens];

  return {
    cleanedText,
    terms,
    structuralRiskBoost,
    trace: {
      rawLength: combinedRaw.length,
      cleanedText: cleanedText.slice(0, 600) + (cleanedText.length > 600 ? '...' : ''),
      tokenCount: rawTokens.length,
      stopWordsRemovedCount,
      normalizedTokensSample: normalizedUnigrams.slice(0, 24),
      bigramCount: bigrams.length,
      tfidfNonZeroCount: 0,
      metadataSignals: humanSignals,
    },
  };
}

export interface SparseVector {
  indices: number[];
  values: number[];
}

/**
 * Fit TF-IDF vocabulary & IDF weights from a corpus of tokenized documents.
 */
export function fitTfidfVectorizer(
  docs: string[][],
  labels: (0 | 1)[],
  maxFeatures = 2500
): { vocabulary: Record<string, number>; idf: number[] } {
  const N = docs.length;
  const dfMap = new Map<string, number>();
  const fakeDfMap = new Map<string, number>();

  for (let i = 0; i < N; i++) {
    const uniqueTerms = new Set(docs[i]);
    const isFake = labels[i] === 1;
    for (const term of uniqueTerms) {
      dfMap.set(term, (dfMap.get(term) || 0) + 1);
      if (isFake) {
        fakeDfMap.set(term, (fakeDfMap.get(term) || 0) + 1);
      }
    }
  }

  const minDf = N >= 1500 ? 3 : N >= 40 ? 2 : 1;
  const totalFake = labels.filter((l) => l === 1).length || 1;
  const totalGenuine = N - totalFake || 1;

  const candidates: { term: string; df: number; score: number }[] = [];
  for (const [term, df] of dfMap.entries()) {
    const isMeta = term.startsWith('meta_');
    if (!isMeta && df < minDf) continue;
    if (df > N * 0.92 && !isMeta) continue;

    const fakeDf = fakeDfMap.get(term) || 0;
    const genDf = df - fakeDf;
    const pFake = (fakeDf + 0.5) / (totalFake + 1);
    const pGen = (genDf + 0.5) / (totalGenuine + 1);
    const logOddsMag = Math.abs(Math.log(pFake / pGen));
    const score = (isMeta ? 12 : 1) * logOddsMag * Math.log(1 + df);
    candidates.push({ term, df, score });
  }

  candidates.sort((a, b) => b.score - a.score || b.df - a.df);
  const selected = candidates.slice(0, maxFeatures);

  const vocabulary: Record<string, number> = Object.create(null);
  const idf: number[] = new Array(selected.length);

  for (let idx = 0; idx < selected.length; idx++) {
    const { term, df } = selected[idx];
    vocabulary[term] = idx;
    idf[idx] = Math.log((1 + N) / (1 + df)) + 1;
  }

  return { vocabulary, idf };
}

/**
 * Transform a tokenized document into an L2-normalized sparse TF-IDF vector.
 */
export function transformToTfidf(
  terms: string[],
  vocabulary: Record<string, number>,
  idf: number[]
): SparseVector {
  const tfCounts = new Map<number, number>();
  for (const term of terms) {
    if (Object.hasOwn(vocabulary, term)) {
      const idx = vocabulary[term];
      if (typeof idx === 'number') {
        tfCounts.set(idx, (tfCounts.get(idx) || 0) + 1);
      }
    }
  }

  const indices: number[] = [];
  const values: number[] = [];
  let normSq = 0;

  for (const [idx, count] of tfCounts.entries()) {
    const tf = 1 + Math.log(count);
    const val = tf * idf[idx];
    indices.push(idx);
    values.push(val);
    normSq += val * val;
  }

  const norm = Math.sqrt(normSq);
  if (norm > 0) {
    for (let i = 0; i < values.length; i++) {
      values[i] /= norm;
    }
  }

  return { indices, values };
}

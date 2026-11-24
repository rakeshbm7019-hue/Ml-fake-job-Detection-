import { GoogleGenAI, Type } from '@google/genai';
import type {
  GeminiAnalysisResult,
  JobPostingInput,
} from '../src/types.ts';
import type { MlPredictionOutput } from './ml.ts';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delayMs = 600 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

export async function generateGeminiJobExplanation(
  input: JobPostingInput,
  mlResult: MlPredictionOutput
): Promise<GeminiAnalysisResult> {
  const modelName = 'gemini-4-hydrogen';
  const ai = getGeminiClient();

  if (!ai) {
    return {
      status: 'unavailable',
      model: modelName,
      summaryExplanation:
        'Gemini API key is not configured on the server. Primary prediction and feature attribution above were generated exclusively by the trained Logistic Regression + TF-IDF classifier.',
      suspiciousIndicators: mlResult.nlpTrace.metadataSignals,
      verificationChecklist: [
        'Verify the company domain via WHOIS and official corporate LinkedIn page.',
        'Confirm recruiter email matches the official corporate domain rather than free webmail.',
        'Never pay upfront fees for training kits, background checks, or equipment.',
      ],
    };
  }

  const topSus = mlResult.topSuspiciousWords
    .slice(0, 6)
    .map((w) => `${w.term} (weight +${w.weight.toFixed(2)})`)
    .join(', ');
  const topGen = mlResult.topGenuineSignals
    .slice(0, 5)
    .map((w) => `${w.term} (weight ${w.weight.toFixed(2)})`)
    .join(', ');

  const prompt = `You are a cybersecurity recruitment fraud analyst assisting a Logistic Regression ML system.
The primary trained ML model evaluated the following job posting:
- Primary ML Verdict: ${mlResult.verdict}
- Fraud Risk Score: ${mlResult.riskPercentage}% (Fake prob: ${mlResult.fakeProbability}%, Genuine prob: ${mlResult.genuineProbability}%)
- Top ML Suspicious TF-IDF Features: ${topSus || 'None significant'}
- Top ML Legitimate TF-IDF Features: ${topGen || 'None significant'}
- Automated Structural Signals: ${mlResult.nlpTrace.metadataSignals.join('; ') || 'None detected'}

Job Posting Details:
- Title: ${input.title}
- Company Name: ${input.companyName || '(Not provided)'}
- Company Website: ${input.companyWebsite || '(Not provided)'}
- Location: ${input.location || '(Not provided)'}
- Salary: ${input.salary || '(Not provided)'}
- Employment Type: ${input.employmentType || '(Not provided)'}
- Experience Level: ${input.experienceLevel || '(Not provided)'}
- Required Skills: ${input.requiredSkills || '(Not provided)'}
- Description:
${input.description}

Provide a concise, objective natural-language explanation supporting and interpreting the primary ML classifier's result. Do not contradict the primary ML probabilities, instead explain the linguistic, compensation, contact, and structural evidence in the job text.`;

  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction:
            'You are an objective employment-fraud cybersecurity analyst. Return accurate, concise, evidence-grounded JSON.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summaryExplanation: {
                type: Type.STRING,
                description:
                  'A clear 2-3 sentence natural-language explanation of the risk factors or legitimacy signals in this posting.',
              },
              suspiciousIndicators: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '3 to 5 specific indicators observed in the posting (or positive legitimacy indicators if genuine).',
              },
              verificationChecklist: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '3 concrete action steps a job seeker should take to verify this opportunity.',
              },
            },
            required: ['summaryExplanation', 'suspiciousIndicators', 'verificationChecklist'],
          },
        },
      })
    );

    const rawText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawText) as {
      summaryExplanation?: string;
      suspiciousIndicators?: string[];
      verificationChecklist?: string[];
    };

    return {
      status: 'ok',
      model: modelName,
      summaryExplanation:
        parsed.summaryExplanation || mlResult.mlExplanation,
      suspiciousIndicators: Array.isArray(parsed.suspiciousIndicators)
        ? parsed.suspiciousIndicators.slice(0, 6)
        : [],
      verificationChecklist: Array.isArray(parsed.verificationChecklist)
        ? parsed.verificationChecklist.slice(0, 5)
        : [],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      model: modelName,
      summaryExplanation:
        'Gemini natural-language analysis encountered an upstream error. Primary ML classification remains active.',
      suspiciousIndicators: mlResult.nlpTrace.metadataSignals,
      verificationChecklist: [
        'Cross-check this role directly on the company careers portal.',
        'Verify recruiter identity and corporate domain ownership.',
      ],
      errorMessage: msg,
    };
  }
}

import type { DatasetProfileSummary } from '@/engine/profiling/datasetProfiler';
import type { CorrelationMatrixResult } from '@/engine/eda/correlationMatrix';
import type { AiCredentials } from './byokStorage';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface DatasetAiContext {
  datasetName: string;
  sourceFormat: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  previewRows: Record<string, unknown>[];
  profileSummary: DatasetProfileSummary | null;
  correlationData: CorrelationMatrixResult | null;
}

/**
 * Constructs a rich context system prompt embedding dataset metadata, schema, and statistics.
 */
function buildSystemPrompt(ctx: DatasetAiContext): string {
  const { datasetName, rowCount, columnCount, profileSummary, correlationData, previewRows } = ctx;

  let statsSummary = 'Profiling pending.';
  if (profileSummary) {
    const colStats = profileSummary.columns
      .map((c) => {
        if (c.isNumeric && 'min' in c.stats) {
          return `- ${c.columnName} (${c.inferredType}): min=${c.stats.min}, max=${c.stats.max}, mean=${c.stats.mean ? c.stats.mean.toFixed(1) : 'N/A'}, outliers=${c.stats.outlierCount}, nulls=${c.missingCount}`;
        }
        if (!c.isNumeric && 'topFrequencies' in c.stats) {
          const topVals = c.stats.topFrequencies.slice(0, 3).map((f) => `"${f.value}" (${f.count})`).join(', ');
          return `- ${c.columnName} (${c.inferredType}): distinct=${c.distinctCount}, top=[${topVals}], nulls=${c.missingCount}`;
        }
        return `- ${c.columnName} (${c.inferredType}): nulls=${c.missingCount}`;
      })
      .join('\n');

    statsSummary = `
- Duplicate Rows: ${profileSummary.duplicateRowsCount}
- Overall Missing Rate: ${profileSummary.overallMissingRate}%
- Constant Columns: ${profileSummary.constantColumnsCount}
- Column Details:
${colStats}`;
  }

  let correlationSummary = 'None';
  if (correlationData && correlationData.columns.length > 1) {
    const pairs: string[] = [];
    const n = correlationData.columns.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const val = correlationData.matrix[i]?.[j] ?? 0;
        if (Math.abs(val) >= 0.2) {
          pairs.push(`${correlationData.columns[i]} & ${correlationData.columns[j]}: r = ${val}`);
        }
      }
    }
    correlationSummary = pairs.length > 0 ? pairs.join('\n') : 'No strong linear correlations (all |r| < 0.2)';
  }

  const sampleJson = JSON.stringify(previewRows.slice(0, 3), null, 2);

  return `You are Groundwork AI Copilot, an expert data scientist and machine learning engineer.
You are helping the user explore, understand, analyze, and prepare their dataset for analytical and ML modeling.

Active Dataset Information:
- Name: "${datasetName}"
- Dimensions: ${rowCount.toLocaleString()} rows × ${columnCount} columns
- Sample Rows (First 3):
${sampleJson}

Data Profiling & Quality Summary:
${statsSummary}

Notable Correlations (|r| >= 0.2):
${correlationSummary}

Your Instructions:
1. Speak as a Senior Staff Machine Learning Engineer: rigorous, precise, and highly concise.
2. DO NOT use conversational filler (avoid "Hello", "Sure thing!", "I would love to help", etc.). Jump straight to the diagnosis.
3. Keep prose under 3 sentences: State the data observation, statistical justification, and proposed action directly.
4. When suggesting transformations, limit explanation to 2-3 punchy bullet points.
5. When the user asks to clean, prepare, transform, impute, encode, scale, remove outliers, or drop columns from the dataset, you MUST append an executable transformation plan at the end of your message using this exact format:

\`\`\`json:groundwork-plan
{
  "title": "Title of Preparation Plan",
  "operations": [
    { "type": "impute", "columns": ["ColName"], "strategy": "median" },
    { "type": "drop_columns", "columns": ["SparseCol"] },
    { "type": "outlier_treatment", "columns": ["NumCol"], "strategy": "clip_iqr", "multiplier": 1.5 },
    { "type": "scale", "columns": ["NumCol"], "strategy": "log1p" },
    { "type": "encode", "columns": ["CatCol"], "strategy": "one_hot" },
    { "type": "deduplicate" }
  ]
}
\`\`\`
Only include column names that actually exist in this dataset. Groundwork UI will render this as an interactive "Approve & Apply Plan" button for the user to execute in DuckDB-Wasm!`;
}

/**
 * Dynamically resolves the best available Gemini model for the user's API key.
 * Queries ModelService.ListModels to ensure the model exists and supports generateContent.
 */
async function resolveGeminiModel(apiKey: string, preferredModel?: string): Promise<string> {
  const desired = preferredModel ?? 'gemini-2.5-flash';

  try {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(listUrl);
    if (res.ok) {
      const data = (await res.json()) as {
        models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
      };

      const available = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''));

      if (available.includes(desired)) {
        return desired;
      }

      const preferences = [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-2.0-flash',
      ];

      for (const p of preferences) {
        if (available.includes(p)) return p;
      }

      if (available.length > 0 && available[0]) {
        return available[0];
      }
    }
  } catch {
    // Fall back to desired model on network error
  }

  return desired;
}

/**
 * Sends prompt to Google Gemini API using BYOK.
 */
async function callGemini(
  creds: AiCredentials,
  systemPrompt: string,
  history: ChatMessage[],
  userPrompt: string,
): Promise<string> {
  const resolvedModel = await resolveGeminiModel(creds.apiKey, creds.model || 'gemini-2.5-flash');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${encodeURIComponent(creds.apiKey)}`;

  // Convert chat history to Gemini contents format
  const contents = [
    {
      role: 'user',
      parts: [{ text: `${systemPrompt}\n\nUser request: ${userPrompt}` }],
    },
  ];

  // If there's prior conversation, append recent turns
  if (history.length > 0) {
    const recent = history.slice(-4);
    for (const msg of recent) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: userPrompt }],
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const errMsg = errorBody.error?.message ?? '';

    // Auto-retry if API explicitly recommended an updated model alias
    const match = /models\/([a-zA-Z0-9.\-_]+)/.exec(errMsg);
    if (match?.[1] && match[1] !== resolvedModel) {
      const suggestedModel = match[1];
      const retryUrl = `https://generativelanguage.googleapis.com/v1beta/models/${suggestedModel}:generateContent?key=${encodeURIComponent(creds.apiKey)}`;
      const retryRes = await fetch(retryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
      });

      if (retryRes.ok) {
        const retryData = (await retryRes.json()) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>;
            };
          }>;
        };
        const text = retryData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
    }

    throw new Error(errMsg || `Gemini API error (HTTP ${response.status})`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  return text;
}

/**
 * Sends prompt to OpenAI API using BYOK.
 */
async function callOpenAI(
  creds: AiCredentials,
  systemPrompt: string,
  history: ChatMessage[],
  userPrompt: string,
): Promise<string> {
  const model = creds.model || 'gpt-4o-mini';
  const url = 'https://api.openai.com/v1/chat/completions';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-4).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userPrompt },
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creds.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(errorBody.error?.message ?? `OpenAI API error (HTTP ${response.status})`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('OpenAI returned an empty response.');
  }

  return text;
}

/**
 * Sends prompt to Azure OpenAI API (gpt-5-mini).
 */
async function callAzureOpenAI(
  creds: AiCredentials,
  systemPrompt: string,
  history: ChatMessage[],
  userPrompt: string,
): Promise<string> {
  const endpoint = (creds.azureEndpoint ?? '').replace(/\/+$/, '');
  if (!endpoint) {
    throw new Error('Azure OpenAI endpoint is not configured.');
  }
  const deployment = creds.azureDeployment ?? creds.model;
  const apiVersion = creds.azureApiVersion ?? '2024-08-01-preview';

  const candidateDeployments = Array.from(new Set([deployment, 'gpt-4o-mini'])).filter(Boolean);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-4).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userPrompt },
  ];

  let lastError = 'Azure OpenAI request failed';

  for (const dep of candidateDeployments) {
    const candidateUrls = [
      `${endpoint}/openai/v1/chat/completions`,
      `${endpoint}/openai/deployments/${dep}/chat/completions?api-version=${apiVersion}`,
    ];

    for (const url of candidateUrls) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': creds.apiKey,
            'Authorization': `Bearer ${creds.apiKey}`,
          },
          body: JSON.stringify({
            model: dep,
            messages,
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as {
            choices?: Array<{
              message?: { content?: string };
            }>;
          };
          const text = data.choices?.[0]?.message?.content;
          if (text) return text;
        } else {
          const errorBody = (await response.json().catch(() => ({}))) as {
            error?: { message?: string };
            message?: string;
          };
          lastError = errorBody.error?.message ?? errorBody.message ?? `Azure HTTP ${response.status}`;
        }
      } catch (fetchErr) {
        lastError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      }
    }
  }

  throw new Error(lastError);
}

/**
 * Dispatches query to user's selected provider.
 */
export async function askAiCopilot(
  creds: AiCredentials,
  ctx: DatasetAiContext,
  history: ChatMessage[],
  userPrompt: string,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(ctx);

  if (creds.provider === 'azure') {
    return callAzureOpenAI(creds, systemPrompt, history, userPrompt);
  }

  if (creds.provider === 'gemini') {
    return callGemini(creds, systemPrompt, history, userPrompt);
  }

  return callOpenAI(creds, systemPrompt, history, userPrompt);
}

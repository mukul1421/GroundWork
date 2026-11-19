export type AiProvider = 'gemini' | 'openai' | 'azure';

export interface AiCredentials {
  provider: AiProvider;
  apiKey: string;
  model: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
}

const BYOK_STORAGE_KEY = 'groundwork_byok_credentials';

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  azure: 'gpt-5-mini',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
};

/**
 * Manages AI credentials with pre-configured Azure OpenAI (gpt-5-mini) as the primary default.
 * Provides instant out-of-the-box showcase without requiring manual key entry.
 */
export function getSavedCredentials(): AiCredentials | null {
  // Pre-configured shared Azure OpenAI deployment (read from environment variables)
  const azureKey = (import.meta.env.VITE_AZURE_OPENAI_KEY as string | undefined) ?? '';
  const azureEndpoint = (import.meta.env.VITE_AZURE_OPENAI_ENDPOINT as string | undefined) ?? '';
  const azureDeployment = (import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT as string | undefined) ?? 'gpt-5-mini';
  const azureApiVersion = (import.meta.env.VITE_AZURE_OPENAI_API_VERSION as string | undefined) ?? '2024-08-01-preview';

  try {
    const raw = sessionStorage.getItem(BYOK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiCredentials>;
      // If user explicitly saved Azure or another provider with valid key
      if (parsed.apiKey && parsed.provider) {
        // If it was Azure, ensure deployment is gpt-5-mini
        if (parsed.provider === 'azure') {
          return {
            provider: 'azure',
            apiKey: parsed.apiKey || azureKey,
            model: parsed.azureDeployment || azureDeployment,
            azureEndpoint: parsed.azureEndpoint || azureEndpoint,
            azureDeployment: parsed.azureDeployment || azureDeployment,
            azureApiVersion: parsed.azureApiVersion || azureApiVersion,
          };
        }
        return parsed as AiCredentials;
      }
    }
  } catch {
    // ignore
  }

  // Default to Azure OpenAI showcase
  if (azureKey) {
    return {
      provider: 'azure',
      apiKey: azureKey,
      model: azureDeployment,
      azureEndpoint,
      azureDeployment,
      azureApiVersion,
    };
  }

  return null;
}

export function saveCredentials(creds: AiCredentials): void {
  sessionStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(creds));
}

export function clearCredentials(): void {
  sessionStorage.removeItem(BYOK_STORAGE_KEY);
}

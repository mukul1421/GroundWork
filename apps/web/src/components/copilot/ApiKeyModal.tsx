import React, { useState } from 'react';
import {
  saveCredentials,
  DEFAULT_MODELS,
  type AiCredentials,
  type AiProvider,
} from '@/integrations/ai/byokStorage';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (creds: AiCredentials) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onSaved }) => {
  const [provider, setProvider] = useState<AiProvider>('azure');
  const [apiKey, setApiKey] = useState(
    (import.meta.env.VITE_AZURE_OPENAI_KEY as string | undefined) ?? '',
  );
  const [azureDeployment, setAzureDeployment] = useState(
    (import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT as string | undefined) ?? 'gpt-5-mini',
  );
  const [model, setModel] = useState(DEFAULT_MODELS.azure);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleProviderChange = (p: AiProvider) => {
    setProvider(p);
    setModel(DEFAULT_MODELS[p]);
    if (p === 'azure') {
      setApiKey((import.meta.env.VITE_AZURE_OPENAI_KEY as string | undefined) ?? '');
      setAzureDeployment('gpt-5-mini');
    } else {
      setApiKey('');
    }
  };

  const handleSave = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!apiKey.trim() && provider !== 'azure') {
      setError('Please provide an API key.');
      return;
    }

    const creds: AiCredentials = {
      provider,
      apiKey: apiKey.trim(),
      model: provider === 'azure' ? azureDeployment.trim() || 'gpt-5-mini' : model,
      azureEndpoint:
        provider === 'azure'
          ? (import.meta.env.VITE_AZURE_OPENAI_ENDPOINT as string | undefined) ??
            'https://autoclip-gpt4o-mini-resource.openai.azure.com'
          : undefined,
      azureDeployment:
        provider === 'azure' ? azureDeployment.trim() || 'gpt-5-mini' : undefined,
      azureApiVersion:
        provider === 'azure'
          ? (import.meta.env.VITE_AZURE_OPENAI_API_VERSION as string | undefined) ??
            '2024-08-01-preview'
          : undefined,
    };

    saveCredentials(creds);
    onSaved(creds);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600 text-sm font-bold">
              ✨
            </span>
            <h2 className="text-sm font-bold text-slate-900">AI Copilot Settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-base"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-500 leading-relaxed">
          Groundwork AI Copilot is connected to your Azure OpenAI deployment or your personal BYOK key.
        </p>

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          {/* Provider Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Select AI Provider
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleProviderChange('azure')}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-xs font-semibold transition ${
                  provider === 'azure'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>☁️</span>
                <span>Azure OpenAI</span>
              </button>

              <button
                type="button"
                onClick={() => handleProviderChange('gemini')}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-xs font-semibold transition ${
                  provider === 'gemini'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>✨</span>
                <span>Gemini</span>
              </button>

              <button
                type="button"
                onClick={() => handleProviderChange('openai')}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center text-xs font-semibold transition ${
                  provider === 'openai'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>⚡</span>
                <span>OpenAI</span>
              </button>
            </div>
          </div>

          {/* Azure Info Card */}
          {provider === 'azure' ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900">
                <div className="flex items-center gap-2 font-bold text-blue-700">
                  <span>✓</span>
                  <span>Azure AI Resource Configured</span>
                </div>
                <p className="mt-1 text-[11px] text-blue-600">
                  Resource: <span className="font-mono">autoclip-gpt4o-mini-resource</span>
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Model Deployment Name
                </label>
                <input
                  type="text"
                  value={azureDeployment}
                  onChange={(e) => setAzureDeployment(e.target.value)}
                  placeholder="gpt-4o-mini"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Name given to the model in Azure AI Foundry &gt; Deployments (e.g. gpt-4o-mini).
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* API Key Input */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    {provider === 'gemini' ? 'Gemini API Key' : 'OpenAI API Key'}
                  </label>
                  <a
                    href={
                      provider === 'gemini'
                        ? 'https://aistudio.google.com/app/apikey'
                        : 'https://platform.openai.com/api-keys'
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-medium text-blue-600 hover:underline"
                  >
                    Get API Key →
                  </a>
                </div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider === 'gemini' ? 'AIzaSy...' : 'sk-...'}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
                />
              </div>

              {/* Model selection */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 outline-none"
                >
                  {provider === 'gemini' ? (
                    <>
                      <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended)</option>
                      <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                      <option value="gemini-1.5-flash-latest">gemini-1.5-flash-latest</option>
                    </>
                  ) : (
                    <>
                      <option value="gpt-4o-mini">gpt-4o-mini (Fast & Low Cost)</option>
                      <option value="gpt-4o">gpt-4o</option>
                    </>
                  )}
                </select>
              </div>
            </>
          )}

          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition"
            >
              Save & Activate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

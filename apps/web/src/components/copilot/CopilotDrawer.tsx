import React, { useState, useRef, useEffect, useCallback, type SyntheticEvent } from 'react';
import {
  askAiCopilot,
  type ChatMessage,
  type DatasetAiContext,
} from '@/integrations/ai/aiCopilotService';
import type { AiCredentials } from '@/integrations/ai/byokStorage';
import {
  extractPlanFromResponse,
  stripPlanFromResponse,
} from '@/engine/preprocessing/preprocessingPlan';
import { TransformationPlanCard } from './TransformationPlanCard';
import type {
  PreprocessingPlan,
  PreprocessingResult,
} from '@/engine/preprocessing/preprocessingEngine';

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenKeyModal: () => void;
  credentials: AiCredentials | null;
  datasetContext: DatasetAiContext;
  initialQuestion?: string | null;
  onClearInitialQuestion?: () => void;
  onApplyPlan?: (plan: PreprocessingPlan) => Promise<PreprocessingResult>;
  onPlanApplied?: (result: PreprocessingResult) => void;
}

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({
  isOpen,
  onClose,
  onOpenKeyModal,
  credentials,
  datasetContext,
  initialQuestion,
  onClearInitialQuestion,
  onApplyPlan,
  onPlanApplied,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = useCallback(
    async (questionText?: string) => {
      const textToSend = (questionText ?? input).trim();
      if (!textToSend || loading) return;

      if (!credentials) {
        onOpenKeyModal();
        return;
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: textToSend,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      setError(null);

      try {
        const response = await askAiCopilot(
          credentials,
          datasetContext,
          messages,
          textToSend,
        );

        const aiMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        setMessages((prev) => [...prev, aiMsg]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'AI request failed');
      } finally {
        setLoading(false);
      }
    },
    [credentials, datasetContext, input, loading, messages, onOpenKeyModal],
  );

  // Handle initial question passed from external search bar
  useEffect(() => {
    if (initialQuestion && isOpen) {
      if (!credentials) {
        onOpenKeyModal();
        return;
      }
      void handleSend(initialQuestion);
      onClearInitialQuestion?.();
    }
  }, [initialQuestion, isOpen, credentials, handleSend, onClearInitialQuestion, onOpenKeyModal]);

  if (!isOpen) return null;

  const handleFormSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    void handleSend();
  };

  const starterSuggestions = [
    'Explain key churn factors in this dataset',
    'Suggest data cleaning & preparation steps',
    'Which columns have outliers or skew?',
    'Write a Scikit-Learn pipeline for this data',
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl transition-all">
      {/* Drawer Header */}
      <div className="flex h-16 items-center justify-between border-b border-slate-100 px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-sm shadow-xs">
            ✨
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Groundwork AI Copilot</h3>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>
                {credentials
                  ? `${credentials.provider === 'azure' ? 'Azure OpenAI' : credentials.provider === 'gemini' ? 'Gemini' : 'OpenAI'} (${credentials.model})`
                  : 'Ready'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenKeyModal}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            🔑 Key
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 text-xl font-bold">
              ✨
            </div>
            <h4 className="mt-3 text-sm font-bold text-slate-800">
              Ask Anything About &ldquo;{datasetContext.datasetName}&rdquo;
            </h4>
            <p className="mt-1 max-w-xs text-xs text-slate-400 leading-relaxed">
              Your AI Copilot has full context on your {datasetContext.rowCount.toLocaleString()} rows,
              column types, nulls, and DuckDB correlation matrix.
            </p>

            {/* Quick Starters */}
            <div className="mt-6 flex flex-col gap-2 w-full text-left">
              {starterSuggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => void handleSend(sug)}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 transition"
                >
                  💬 {sug}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => {
            const plan = m.role === 'assistant' ? extractPlanFromResponse(m.content) : null;
            const textToDisplay = plan ? stripPlanFromResponse(m.content) : m.content;

            return (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl p-4 text-xs leading-relaxed shadow-xs ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-xs'
                      : 'bg-slate-50 text-slate-800 border border-slate-200/80 rounded-bl-xs'
                  }`}
                >
                  {/* Render Markdown / Plain text */}
                  <div className="whitespace-pre-wrap font-sans">{textToDisplay}</div>

                  {/* Executable Transformation Plan Card if proposed */}
                  {plan && onApplyPlan && (
                    <TransformationPlanCard
                      plan={plan}
                      onApply={onApplyPlan}
                      onAppliedSuccess={(res) => {
                        onPlanApplied?.(res);
                        const confirmMsg: ChatMessage = {
                          id: crypto.randomUUID(),
                          role: 'assistant',
                          content: `✅ Transformation plan **"${plan.title}"** applied!\nCreated new dataset version with **${res.transformedRowCount.toLocaleString()} rows** and **${res.transformedColumnCount} columns** in ${res.durationMs}ms.`,
                          timestamp: new Date().toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          }),
                        };
                        setMessages((prev) => [...prev, confirmMsg]);
                      }}
                    />
                  )}
                </div>
                <span className="mt-1 text-[10px] text-slate-400 px-1">{m.timestamp}</span>
              </div>
            );
          })
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500 w-fit">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span>Analyzing dataset & formulating answer...</span>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            ⚠️ {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box Footer */}
      <div className="border-t border-slate-100 p-4 bg-white">
        <form onSubmit={handleFormSubmit} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              credentials
                ? 'Ask AI about your data, patterns, or transformations...'
                : 'Set API key to chat with AI...'
            }
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 pr-12 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-40"
          >
            <span className="text-xs -rotate-45">➤</span>
          </button>
        </form>
        <p className="mt-2 text-center text-[10px] text-slate-400">
          BYOK: Keys remain in session memory and are never persisted to database.
        </p>
      </div>
    </div>
  );
};

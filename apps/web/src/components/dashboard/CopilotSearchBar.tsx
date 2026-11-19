import React, { useState, type SyntheticEvent } from 'react';

interface CopilotSearchBarProps {
  onAsk?: (question: string) => void;
}

export const CopilotSearchBar: React.FC<CopilotSearchBarProps> = ({ onAsk }) => {
  const [prompt, setPrompt] = useState('');

  const suggestions = [
    'What are the top 5 products by revenue?',
    'Show distribution of CreditScore',
    'Which region has highest churn?',
  ];

  const handleSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    onAsk?.(prompt);
  };

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
      <div>
        <label className="text-xs font-semibold text-slate-800 block mb-2">
          Ask a question about your data
        </label>
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask anything about your data..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 pr-10 text-xs text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            className="absolute right-2 flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-50"
            disabled={!prompt.trim()}
          >
            <span className="text-xs -rotate-45">➤</span>
          </button>
        </form>
      </div>

      {/* Suggestion Chips matching reference mockup */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-1">
        {suggestions.map((sug) => (
          <button
            key={sug}
            type="button"
            onClick={() => {
              setPrompt(sug);
              onAsk?.(sug);
            }}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          >
            {sug}
          </button>
        ))}
      </div>
    </div>
  );
};

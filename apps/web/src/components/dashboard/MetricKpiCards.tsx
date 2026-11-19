import React from 'react';

interface MetricKpiCardsProps {
  totalRows: number;
  totalColumns: number;
  missingRate: number;
  duplicateCount: number;
}

export const MetricKpiCards: React.FC<MetricKpiCardsProps> = ({
  totalRows,
  totalColumns,
  missingRate,
  duplicateCount,
}) => {
  const qualityScore = Math.max(0, 100 - missingRate * 5 - (duplicateCount > 0 ? 5 : 0));

  const cards = [
    {
      title: 'Total Records',
      value: totalRows.toLocaleString(),
      badge: '+100% parsed',
      badgeColor: 'text-emerald-600 bg-emerald-50',
      iconBg: 'bg-blue-600 text-white',
      icon: '📊',
      sparkColor: '#2563eb',
      sparkPath: 'M 0 18 Q 20 8, 40 14 T 80 4 T 120 10',
    },
    {
      title: 'Total Features',
      value: `${totalColumns} cols`,
      badge: '100% verified',
      badgeColor: 'text-emerald-600 bg-emerald-50',
      iconBg: 'bg-emerald-500 text-white',
      icon: '🗂️',
      sparkColor: '#10b981',
      sparkPath: 'M 0 12 Q 25 18, 50 8 T 90 14 T 120 6',
    },
    {
      title: 'Missing Rate',
      value: `${missingRate.toFixed(1)}%`,
      badge: missingRate === 0 ? '✓ Zero missing' : 'Imputation needed',
      badgeColor: missingRate === 0 ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50',
      iconBg: 'bg-purple-600 text-white',
      icon: '📑',
      sparkColor: '#8b5cf6',
      sparkPath: 'M 0 16 Q 30 10, 60 14 T 100 8 T 120 12',
    },
    {
      title: 'Quality Score',
      value: `${qualityScore.toFixed(1)}%`,
      badge: duplicateCount === 0 ? '0 duplicates' : `${duplicateCount} dups`,
      badgeColor: duplicateCount === 0 ? 'text-teal-600 bg-teal-50' : 'text-rose-600 bg-rose-50',
      iconBg: 'bg-cyan-500 text-white',
      icon: '%',
      sparkColor: '#06b6d4',
      sparkPath: 'M 0 14 Q 25 6, 50 12 T 90 4 T 120 8',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.title}
          className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">{c.title}</span>
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shadow-xs ${c.iconBg}`}
            >
              {c.icon}
            </div>
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight text-slate-900">{c.value}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.badgeColor}`}>
                {c.badge}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">vs original snapshot</span>
          </div>

          {/* Mini Sparkline SVG curve */}
          <div className="mt-2 w-full pt-1">
            <svg viewBox="0 0 120 20" className="h-6 w-full overflow-visible">
              <path
                d={c.sparkPath}
                fill="none"
                stroke={c.sparkColor}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
};

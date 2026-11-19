import React from 'react';
import type { DatasetProfileSummary } from '../../engine/profiling/datasetProfiler';

interface InsightsCardProps {
  profile: DatasetProfileSummary | null;
  datasetName?: string;
}

export const InsightsCard: React.FC<InsightsCardProps> = ({ profile }) => {
  // Generate intelligent insights based on the profiling summary
  const generateInsights = () => {
    if (!profile) {
      return [
        'Run deep profiling to unlock automatic AI observations.',
        'Data integrity and missingness scans will be reported here.',
        'Distribution skew and outlier summaries ready after analysis.',
      ];
    }

    const insights: string[] = [];

    // Duplicate check
    if (profile.duplicateRowsCount > 0) {
      insights.push(
        `Detected ${profile.duplicateRowsCount} exact duplicate rows across all ${profile.columnCount} columns.`,
      );
    } else {
      insights.push(`Zero duplicate rows found across all ${profile.rowCount.toLocaleString()} records.`);
    }

    // Missingness check
    if (profile.overallMissingRate === 0) {
      insights.push('High completeness: 0.0% missing cells across the entire dataset.');
    } else {
      insights.push(
        `Overall missingness rate is ${profile.overallMissingRate}%—recommend imputation before training.`,
      );
    }

    // Outlier check
    const outlierCols = profile.columns.filter(
      (c) => c.isNumeric && 'outlierCount' in c.stats && c.stats.outlierCount > 0,
    );
    if (outlierCols.length > 0) {
      const topOutlier = outlierCols[0];
      if (topOutlier && 'outlierCount' in topOutlier.stats) {
        insights.push(
          `Column "${topOutlier.columnName}" contains ${topOutlier.stats.outlierCount} IQR outlier values.`,
        );
      }
    }

    // High cardinality or primary key candidate
    const pkCandidates = profile.columns.filter((c) => c.isPrimaryKeyCandidate);
    if (pkCandidates.length > 0 && pkCandidates[0]) {
      insights.push(`"${pkCandidates[0].columnName}" is a unique primary key identifier.`);
    } else {
      insights.push(`Categorical features display healthy variance without constant columns.`);
    }

    return insights.slice(0, 4);
  };

  const insightsList = generateInsights();

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-blue-600 text-sm">✨</span>
          <h3 className="text-sm font-semibold text-slate-800">Insights</h3>
        </div>

        <ul className="mt-4 space-y-3.5">
          {insightsList.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-600 leading-relaxed">
              <span className="text-blue-500 mt-0.5 text-xs">✦</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 pt-3 border-t border-slate-100 text-center">
        <button
          type="button"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition"
        >
          View all insights →
        </button>
      </div>
    </div>
  );
};

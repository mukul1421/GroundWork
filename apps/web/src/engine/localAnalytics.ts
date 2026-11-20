import type {
  ColumnProfileSummary,
  DatasetProfileSummary,
  NumericStats,
  CategoricalFrequency,
} from '@/engine/profiling/datasetProfiler';
import type { CorrelationMatrixResult } from '@/engine/eda/correlationMatrix';
import type { PreprocessingPlan } from '@/engine/preprocessing/preprocessingEngine';

export interface HistogramBin {
  label: string;
  rangeLabel: string;
  low: number;
  high: number;
  count: number;
}

export interface DataInsight {
  id: string;
  severity: 'high' | 'medium' | 'info';
  title: string;
  summary: string;
  explanation: string;
  actionType: 'impute' | 'drop_columns' | 'outlier_treatment' | 'encode' | 'deduplicate' | 'scale';
  column?: string;
  actionPrompt: string;
}

export interface LocalTransformOutput {
  rows: Record<string, unknown>[];
  columns: string[];
  originalRowCount: number;
  transformedRowCount: number;
  originalColumnCount: number;
  transformedColumnCount: number;
  summaryBullets: string[];
  durationMs: number;
}

function isNullish(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') {
    const trimmed = val.trim().toLowerCase();
    return trimmed === '' || trimmed === 'null' || trimmed === 'na' || trimmed === 'n/a' || trimmed === 'nan';
  }
  if (typeof val === 'number') return Number.isNaN(val);
  return false;
}

function toFiniteNumber(val: unknown): number | null {
  if (isNullish(val)) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'boolean') return null;
  const parsed = Number(String(val).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function quantileSorted(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0] ?? null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const low = sorted[base] ?? sorted[sorted.length - 1]!;
  const high = sorted[base + 1] ?? low;
  return low + rest * (high - low);
}

/**
 * Pure, deterministic in-memory dataset profiler matching DatasetProfileSummary.
 * Note: overallMissingRate and missingPercent are returned on a 0..100 percentage scale.
 */
export function profileRows(rows: Record<string, unknown>[], explicitColumns?: string[]): DatasetProfileSummary {
  const columnsList =
    explicitColumns && explicitColumns.length > 0
      ? explicitColumns
      : rows.length > 0
        ? Object.keys(rows[0]!)
        : [];

  const rowCount = rows.length;
  const columnCount = columnsList.length;

  if (rowCount === 0 || columnCount === 0) {
    return {
      rowCount,
      columnCount,
      duplicateRowsCount: 0,
      constantColumnsCount: 0,
      overallMissingRate: 0,
      columns: [],
    };
  }

  // Exact duplicate row count
  const seenRowKeys = new Set<string>();
  let duplicateRowsCount = 0;
  for (const row of rows) {
    const key = columnsList
      .map((col) => {
        const v = row[col];
        return isNullish(v) ? '__NULL__' : String(v);
      })
      .join('\u001f');
    if (seenRowKeys.has(key)) {
      duplicateRowsCount++;
    } else {
      seenRowKeys.add(key);
    }
  }

  let totalMissingCells = 0;
  let constantColumnsCount = 0;
  const columnProfiles: ColumnProfileSummary[] = [];

  for (const colName of columnsList) {
    let missingCount = 0;
    const nonNullRaw: unknown[] = [];
    const numericVals: number[] = [];
    const distinctSet = new Set<string>();

    for (const row of rows) {
      const val = row[colName];
      if (isNullish(val)) {
        missingCount++;
      } else {
        nonNullRaw.push(val);
        distinctSet.add(String(val));
        const num = toFiniteNumber(val);
        if (num !== null) {
          numericVals.push(num);
        }
      }
    }

    const nonNullCount = nonNullRaw.length;
    const isNumeric = nonNullCount > 0 && numericVals.length / nonNullCount >= 0.9;
    const isInteger = isNumeric && numericVals.every((n) => Number.isInteger(n));
    const inferredType = isNumeric ? (isInteger ? 'BIGINT' : 'DOUBLE') : 'VARCHAR';

    const distinctCount = distinctSet.size;
    const missingPercent = Number(((missingCount / rowCount) * 100).toFixed(2));
    const uniquenessPercent = Number(((distinctCount / rowCount) * 100).toFixed(2));
    const isConstant = distinctCount === 1;
    const isPrimaryKeyCandidate = distinctCount === rowCount && missingCount === 0;

    totalMissingCells += missingCount;
    if (isConstant) constantColumnsCount++;

    let stats: NumericStats | { topFrequencies: CategoricalFrequency[] };

    if (isNumeric) {
      const sorted = [...numericVals].sort((a, b) => a - b);
      const min = sorted[0] ?? null;
      const max = sorted[sorted.length - 1] ?? null;
      const mean =
        sorted.length > 0 ? sorted.reduce((acc, n) => acc + n, 0) / sorted.length : null;
      const variance =
        mean !== null && sorted.length > 1
          ? sorted.reduce((acc, n) => acc + (n - mean) ** 2, 0) / (sorted.length - 1)
          : 0;
      const stddev = mean !== null ? Math.sqrt(variance) : null;
      const q25 = quantileSorted(sorted, 0.25);
      const median = quantileSorted(sorted, 0.5);
      const q75 = quantileSorted(sorted, 0.75);
      const iqr = q25 !== null && q75 !== null ? q75 - q25 : null;

      let outlierCount = 0;
      if (iqr !== null && q25 !== null && q75 !== null && iqr > 0) {
        const lower = q25 - 1.5 * iqr;
        const upper = q75 + 1.5 * iqr;
        for (const n of sorted) {
          if (n < lower || n > upper) outlierCount++;
        }
      }

      stats = {
        min,
        max,
        mean: mean !== null ? Number(mean.toFixed(4)) : null,
        stddev: stddev !== null ? Number(stddev.toFixed(4)) : null,
        median: median !== null ? Number(median.toFixed(4)) : null,
        q25: q25 !== null ? Number(q25.toFixed(4)) : null,
        q75: q75 !== null ? Number(q75.toFixed(4)) : null,
        iqr: iqr !== null ? Number(iqr.toFixed(4)) : null,
        outlierCount,
      };
    } else {
      const counts = new Map<string, number>();
      for (const v of nonNullRaw) {
        const k = String(v);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const topFrequencies: CategoricalFrequency[] = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({
          value,
          count,
          percent: Number(((count / rowCount) * 100).toFixed(2)),
        }));
      stats = { topFrequencies };
    }

    columnProfiles.push({
      columnName: colName,
      inferredType,
      isNumeric,
      nullable: missingCount > 0,
      missingCount,
      missingPercent,
      distinctCount,
      uniquenessPercent,
      isConstant,
      isPrimaryKeyCandidate,
      stats,
    });
  }

  const totalCells = rowCount * columnCount;
  const overallMissingRate = totalCells > 0 ? Number(((totalMissingCells / totalCells) * 100).toFixed(2)) : 0;

  return {
    rowCount,
    columnCount,
    duplicateRowsCount,
    constantColumnsCount,
    overallMissingRate,
    columns: columnProfiles,
  };
}

/**
 * Computes exact pairwise Pearson correlation matrix for numeric columns.
 */
export function computeCorrelationFromRows(
  rows: Record<string, unknown>[],
  numericColumns: string[],
): CorrelationMatrixResult {
  const cols = numericColumns.slice(0, 12);
  const n = cols.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i]![i] = 1.0;
    for (let j = i + 1; j < n; j++) {
      const colA = cols[i]!;
      const colB = cols[j]!;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const row of rows) {
        const a = toFiniteNumber(row[colA]);
        const b = toFiniteNumber(row[colB]);
        if (a !== null && b !== null) {
          xs.push(a);
          ys.push(b);
        }
      }

      let r = 0;
      if (xs.length >= 2) {
        const meanX = xs.reduce((s, v) => s + v, 0) / xs.length;
        const meanY = ys.reduce((s, v) => s + v, 0) / ys.length;
        let num = 0;
        let denX = 0;
        let denY = 0;
        for (let k = 0; k < xs.length; k++) {
          const dx = xs[k]! - meanX;
          const dy = ys[k]! - meanY;
          num += dx * dy;
          denX += dx * dx;
          denY += dy * dy;
        }
        const denom = Math.sqrt(denX * denY);
        if (denom > 0) {
          r = Number(Math.max(-1, Math.min(1, num / denom)).toFixed(2));
        }
      }
      matrix[i]![j] = r;
      matrix[j]![i] = r;
    }
  }

  return { columns: cols, matrix };
}

/**
 * Computes accurate histogram bins for a numeric column (zero-count bins remain 0, never faked as 1).
 */
export function computeHistogramBins(
  rows: Record<string, unknown>[],
  columnName: string,
  binCount = 10,
): HistogramBin[] {
  const values: number[] = [];
  for (const r of rows) {
    const num = toFiniteNumber(r[columnName]);
    if (num !== null) values.push(num);
  }
  if (values.length === 0) return [];

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  if (minVal === maxVal) {
    return [
      {
        label: minVal.toFixed(0),
        rangeLabel: `${minVal.toFixed(1)}`,
        low: minVal,
        high: maxVal,
        count: values.length,
      },
    ];
  }

  const safeBins = Math.max(3, Math.min(20, binCount));
  const step = (maxVal - minVal) / safeBins;
  const bins: HistogramBin[] = [];

  for (let i = 0; i < safeBins; i++) {
    const low = minVal + i * step;
    const high = low + step;
    const count = values.filter((v) =>
      i === safeBins - 1 ? v >= low && v <= high : v >= low && v < high,
    ).length;
    const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(1));
    bins.push({
      label: fmt(low),
      rangeLabel: `${fmt(low)}–${fmt(high)}`,
      low,
      high,
      count,
    });
  }

  return bins;
}

/**
 * Computes dataset quality score on 0..100 scale cleanly from real profile metrics.
 */
export function computeQualityScore(profile: DatasetProfileSummary | null): number {
  if (!profile || profile.rowCount === 0) return 0;
  const missingPenalty = Math.min(profile.overallMissingRate * 1.8, 45);
  const duplicateRate = (profile.duplicateRowsCount / profile.rowCount) * 100;
  const duplicatePenalty = Math.min(duplicateRate * 1.5, 25);
  const outlierTotal = profile.columns.reduce(
    (sum, c) => sum + (c.isNumeric && 'outlierCount' in c.stats ? c.stats.outlierCount : 0),
    0,
  );
  const outlierPenalty = Math.min((outlierTotal / Math.max(profile.rowCount, 1)) * 20, 15);
  return Math.max(0, Math.min(100, Math.round(100 - missingPenalty - duplicatePenalty - outlierPenalty)));
}

/**
 * Generates real, data-driven insights strictly from the active dataset's profile & correlations.
 */
export function generateDataInsights(
  profile: DatasetProfileSummary | null,
  correlation: CorrelationMatrixResult | null,
): DataInsight[] {
  if (!profile || profile.columns.length === 0) return [];
  const insights: DataInsight[] = [];

  // 1. Highest missing-value column
  const missingCols = [...profile.columns]
    .filter((c) => c.missingCount > 0)
    .sort((a, b) => b.missingPercent - a.missingPercent);

  if (missingCols.length > 0) {
    const top = missingCols[0]!;
    insights.push({
      id: `missing-${top.columnName}`,
      severity: top.missingPercent >= 10 ? 'high' : 'medium',
      title: `Missing values in ${top.columnName} (${top.missingPercent.toFixed(1)}%)`,
      summary: `${top.missingCount.toLocaleString()} missing entries detected across ${profile.rowCount.toLocaleString()} rows. ${
        top.missingPercent >= 50
          ? 'Dropping this sparse feature is recommended.'
          : top.isNumeric
            ? 'Median imputation preserves distribution without leakage.'
            : 'Mode imputation prevents sample loss during encoding.'
      }`,
      explanation: `Column "${top.columnName}" (${top.inferredType}) has ${top.missingCount} null records (${top.missingPercent.toFixed(1)}%). Fitting a ${
        top.isNumeric ? 'median' : 'most-frequent'
      } imputer strictly on training folds avoids data leakage while retaining ${profile.rowCount.toLocaleString()} observations.`,
      actionType: top.missingPercent >= 50 ? 'drop_columns' : 'impute',
      column: top.columnName,
      actionPrompt:
        top.missingPercent >= 50
          ? `Drop high-null column "${top.columnName}"`
          : `Impute missing values in "${top.columnName}" using ${top.isNumeric ? 'median' : 'mode'}`,
    });
  }

  // 2. Duplicate rows
  if (profile.duplicateRowsCount > 0) {
    insights.push({
      id: 'duplicates',
      severity: 'medium',
      title: `${profile.duplicateRowsCount.toLocaleString()} duplicate rows detected`,
      summary: `Duplicate observations inflate validation metrics and bias tree splits. Deduplicating retains ${(
        profile.rowCount - profile.duplicateRowsCount
      ).toLocaleString()} unique records.`,
      explanation: `Exact row matching across all ${profile.columnCount} columns found ${profile.duplicateRowsCount} repeated rows. Removing duplicates before train/test splitting prevents identical samples from leaking across partitions.`,
      actionType: 'deduplicate',
      actionPrompt: 'Remove exact duplicate rows from the dataset',
    });
  }

  // 3. Outliers in numeric columns
  const outlierCols = profile.columns
    .filter((c) => c.isNumeric && 'outlierCount' in c.stats && c.stats.outlierCount > 0)
    .sort((a, b) => {
      const oa = a.isNumeric && 'outlierCount' in a.stats ? a.stats.outlierCount : 0;
      const ob = b.isNumeric && 'outlierCount' in b.stats ? b.stats.outlierCount : 0;
      return ob - oa;
    });

  if (outlierCols.length > 0) {
    const topOut = outlierCols[0]!;
    const outCount = topOut.isNumeric && 'outlierCount' in topOut.stats ? topOut.stats.outlierCount : 0;
    insights.push({
      id: `outliers-${topOut.columnName}`,
      severity: 'medium',
      title: `${outCount.toLocaleString()} IQR outliers in ${topOut.columnName}`,
      summary: `Extreme tail values fall outside [Q1 − 1.5×IQR, Q3 + 1.5×IQR]. Clipping bounds stabilizes linear and gradient-based models.`,
      explanation: `Column "${topOut.columnName}" exhibits ${outCount} observations beyond the Tukey 1.5× IQR fence. Winsorization / IQR clipping preserves row count while bounding extreme leverage points.`,
      actionType: 'outlier_treatment',
      column: topOut.columnName,
      actionPrompt: `Clip extreme outliers in "${topOut.columnName}" using 1.5 IQR boundary`,
    });
  }

  // 4. Primary key / ID candidates or categorical encoding suggestion
  const pkCandidate = profile.columns.find(
    (c) =>
      c.isPrimaryKeyCandidate &&
      (c.columnName.toLowerCase().includes('id') || !c.isNumeric),
  );
  if (pkCandidate && insights.length < 4) {
    insights.push({
      id: `identifier-${pkCandidate.columnName}`,
      severity: 'info',
      title: `Identifier column detected: ${pkCandidate.columnName}`,
      summary: `100% unique values (${pkCandidate.distinctCount.toLocaleString()} keys). Drop before model training to prevent memorization.`,
      explanation: `"${pkCandidate.columnName}" has unique values on every row with zero nulls, indicating a surrogate identifier. Excluding IDs from feature matrices prevents overfitting.`,
      actionType: 'drop_columns',
      column: pkCandidate.columnName,
      actionPrompt: `Drop identifier column "${pkCandidate.columnName}"`,
    });
  }

  // 5. Strongest correlation or low-cardinality categorical encoding
  if (correlation && correlation.columns.length >= 2 && insights.length < 4) {
    let bestA = '';
    let bestB = '';
    let bestAbs = 0;
    let bestVal = 0;
    for (let i = 0; i < correlation.columns.length; i++) {
      for (let j = i + 1; j < correlation.columns.length; j++) {
        const val = correlation.matrix[i]?.[j] ?? 0;
        if (Math.abs(val) > bestAbs) {
          bestAbs = Math.abs(val);
          bestVal = val;
          bestA = correlation.columns[i]!;
          bestB = correlation.columns[j]!;
        }
      }
    }
    if (bestAbs >= 0.45 && bestA && bestB) {
      insights.push({
        id: `corr-${bestA}-${bestB}`,
        severity: 'info',
        title: `Strong correlation between ${bestA} and ${bestB} (r = ${bestVal.toFixed(2)})`,
        summary: `Strong ${bestVal > 0 ? 'positive' : 'negative'} linear relationship detected. Consider standard scaling before fitting regularized models.`,
        explanation: `Pearson correlation between "${bestA}" and "${bestB}" is ${bestVal.toFixed(2)}. Standardizing numeric features aligns coefficient scales and accelerates convergence.`,
        actionType: 'scale',
        column: bestA,
        actionPrompt: `Apply standard scaling to numeric columns "${bestA}" and "${bestB}"`,
      });
    }
  }

  const lowCardCat = profile.columns.find(
    (c) => !c.isNumeric && c.distinctCount >= 2 && c.distinctCount <= 8 && !c.isPrimaryKeyCandidate,
  );
  if (lowCardCat && insights.length < 3) {
    insights.push({
      id: `encode-${lowCardCat.columnName}`,
      severity: 'info',
      title: `Ready for encoding: ${lowCardCat.columnName} (${lowCardCat.distinctCount} categories)`,
      summary: `Low-cardinality categorical feature ideal for one-hot encoding into numeric indicator columns.`,
      explanation: `"${lowCardCat.columnName}" contains ${lowCardCat.distinctCount} distinct categories. One-hot encoding converts nominal labels into clean binary vectors for scikit-learn estimators.`,
      actionType: 'encode',
      column: lowCardCat.columnName,
      actionPrompt: `One-hot encode categorical column "${lowCardCat.columnName}"`,
    });
  }

  return insights.slice(0, 4);
}

/**
 * Deterministic built-in Copilot planner that translates natural language preprocessing requests
 * into valid, column-verified PreprocessingPlan objects without requiring external API keys.
 */
export function proposePlanFromPrompt(
  prompt: string,
  profile: DatasetProfileSummary | null,
): { message: string; plan: PreprocessingPlan | null } {
  if (!profile || profile.columns.length === 0) {
    return {
      message: 'Dataset profiling has not completed yet. Load or profile the dataset before planning transformations.',
      plan: null,
    };
  }

  const lower = prompt.toLowerCase();
  const colNames = profile.columns.map((c) => c.columnName);
  const mentionedCols = colNames.filter((name) => lower.includes(name.toLowerCase()));

  const ops: PreprocessingPlan['operations'] = [];
  const explanations: string[] = [];

  // Deduplication
  if (lower.includes('dedup') || lower.includes('duplicate')) {
    ops.push({ type: 'deduplicate' });
    explanations.push(
      `Remove ${profile.duplicateRowsCount.toLocaleString()} exact duplicate rows while preserving original ordering.`,
    );
  }

  // Drop columns
  if (lower.includes('drop') || lower.includes('remove column')) {
    const targets =
      mentionedCols.length > 0
        ? mentionedCols
        : profile.columns
            .filter(
              (c) =>
                c.missingPercent >= 40 ||
                (c.isPrimaryKeyCandidate && c.columnName.toLowerCase().includes('id')),
            )
            .map((c) => c.columnName);
    if (targets.length > 0) {
      ops.push({ type: 'drop_columns', columns: targets });
      explanations.push(`Drop ${targets.join(', ')} to eliminate sparse or non-predictive identifier columns.`);
    }
  }

  // Impute missing values
  if (lower.includes('impute') || lower.includes('missing') || lower.includes('null') || lower.includes('clean')) {
    const numTargets = (
      mentionedCols.length > 0
        ? profile.columns.filter((c) => mentionedCols.includes(c.columnName) && c.isNumeric)
        : profile.columns.filter((c) => c.isNumeric && c.missingCount > 0)
    ).map((c) => c.columnName);

    const catTargets = (
      mentionedCols.length > 0
        ? profile.columns.filter((c) => mentionedCols.includes(c.columnName) && !c.isNumeric)
        : profile.columns.filter((c) => !c.isNumeric && c.missingCount > 0)
    ).map((c) => c.columnName);

    if (numTargets.length > 0) {
      const strategy = lower.includes('mean') ? 'mean' : lower.includes('zero') ? 'constant' : 'median';
      ops.push({
        type: 'impute',
        columns: numTargets,
        strategy,
        ...(strategy === 'constant' ? { constantValue: 0 } : {}),
      });
      explanations.push(`Impute numeric nulls in ${numTargets.join(', ')} with column ${strategy}.`);
    }
    if (catTargets.length > 0) {
      ops.push({ type: 'impute', columns: catTargets, strategy: 'mode' });
      explanations.push(`Impute categorical nulls in ${catTargets.join(', ')} with most-frequent mode.`);
    }
  }

  // Outliers
  if (lower.includes('outlier') || lower.includes('clip') || lower.includes('iqr') || lower.includes('cap')) {
    const targets = (
      mentionedCols.length > 0
        ? profile.columns.filter((c) => mentionedCols.includes(c.columnName) && c.isNumeric)
        : profile.columns.filter(
            (c) => c.isNumeric && 'outlierCount' in c.stats && c.stats.outlierCount > 0,
          )
    ).map((c) => c.columnName);

    const finalTargets =
      targets.length > 0
        ? targets
        : profile.columns.filter((c) => c.isNumeric && !c.isPrimaryKeyCandidate).slice(0, 2).map((c) => c.columnName);

    if (finalTargets.length > 0) {
      ops.push({
        type: 'outlier_treatment',
        columns: finalTargets,
        strategy: 'clip_iqr',
        multiplier: 1.5,
      });
      explanations.push(`Clip extreme values in ${finalTargets.join(', ')} to the 1.5× IQR fence.`);
    }
  }

  // Scaling
  if (lower.includes('scale') || lower.includes('normaliz') || lower.includes('standard') || lower.includes('log1p')) {
    const targets = (
      mentionedCols.length > 0
        ? profile.columns.filter((c) => mentionedCols.includes(c.columnName) && c.isNumeric)
        : profile.columns.filter((c) => c.isNumeric && !c.isPrimaryKeyCandidate).slice(0, 3)
    ).map((c) => c.columnName);

    if (targets.length > 0) {
      const strategy = lower.includes('minmax') ? 'minmax' : lower.includes('log') ? 'log1p' : 'standard';
      ops.push({ type: 'scale', columns: targets, strategy });
      explanations.push(`Apply ${strategy} scaling to ${targets.join(', ')}.`);
    }
  }

  // Categorical encoding
  if (lower.includes('encode') || lower.includes('one-hot') || lower.includes('one_hot') || lower.includes('categorical')) {
    const targets = (
      mentionedCols.length > 0
        ? profile.columns.filter((c) => mentionedCols.includes(c.columnName) && !c.isNumeric)
        : profile.columns
            .filter((c) => !c.isNumeric && !c.isPrimaryKeyCandidate && c.distinctCount >= 2 && c.distinctCount <= 10)
            .slice(0, 2)
    ).map((c) => c.columnName);

    if (targets.length > 0) {
      ops.push({ type: 'encode', columns: targets, strategy: 'one_hot', dropOriginal: true });
      explanations.push(`One-hot encode ${targets.join(', ')} into binary numeric indicators.`);
    }
  }

  // Full cleanup fallback when user says "prepare" or "full pipeline"
  if (ops.length === 0 && (lower.includes('prepare') || lower.includes('pipeline') || lower.includes('auto'))) {
    if (profile.duplicateRowsCount > 0) {
      ops.push({ type: 'deduplicate' });
      explanations.push(`Deduplicate ${profile.duplicateRowsCount} repeated rows.`);
    }
    const numNulls = profile.columns.filter((c) => c.isNumeric && c.missingCount > 0).map((c) => c.columnName);
    if (numNulls.length > 0) {
      ops.push({ type: 'impute', columns: numNulls, strategy: 'median' });
      explanations.push(`Impute missing values in ${numNulls.join(', ')} with median.`);
    }
    const outCols = profile.columns
      .filter((c) => c.isNumeric && 'outlierCount' in c.stats && c.stats.outlierCount > 0)
      .map((c) => c.columnName);
    if (outCols.length > 0) {
      ops.push({ type: 'outlier_treatment', columns: outCols, strategy: 'clip_iqr', multiplier: 1.5 });
      explanations.push(`Clip IQR outliers in ${outCols.join(', ')}.`);
    }
  }

  if (ops.length === 0) {
    return {
      message: `No matching anomalies required transformation for "${prompt}". Try requesting missing value imputation, duplicate removal, IQR outlier clipping, standard scaling, or one-hot encoding on specific columns (${colNames.slice(0, 5).join(', ')}).`,
      plan: null,
    };
  }

  return {
    message: explanations.join(' '),
    plan: {
      title: `Prepared Transformation Plan (${ops.length} step${ops.length > 1 ? 's' : ''})`,
      description: explanations.join(' '),
      operations: ops,
    },
  };
}

/**
 * Pure immutable transformation executor for browser-local datasets.
 * Returns a brand-new row array and column list without mutating inputs.
 */
export function applyPlanToRows(
  sourceRows: Record<string, unknown>[],
  sourceColumns: string[],
  plan: PreprocessingPlan,
): LocalTransformOutput {
  const start = performance.now();
  let rows = sourceRows.map((r) => ({ ...r }));
  let columns = [...sourceColumns];
  const summaryBullets: string[] = [];

  for (const op of plan.operations) {
    switch (op.type) {
      case 'deduplicate': {
        const before = rows.length;
        const seen = new Set<string>();
        rows = rows.filter((row) => {
          const key = columns
            .map((c) => (isNullish(row[c]) ? '__NULL__' : String(row[c])))
            .join('\u001f');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        summaryBullets.push(`Removed ${before - rows.length} duplicate rows.`);
        break;
      }

      case 'drop_columns': {
        const dropSet = new Set(op.columns);
        const removed = columns.filter((c) => dropSet.has(c));
        columns = columns.filter((c) => !dropSet.has(c));
        rows = rows.map((row) => {
          const next: Record<string, unknown> = {};
          for (const c of columns) next[c] = row[c];
          return next;
        });
        if (removed.length > 0) {
          summaryBullets.push(`Dropped columns: ${removed.join(', ')}.`);
        }
        break;
      }

      case 'impute': {
        for (const col of op.columns) {
          if (!columns.includes(col)) continue;
          let fillVal: unknown = op.constantValue ?? 0;

          if (op.strategy === 'median' || op.strategy === 'mean') {
            const nums = rows
              .map((r) => toFiniteNumber(r[col]))
              .filter((v): v is number => v !== null)
              .sort((a, b) => a - b);
            if (nums.length > 0) {
              const computed =
                op.strategy === 'mean'
                  ? nums.reduce((a, b) => a + b, 0) / nums.length
                  : (quantileSorted(nums, 0.5) ?? 0);
              fillVal = Number(computed.toFixed(2));
            }
          } else if (op.strategy === 'mode') {
            const counts = new Map<string, number>();
            for (const r of rows) {
              if (!isNullish(r[col])) {
                const k = String(r[col]);
                counts.set(k, (counts.get(k) ?? 0) + 1);
              }
            }
            const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
            fillVal = top ? top[0] : 'Unknown';
          }

          let filledCount = 0;
          rows = rows.map((r) => {
            if (isNullish(r[col])) {
              filledCount++;
              return { ...r, [col]: fillVal };
            }
            return r;
          });
          summaryBullets.push(`Imputed ${filledCount} nulls in ${col} (${op.strategy}: ${String(fillVal)}).`);
        }
        break;
      }

      case 'outlier_treatment': {
        const mult = op.multiplier ?? 1.5;
        for (const col of op.columns) {
          if (!columns.includes(col)) continue;
          const nums = rows
            .map((r) => toFiniteNumber(r[col]))
            .filter((v): v is number => v !== null)
            .sort((a, b) => a - b);
          const q25 = quantileSorted(nums, 0.25);
          const q75 = quantileSorted(nums, 0.75);
          if (q25 === null || q75 === null) continue;
          const iqr = q75 - q25;
          if (iqr <= 0) continue;
          const lower = Number((q25 - mult * iqr).toFixed(2));
          const upper = Number((q75 + mult * iqr).toFixed(2));

          if (op.strategy === 'drop_rows') {
            const before = rows.length;
            rows = rows.filter((r) => {
              const v = toFiniteNumber(r[col]);
              return v === null || (v >= lower && v <= upper);
            });
            summaryBullets.push(`Removed ${before - rows.length} outlier rows in ${col}.`);
          } else {
            let clipped = 0;
            rows = rows.map((r) => {
              const v = toFiniteNumber(r[col]);
              if (v === null) return r;
              if (v < lower) {
                clipped++;
                return { ...r, [col]: lower };
              }
              if (v > upper) {
                clipped++;
                return { ...r, [col]: upper };
              }
              return r;
            });
            summaryBullets.push(`Clipped ${clipped} outliers in ${col} to [${lower}, ${upper}].`);
          }
        }
        break;
      }

      case 'scale': {
        for (const col of op.columns) {
          if (!columns.includes(col)) continue;
          const nums = rows
            .map((r) => toFiniteNumber(r[col]))
            .filter((v): v is number => v !== null);
          if (nums.length === 0) continue;

          if (op.strategy === 'standard') {
            const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
            const std =
              Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(nums.length - 1, 1)) || 1;
            rows = rows.map((r) => {
              const v = toFiniteNumber(r[col]);
              return v === null ? r : { ...r, [col]: Number(((v - mean) / std).toFixed(4)) };
            });
          } else if (op.strategy === 'minmax') {
            const min = Math.min(...nums);
            const max = Math.max(...nums);
            const range = max - min || 1;
            rows = rows.map((r) => {
              const v = toFiniteNumber(r[col]);
              return v === null ? r : { ...r, [col]: Number(((v - min) / range).toFixed(4)) };
            });
          } else if (op.strategy === 'log1p') {
            rows = rows.map((r) => {
              const v = toFiniteNumber(r[col]);
              return v === null || v <= -1 ? r : { ...r, [col]: Number(Math.log1p(v).toFixed(4)) };
            });
          }
          summaryBullets.push(`Applied ${op.strategy} scaling to ${col}.`);
        }
        break;
      }

      case 'encode': {
        for (const col of op.columns) {
          if (!columns.includes(col)) continue;
          const categories = Array.from(
            new Set(
              rows
                .map((r) => r[col])
                .filter((v) => !isNullish(v))
                .map((v) => String(v)),
            ),
          ).slice(0, 12);

          if (categories.length === 0) continue;
          const newCols: string[] = [];

          for (const cat of categories) {
            const safeSuffix = cat.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const encodedName = `${col}_${safeSuffix}`;
            newCols.push(encodedName);
            rows = rows.map((r) => ({
              ...r,
              [encodedName]: String(r[col] ?? '') === cat ? 1 : 0,
            }));
          }

          const dropOrig = op.dropOriginal !== false;
          if (dropOrig) {
            columns = columns.filter((c) => c !== col);
            rows = rows.map((r) => {
              const copy = { ...r };
              delete copy[col];
              return copy;
            });
          }
          columns = [...columns, ...newCols];
          summaryBullets.push(`One-hot encoded ${col} into ${newCols.length} binary columns.`);
        }
      }
    }
  }

  return {
    rows,
    columns,
    originalRowCount: sourceRows.length,
    transformedRowCount: rows.length,
    originalColumnCount: sourceColumns.length,
    transformedColumnCount: columns.length,
    summaryBullets,
    durationMs: Math.max(1, Math.round(performance.now() - start)),
  };
}

/**
 * Formats an ISO timestamp into an honest relative time string.
 */
export function formatRelativeTime(isoString: string, nowMs = Date.now()): string {
  const then = Date.parse(isoString);
  if (Number.isNaN(then)) return 'Recently';
  const diffSec = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(then).toLocaleDateString();
}

/**
 * Returns an accurate time-of-day greeting for the given hour (0..23).
 */
export function getTimeOfDayGreeting(hour = new Date().getHours()): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

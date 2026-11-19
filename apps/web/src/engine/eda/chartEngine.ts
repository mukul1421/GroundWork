import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

export interface HistogramBin {
  binLabel: string;
  count: number;
  x0: number;
  x1: number;
}

export interface DistributionResult {
  columnName: string;
  bins: HistogramBin[];
  min: number;
  max: number;
  mean: number;
}

function rowToJson(row: unknown): Record<string, unknown> {
  if (row && typeof row === 'object') {
    const candidate = row as { toJSON?: () => Record<string, unknown> };
    if (typeof candidate.toJSON === 'function') {
      return candidate.toJSON();
    }
    return row as Record<string, unknown>;
  }
  return {};
}

/**
 * Computes frequency distribution histogram for a numeric column using DuckDB SQL.
 */
export async function computeNumericDistribution(
  conn: AsyncDuckDBConnection,
  tableName: string,
  columnName: string,
  binCount = 12,
): Promise<DistributionResult | null> {
  const statsRes = await conn.query(`
    SELECT 
      MIN("${columnName}") AS min_v, 
      MAX("${columnName}") AS max_v, 
      AVG("${columnName}") AS avg_v 
    FROM ${tableName} 
    WHERE "${columnName}" IS NOT NULL
  `);

  const statsRow = rowToJson((statsRes.toArray() as unknown[])[0]);
  const minVal = typeof statsRow.min_v === 'number' ? statsRow.min_v : null;
  const maxVal = typeof statsRow.max_v === 'number' ? statsRow.max_v : null;
  const avgVal = typeof statsRow.avg_v === 'number' ? statsRow.avg_v : null;

  if (minVal === null || maxVal === null || minVal === maxVal) {
    return null;
  }

  const range = maxVal - minVal;
  const step = range / binCount;

  // Compute bin counts via DuckDB floor calculation
  const binQuery = `
    SELECT 
      LEAST(${binCount - 1}, FLOOR(("${columnName}" - ${minVal}) / ${step}))::INT AS bin_idx,
      COUNT(*)::INT AS bin_count
    FROM ${tableName}
    WHERE "${columnName}" IS NOT NULL
    GROUP BY bin_idx
    ORDER BY bin_idx ASC
  `;

  const binResult = await conn.query(binQuery);
  const rows = binResult.toArray() as unknown[];

  const countMap = new Map<number, number>();
  for (const r of rows) {
    const obj = rowToJson(r);
    const idx = typeof obj.bin_idx === 'number' ? obj.bin_idx : 0;
    const count = typeof obj.bin_count === 'number' ? obj.bin_count : 0;
    countMap.set(idx, count);
  }

  const bins: HistogramBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const x0 = minVal + i * step;
    const x1 = minVal + (i + 1) * step;
    bins.push({
      binLabel: `${Math.round(x0)} - ${Math.round(x1)}`,
      count: countMap.get(i) ?? 0,
      x0,
      x1,
    });
  }

  return {
    columnName,
    bins,
    min: minVal,
    max: maxVal,
    mean: avgVal ?? (minVal + maxVal) / 2,
  };
}

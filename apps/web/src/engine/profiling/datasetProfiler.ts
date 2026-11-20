import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { supabase } from '@/integrations/supabase';
import type { Json } from '@/types/database';

interface ArrowTableLike {
  getChild(name: string): { get(index: number): unknown } | null;
  getChildAt(index: number): { get(index: number): unknown } | null;
}

export interface NumericStats {
  min: number | null;
  max: number | null;
  mean: number | null;
  stddev: number | null;
  median: number | null;
  q25: number | null;
  q75: number | null;
  iqr: number | null;
  outlierCount: number;
}

export interface CategoricalFrequency {
  value: string;
  count: number;
  percent: number;
}

export interface ColumnProfileSummary {
  columnName: string;
  inferredType: string;
  isNumeric: boolean;
  nullable: boolean;
  missingCount: number;
  missingPercent: number;
  distinctCount: number;
  uniquenessPercent: number;
  isConstant: boolean;
  isPrimaryKeyCandidate: boolean;
  stats: NumericStats | { topFrequencies: CategoricalFrequency[] };
}

export interface DatasetProfileSummary {
  rowCount: number;
  columnCount: number;
  duplicateRowsCount: number;
  constantColumnsCount: number;
  overallMissingRate: number;
  columns: ColumnProfileSummary[];
}

/**
 * Bulletproof helper to extract a scalar value from an Apache Arrow Table.
 * Avoids StructRowProxy traps and supports case-insensitivity & numeric indices.
 */
function getScalar(table: ArrowTableLike, nameOrIndex: string | number, rowIndex = 0): unknown {
  try {
    const col =
      typeof nameOrIndex === 'string'
        ? (table.getChild(nameOrIndex) ??
          table.getChild(nameOrIndex.toLowerCase()) ??
          table.getChild(nameOrIndex.toUpperCase()))
        : table.getChildAt(nameOrIndex);
    return col ? col.get(rowIndex) : undefined;
  } catch {
    return undefined;
  }
}

function toNum(val: unknown, fallback = 0): number {
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  if (typeof val === 'bigint') return Number(val);
  if (typeof val === 'string') {
    const parsed = Number(val);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

/**
 * Runs SQL-based analytical profiling on a registered DuckDB table.
 * All computations run locally inside DuckDB-Wasm in a Web Worker per Spec §4.1 & §5.1.
 */
export async function profileTable(
  conn: AsyncDuckDBConnection,
  tableName: string,
): Promise<DatasetProfileSummary> {
  // 1. Get Table Schema & Column Types
  const schemaResult = await conn.query(`DESCRIBE ${tableName}`);
  const colNameVec =
    schemaResult.getChild('column_name') ??
    schemaResult.getChild('COLUMN_NAME') ??
    schemaResult.getChildAt(0);
  const colTypeVec =
    schemaResult.getChild('column_type') ??
    schemaResult.getChild('COLUMN_TYPE') ??
    schemaResult.getChildAt(1);

  const schemaRows: Array<{ column_name: string; column_type: string }> = [];
  for (let i = 0; i < schemaResult.numRows; i++) {
    const cn = String(colNameVec?.get(i) ?? '').trim();
    const ct = String(colTypeVec?.get(i) ?? '').trim();
    if (cn) {
      schemaRows.push({ column_name: cn, column_type: ct });
    }
  }

  const columnsList = schemaRows.map((c) => c.column_name);
  const columnCount = columnsList.length;

  // 2. Compute Row Count
  const countResult = await conn.query(
    `SELECT COUNT(*)::BIGINT AS total FROM ${tableName}`,
  );
  const rawTotal = getScalar(countResult, 'total', 0) ?? getScalar(countResult, 0, 0);
  const rowCount = toNum(rawTotal, 0);

  if (rowCount === 0) {
    return {
      rowCount: 0,
      columnCount,
      duplicateRowsCount: 0,
      constantColumnsCount: 0,
      overallMissingRate: 0,
      columns: [],
    };
  }

  // 3. Compute Exact Duplicate Rows Count
  // Duplicates = total rows - distinct rows
  const safeCols = columnsList.map((c) => `"${c}"`).join(', ');
  const distinctRowsResult = await conn.query(
    `SELECT COUNT(*)::BIGINT AS distinct_rows FROM (SELECT DISTINCT ${safeCols} FROM ${tableName})`,
  );
  const distinctRowsVal =
    getScalar(distinctRowsResult, 'distinct_rows', 0) ?? getScalar(distinctRowsResult, 0, 0);
  const distinctRows = toNum(distinctRowsVal, rowCount);
  const duplicateRowsCount = Math.max(0, rowCount - distinctRows);

  // 4. Compute per-column metrics
  let totalMissingCells = 0;
  let constantColumnsCount = 0;
  const columnProfiles: ColumnProfileSummary[] = [];

  for (const col of schemaRows) {
    const colName = col.column_name;
    const colType = col.column_type.toUpperCase();
    const isNumeric =
      colType.includes('INT') ||
      colType.includes('FLOAT') ||
      colType.includes('DOUBLE') ||
      colType.includes('DECIMAL') ||
      colType.includes('REAL');

    // Missing count and Distinct count
    const basicStatsResult = await conn.query(`
      SELECT 
        COUNT(*)::BIGINT - COUNT("${colName}")::BIGINT AS missing_count,
        COUNT(DISTINCT "${colName}")::BIGINT AS distinct_count
      FROM ${tableName}
    `);

    const missingCount = toNum(
      getScalar(basicStatsResult, 'missing_count', 0) ?? getScalar(basicStatsResult, 0, 0),
      0,
    );
    const distinctCount = toNum(
      getScalar(basicStatsResult, 'distinct_count', 0) ?? getScalar(basicStatsResult, 1, 0),
      0,
    );
    const missingPercent = rowCount > 0 ? (missingCount / rowCount) * 100 : 0;
    const uniquenessPercent = rowCount > 0 ? (distinctCount / rowCount) * 100 : 0;
    const isConstant = distinctCount === 1;
    const isPrimaryKeyCandidate = distinctCount === rowCount && missingCount === 0;

    totalMissingCells += missingCount;
    if (isConstant) constantColumnsCount++;

    let stats: NumericStats | { topFrequencies: CategoricalFrequency[] };

    if (isNumeric) {
      // Numerical summary stats
      const numStatsResult = await conn.query(`
        SELECT
          MIN("${colName}") AS col_min,
          MAX("${colName}") AS col_max,
          AVG("${colName}") AS col_mean,
          STDDEV("${colName}") AS col_stddev,
          MEDIAN("${colName}") AS col_median,
          QUANTILE_CONT("${colName}", 0.25) AS col_q25,
          QUANTILE_CONT("${colName}", 0.75) AS col_q75
        FROM ${tableName}
        WHERE "${colName}" IS NOT NULL
      `);

      const rawMin = getScalar(numStatsResult, 'col_min', 0);
      const rawMax = getScalar(numStatsResult, 'col_max', 0);
      const rawMean = getScalar(numStatsResult, 'col_mean', 0);
      const rawStddev = getScalar(numStatsResult, 'col_stddev', 0);
      const rawMedian = getScalar(numStatsResult, 'col_median', 0);
      const rawQ25 = getScalar(numStatsResult, 'col_q25', 0);
      const rawQ75 = getScalar(numStatsResult, 'col_q75', 0);

      const min = rawMin !== null && rawMin !== undefined ? toNum(rawMin) : null;
      const max = rawMax !== null && rawMax !== undefined ? toNum(rawMax) : null;
      const mean = rawMean !== null && rawMean !== undefined ? toNum(rawMean) : null;
      const stddev = rawStddev !== null && rawStddev !== undefined ? toNum(rawStddev) : null;
      const median = rawMedian !== null && rawMedian !== undefined ? toNum(rawMedian) : null;
      const q25 = rawQ25 !== null && rawQ25 !== undefined ? toNum(rawQ25) : null;
      const q75 = rawQ75 !== null && rawQ75 !== undefined ? toNum(rawQ75) : null;
      const iqr = q25 !== null && q75 !== null ? q75 - q25 : null;

      let outlierCount = 0;
      if (iqr !== null && q25 !== null && q75 !== null && iqr > 0) {
        const lowerBound = q25 - 1.5 * iqr;
        const upperBound = q75 + 1.5 * iqr;
        const outlierResult = await conn.query(`
          SELECT COUNT(*)::BIGINT AS outliers 
          FROM ${tableName} 
          WHERE "${colName}" < ${lowerBound} OR "${colName}" > ${upperBound}
        `);
        outlierCount = toNum(
          getScalar(outlierResult, 'outliers', 0) ?? getScalar(outlierResult, 0, 0),
          0,
        );
      }

      stats = {
        min,
        max,
        mean,
        stddev,
        median,
        q25,
        q75,
        iqr,
        outlierCount,
      };
    } else {
      // Categorical frequency summary (Top 10)
      const freqResult = await conn.query(`
        SELECT 
          CAST("${colName}" AS VARCHAR) AS cat_val,
          COUNT(*)::BIGINT AS cat_count
        FROM ${tableName}
        WHERE "${colName}" IS NOT NULL
        GROUP BY "${colName}"
        ORDER BY cat_count DESC
        LIMIT 10
      `);

      const catValCol = freqResult.getChild('cat_val') ?? freqResult.getChildAt(0);
      const catCountCol = freqResult.getChild('cat_count') ?? freqResult.getChildAt(1);
      const topFrequencies: CategoricalFrequency[] = [];

      for (let i = 0; i < freqResult.numRows; i++) {
        const rawVal: unknown = catValCol?.get(i);
        const count = toNum(catCountCol?.get(i), 0);
        const valStr =
          typeof rawVal === 'string'
            ? rawVal
            : typeof rawVal === 'number' ||
                typeof rawVal === 'boolean' ||
                typeof rawVal === 'bigint'
              ? String(rawVal)
              : 'null';
        topFrequencies.push({
          value: valStr,
          count,
          percent: rowCount > 0 ? (count / rowCount) * 100 : 0,
        });
      }

      stats = { topFrequencies };
    }

    columnProfiles.push({
      columnName: colName,
      inferredType: colType,
      isNumeric,
      nullable: missingCount > 0,
      missingCount,
      missingPercent: Number(missingPercent.toFixed(2)),
      distinctCount,
      uniquenessPercent: Number(uniquenessPercent.toFixed(2)),
      isConstant,
      isPrimaryKeyCandidate,
      stats,
    });
  }

  const totalCells = rowCount * columnCount;
  const overallMissingRate = totalCells > 0 ? (totalMissingCells / totalCells) * 100 : 0;

  return {
    rowCount,
    columnCount,
    duplicateRowsCount,
    constantColumnsCount,
    overallMissingRate: Number(overallMissingRate.toFixed(2)),
    columns: columnProfiles,
  };
}

/**
 * Recursively converts any BigInt values into safe Numbers so JSON.stringify / Supabase never throws.
 */
export function sanitizeJson(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map((item: unknown) => sanitizeJson(item));
  if (typeof obj === 'object') {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = sanitizeJson(v);
    }
    return res;
  }
  return obj;
}

/**
 * Persists computed profile summary into PostgreSQL per Spec §5.1 step 7.
 * Compact JSON metadata only — no raw rows.
 */
export async function saveProfileToDatabase(
  datasetVersionId: string,
  profile: DatasetProfileSummary,
  correlation?: unknown,
): Promise<void> {
  // 1. Upsert dataset_profiles
  const profileJson: Json = sanitizeJson({
    rowCount: profile.rowCount,
    columnCount: profile.columnCount,
    duplicateRowsCount: profile.duplicateRowsCount,
    constantColumnsCount: profile.constantColumnsCount,
    overallMissingRate: profile.overallMissingRate,
    ...(correlation ? { correlation } : {}),
  }) as Json;

  const qualityJson: Json = sanitizeJson({
    hasDuplicates: profile.duplicateRowsCount > 0,
    hasMissingValues: profile.overallMissingRate > 0,
    hasConstantColumns: profile.constantColumnsCount > 0,
  }) as Json;

  const { error: dsProfileError } = await supabase.from('dataset_profiles').upsert(
    {
      dataset_version_id: datasetVersionId,
      profile_json: profileJson,
      quality_json: qualityJson,
    },
    { onConflict: 'dataset_version_id' },
  );

  if (dsProfileError) {
    throw new Error(`Failed to save dataset profile: ${dsProfileError.message}`);
  }

  // 2. Upsert column_profiles
  const columnInserts = profile.columns.map((col) => ({
    dataset_version_id: datasetVersionId,
    column_name: col.columnName,
    inferred_type: col.inferredType,
    nullable: col.nullable,
    missing_count: toNum(col.missingCount),
    distinct_count: toNum(col.distinctCount),
    stats_json: sanitizeJson(col.stats) as Json,
  }));

  if (columnInserts.length > 0) {
    const { error: colProfileError } = await supabase
      .from('column_profiles')
      .upsert(columnInserts, { onConflict: 'dataset_version_id,column_name' });

    if (colProfileError) {
      throw new Error(`Failed to save column profiles: ${colProfileError.message}`);
    }
  }
}

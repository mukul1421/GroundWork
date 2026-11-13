import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { supabase } from '@/integrations/supabase';
import type { Json } from '@/types/database';

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

interface RowJsonRecord {
  toJSON(): Record<string, unknown>;
}

function rowToJson(row: unknown): Record<string, unknown> {
  if (row && typeof row === 'object' && 'toJSON' in row) {
    const candidate = row as RowJsonRecord;
    return candidate.toJSON();
  }
  return {};
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
  const schemaRows = (schemaResult.toArray() as unknown[]).map((r) => {
    const obj = rowToJson(r);
    return {
      column_name: typeof obj.column_name === 'string' ? obj.column_name : '',
      column_type: typeof obj.column_type === 'string' ? obj.column_type : '',
    };
  });

  const columnsList = schemaRows.map((c) => c.column_name);
  const columnCount = columnsList.length;

  // 2. Compute Row Count
  const countResult = await conn.query(`SELECT COUNT(*)::BIGINT AS total FROM ${tableName}`);
  const countRows = countResult.toArray() as unknown[];
  const totalVal = rowToJson(countRows[0]).total;
  const rowCount = typeof totalVal === 'number' || typeof totalVal === 'bigint' ? Number(totalVal) : 0;

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
  const distinctRowsVal = rowToJson((distinctRowsResult.toArray() as unknown[])[0]).distinct_rows;
  const distinctRows =
    typeof distinctRowsVal === 'number' || typeof distinctRowsVal === 'bigint'
      ? Number(distinctRowsVal)
      : rowCount;
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

    const basicStats = rowToJson((basicStatsResult.toArray() as unknown[])[0]);
    const missingVal = basicStats.missing_count;
    const distinctVal = basicStats.distinct_count;
    const missingCount =
      typeof missingVal === 'number' || typeof missingVal === 'bigint' ? Number(missingVal) : 0;
    const distinctCount =
      typeof distinctVal === 'number' || typeof distinctVal === 'bigint' ? Number(distinctVal) : 0;
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

      const numData = rowToJson((numStatsResult.toArray() as unknown[])[0]);
      const q25 = typeof numData.col_q25 === 'number' ? numData.col_q25 : null;
      const q75 = typeof numData.col_q75 === 'number' ? numData.col_q75 : null;
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
        const outlierVal = rowToJson((outlierResult.toArray() as unknown[])[0]).outliers;
        outlierCount =
          typeof outlierVal === 'number' || typeof outlierVal === 'bigint'
            ? Number(outlierVal)
            : 0;
      }

      stats = {
        min: typeof numData.col_min === 'number' ? numData.col_min : null,
        max: typeof numData.col_max === 'number' ? numData.col_max : null,
        mean: typeof numData.col_mean === 'number' ? numData.col_mean : null,
        stddev: typeof numData.col_stddev === 'number' ? numData.col_stddev : null,
        median: typeof numData.col_median === 'number' ? numData.col_median : null,
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

      const topFrequencies = (freqResult.toArray() as unknown[]).map((r) => {
        const rowJson = rowToJson(r);
        const count =
          typeof rowJson.cat_count === 'number' || typeof rowJson.cat_count === 'bigint'
            ? Number(rowJson.cat_count)
            : 0;
        let catValStr = 'null';
        if (typeof rowJson.cat_val === 'string') {
          catValStr = rowJson.cat_val;
        } else if (typeof rowJson.cat_val === 'number' || typeof rowJson.cat_val === 'boolean') {
          catValStr = `${rowJson.cat_val}`;
        }
        return {
          value: catValStr,
          count,
          percent: rowCount > 0 ? (count / rowCount) * 100 : 0,
        };
      });

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
 * Persists computed profile summary into PostgreSQL per Spec §5.1 step 7.
 * Compact JSON metadata only — no raw rows.
 */
export async function saveProfileToDatabase(
  datasetVersionId: string,
  profile: DatasetProfileSummary,
): Promise<void> {
  // 1. Upsert dataset_profiles
  const profileJson: Json = {
    rowCount: profile.rowCount,
    columnCount: profile.columnCount,
    duplicateRowsCount: profile.duplicateRowsCount,
    constantColumnsCount: profile.constantColumnsCount,
    overallMissingRate: profile.overallMissingRate,
  };

  const qualityJson: Json = {
    hasDuplicates: profile.duplicateRowsCount > 0,
    hasMissingValues: profile.overallMissingRate > 0,
    hasConstantColumns: profile.constantColumnsCount > 0,
  };

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
    missing_count: col.missingCount,
    distinct_count: col.distinctCount,
    stats_json: JSON.parse(JSON.stringify(col.stats)) as Json,
  }));

  const { error: colProfileError } = await supabase
    .from('column_profiles')
    .upsert(columnInserts, { onConflict: 'dataset_version_id,column_name' });

  if (colProfileError) {
    throw new Error(`Failed to save column profiles: ${colProfileError.message}`);
  }
}

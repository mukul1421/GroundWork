import type { AsyncDuckDBConnection, AsyncDuckDB } from '@duckdb/duckdb-wasm';

interface ArrowTableLike {
  getChild(name: string): { get(index: number): unknown } | null;
  getChildAt(index: number): { get(index: number): unknown } | null;
}

export type PreprocessingOperationType =
  | 'impute'
  | 'drop_columns'
  | 'outlier_treatment'
  | 'encode'
  | 'scale'
  | 'deduplicate';

export interface ImputeOperation {
  type: 'impute';
  columns: string[];
  strategy: 'median' | 'mean' | 'mode' | 'constant';
  constantValue?: string | number | boolean;
}

export interface DropColumnsOperation {
  type: 'drop_columns';
  columns: string[];
}

export interface OutlierOperation {
  type: 'outlier_treatment';
  columns: string[];
  strategy: 'clip_iqr' | 'drop_rows';
  multiplier?: number; // default 1.5
}

export interface EncodeOperation {
  type: 'encode';
  columns: string[];
  strategy: 'one_hot' | 'label';
  dropOriginal?: boolean;
}

export interface ScaleOperation {
  type: 'scale';
  columns: string[];
  strategy: 'standard' | 'minmax' | 'log1p';
}

export interface DeduplicateOperation {
  type: 'deduplicate';
  columns?: string[];
}

export type PreprocessingOperation =
  | ImputeOperation
  | DropColumnsOperation
  | OutlierOperation
  | EncodeOperation
  | ScaleOperation
  | DeduplicateOperation;

export interface PreprocessingPlan {
  title: string;
  description?: string;
  operations: PreprocessingOperation[];
}

export interface PreprocessingResult {
  sourceRowCount: number;
  transformedRowCount: number;
  sourceColumnCount: number;
  transformedColumnCount: number;
  appliedOperationsCount: number;
  durationMs: number;
  exportedBuffer: Uint8Array;
}

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
 * Executes a sequence of data preparation operations inside DuckDB-Wasm.
 * Runs completely in-browser per Spec §5.2.
 */
export async function executePreprocessingPlan(
  db: AsyncDuckDB,
  conn: AsyncDuckDBConnection,
  sourceTableName: string,
  targetTableName: string,
  plan: PreprocessingPlan,
): Promise<PreprocessingResult> {
  const startTime = performance.now();

  // 1. Clone source table into target working table
  await conn.query(`CREATE OR REPLACE TABLE ${targetTableName} AS SELECT * FROM ${sourceTableName}`);

  // Measure initial shape
  const initCountRes = await conn.query(`SELECT COUNT(*)::BIGINT AS total FROM ${targetTableName}`);
  const sourceRowCount = toNum(getScalar(initCountRes, 'total', 0) ?? getScalar(initCountRes, 0, 0), 0);
  const initSchemaRes = await conn.query(`DESCRIBE ${targetTableName}`);
  const sourceColumnCount = initSchemaRes.numRows;

  // 2. Iterate and apply each operation
  let appliedCount = 0;

  for (const op of plan.operations) {
    switch (op.type) {
      case 'impute': {
        for (const col of op.columns) {
          if (op.strategy === 'median') {
            const medRes = await conn.query(
              `SELECT MEDIAN("${col}") AS med FROM ${targetTableName} WHERE "${col}" IS NOT NULL`,
            );
            const medVal = getScalar(medRes, 'med', 0) ?? getScalar(medRes, 0, 0);
            if (medVal !== null && medVal !== undefined) {
              const numVal = toNum(medVal);
              await conn.query(
                `UPDATE ${targetTableName} SET "${col}" = ${numVal} WHERE "${col}" IS NULL`,
              );
            }
          } else if (op.strategy === 'mean') {
            const avgRes = await conn.query(
              `SELECT AVG("${col}") AS avg_v FROM ${targetTableName} WHERE "${col}" IS NOT NULL`,
            );
            const avgVal = getScalar(avgRes, 'avg_v', 0) ?? getScalar(avgRes, 0, 0);
            if (avgVal !== null && avgVal !== undefined) {
              const numVal = toNum(avgVal);
              await conn.query(
                `UPDATE ${targetTableName} SET "${col}" = ${numVal} WHERE "${col}" IS NULL`,
              );
            }
          } else if (op.strategy === 'mode') {
            const modeRes = await conn.query(`
              SELECT CAST("${col}" AS VARCHAR) AS mode_v, COUNT(*) AS cnt 
              FROM ${targetTableName} 
              WHERE "${col}" IS NOT NULL 
              GROUP BY "${col}" 
              ORDER BY cnt DESC 
              LIMIT 1
            `);
            const modeVal = getScalar(modeRes, 'mode_v', 0) ?? getScalar(modeRes, 0, 0);
            if (modeVal !== null && modeVal !== undefined) {
              const safeStr =
                typeof modeVal === 'string'
                  ? modeVal.replace(/'/g, "''")
                  : typeof modeVal === 'number' ||
                      typeof modeVal === 'boolean' ||
                      typeof modeVal === 'bigint'
                    ? String(modeVal)
                    : '';
              await conn.query(
                `UPDATE ${targetTableName} SET "${col}" = '${safeStr}' WHERE "${col}" IS NULL`,
              );
            }
          } else {
            // constant
            if (op.constantValue !== undefined) {
              let safeSqlVal: string;
              if (typeof op.constantValue === 'number' || typeof op.constantValue === 'boolean') {
                safeSqlVal = `${op.constantValue}`;
              } else {
                safeSqlVal = `'${op.constantValue.replace(/'/g, "''")}'`;
              }
              await conn.query(
                `UPDATE ${targetTableName} SET "${col}" = ${safeSqlVal} WHERE "${col}" IS NULL`,
              );
            }
          }
        }
        appliedCount++;
        break;
      }

      case 'drop_columns': {
        for (const col of op.columns) {
          try {
            await conn.query(`ALTER TABLE ${targetTableName} DROP COLUMN "${col}"`);
          } catch (dropErr) {
            console.warn(`Could not drop column "${col}":`, dropErr);
          }
        }
        appliedCount++;
        break;
      }

      case 'outlier_treatment': {
        const mult = op.multiplier ?? 1.5;
        for (const col of op.columns) {
          const statsRes = await conn.query(`
            SELECT
              QUANTILE_CONT("${col}", 0.25) AS q25,
              QUANTILE_CONT("${col}", 0.75) AS q75
            FROM ${targetTableName}
            WHERE "${col}" IS NOT NULL
          `);

          const q25 = toNum(getScalar(statsRes, 'q25', 0) ?? getScalar(statsRes, 0, 0), NaN);
          const q75 = toNum(getScalar(statsRes, 'q75', 0) ?? getScalar(statsRes, 1, 0), NaN);

          if (!isNaN(q25) && !isNaN(q75) && q75 >= q25) {
            const iqr = q75 - q25;
            const lowerBound = q25 - mult * iqr;
            const upperBound = q75 + mult * iqr;

            if (op.strategy === 'clip_iqr') {
              await conn.query(`
                UPDATE ${targetTableName}
                SET "${col}" = CASE
                  WHEN "${col}" < ${lowerBound} THEN ${lowerBound}
                  WHEN "${col}" > ${upperBound} THEN ${upperBound}
                  ELSE "${col}"
                END
                WHERE "${col}" IS NOT NULL
              `);
            } else {
              // drop_rows
              await conn.query(`
                DELETE FROM ${targetTableName}
                WHERE "${col}" < ${lowerBound} OR "${col}" > ${upperBound}
              `);
            }
          }
        }
        appliedCount++;
        break;
      }

      case 'scale': {
        for (const col of op.columns) {
          if (op.strategy === 'log1p') {
            await conn.query(`
              UPDATE ${targetTableName}
              SET "${col}" = LN("${col}" + 1)
              WHERE "${col}" IS NOT NULL AND "${col}" >= 0
            `);
          } else if (op.strategy === 'minmax') {
            const boundsRes = await conn.query(`
              SELECT MIN("${col}") AS min_v, MAX("${col}") AS max_v
              FROM ${targetTableName}
              WHERE "${col}" IS NOT NULL
            `);
            const minV = toNum(getScalar(boundsRes, 'min_v', 0) ?? getScalar(boundsRes, 0, 0), 0);
            const maxV = toNum(getScalar(boundsRes, 'max_v', 0) ?? getScalar(boundsRes, 1, 0), 0);
            if (maxV > minV) {
              await conn.query(`
                UPDATE ${targetTableName}
                SET "${col}" = ("${col}" - ${minV}) / (${maxV} - ${minV})
                WHERE "${col}" IS NOT NULL
              `);
            }
          } else {
            // standard
            const stdRes = await conn.query(`
              SELECT AVG("${col}") AS avg_v, STDDEV("${col}") AS std_v
              FROM ${targetTableName}
              WHERE "${col}" IS NOT NULL
            `);
            const avgV = toNum(getScalar(stdRes, 'avg_v', 0) ?? getScalar(stdRes, 0, 0), 0);
            const stdV = toNum(getScalar(stdRes, 'std_v', 0) ?? getScalar(stdRes, 1, 0), 0);
            if (stdV > 0) {
              await conn.query(`
                UPDATE ${targetTableName}
                SET "${col}" = ("${col}" - ${avgV}) / ${stdV}
                WHERE "${col}" IS NOT NULL
              `);
            }
          }
        }
        appliedCount++;
        break;
      }

      case 'encode': {
        for (const col of op.columns) {
          if (op.strategy === 'one_hot') {
            // Get up to 10 top distinct categories to avoid exploding columns
            const distinctRes = await conn.query(`
              SELECT DISTINCT CAST("${col}" AS VARCHAR) AS val
              FROM ${targetTableName}
              WHERE "${col}" IS NOT NULL
              LIMIT 10
            `);

            const valCol = distinctRes.getChild('val') ?? distinctRes.getChildAt(0);
            const categories: string[] = [];
            for (let i = 0; i < distinctRes.numRows; i++) {
              const v: unknown = valCol?.get(i);
              if (v !== null && v !== undefined) {
                const catStr =
                  typeof v === 'string'
                    ? v
                    : typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint'
                      ? String(v)
                      : '';
                if (catStr) categories.push(catStr);
              }
            }

            for (const cat of categories) {
              const safeColName = `${col}_${cat.replace(/[^a-zA-Z0-9]/g, '_')}`;
              const safeCatVal = cat.replace(/'/g, "''");
              try {
                await conn.query(`ALTER TABLE ${targetTableName} ADD COLUMN "${safeColName}" INT DEFAULT 0`);
                await conn.query(`
                  UPDATE ${targetTableName}
                  SET "${safeColName}" = CASE WHEN CAST("${col}" AS VARCHAR) = '${safeCatVal}' THEN 1 ELSE 0 END
                `);
              } catch (alterErr) {
                console.warn(`One-hot encoding column "${safeColName}" warning:`, alterErr);
              }
            }

            if (op.dropOriginal) {
              try {
                await conn.query(`ALTER TABLE ${targetTableName} DROP COLUMN "${col}"`);
              } catch {
                // ignore
              }
            }
          }
        }
        appliedCount++;
        break;
      }

      case 'deduplicate': {
        await conn.query(
          `CREATE OR REPLACE TABLE ${targetTableName} AS SELECT DISTINCT * FROM ${targetTableName}`,
        );
        appliedCount++;
        break;
      }
    }
  }

  // 3. Measure transformed shape
  const finalCountRes = await conn.query(`SELECT COUNT(*)::BIGINT AS total FROM ${targetTableName}`);
  const transformedRowCount = toNum(getScalar(finalCountRes, 'total', 0) ?? getScalar(finalCountRes, 0, 0), 0);
  const finalSchemaRes = await conn.query(`DESCRIBE ${targetTableName}`);
  const transformedColumnCount = finalSchemaRes.numRows;

  // 4. Export transformed table to in-memory Parquet
  const outFileName = `transformed_${Date.now()}.parquet`;
  await conn.query(`COPY ${targetTableName} TO '${outFileName}' (FORMAT PARQUET)`);
  const exportedBuffer = await db.copyFileToBuffer(outFileName);

  // Clean up virtual file
  try {
    await db.dropFile(outFileName);
  } catch {
    // ignore
  }

  const durationMs = Math.round(performance.now() - startTime);

  return {
    sourceRowCount,
    transformedRowCount,
    sourceColumnCount,
    transformedColumnCount,
    appliedOperationsCount: appliedCount,
    durationMs,
    exportedBuffer,
  };
}

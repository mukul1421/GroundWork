import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

export interface CorrelationCell {
  colA: string;
  colB: string;
  value: number;
}

export interface CorrelationMatrixResult {
  columns: string[];
  matrix: number[][]; // [rowIdx][colIdx]
}

/**
 * Computes Pearson correlation matrix for numeric columns using DuckDB's native CORR() function.
 * Runs completely in-browser via WebAssembly per Spec §6.2.
 */
export async function computeCorrelationMatrix(
  conn: AsyncDuckDBConnection,
  tableName: string,
  numericColumns: string[],
  maxColumns = 8, // limit to 8 most relevant columns for crisp visual rendering
): Promise<CorrelationMatrixResult> {
  const selectedCols = numericColumns.slice(0, maxColumns);
  const n = selectedCols.length;

  if (n === 0) {
    return { columns: [], matrix: [] };
  }

  // Pre-initialize n x n matrix with 1.0 on diagonal
  const matrix: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(1));

  // Build batch query for upper triangle pairs
  const selectExpressions: string[] = [];
  const pairIndices: [number, number][] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const colA = selectedCols[i];
      const colB = selectedCols[j];
      if (!colA || !colB) continue;
      selectExpressions.push(`COALESCE(CORR("${colA}", "${colB}"), 0) AS "corr_${i}_${j}"`);
      pairIndices.push([i, j]);
    }
  }

  if (selectExpressions.length > 0) {
    const query = `SELECT ${selectExpressions.join(', ')} FROM ${tableName}`;
    const result = await conn.query(query);

    for (const [i, j] of pairIndices) {
      const colName = `corr_${i}_${j}`;
      const colVec =
        result.getChild(colName) ??
        result.getChild(colName.toLowerCase()) ??
        result.getChild(colName.toUpperCase());

      const rawVal: unknown = colVec ? colVec.get(0) : undefined;
      let val =
        typeof rawVal === 'number'
          ? rawVal
          : typeof rawVal === 'bigint'
            ? Number(rawVal)
            : 0;

      if (isNaN(val)) val = 0;
      // Round to 2 decimal places
      val = Math.round(val * 100) / 100;

      const rowI = matrix[i];
      const rowJ = matrix[j];
      if (rowI) rowI[j] = val;
      if (rowJ) rowJ[i] = val;
    }
  }

  return {
    columns: selectedCols,
    matrix,
  };
}

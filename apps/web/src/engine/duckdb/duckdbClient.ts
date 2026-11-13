import * as duckdb from '@duckdb/duckdb-wasm';

let dbInstance: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;

/**
 * Initializes and returns the singleton DuckDB-Wasm instance.
 * Runs in a dedicated Web Worker to prevent UI blocking per Spec §4.1 & §13.4.
 */
export async function getDuckDB(): Promise<duckdb.AsyncDuckDB> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      if (!bundle.mainWorker) {
        throw new Error('DuckDB WebAssembly main worker could not be selected.');
      }

      // Create worker from CDN bundle or URL
      const worker = new Worker(bundle.mainWorker);
      const logger = new duckdb.VoidLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);

      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      dbInstance = db;
      return db;
    } catch (err) {
      initPromise = null;
      throw new Error(
        `Failed to initialize DuckDB-Wasm in browser: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  })();

  return initPromise;
}

/**
 * Creates a new connection to the DuckDB-Wasm instance.
 */
export async function getDuckDBConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  const db = await getDuckDB();
  return db.connect();
}

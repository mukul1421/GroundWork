import * as XLSX from 'xlsx';
import type { Dataset, DatasetVersion, Json } from '@/types/database';
import type { DatasetProfileSummary } from '@/engine/profiling/datasetProfiler';
import type { CorrelationMatrixResult } from '@/engine/eda/correlationMatrix';
import type { PreprocessingPlan, PreprocessingResult } from '@/engine/preprocessing/preprocessingEngine';
import {
  profileRows,
  computeCorrelationFromRows,
  applyPlanToRows,
  computeQualityScore,
} from '@/engine/localAnalytics';
import { parsePreview } from './fileParser';

export interface LocalActivityEvent {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  category: 'upload' | 'transform' | 'profile' | 'pipeline';
}

export interface LocalDatasetVersionRecord extends DatasetVersion {
  rows: Record<string, unknown>[];
  columns: string[];
  changelogSummary: string;
  profile: DatasetProfileSummary;
  correlation: CorrelationMatrixResult | null;
}

export interface LocalDatasetRecord extends Dataset {
  description: string;
  versions: LocalDatasetVersionRecord[];
}

export interface LocalWorkspaceSnapshot {
  datasets: LocalDatasetRecord[];
  activities: LocalActivityEvent[];
  pipelinesRun: number;
}

const DEMO_WORKSPACE_ID = 'ws-groundwork-local';
const DEMO_USER_ID = 'user-groundwork-demo';

/**
 * Deterministic PRNG (Mulberry32) so seed datasets are 100% reproducible across sessions & tests.
 */
function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildChurnSeedRows(): Record<string, unknown>[] {
  const rand = createSeededRandom(42);
  const contracts = ['Month-to-month', 'One year', 'Two year'];
  const payments = ['Electronic check', 'Credit card', 'Bank transfer', 'Mailed check'];
  const internetTypes = ['Fiber optic', 'DSL', 'None'];
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i <= 148; i++) {
    const contractRoll = rand();
    const contract_type =
      contractRoll < 0.52 ? contracts[0]! : contractRoll < 0.77 ? contracts[1]! : contracts[2]!;
    const baseTenure =
      contract_type === 'Month-to-month'
        ? Math.floor(1 + rand() * 24)
        : contract_type === 'One year'
          ? Math.floor(12 + rand() * 38)
          : Math.floor(30 + rand() * 42);
    // Inject realistic extreme outliers in tenure for 4 rows
    const tenure = i % 37 === 0 ? 118 + (i % 15) : baseTenure;
    const internet_service = internetTypes[Math.floor(rand() * internetTypes.length)]!;
    const monthly_charges = Number(
      (
        (internet_service === 'Fiber optic' ? 78 : internet_service === 'DSL' ? 54 : 24) +
        rand() * 32
      ).toFixed(2),
    );
    // Inject ~12% missing values in total_charges and ~4% in payment_method
    const total_charges =
      i % 9 === 0 ? null : Number((tenure * monthly_charges * (0.94 + rand() * 0.12)).toFixed(2));
    const payment_method = i % 24 === 0 ? null : payments[Math.floor(rand() * payments.length)]!;
    const support_tickets = Math.floor(rand() * (contract_type === 'Month-to-month' ? 7 : 3));
    const churnProb =
      (contract_type === 'Month-to-month' ? 0.42 : contract_type === 'One year' ? 0.12 : 0.04) +
      (tenure < 10 ? 0.14 : -0.05) +
      (support_tickets >= 4 ? 0.18 : 0);
    const churn = rand() < Math.max(0.02, Math.min(0.92, churnProb)) ? 1 : 0;

    rows.push({
      customer_id: `CUST-${String(1000 + i)}`,
      tenure,
      monthly_charges,
      total_charges,
      support_tickets,
      contract_type,
      internet_service,
      payment_method,
      churn,
    });
  }

  // Add 4 exact duplicate rows so deduplication has a verifiable impact
  rows.push({ ...rows[4]! }, { ...rows[19]! }, { ...rows[42]! }, { ...rows[88]! });
  return rows;
}

function buildRevenueCohortSeedRows(): Record<string, unknown>[] {
  const rand = createSeededRandom(108);
  const segments = ['Enterprise', 'Mid-Market', 'Growth', 'Starter'];
  const regions = ['North America', 'EMEA', 'APAC'];
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i <= 118; i++) {
    const segment = segments[Math.floor(rand() * segments.length)]!;
    const region = regions[Math.floor(rand() * regions.length)]!;
    const seats =
      segment === 'Enterprise'
        ? Math.floor(80 + rand() * 320)
        : segment === 'Mid-Market'
          ? Math.floor(20 + rand() * 80)
          : Math.floor(3 + rand() * 25);
    const mrr_usd = Number((seats * (38 + rand() * 18)).toFixed(2));
    const nps_score = i % 11 === 0 ? null : Math.round(35 + rand() * 60);
    const expansion_rate = Number(
      (i % 29 === 0 ? 2.45 : 0.88 + rand() * 0.42).toFixed(3),
    );
    const active_days_30d = Math.min(30, Math.floor(8 + rand() * 23));
    const renewed = rand() < (active_days_30d > 16 ? 0.88 : 0.56) ? 1 : 0;

    rows.push({
      account_id: `ACC-${String(2000 + i)}`,
      segment,
      region,
      seats,
      mrr_usd,
      nps_score,
      expansion_rate,
      active_days_30d,
      renewed,
    });
  }

  rows.push({ ...rows[7]! }, { ...rows[31]! });
  return rows;
}

function buildEcommerceOrdersSeedRows(): Record<string, unknown>[] {
  const rand = createSeededRandom(314);
  const categories = ['Electronics', 'Home Office', 'Apparel', 'Audio', 'Accessories'];
  const channels = ['Organic Search', 'Direct', 'Paid Social', 'Email'];
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i <= 130; i++) {
    const category = categories[Math.floor(rand() * categories.length)]!;
    const channel = i % 19 === 0 ? null : channels[Math.floor(rand() * channels.length)]!;
    const items_count = Math.floor(1 + rand() * 6);
    const unit_price = Number((22 + rand() * 220).toFixed(2));
    const discount_pct = i % 15 === 0 ? null : Number((rand() * 25).toFixed(1));
    const order_total = Number(
      (
        (i % 33 === 0 ? 4850 : items_count * unit_price) *
        (1 - (discount_pct ?? 0) / 100)
      ).toFixed(2),
    );
    const delivery_days = Math.floor(2 + rand() * 8);
    const returned = rand() < (delivery_days >= 7 ? 0.28 : 0.08) ? 1 : 0;

    rows.push({
      order_id: `ORD-${String(5000 + i)}`,
      category,
      channel,
      items_count,
      unit_price,
      discount_pct,
      order_total,
      delivery_days,
      returned,
    });
  }

  return rows;
}

function makeFakeHash(seed: string): string {
  let h1 = 0xdeadbeef ^ seed.length;
  let h2 = 0x41c6ce57 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const part1 = ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'));
  return (part1 + part1 + part1 + part1).slice(0, 64);
}

function createVersionRecord(params: {
  datasetId: string;
  versionNumber: number;
  parentVersionId: string | null;
  filename: string;
  rows: Record<string, unknown>[];
  columns: string[];
  createdAt: string;
  changelogSummary: string;
}): LocalDatasetVersionRecord {
  const profile = profileRows(params.rows, params.columns);
  const numericCols = profile.columns.filter((c) => c.isNumeric).map((c) => c.columnName);
  const correlation = numericCols.length >= 2 ? computeCorrelationFromRows(params.rows, numericCols) : null;
  const schemaSummary = params.columns.map((name) => ({
    name,
    sampleValues: params.rows.slice(0, 5).map((r) => {
      const v = r[name];
      return v === undefined ? null : v;
    }),
  }));

  const approxBytes = JSON.stringify(params.rows).length;
  const versionId = `${params.datasetId}-v${params.versionNumber}`;

  return {
    id: versionId,
    dataset_id: params.datasetId,
    version_number: params.versionNumber,
    parent_version_id: params.parentVersionId,
    bucket_id: 'local-memory',
    storage_path: `${DEMO_USER_ID}/${DEMO_WORKSPACE_ID}/${params.datasetId}/${versionId}/${params.filename}`,
    content_sha256: makeFakeHash(`${versionId}:${params.rows.length}:${params.columns.join(',')}`),
    row_count: params.rows.length,
    column_count: params.columns.length,
    file_size_bytes: approxBytes,
    schema_json: schemaSummary as unknown as Json,
    created_by: DEMO_USER_ID,
    created_at: params.createdAt,
    rows: params.rows,
    columns: params.columns,
    changelogSummary: params.changelogSummary,
    profile,
    correlation,
  };
}

function createInitialSnapshot(): LocalWorkspaceSnapshot {
  const now = Date.now();
  const twoHoursAgo = new Date(now - 2 * 3600 * 1000).toISOString();
  const oneDayAgo = new Date(now - 26 * 3600 * 1000).toISOString();
  const twoDaysAgo = new Date(now - 52 * 3600 * 1000).toISOString();

  const churnRows = buildChurnSeedRows();
  const churnCols = Object.keys(churnRows[0]!);
  const churnV1 = createVersionRecord({
    datasetId: 'ds-customer-churn',
    versionNumber: 1,
    parentVersionId: null,
    filename: 'customer_churn.csv',
    rows: churnRows,
    columns: churnCols,
    createdAt: twoHoursAgo,
    changelogSummary: 'Raw CSV ingested and profiled locally in browser.',
  });

  const revRows = buildRevenueCohortSeedRows();
  const revCols = Object.keys(revRows[0]!);
  const revV1 = createVersionRecord({
    datasetId: 'ds-saas-cohorts',
    versionNumber: 1,
    parentVersionId: null,
    filename: 'saas_revenue_cohorts.csv',
    rows: revRows,
    columns: revCols,
    createdAt: oneDayAgo,
    changelogSummary: 'Raw CSV ingested and profiled locally in browser.',
  });

  const orderRows = buildEcommerceOrdersSeedRows();
  const orderCols = Object.keys(orderRows[0]!);
  const orderV1 = createVersionRecord({
    datasetId: 'ds-ecommerce-orders',
    versionNumber: 1,
    parentVersionId: null,
    filename: 'ecommerce_orders.csv',
    rows: orderRows,
    columns: orderCols,
    createdAt: twoDaysAgo,
    changelogSummary: 'Raw CSV ingested and profiled locally in browser.',
  });

  const datasets: LocalDatasetRecord[] = [
    {
      id: 'ds-customer-churn',
      workspace_id: DEMO_WORKSPACE_ID,
      name: 'customer_churn.csv',
      description: 'Subscription retention records with contract duration, billing charges, and churn indicator.',
      source_filename: 'customer_churn.csv',
      source_format: 'csv',
      status: 'READY',
      active_version_id: churnV1.id,
      created_at: twoHoursAgo,
      updated_at: twoHoursAgo,
      versions: [churnV1],
    },
    {
      id: 'ds-saas-cohorts',
      workspace_id: DEMO_WORKSPACE_ID,
      name: 'saas_revenue_cohorts.csv',
      description: 'B2B account expansion, seat utilization, NPS scores, and annual renewal outcomes.',
      source_filename: 'saas_revenue_cohorts.csv',
      source_format: 'csv',
      status: 'READY',
      active_version_id: revV1.id,
      created_at: oneDayAgo,
      updated_at: oneDayAgo,
      versions: [revV1],
    },
    {
      id: 'ds-ecommerce-orders',
      workspace_id: DEMO_WORKSPACE_ID,
      name: 'ecommerce_orders.csv',
      description: 'Direct-to-consumer order fulfillment, discount tiers, shipping lead times, and return flags.',
      source_filename: 'ecommerce_orders.csv',
      source_format: 'csv',
      status: 'READY',
      active_version_id: orderV1.id,
      created_at: twoDaysAgo,
      updated_at: twoDaysAgo,
      versions: [orderV1],
    },
  ];

  const activities: LocalActivityEvent[] = [
    {
      id: 'act-1',
      title: 'Dataset profiled',
      detail: `customer_churn.csv · ${churnV1.row_count} rows · ${computeQualityScore(churnV1.profile)}% quality`,
      timestamp: twoHoursAgo,
      category: 'profile',
    },
    {
      id: 'act-2',
      title: 'Dataset ingested',
      detail: `saas_revenue_cohorts.csv · ${revV1.row_count} rows`,
      timestamp: oneDayAgo,
      category: 'upload',
    },
    {
      id: 'act-3',
      title: 'Dataset ingested',
      detail: `ecommerce_orders.csv · ${orderV1.row_count} rows`,
      timestamp: twoDaysAgo,
      category: 'upload',
    },
  ];

  return { datasets, activities, pipelinesRun: 2 };
}

const WORKSPACE_STORAGE_KEY = 'groundwork_local_workspace_v1';

function loadPersistedSnapshot(): LocalWorkspaceSnapshot | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalWorkspaceSnapshot;
    if (parsed && Array.isArray(parsed.datasets) && Array.isArray(parsed.activities)) {
      return parsed;
    }
  } catch {
    // Ignore storage read/parse errors and fall back to fresh seed snapshot
  }
  return null;
}

function persistSnapshot(snapshot: LocalWorkspaceSnapshot): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota exceeded errors for very large uploaded files
  }
}

let storeState: LocalWorkspaceSnapshot = loadPersistedSnapshot() ?? createInitialSnapshot();
const listeners = new Set<() => void>();

function notifyListeners() {
  persistSnapshot(storeState);
  listeners.forEach((cb) => cb());
}

export function subscribeLocalWorkspace(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getLocalWorkspaceSnapshot(): LocalWorkspaceSnapshot {
  return storeState;
}

export function getLocalDatasetById(datasetId: string): LocalDatasetRecord | null {
  return storeState.datasets.find((d) => d.id === datasetId) ?? null;
}

export function getActiveVersionOfDataset(ds: LocalDatasetRecord): LocalDatasetVersionRecord {
  return (
    ds.versions.find((v) => v.id === ds.active_version_id) ??
    ds.versions[0]!
  );
}

export function selectLocalDatasetVersion(datasetId: string, versionId: string): void {
  storeState = {
    ...storeState,
    datasets: storeState.datasets.map((d) =>
      d.id === datasetId ? { ...d, active_version_id: versionId, updated_at: new Date().toISOString() } : d,
    ),
  };
  notifyListeners();
}

export function deleteLocalDataset(datasetId: string): void {
  const target = storeState.datasets.find((d) => d.id === datasetId);
  storeState = {
    ...storeState,
    datasets: storeState.datasets.filter((d) => d.id !== datasetId),
    activities: target
      ? [
          {
            id: `act-${Date.now()}`,
            title: 'Dataset removed',
            detail: target.name,
            timestamp: new Date().toISOString(),
            category: 'upload',
          },
          ...storeState.activities.slice(0, 14),
        ]
      : storeState.activities,
  };
  notifyListeners();
}

function parseFullCsvText(text: string): { columns: string[]; rows: Record<string, unknown>[] } {
  const wb = XLSX.read(text, { type: 'string' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { columns: [], rows: [] };
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return { columns: [], rows: [] };
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const columns = rawRows.length > 0 ? Object.keys(rawRows[0]!) : [];
  return { columns, rows: rawRows };
}

/**
 * Parses and ingests any uploaded CSV, XLSX, JSON, or JSONL file directly into the browser workspace.
 */
export async function uploadLocalDataset(file: File, customName?: string): Promise<LocalDatasetRecord> {
  const preview = await parsePreview(file);
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'csv';
  let columns: string[] = preview.columns;
  let rows: Record<string, unknown>[] = preview.rows;

  try {
    if (ext === 'csv') {
      const text = await file.text();
      const parsed = parseFullCsvText(text);
      if (parsed.rows.length > 0) {
        columns = parsed.columns;
        rows = parsed.rows;
      }
    } else if (ext === 'xlsx' || ext === 'xls') {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (sheetName && wb.Sheets[sheetName]) {
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
          defval: null,
        });
        if (rawRows.length > 0) {
          columns = Object.keys(rawRows[0]!);
          rows = rawRows;
        }
      }
    } else if (ext === 'json') {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
        rows = parsed as Record<string, unknown>[];
        columns = Object.keys(rows[0]!);
      }
    } else if (ext === 'jsonl') {
      const text = await file.text();
      const parsedRows = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      if (parsedRows.length > 0) {
        rows = parsedRows;
        columns = Object.keys(rows[0]!);
      }
    }
  } catch {
    // Keep preview rows if full parse hits an edge case
  }

  const nowIso = new Date().toISOString();
  const datasetId = `ds-${crypto.randomUUID().slice(0, 8)}`;
  const displayName = customName?.trim() || file.name;
  const v1 = createVersionRecord({
    datasetId,
    versionNumber: 1,
    parentVersionId: null,
    filename: file.name,
    rows,
    columns,
    createdAt: nowIso,
    changelogSummary: `Uploaded ${file.name} (${rows.length.toLocaleString()} rows × ${columns.length} columns) and profiled locally.`,
  });

  const newDataset: LocalDatasetRecord = {
    id: datasetId,
    workspace_id: DEMO_WORKSPACE_ID,
    name: displayName,
    description: `${preview.format.toUpperCase()} dataset with ${rows.length.toLocaleString()} rows and ${columns.length} columns.`,
    source_filename: file.name,
    source_format: preview.format,
    status: 'READY',
    active_version_id: v1.id,
    created_at: nowIso,
    updated_at: nowIso,
    versions: [v1],
  };

  storeState = {
    ...storeState,
    datasets: [newDataset, ...storeState.datasets],
    activities: [
      {
        id: `act-${Date.now()}`,
        title: 'Dataset uploaded',
        detail: `${displayName} · ${rows.length.toLocaleString()} rows`,
        timestamp: nowIso,
        category: 'upload',
      },
      ...storeState.activities.slice(0, 14),
    ],
  };
  notifyListeners();
  return newDataset;
}

/**
 * Executes a PreprocessingPlan immutably on the active version of a local dataset,
 * creating a new version (v2, v3, ...) with recomputed profiling & correlations.
 */
export function applyLocalPreprocessingPlan(
  datasetId: string,
  plan: PreprocessingPlan,
): { result: PreprocessingResult; newVersion: LocalDatasetVersionRecord } {
  const ds = getLocalDatasetById(datasetId);
  if (!ds) throw new Error('Dataset not found in workspace.');

  const activeVer = getActiveVersionOfDataset(ds);
  const transformed = applyPlanToRows(activeVer.rows, activeVer.columns, plan);
  const nextVersionNumber = Math.max(...ds.versions.map((v) => v.version_number)) + 1;
  const nowIso = new Date().toISOString();
  const baseName = ds.source_filename.replace(/\.[^/.]+$/, '');

  const newVersion = createVersionRecord({
    datasetId: ds.id,
    versionNumber: nextVersionNumber,
    parentVersionId: activeVer.id,
    filename: `${baseName}_v${nextVersionNumber}.csv`,
    rows: transformed.rows,
    columns: transformed.columns,
    createdAt: nowIso,
    changelogSummary:
      transformed.summaryBullets.length > 0
        ? transformed.summaryBullets.join(' ')
        : `Executed ${plan.title}.`,
  });

  const csvContent = serializeRowsToCsv(transformed.columns, transformed.rows);
  const exportedBuffer = new TextEncoder().encode(csvContent);

  storeState = {
    ...storeState,
    pipelinesRun: storeState.pipelinesRun + 1,
    datasets: storeState.datasets.map((d) =>
      d.id === ds.id
        ? {
            ...d,
            active_version_id: newVersion.id,
            updated_at: nowIso,
            versions: [newVersion, ...d.versions],
          }
        : d,
    ),
    activities: [
      {
        id: `act-${Date.now()}`,
        title: `Created v${nextVersionNumber} (${plan.title})`,
        detail: `${ds.name} · ${transformed.transformedRowCount.toLocaleString()} rows · ${transformed.transformedColumnCount} cols`,
        timestamp: nowIso,
        category: 'transform',
      },
      ...storeState.activities.slice(0, 14),
    ],
  };
  notifyListeners();

  return {
    newVersion,
    result: {
      sourceRowCount: transformed.originalRowCount,
      transformedRowCount: transformed.transformedRowCount,
      sourceColumnCount: transformed.originalColumnCount,
      transformedColumnCount: transformed.transformedColumnCount,
      appliedOperationsCount: plan.operations.length,
      exportedBuffer,
      durationMs: transformed.durationMs,
    },
  };
}

export function serializeRowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const header = columns.map(escapeCell).join(',');
  const lines = rows.map((r) => columns.map((c) => escapeCell(r[c])).join(','));
  return [header, ...lines].join('\n');
}

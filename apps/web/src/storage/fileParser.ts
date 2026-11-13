import * as XLSX from 'xlsx';
import type { SupportedFormat } from '@/types';

export interface ParsedPreview {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRowsEstimate: number;
  format: SupportedFormat;
  hash: string;
}

export const MAX_FILE_SIZE_BYTES = 40 * 1024 * 1024; // 40 MB

/**
 * Calculates SHA-256 hash of a file using standard Web Crypto API.
 */
export async function calculateSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digestBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(digestBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Detects format from filename and extension.
 */
export function detectFormat(filename: string): SupportedFormat {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'csv':
      return 'csv';
    case 'xlsx':
    case 'xls':
      return 'xlsx';
    case 'json':
      return 'json';
    case 'jsonl':
      return 'jsonl';
    default:
      throw new Error(
        `Unsupported file format ".${ext ?? ''}". Groundwork supports CSV, XLSX, JSON, and JSONL.`,
      );
  }
}

/**
 * Parses the first N rows of a file for client preview and metadata extraction.
 */
export async function parsePreview(file: File, maxPreviewRows = 100): Promise<ParsedPreview> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 40 MB free-tier limit.`,
    );
  }

  const format = detectFormat(file.name);
  const hash = await calculateSHA256(file);

  if (format === 'csv') {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      throw new Error('CSV file is empty.');
    }

    const firstLine = lines[0] ?? '';
    const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
    const columns = firstLine.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));

    const previewLines = lines.slice(1, maxPreviewRows + 1);
    const rows = previewLines.map((line) => {
      const vals = line.split(delimiter).map((v) => v.trim().replace(/^["']|["']$/g, ''));
      const row: Record<string, unknown> = {};
      columns.forEach((col, idx) => {
        row[col] = vals[idx] ?? null;
      });
      return row;
    });

    return {
      columns,
      rows,
      totalRowsEstimate: Math.max(0, lines.length - 1),
      format,
      hash,
    };
  }

  if (format === 'xlsx') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('Spreadsheet has no sheets.');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet) {
      throw new Error('Could not read worksheet.');
    }

    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: null,
    });
    if (jsonData.length === 0) {
      throw new Error('Worksheet is empty.');
    }

    const firstRow = jsonData[0] ?? {};
    const columns = Object.keys(firstRow);
    const rows = jsonData.slice(0, maxPreviewRows);

    return {
      columns,
      rows,
      totalRowsEstimate: jsonData.length,
      format,
      hash,
    };
  }

  if (format === 'json') {
    const text = await file.text();
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('JSON file must be a non-empty array of objects.');
    }

    const sample = parsed[0] as Record<string, unknown>;
    const columns = Object.keys(sample);
    const rows = parsed.slice(0, maxPreviewRows) as Record<string, unknown>[];

    return {
      columns,
      rows,
      totalRowsEstimate: parsed.length,
      format,
      hash,
    };
  }

  // format is 'jsonl'
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('JSONL file is empty.');
  }

  const firstParsed = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
  const columns = Object.keys(firstParsed);
  const rows: Record<string, unknown>[] = [];

  const previewCount = Math.min(lines.length, maxPreviewRows);
  for (let i = 0; i < previewCount; i++) {
    try {
      const item = JSON.parse(lines[i] ?? '{}') as Record<string, unknown>;
      rows.push(item);
    } catch {
      // Skip malformed lines in preview
    }
  }

  return {
    columns,
    rows,
    totalRowsEstimate: lines.length,
    format,
    hash,
  };
}

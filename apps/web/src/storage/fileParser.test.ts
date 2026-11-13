import { describe, it, expect } from 'vitest';
import { detectFormat, parsePreview, MAX_FILE_SIZE_BYTES } from './fileParser';

describe('fileParser', () => {
  it('detects supported file formats by extension', () => {
    expect(detectFormat('test.csv')).toBe('csv');
    expect(detectFormat('data.xlsx')).toBe('xlsx');
    expect(detectFormat('data.xls')).toBe('xlsx');
    expect(detectFormat('users.json')).toBe('json');
    expect(detectFormat('events.jsonl')).toBe('jsonl');
  });

  it('rejects unsupported file formats', () => {
    expect(() => detectFormat('script.py')).toThrow(/Unsupported file format/);
    expect(() => detectFormat('image.png')).toThrow(/Unsupported file format/);
  });

  it('enforces 40 MB max file size limit', async () => {
    const largeFile = new File(['x'], 'large.csv', { type: 'text/csv' });
    Object.defineProperty(largeFile, 'size', { value: MAX_FILE_SIZE_BYTES + 1000 });

    await expect(parsePreview(largeFile)).rejects.toThrow(/exceeds the 40 MB/);
  });

  it('correctly parses CSV content with headers and rows', async () => {
    const csvContent = 'name,age,city\nAlice,30,New York\nBob,25,San Francisco\nCharlie,35,Boston';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    const preview = await parsePreview(file);
    expect(preview.format).toBe('csv');
    expect(preview.columns).toEqual(['name', 'age', 'city']);
    expect(preview.rows).toHaveLength(3);
    expect(preview.rows[0]).toEqual({ name: 'Alice', age: '30', city: 'New York' });
    expect(preview.totalRowsEstimate).toBe(3);
    expect(preview.hash).toHaveLength(64); // SHA-256 hex string
  });

  it('correctly parses JSON array content', async () => {
    const jsonContent = JSON.stringify([
      { id: 1, product: 'Laptop', price: 999 },
      { id: 2, product: 'Phone', price: 499 },
    ]);
    const file = new File([jsonContent], 'products.json', { type: 'application/json' });

    const preview = await parsePreview(file);
    expect(preview.format).toBe('json');
    expect(preview.columns).toEqual(['id', 'product', 'price']);
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0]).toEqual({ id: 1, product: 'Laptop', price: 999 });
  });

  it('correctly parses JSONL line-by-line content', async () => {
    const jsonlContent =
      '{"user": "alice", "score": 95}\n{"user": "bob", "score": 88}\n{"user": "carol", "score": 92}';
    const file = new File([jsonlContent], 'scores.jsonl', { type: 'application/x-ndjson' });

    const preview = await parsePreview(file);
    expect(preview.format).toBe('jsonl');
    expect(preview.columns).toEqual(['user', 'score']);
    expect(preview.rows).toHaveLength(3);
    expect(preview.rows[1]).toEqual({ user: 'bob', score: 88 });
  });
});

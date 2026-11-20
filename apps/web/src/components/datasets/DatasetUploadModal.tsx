import { useState, useRef, type ChangeEvent, type DragEvent } from 'react';
import { useAuth } from '@/integrations/supabase';
import { uploadDataset } from '@/storage/datasetStorage';
import { uploadLocalDataset } from '@/storage/localWorkspaceStore';
import { parsePreview, type ParsedPreview } from '@/storage/fileParser';
import { DatasetPreviewTable } from './DatasetPreviewTable';
import type { Dataset } from '@/types/database';

interface DatasetUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (dataset: Dataset) => void;
}

export function DatasetUploadModal({ isOpen, onClose, onUploadSuccess }: DatasetUploadModalProps) {
  const { user, activeWorkspace, isDemoMode } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setFile(null);
    setDatasetName('');
    setPreview(null);
    setError(null);
    onClose();
  };

  const handleFileSelect = async (selectedFile: File) => {
    setError(null);
    setFile(selectedFile);
    setDatasetName(selectedFile.name);
    setLoadingPreview(true);

    try {
      const parsed = await parsePreview(selectedFile);
      setPreview(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file.');
      setFile(null);
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      void handleFileSelect(selected);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      void handleFileSelect(dropped);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    if (!datasetName.trim()) {
      setError('Please enter a dataset name before saving.');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      if (isDemoMode) {
        const created = await uploadLocalDataset(file, datasetName.trim());
        onUploadSuccess(created);
        resetAndClose();
        return;
      }

      if (!user || !activeWorkspace) {
        setError('No active workspace selected.');
        return;
      }

      const result = await uploadDataset({
        file,
        workspaceId: activeWorkspace.id,
        userId: user.id,
        customName: datasetName.trim(),
      });

      onUploadSuccess(result.dataset);
      resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="upload-modal-title" className="font-display text-base font-bold text-slate-900">
              Upload Dataset
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Workspace: <span className="font-medium text-slate-700">{activeWorkspace?.name ?? 'Local Workspace'}</span>
            </p>
          </div>
          <button
            type="button"
            aria-label="Close upload dialog"
            onClick={resetAndClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {error && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </div>
          )}

          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed p-10 text-center transition ${
                isDragOver
                  ? 'border-[#3b63f6] bg-blue-50/60'
                  : 'border-slate-300 bg-slate-50/70 hover:border-[#3b63f6]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.json,.jsonl"
                onChange={handleInputChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center cursor-pointer"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#3b63f6]">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>
                <span className="mt-3 text-sm font-semibold text-slate-900">
                  Click to browse or drag and drop a dataset file
                </span>
                <span className="mt-1 text-xs text-slate-500">
                  CSV · XLSX · JSON · JSONL · Up to 40 MB
                </span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{file.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500 font-mono tabular-nums">
                    {(preview?.format ?? 'FILE').toUpperCase()} · {(file.size / 1024).toFixed(1)} KB ·{' '}
                    {preview?.columns.length ?? 0} cols · ~{preview?.totalRowsEstimate ?? 0} rows
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                  }}
                  className="text-xs font-medium text-slate-600 hover:text-rose-600 cursor-pointer shrink-0 ml-3"
                >
                  Change file
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700" htmlFor="upload-dataset-name">
                  Dataset Name
                </label>
                <input
                  id="upload-dataset-name"
                  type="text"
                  required
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3b63f6] focus:outline-none"
                />
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold text-slate-700">
                  Data Preview (First 10 Rows)
                </h3>
                {loadingPreview ? (
                  <div className="p-6 text-center text-xs text-slate-500">Parsing preview...</div>
                ) : preview ? (
                  <DatasetPreviewTable
                    columns={preview.columns}
                    rows={preview.rows}
                    totalRowsEstimate={preview.totalRowsEstimate}
                  />
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/70 px-6 py-3.5 rounded-b-xl">
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!file || uploading || loadingPreview}
            onClick={() => void handleUpload()}
            className="rounded-lg bg-[#3b63f6] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#2f54e0] disabled:opacity-50 cursor-pointer"
          >
            {uploading ? 'Ingesting Dataset...' : 'Ingest & Open Explorer'}
          </button>
        </div>
      </div>
    </div>
  );
}

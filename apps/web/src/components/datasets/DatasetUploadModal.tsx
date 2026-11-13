import { useState, useRef, type ChangeEvent, type DragEvent } from 'react';
import { useAuth } from '@/integrations/supabase';
import { uploadDataset } from '@/storage/datasetStorage';
import { parsePreview, type ParsedPreview } from '@/storage/fileParser';
import { DatasetPreviewTable } from './DatasetPreviewTable';
import type { Dataset } from '@/types/database';

interface DatasetUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (dataset: Dataset) => void;
}

export function DatasetUploadModal({ isOpen, onClose, onUploadSuccess }: DatasetUploadModalProps) {
  const { user, activeWorkspace } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  if (!isOpen) return null;

  const handleFileSelect = async (selectedFile: File) => {
    setError(null);
    setFile(selectedFile);
    setDatasetName(selectedFile.name.replace(/\.[^/.]+$/, ''));
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
    if (!file || !user || !activeWorkspace) return;
    setError(null);
    setUploading(true);

    try {
      const result = await uploadDataset({
        file,
        workspaceId: activeWorkspace.id,
        userId: user.id,
        customName: datasetName,
      });

      onUploadSuccess(result.dataset);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Upload Dataset</h2>
            <p className="text-xs text-slate-400">
              Target Workspace:{' '}
              <span className="font-medium text-sky-400">{activeWorkspace?.name}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {error && (
            <div className="rounded-md border border-rose-800/60 bg-rose-950/40 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          {!file ? (
            /* Drag and Drop Zone */
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition ${
                isDragOver
                  ? 'border-sky-500 bg-sky-500/10'
                  : 'border-slate-700 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.json,.jsonl"
                onChange={handleInputChange}
                className="hidden"
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/10 text-sky-400">
                📁
              </div>
              <p className="mt-3 text-sm font-medium text-slate-200">
                Click to browse or drag and drop your file here
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Supported formats: <span className="font-semibold text-slate-300">CSV</span>,{' '}
                <span className="font-semibold text-slate-300">XLSX</span>,{' '}
                <span className="font-semibold text-slate-300">JSON</span>,{' '}
                <span className="font-semibold text-slate-300">JSONL</span>
              </p>
              <div className="mt-4 rounded-full bg-slate-800 px-3 py-1 text-[11px] text-slate-400">
                Max file size: 40 MB
              </div>
            </div>
          ) : (
            /* File Selected & Preview Mode */
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                <div className="flex items-center gap-3">
                  <span className="rounded bg-sky-500/20 px-2 py-1 font-mono text-xs uppercase text-sky-400">
                    {preview?.format ?? 'FILE'}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-slate-200">{file.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB · {preview?.columns.length ?? 0}{' '}
                      columns · ~{preview?.totalRowsEstimate ?? 0} rows
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                  }}
                  className="text-xs text-slate-400 hover:text-rose-400"
                >
                  Change
                </button>
              </div>

              {/* Name Input */}
              <div>
                <label className="block text-xs font-medium text-slate-300" htmlFor="datasetName">
                  Dataset Name
                </label>
                <input
                  id="datasetName"
                  type="text"
                  required
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              {/* Preview Table */}
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Data Preview (First 10 Rows)
                </h3>
                {loadingPreview ? (
                  <div className="p-6 text-center text-xs text-slate-400">Parsing preview...</div>
                ) : preview ? (
                  <DatasetPreviewTable columns={preview.columns} rows={preview.rows} />
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-800 bg-slate-950/60 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!file || uploading || loadingPreview}
            onClick={() => void handleUpload()}
            className="rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-sky-400 disabled:opacity-50"
          >
            {uploading ? 'Uploading to Private Storage...' : 'Save & Upload Dataset'}
          </button>
        </div>
      </div>
    </div>
  );
}

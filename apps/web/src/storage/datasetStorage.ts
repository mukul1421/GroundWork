import { supabase } from '@/integrations/supabase';
import { parsePreview, type ParsedPreview } from './fileParser';
import type { Dataset, DatasetVersion } from '@/types/database';

export interface UploadDatasetParams {
  file: File;
  workspaceId: string;
  userId: string;
  customName?: string;
  onProgress?: (percent: number) => void;
}

export interface UploadDatasetResult {
  dataset: Dataset;
  version: DatasetVersion;
  preview: ParsedPreview;
}

/**
 * Handles the complete M2 upload lifecycle per Spec §5.1 & §13.2:
 * 1. Client-side validation & preview generation
 * 2. Create PostgreSQL dataset record with status 'UPLOADING'
 * 3. Upload file to private 'datasets' bucket with immutable path
 * 4. Create dataset_versions record
 * 5. Update dataset status to 'READY' and active_version_id
 */
export async function uploadDataset({
  file,
  workspaceId,
  userId,
  customName,
}: UploadDatasetParams): Promise<UploadDatasetResult> {
  // Step 1: Client-side parsing and validation
  const preview = await parsePreview(file);
  const datasetName = customName?.trim() || file.name.replace(/\.[^/.]+$/, '');
  const datasetId = crypto.randomUUID();
  const versionId = crypto.randomUUID();

  // Step 2: Create initial metadata record (status: UPLOADING)
  const { error: datasetError } = await supabase
    .from('datasets')
    .insert({
      id: datasetId,
      workspace_id: workspaceId,
      name: datasetName,
      source_filename: file.name,
      source_format: preview.format,
      status: 'UPLOADING',
    })
    .select()
    .single();

  if (datasetError) {
    throw new Error(`Failed to create dataset metadata: ${datasetError.message}`);
  }

  // Step 3: Storage path following spec §11.4:
  // datasets/<user_id>/<workspace_id>/<dataset_id>/<version_id>/<filename>
  const safeFilename = encodeURIComponent(file.name);
  const storagePath = `${userId}/${workspaceId}/${datasetId}/${versionId}/${safeFilename}`;

  const { error: storageError } = await supabase.storage
    .from('datasets')
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (storageError) {
    // Clean up dataset record on upload failure
    await supabase.from('datasets').delete().eq('id', datasetId);
    throw new Error(`Storage upload failed: ${storageError.message}`);
  }

  // Step 4: Create dataset_version record (Version 1)
  const schemaSummary = preview.columns.map((col) => ({
    name: col,
    sampleValues: preview.rows.slice(0, 5).map((r) => {
      const v = r[col];
      if (v === null || v === undefined) return null;
      if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
      return JSON.stringify(v);
    }),
  }));

  const { data: versionRecord, error: versionError } = await supabase
    .from('dataset_versions')
    .insert({
      id: versionId,
      dataset_id: datasetId,
      version_number: 1,
      bucket_id: 'datasets',
      storage_path: storagePath,
      content_sha256: preview.hash,
      row_count: preview.totalRowsEstimate,
      column_count: preview.columns.length,
      file_size_bytes: file.size,
      schema_json: schemaSummary,
      created_by: userId,
    })
    .select()
    .single();

  if (versionError) {
    throw new Error(`Failed to create dataset version: ${versionError.message}`);
  }

  // Step 5: Update active_version_id and mark READY
  const { data: updatedDataset, error: updateError } = await supabase
    .from('datasets')
    .update({
      status: 'READY',
      active_version_id: versionId,
    })
    .eq('id', datasetId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to finalize dataset status: ${updateError.message}`);
  }

  return {
    dataset: updatedDataset,
    version: versionRecord,
    preview,
  };
}

/**
 * Deletes a dataset, cascading versions, and purges all storage files under its path.
 */
export async function deleteDataset(dataset: Dataset, userId: string): Promise<void> {
  // List all files in the dataset folder
  const folderPath = `${userId}/${dataset.workspace_id}/${dataset.id}`;
  const { data: files } = await supabase.storage.from('datasets').list(folderPath);

  if (files && files.length > 0) {
    const pathsToRemove = files.map((f) => `${folderPath}/${f.name}`);
    await supabase.storage.from('datasets').remove(pathsToRemove);
  }

  // Delete from PostgreSQL (foreign key CASCADE removes dataset_versions)
  const { error } = await supabase.from('datasets').delete().eq('id', dataset.id);
  if (error) {
    throw new Error(`Failed to delete dataset record: ${error.message}`);
  }
}

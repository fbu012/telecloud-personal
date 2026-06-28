export type ViewMode = 'photos' | 'drive' | 'uploads' | 'favorites' | 'settings';

export interface StoredFile {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256?: string | null;
  telegram_chat_id: string;
  telegram_message_id: number;
  telegram_file_id?: string | null;
  telegram_file_unique_id?: string | null;
  storage_provider: string;
  upload_mode: string;
  status: string;
  is_favorite: boolean;
  tags?: string[];
  notes?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export type UploadStatus = 'queued' | 'uploading' | 'uploaded' | 'failed' | 'retrying' | 'skipped';

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
  storedFile?: StoredFile;
}

export interface Settings {
  app_name: string;
  storage_provider: string;
  max_file_size_mb: number;
  upload_mode: string;
  telegram_api_base: string;
  telegram_chat_id_configured: boolean;
  bot_token_configured: boolean;
  migration_ready: boolean;
}

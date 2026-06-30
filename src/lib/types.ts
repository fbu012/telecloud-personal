export type ViewMode = 'photos' | 'drive' | 'uploads' | 'favorites' | 'trash' | 'settings';

export interface FolderItem {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  is_secure?: boolean;
}

export interface StoredFile {
  id: string;
  folder_id?: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256?: string | null;
  telegram_chat_id: string;
  telegram_message_id: number;
  telegram_file_id?: string | null;
  telegram_file_unique_id?: string | null;
  preview_telegram_chat_id?: string | null;
  preview_telegram_message_id?: number | null;
  preview_telegram_file_id?: string | null;
  preview_telegram_file_unique_id?: string | null;
  preview_mime_type?: string | null;
  preview_size_bytes?: number | null;
  thumbnail_telegram_chat_id?: string | null;
  thumbnail_telegram_message_id?: number | null;
  thumbnail_telegram_file_id?: string | null;
  thumbnail_telegram_file_unique_id?: string | null;
  thumbnail_mime_type?: string | null;
  thumbnail_size_bytes?: number | null;
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
  folder_id?: string | null;
  folder_name?: string;
  status: UploadStatus;
  progress: number;
  stage_label?: string;
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
  telegram_original_chat_id?: string;
  telegram_preview_chat_id?: string;
  telegram_thumbnail_chat_id?: string;
  telegram_original_chat_id_configured?: boolean;
  telegram_preview_chat_id_configured?: boolean;
  telegram_thumbnail_chat_id_configured?: boolean;
  bot_token_configured: boolean;
  trash_auto_delete_days?: number;
  migration_ready: boolean;
}

export interface ShareLink {
  id: string;
  token: string;
  target_type: 'file' | 'folder';
  target_id: string;
  allow_download: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicSharedFile {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

export interface PublicShareData {
  ok: true;
  target_type: 'file' | 'folder';
  allow_download: boolean;
  file?: PublicSharedFile;
  folder?: FolderItem;
  files: PublicSharedFile[];
}

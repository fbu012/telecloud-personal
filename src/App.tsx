import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Download,
  File as FileIcon,
  Folder,
  FolderPlus,
  Grid3X3,
  HardDrive,
  Heart,
  Image,
  Loader2,
  LogOut,
  MoreVertical,
  RefreshCcw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Star,
  Trash2,
  UploadCloud,
  Video,
  XCircle,
} from 'lucide-react';
import {
  ApiError,
  createFolder,
  deleteFile,
  getDownloadUrl,
  getMe,
  getPreviewUrl,
  getSettings,
  listFiles,
  listFolders,
  login,
  logout,
  updateFile,
  uploadFile,
} from './lib/api';
import { formatBytes, formatDate, getTypeGroup, typeLabel } from './lib/format';
import type { FolderItem, Settings, StoredFile, UploadItem, ViewMode } from './lib/types';

const typeFilters = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'document', label: 'Docs' },
  { value: 'audio', label: 'Audio' },
];

const navItems: Array<{ key: ViewMode; label: string; icon: typeof Grid3X3 }> = [
  { key: 'photos', label: 'Photos', icon: Image },
  { key: 'drive', label: 'Drive', icon: HardDrive },
  { key: 'uploads', label: 'Uploads', icon: UploadCloud },
  { key: 'favorites', label: 'Favorites', icon: Star },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [appName, setAppName] = useState('TeleCloud Personal');

  useEffect(() => {
    getMe()
      .then((me) => {
        setAuthenticated(me.authenticated);
        setAppName(me.app_name || 'TeleCloud Personal');
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-soft">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-slate-600">Loading private cloud...</span>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <LoginScreen appName={appName} onLoggedIn={() => setAuthenticated(true)} />;
  }

  return <Dashboard appName={appName} onLogout={() => setAuthenticated(false)} />;
}

function LoginScreen({ appName, onLoggedIn }: { appName: string; onLoggedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-border bg-white/90 p-6 shadow-soft backdrop-blur">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-soft">
            <Cloud className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-950">{appName}</h1>
            <p className="text-sm text-slate-500">Private Telegram cloud dashboard</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
              Admin password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Masukkan password"
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-primary"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <button
            type="submit"
            disabled={loading || !password}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Login
          </button>
        </form>

        <p className="mt-6 text-xs leading-5 text-slate-500">
          Frontend boleh publik, tapi data dan Telegram token tetap dilindungi di Pages Functions lewat cookie HttpOnly.
        </p>
      </div>
    </div>
  );
}

function Dashboard({ appName, onLogout }: { appName: string; onLogout: () => void }) {
  const [view, setView] = useState<ViewMode>('photos');
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<StoredFile | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const maxBytes = useMemo(() => Math.round((settings?.max_file_size_mb || 20) * 1024 * 1024), [settings]);
  const currentFolder = useMemo(() => folders.find((folder) => folder.id === currentFolderId) || null, [folders, currentFolderId]);
  const currentFolderName = currentFolder?.name || 'Root';
  const childFolders = useMemo(() => folders.filter((folder) => (folder.parent_id || null) === currentFolderId), [folders, currentFolderId]);
  const breadcrumbs = useMemo(() => buildBreadcrumbs(folders, currentFolderId), [folders, currentFolderId]);

  const refresh = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const useFolderFilter = view === 'drive';
      const [remoteFiles, remoteFolders, remoteSettings] = await Promise.all([
        listFiles({ q: searchQuery, type: typeFilter, favorite: view === 'favorites', folder_id: currentFolderId, useFolderFilter }),
        listFolders().catch(() => []),
        getSettings().catch(() => null),
      ]);
      setFiles(remoteFiles);
      setFolders(remoteFolders);
      if (remoteSettings) setSettings(remoteSettings);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setLoadingFiles(false);
    }
  }, [currentFolderId, searchQuery, typeFilter, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function doLogout() {
    await logout();
    onLogout();
  }

  function handlePickFiles() {
    inputRef.current?.click();
  }

  function addFiles(fileList: FileList | File[], folderId = currentFolderId) {
    const incoming = Array.from(fileList);
    const folderName = folderId ? folders.find((folder) => folder.id === folderId)?.name || 'Folder' : 'Root';
    const items: UploadItem[] = incoming.map((file) => {
      const tooLarge = file.size > maxBytes;
      return {
        id: crypto.randomUUID(),
        file,
        folder_id: folderId,
        folder_name: folderName,
        status: tooLarge ? 'failed' : 'queued',
        progress: 0,
        error: tooLarge ? `Terlalu besar. Maksimal ${formatBytes(maxBytes)}.` : undefined,
      };
    });
    setUploadItems((prev) => [...items, ...prev]);
    setView('uploads');
  }

  async function processOne(item: UploadItem) {
    setUploadItems((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading', progress: 35, error: undefined } : q)));
    try {
      const result = await uploadFile(item.file, false, item.folder_id || null);
      if (result.skipped) {
        setUploadItems((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'skipped', progress: 100 } : q)));
      } else if (result.file) {
        setUploadItems((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'uploaded', progress: 100, storedFile: result.file } : q)),
        );
        setFiles((prev) => [result.file!, ...prev.filter((file) => file.id !== result.file!.id)]);
      }
    } catch (err) {
      const message = err instanceof ApiError || err instanceof Error ? err.message : 'Upload gagal';
      setUploadItems((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'failed', progress: 0, error: message } : q)));
    }
  }

  async function startQueue() {
    const queued = uploadItems.filter((item) => item.status === 'queued' || item.status === 'retrying');
    for (const item of queued) {
      await processOne(item);
    }
    await refresh();
  }

  async function retryFailed() {
    const failed = uploadItems.filter((item) => item.status === 'failed' && item.file.size <= maxBytes);
    setUploadItems((prev) => prev.map((item) => (item.status === 'failed' && item.file.size <= maxBytes ? { ...item, status: 'retrying', error: undefined } : item)));
    for (const item of failed) {
      await processOne({ ...item, status: 'retrying', error: undefined });
    }
    await refresh();
  }

  async function toggleFavorite(file: StoredFile) {
    try {
      const updated = await updateFile(file.id, { is_favorite: !file.is_favorite });
      setFiles((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (selected?.id === updated.id) setSelected(updated);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal update favorite');
    }
  }

  async function removeFile(file: StoredFile) {
    if (!window.confirm(`Pindahkan "${file.original_name}" ke trash?`)) return;
    try {
      await deleteFile(file.id, false);
      setFiles((prev) => prev.filter((item) => item.id !== file.id));
      if (selected?.id === file.id) setSelected(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menghapus file');
    }
  }

  async function createFolderInCurrent() {
    const name = window.prompt('Nama folder baru');
    if (!name?.trim()) return;
    try {
      const folder = await createFolder(name, currentFolderId);
      setFolders((prev) => [...prev, folder]);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal membuat folder');
    }
  }

  async function moveFileToFolder(fileId: string, folderId: string | null) {
    try {
      const updated = await updateFile(fileId, { folder_id: folderId });
      setFiles((prev) => prev.filter((item) => item.id !== updated.id));
      setNotice(`File dipindahkan ke ${folderId ? folders.find((folder) => folder.id === folderId)?.name || 'folder' : 'Root'}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal memindahkan file');
    } finally {
      setDraggingFileId(null);
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) addFiles(event.target.files, view === 'drive' ? currentFolderId : null);
    event.target.value = '';
  }

  const visibleFiles = useMemo(() => {
    if (view === 'photos') return files.filter((file) => ['image', 'video'].includes(getTypeGroup(file.mime_type)));
    if (view === 'favorites') return files.filter((file) => file.is_favorite);
    return files;
  }, [files, view]);

  return (
    <div className="min-h-screen text-slate-950">
      <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFileInput} />

      <div className="mx-auto flex min-h-screen max-w-[1500px] gap-4 p-3 lg:p-5">
        <aside className="hidden w-64 shrink-0 rounded-[28px] border border-border bg-white/90 p-4 shadow-soft backdrop-blur lg:block">
          <Brand appName={appName} />
          <nav className="mt-8 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition',
                    view === item.key ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-8 rounded-3xl border border-blue-100 bg-blue-50/70 p-4">
            <p className="text-sm font-semibold text-blue-950">Mode awal</p>
            <p className="mt-1 text-xs leading-5 text-blue-800">Telegram Bot API biasa · maksimal {settings?.max_file_size_mb || 20} MB/file.</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-3 z-20 rounded-[28px] border border-border bg-white/90 p-3 shadow-soft backdrop-blur">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3 lg:hidden">
                <Brand appName={appName} compact />
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border bg-slate-50 px-3 py-2.5">
                <Search className="h-5 w-5 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search photos, videos, documents..."
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto">
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="rounded-2xl border border-border bg-white px-3 py-2.5 text-sm text-slate-700"
                >
                  {typeFilters.map((filter) => (
                    <option key={filter.value} value={filter.value}>{filter.label}</option>
                  ))}
                </select>
                <button onClick={handlePickFiles} className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1d4ed8]">
                  <UploadCloud className="h-4 w-4" /> Upload
                </button>
                <button onClick={refresh} className="rounded-2xl border border-border bg-white p-2.5 text-slate-500 hover:bg-slate-50" title="Refresh">
                  <RefreshCcw className="h-5 w-5" />
                </button>
                <button onClick={doLogout} className="rounded-2xl border border-border bg-white p-2.5 text-slate-500 hover:bg-slate-50" title="Logout">
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto lg:hidden">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={() => setView(item.key)}
                    className={cx('flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold', view === item.key ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600')}
                  >
                    <Icon className="h-4 w-4" /> {item.label}
                  </button>
                );
              })}
            </div>
          </header>

          {notice && (
            <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span>{notice}</span>
              <button onClick={() => setNotice('')} className="font-semibold">Close</button>
            </div>
          )}

          <section className="mt-5">
            {view === 'uploads' ? (
              <UploadQueue
                items={uploadItems}
                maxBytes={maxBytes}
                onPickFiles={handlePickFiles}
                onStart={startQueue}
                onRetry={retryFailed}
                onAddFiles={(filesToAdd) => addFiles(filesToAdd, currentFolderId)}
                onClearCompleted={() => setUploadItems((prev) => prev.filter((item) => !['uploaded', 'skipped'].includes(item.status)))}
                onCancelWaiting={() => setUploadItems((prev) => prev.filter((item) => !['queued', 'retrying'].includes(item.status)))}
              />
            ) : view === 'settings' ? (
              <SettingsView settings={settings} />
            ) : view === 'drive' ? (
              <DriveView
                files={visibleFiles}
                folders={childFolders}
                allFolders={folders}
                breadcrumbs={breadcrumbs}
                currentFolderId={currentFolderId}
                currentFolderName={currentFolderName}
                loading={loadingFiles}
                onPickFiles={handlePickFiles}
                onDropFiles={(droppedFiles) => addFiles(droppedFiles, currentFolderId)}
                onCreateFolder={createFolderInCurrent}
                onOpenFolder={(folderId) => setCurrentFolderId(folderId)}
                onDeleteFile={removeFile}
                onFavorite={toggleFavorite}
                onSelect={setSelected}
                onMoveFile={moveFileToFolder}
                draggingFileId={draggingFileId}
                setDraggingFileId={setDraggingFileId}
              />
            ) : (
              <LibraryView
                view={view}
                files={visibleFiles}
                loading={loadingFiles}
                onPickFiles={handlePickFiles}
                onDelete={removeFile}
                onFavorite={toggleFavorite}
                onSelect={setSelected}
              />
            )}
          </section>
        </main>
      </div>

      {selected && (
        <FileDrawer
          file={selected}
          folders={folders}
          onClose={() => setSelected(null)}
          onFavorite={() => toggleFavorite(selected)}
          onDelete={() => removeFile(selected)}
          onSaved={(updated) => {
            setFiles((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
            setSelected(updated);
          }}
        />
      )}
    </div>
  );
}

function Brand({ appName, compact = false }: { appName: string; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cx('flex items-center justify-center rounded-2xl bg-primary text-white shadow-sm', compact ? 'h-10 w-10' : 'h-11 w-11')}>
        <Cloud className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">{appName}</p>
        <p className="truncate text-xs text-slate-500">Private cloud</p>
      </div>
    </div>
  );
}

function LibraryView({
  view,
  files,
  loading,
  onPickFiles,
  onSelect,
  onFavorite,
  onDelete,
}: {
  view: ViewMode;
  files: StoredFile[];
  loading: boolean;
  onPickFiles: () => void;
  onSelect: (file: StoredFile) => void;
  onFavorite: (file: StoredFile) => void;
  onDelete: (file: StoredFile) => void;
}) {
  return (
    <div className="rounded-[28px] border border-border bg-white/85 p-4 shadow-soft backdrop-blur">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{view === 'photos' ? 'Photos' : view === 'favorites' ? 'Favorites' : 'Drive'}</h2>
          <p className="text-sm text-slate-500">{files.length} file tersimpan</p>
        </div>
        <button onClick={onPickFiles} className="rounded-2xl border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Add files</button>
      </div>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : files.length === 0 ? (
        <EmptyState onPickFiles={onPickFiles} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
          {files.map((file) => (
            <FileCard key={file.id} file={file} onSelect={onSelect} onFavorite={onFavorite} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function DriveView({
  files,
  folders,
  breadcrumbs,
  currentFolderId,
  currentFolderName,
  loading,
  onPickFiles,
  onDropFiles,
  onCreateFolder,
  onOpenFolder,
  onSelect,
  onFavorite,
  onDeleteFile,
  onMoveFile,
  draggingFileId,
  setDraggingFileId,
}: {
  files: StoredFile[];
  folders: FolderItem[];
  allFolders: FolderItem[];
  breadcrumbs: FolderItem[];
  currentFolderId: string | null;
  currentFolderName: string;
  loading: boolean;
  onPickFiles: () => void;
  onDropFiles: (files: File[]) => void;
  onCreateFolder: () => void;
  onOpenFolder: (folderId: string | null) => void;
  onSelect: (file: StoredFile) => void;
  onFavorite: (file: StoredFile) => void;
  onDeleteFile: (file: StoredFile) => void;
  onMoveFile: (fileId: string, folderId: string | null) => void;
  draggingFileId: string | null;
  setDraggingFileId: (id: string | null) => void;
}) {
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const droppedFiles = Array.from(event.dataTransfer.files || []);
    if (droppedFiles.length) onDropFiles(droppedFiles);
  }

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      className="rounded-[28px] border border-border bg-white/85 p-4 shadow-soft backdrop-blur"
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
            <button
              onClick={() => onOpenFolder(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (draggingFileId) onMoveFile(draggingFileId, null);
              }}
              className="rounded-xl px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
            >
              Drive
            </button>
            {breadcrumbs.map((folder) => (
              <span key={folder.id} className="flex items-center gap-1">
                <ChevronRight className="h-4 w-4" />
                <button onClick={() => onOpenFolder(folder.id)} className="rounded-xl px-2 py-1 font-medium text-slate-700 hover:bg-slate-100">{folder.name}</button>
              </span>
            ))}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">{currentFolderName}</h2>
          <p className="text-sm text-slate-500">{folders.length} folder · {files.length} file</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onCreateFolder} className="flex items-center gap-2 rounded-2xl border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <FolderPlus className="h-4 w-4" /> New folder
          </button>
          <button onClick={onPickFiles} className="rounded-2xl border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Add files</button>
        </div>
      </div>

      <div className="mb-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
        Drag & drop file ke area ini untuk upload ke folder <strong>{currentFolderName}</strong>. Drag file yang sudah ada ke kartu folder untuk memindahkan.
      </div>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : folders.length === 0 && files.length === 0 ? (
        <EmptyState onPickFiles={onPickFiles} />
      ) : (
        <div className="space-y-5">
          {folders.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {folders.map((folder) => (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  onOpen={() => onOpenFolder(folder.id)}
                  onMoveFile={draggingFileId ? () => onMoveFile(draggingFileId, folder.id) : undefined}
                />
              ))}
            </div>
          )}
          {files.length > 0 && (
            <FileTable
              files={files}
              onSelect={onSelect}
              onFavorite={onFavorite}
              onDelete={onDeleteFile}
              onDragStart={setDraggingFileId}
              onDragEnd={() => setDraggingFileId(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FolderCard({ folder, onOpen, onMoveFile }: { folder: FolderItem; onOpen: () => void; onMoveFile?: () => void }) {
  return (
    <div
      onDragOver={(event) => {
        if (onMoveFile) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!onMoveFile) return;
        event.preventDefault();
        onMoveFile();
      }}
      className="group rounded-3xl border border-border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft"
    >
      <button onClick={onOpen} className="flex w-full items-center gap-3 text-left">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-primary">
          <Folder className="h-6 w-6" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-950">{folder.name}</span>
          <span className="block text-xs text-slate-500">Folder</span>
        </span>
      </button>
    </div>
  );
}

function EmptyState({ onPickFiles }: { onPickFiles: () => void }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-primary shadow-sm"><UploadCloud className="h-7 w-7" /></div>
      <h3 className="mt-4 text-base font-semibold text-slate-950">Belum ada file</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Upload foto, video, dokumen, atau file lain ke private Telegram channel.</p>
      <button onClick={onPickFiles} className="mt-5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8]">Upload file</button>
    </div>
  );
}

function FileCard({ file, onSelect, onFavorite, onDelete }: { file: StoredFile; onSelect: (file: StoredFile) => void; onFavorite: (file: StoredFile) => void; onDelete: (file: StoredFile) => void }) {
  const isImage = getTypeGroup(file.mime_type) === 'image';
  const Icon = iconForMime(file.mime_type);

  return (
    <div className="group overflow-hidden rounded-3xl border border-border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
      <button onClick={() => onSelect(file)} className="flex aspect-square w-full items-center justify-center overflow-hidden bg-slate-50 text-slate-400 transition group-hover:bg-blue-50 group-hover:text-primary">
        {isImage ? <img src={getPreviewUrl(file.id)} alt={file.original_name} className="h-full w-full object-cover" loading="lazy" /> : <Icon className="h-14 w-14" />}
      </button>
      <div className="p-3">
        <button onClick={() => onSelect(file)} className="block w-full truncate text-left text-sm font-medium text-slate-950" title={file.original_name}>{file.original_name}</button>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>{formatBytes(file.size_bytes)}</span>
          <span>{typeLabel(file.mime_type)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button onClick={() => onFavorite(file)} className={cx('rounded-xl p-2', file.is_favorite ? 'bg-amber-50 text-amber-600' : 'text-slate-400 hover:bg-slate-100')} title="Favorite"><Heart className={cx('h-4 w-4', file.is_favorite && 'fill-current')} /></button>
          <div className="flex items-center gap-1">
            <a href={getDownloadUrl(file.id)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-primary" title="Download"><Download className="h-4 w-4" /></a>
            <button onClick={() => onDelete(file)} className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileTable({
  files,
  onSelect,
  onFavorite,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  files: StoredFile[];
  onSelect: (file: StoredFile) => void;
  onFavorite: (file: StoredFile) => void;
  onDelete: (file: StoredFile) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Size</th>
              <th className="px-4 py-3 font-semibold">Uploaded</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white">
            {files.map((file) => {
              const isImage = getTypeGroup(file.mime_type) === 'image';
              const Icon = iconForMime(file.mime_type);
              return (
                <tr key={file.id} draggable onDragStart={() => onDragStart(file.id)} onDragEnd={onDragEnd} className="hover:bg-slate-50/70">
                  <td className="max-w-[320px] px-4 py-3">
                    <button onClick={() => onSelect(file)} className="flex min-w-0 items-center gap-3 text-left">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-slate-500">
                        {isImage ? <img src={getPreviewUrl(file.id)} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Icon className="h-5 w-5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-950">{file.original_name}</span>
                        <span className="block truncate text-xs text-slate-500">{file.mime_type}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{typeLabel(file.mime_type)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatBytes(file.size_bytes)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(file.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => onFavorite(file)} className={cx('rounded-xl p-2', file.is_favorite ? 'text-amber-600' : 'text-slate-400 hover:bg-slate-100')}><Heart className={cx('h-4 w-4', file.is_favorite && 'fill-current')} /></button>
                      <a href={getDownloadUrl(file.id)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-primary"><Download className="h-4 w-4" /></a>
                      <button onClick={() => onDelete(file)} className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UploadQueue({
  items,
  maxBytes,
  onPickFiles,
  onStart,
  onRetry,
  onAddFiles,
  onClearCompleted,
  onCancelWaiting,
}: {
  items: UploadItem[];
  maxBytes: number;
  onPickFiles: () => void;
  onStart: () => void;
  onRetry: () => void;
  onAddFiles: (files: File[]) => void;
  onClearCompleted: () => void;
  onCancelWaiting: () => void;
}) {
  const hasQueued = items.some((item) => item.status === 'queued' || item.status === 'retrying');
  const hasFailed = items.some((item) => item.status === 'failed');
  const completedCount = items.filter((item) => item.status === 'uploaded' || item.status === 'skipped').length;

  return (
    <div className="rounded-[28px] border border-border bg-white/85 p-4 shadow-soft backdrop-blur">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Upload Queue</h2>
          <p className="text-sm text-slate-500">Maksimal {formatBytes(maxBytes)} per file · {completedCount} selesai</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onPickFiles} className="rounded-2xl border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Add files</button>
          <button onClick={onStart} disabled={!hasQueued} className="rounded-2xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">Start upload</button>
          <button onClick={onRetry} disabled={!hasFailed} className="rounded-2xl border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Retry failed</button>
        </div>
      </div>

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const droppedFiles = Array.from(event.dataTransfer.files || []);
          if (droppedFiles.length) onAddFiles(droppedFiles);
        }}
        className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-4"
      >
        {items.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <UploadCloud className="h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold text-slate-950">Pilih banyak file sekaligus</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Drop file ke sini atau klik tombol. Queue akan upload satu per satu agar lebih stabil.</p>
            <button onClick={onPickFiles} className="mt-5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8]">Select files</button>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => <UploadQueueRow key={item.id} item={item} />)}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={onClearCompleted} className="rounded-2xl border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Clear completed</button>
          <button onClick={onCancelWaiting} className="rounded-2xl border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel waiting</button>
        </div>
      )}
    </div>
  );
}

function UploadQueueRow({ item }: { item: UploadItem }) {
  const statusStyle = {
    queued: 'text-slate-500 bg-slate-100',
    uploading: 'text-blue-700 bg-blue-50',
    uploaded: 'text-green-700 bg-green-50',
    failed: 'text-red-700 bg-red-50',
    retrying: 'text-amber-700 bg-amber-50',
    skipped: 'text-slate-500 bg-slate-100',
  }[item.status];

  const StatusIcon = item.status === 'uploaded' ? CheckCircle2 : item.status === 'failed' ? XCircle : item.status === 'uploading' || item.status === 'retrying' ? Loader2 : FileIcon;

  return (
    <div className="rounded-2xl border border-border bg-white p-3">
      <div className="flex items-center gap-3">
        <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', statusStyle)}>
          <StatusIcon className={cx('h-5 w-5', (item.status === 'uploading' || item.status === 'retrying') && 'animate-spin')} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium text-slate-950">{item.file.name}</p>
            <span className="shrink-0 text-xs text-slate-500">{formatBytes(item.file.size)}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Tujuan: {item.folder_name || 'Root'}</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={cx('h-full rounded-full transition-all', item.status === 'failed' ? 'bg-red-500' : item.status === 'uploaded' ? 'bg-green-500' : 'bg-primary')} style={{ width: `${item.progress}%` }} />
          </div>
          {item.error && <p className="mt-2 text-xs text-red-600">{item.error}</p>}
        </div>
      </div>
    </div>
  );
}

function SettingsView({ settings }: { settings: Settings | null }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="rounded-[28px] border border-border bg-white/85 p-5 shadow-soft backdrop-blur xl:col-span-2">
        <h2 className="text-lg font-semibold text-slate-950">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">Konfigurasi runtime dari Cloudflare Environment Variables.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <SettingCard label="Storage mode" value={settings?.storage_provider || 'telegram_bot_api'} />
          <SettingCard label="Max file size" value={`${settings?.max_file_size_mb || 20} MB/file`} />
          <SettingCard label="Upload mode" value={settings?.upload_mode || 'document'} />
          <SettingCard label="Telegram API" value={settings?.telegram_api_base || 'https://api.telegram.org'} />
          <SettingCard label="Bot token" value={settings?.bot_token_configured ? 'Configured' : 'Missing'} tone={settings?.bot_token_configured ? 'success' : 'danger'} />
          <SettingCard label="Channel ID" value={settings?.telegram_chat_id_configured ? 'Configured' : 'Missing'} tone={settings?.telegram_chat_id_configured ? 'success' : 'danger'} />
        </div>
      </div>

      <div className="rounded-[28px] border border-blue-100 bg-blue-50/80 p-5 shadow-soft">
        <h3 className="font-semibold text-blue-950">Migration-ready</h3>
        <p className="mt-2 text-sm leading-6 text-blue-800">Folder, preview, dan metadata tetap kompatibel untuk upgrade ke Local Bot API Server nanti.</p>
        <div className="mt-4 rounded-2xl bg-white/70 p-3 text-xs leading-5 text-blue-900">Buka <code>MIGRATION.md</code> untuk upgrade VPS + Local Bot API Server.</div>
      </div>
    </div>
  );
}

function SettingCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'danger' }) {
  return (
    <div className="rounded-3xl border border-border bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx('mt-2 break-words text-sm font-semibold', tone === 'success' ? 'text-green-700' : tone === 'danger' ? 'text-red-700' : 'text-slate-950')}>{value}</p>
    </div>
  );
}

function FileDrawer({
  file,
  folders,
  onClose,
  onFavorite,
  onDelete,
  onSaved,
}: {
  file: StoredFile;
  folders: FolderItem[];
  onClose: () => void;
  onFavorite: () => void;
  onDelete: () => void;
  onSaved: (file: StoredFile) => void;
}) {
  const [name, setName] = useState(file.original_name);
  const [folderId, setFolderId] = useState<string | null>(file.folder_id || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const Icon = iconForMime(file.mime_type);
  const isImage = getTypeGroup(file.mime_type) === 'image';

  useEffect(() => {
    setName(file.original_name);
    setFolderId(file.folder_id || null);
  }, [file.id, file.original_name, file.folder_id]);

  async function save() {
    setSaving(true);
    setError('');
    try {
      const updated = await updateFile(file.id, { original_name: name, folder_id: folderId });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30 p-3 backdrop-blur-sm" onClick={onClose}>
      <aside className="w-full max-w-md overflow-hidden rounded-[28px] border border-border bg-white shadow-soft" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="font-semibold text-slate-950">File details</h3>
            <p className="text-xs text-slate-500">Metadata tersimpan di D1</p>
          </div>
          <button onClick={onClose} className="rounded-2xl p-2 text-slate-500 hover:bg-slate-100"><MoreVertical className="h-5 w-5" /></button>
        </div>

        <div className="max-h-[calc(100vh-7rem)] overflow-y-auto p-4 scrollbar-thin">
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-3xl bg-slate-50 text-slate-400">
            {isImage ? <img src={getPreviewUrl(file.id)} alt={file.original_name} className="h-full w-full object-contain" /> : <Icon className="h-16 w-16" />}
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">File name</label>
              <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none focus:border-primary" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Folder</label>
              <select value={folderId || 'root'} onChange={(event) => setFolderId(event.target.value === 'root' ? null : event.target.value)} className="w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none focus:border-primary">
                <option value="root">Root</option>
                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            </div>

            {error && <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <div className="grid grid-cols-2 gap-3">
              <Meta label="Size" value={formatBytes(file.size_bytes)} />
              <Meta label="Type" value={typeLabel(file.mime_type)} />
              <Meta label="Uploaded" value={formatDate(file.created_at)} />
              <Meta label="Provider" value={file.storage_provider} />
            </div>

            <div className="rounded-3xl border border-border bg-slate-50 p-4 text-xs leading-5 text-slate-600">
              <p><strong>Telegram message:</strong> {file.telegram_message_id}</p>
              <p className="truncate"><strong>File ID:</strong> {file.telegram_file_id || '-'}</p>
              <p className="truncate"><strong>SHA256:</strong> {file.checksum_sha256 || '-'}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={save} disabled={saving} className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
              <a href={getDownloadUrl(file.id)} className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> Download</a>
              <button onClick={onFavorite} className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Heart className={cx('h-4 w-4', file.is_favorite && 'fill-current text-amber-600')} /> Favorite</button>
              <button onClick={onDelete} className="flex items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100"><Trash2 className="h-4 w-4" /> Delete</button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-slate-950">{value}</p>
    </div>
  );
}

function buildBreadcrumbs(folders: FolderItem[], currentFolderId: string | null): FolderItem[] {
  const out: FolderItem[] = [];
  let cursor = currentFolderId;
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor)) {
    guard.add(cursor);
    const folder = folders.find((item) => item.id === cursor);
    if (!folder) break;
    out.unshift(folder);
    cursor = folder.parent_id;
  }
  return out;
}

function iconForMime(mime: string) {
  const group = getTypeGroup(mime);
  if (group === 'image') return Image;
  if (group === 'video') return Video;
  if (group === 'archive') return Archive;
  if (group === 'document') return FileIcon;
  if (group === 'audio') return FileIcon;
  return FileIcon;
}

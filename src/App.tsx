import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Download,
  File as FileIcon,
  Folder,
  FolderPlus,
  Grid3X3,
  Heart,
  Home,
  Image,
  List,
  Loader2,
  LogOut,
  MoreVertical,
  Plus,
  RefreshCcw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
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

type LayoutMode = 'list' | 'grid';
type SortMode = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc' | 'type';

type NavItem = { key: ViewMode; label: string; icon: typeof Grid3X3; mobileLabel?: string };

const typeFilters = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'document', label: 'Docs' },
  { value: 'audio', label: 'Audio' },
];

const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
  { value: 'size_desc', label: 'Largest first' },
  { value: 'size_asc', label: 'Smallest first' },
  { value: 'type', label: 'File type' },
];

const desktopNavItems: NavItem[] = [
  { key: 'photos', label: 'Home / Photos', icon: Home },
  { key: 'drive', label: 'Drive', icon: Folder },
  { key: 'uploads', label: 'Uploads', icon: UploadCloud },
  { key: 'favorites', label: 'Starred', icon: Star },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

const mobileNavItems: NavItem[] = [
  { key: 'photos', label: 'Home', mobileLabel: 'Home', icon: Home },
  { key: 'favorites', label: 'Starred', mobileLabel: 'Starred', icon: Star },
  { key: 'uploads', label: 'Uploads', mobileLabel: 'Uploads', icon: UploadCloud },
  { key: 'drive', label: 'Files', mobileLabel: 'Files', icon: Folder },
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
        <div className="flex items-center gap-3 rounded-[28px] border border-border bg-card px-5 py-4 shadow-soft">
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
      <div className="w-full max-w-md rounded-[32px] border border-border bg-white/95 p-6 shadow-soft backdrop-blur">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-primary text-white shadow-soft">
            <Cloud className="h-7 w-7" />
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
              className="w-full rounded-[22px] border border-border bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-primary"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="rounded-[22px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <button
            type="submit"
            disabled={loading || !password}
            className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-60"
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
  const [view, setView] = useState<ViewMode>('drive');
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('list');
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<StoredFile | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const maxBytes = useMemo(() => Math.round((settings?.max_file_size_mb || 20) * 1024 * 1024), [settings]);
  const currentFolder = useMemo(() => folders.find((folder) => folder.id === currentFolderId) || null, [folders, currentFolderId]);
  const childFolders = useMemo(() => folders.filter((folder) => (folder.parent_id || null) === currentFolderId).sort((a, b) => a.name.localeCompare(b.name)), [folders, currentFolderId]);
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

  function addFiles(fileList: FileList | File[], folderId = view === 'drive' ? currentFolderId : null) {
    const incoming = Array.from(fileList);
    if (!incoming.length) return;

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
        setUploadItems((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'uploaded', progress: 100, storedFile: result.file } : q)));
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
      setNotice(`Folder "${folder.name}" dibuat`);
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
    const byView = view === 'photos'
      ? files.filter((file) => ['image', 'video'].includes(getTypeGroup(file.mime_type)))
      : view === 'favorites'
        ? files.filter((file) => file.is_favorite)
        : files;
    return sortFiles(byView, sortMode);
  }, [files, view, sortMode]);

  const title = view === 'drive' ? 'Files' : view === 'photos' ? 'Home' : view === 'favorites' ? 'Starred' : view === 'uploads' ? 'Uploads' : 'Settings';

  return (
    <div className="min-h-screen pb-24 text-slate-950 lg:pb-0">
      <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFileInput} />

      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-4 p-0 lg:p-5">
        <aside className="hidden w-72 shrink-0 rounded-[30px] border border-border bg-white/95 p-4 shadow-soft backdrop-blur lg:block">
          <Brand appName={appName} />
          <button onClick={handlePickFiles} className="mt-8 flex w-full items-center justify-center gap-2 rounded-[22px] bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">
            <Plus className="h-4 w-4" /> New upload
          </button>
          <nav className="mt-5 space-y-1">
            {desktopNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-[22px] px-4 py-3 text-left text-sm font-semibold transition',
                    view === item.key ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-8 rounded-[28px] border border-blue-100 bg-blue-50/80 p-4">
            <p className="text-sm font-semibold text-blue-950">Mode awal</p>
            <p className="mt-1 text-xs leading-5 text-blue-800">Telegram Bot API biasa · maksimal {settings?.max_file_size_mb || 20} MB/file.</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-4 lg:px-0 lg:py-0">
          <header className="sticky top-3 z-20 rounded-[32px] border border-border bg-white/95 p-3 shadow-soft backdrop-blur">
            <div className="flex items-center gap-3">
              <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 lg:hidden" onClick={() => setView('settings')} title="Settings">
                <SettingsIcon className="h-6 w-6" />
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-border bg-slate-100/80 px-4 py-3">
                <Search className="h-5 w-5 shrink-0 text-slate-500" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search in Drive"
                  className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-500"
                />
              </div>
              <button onClick={doLogout} className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-white text-slate-500 hover:bg-slate-50 lg:flex" title="Logout">
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </header>

          {notice && (
            <div className="mt-4 flex items-center justify-between gap-4 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
              <SettingsView settings={settings} onLogout={doLogout} />
            ) : view === 'drive' ? (
              <DriveView
                title={title}
                files={visibleFiles}
                folders={childFolders}
                breadcrumbs={breadcrumbs}
                currentFolder={currentFolder}
                currentFolderId={currentFolderId}
                loading={loadingFiles}
                layoutMode={layoutMode}
                sortMode={sortMode}
                typeFilter={typeFilter}
                onLayoutChange={setLayoutMode}
                onSortChange={setSortMode}
                onTypeFilterChange={setTypeFilter}
                onPickFiles={handlePickFiles}
                onDropFiles={(droppedFiles) => addFiles(droppedFiles, currentFolderId)}
                onCreateFolder={createFolderInCurrent}
                onOpenFolder={(folderId) => setCurrentFolderId(folderId)}
                onBackToRoot={() => setCurrentFolderId(null)}
                onDeleteFile={removeFile}
                onFavorite={toggleFavorite}
                onSelect={setSelected}
                onMoveFile={moveFileToFolder}
                draggingFileId={draggingFileId}
                setDraggingFileId={setDraggingFileId}
              />
            ) : (
              <HomeView
                title={title}
                view={view}
                files={visibleFiles}
                loading={loadingFiles}
                layoutMode={layoutMode}
                sortMode={sortMode}
                typeFilter={typeFilter}
                onLayoutChange={setLayoutMode}
                onSortChange={setSortMode}
                onTypeFilterChange={setTypeFilter}
                onPickFiles={handlePickFiles}
                onDelete={removeFile}
                onFavorite={toggleFavorite}
                onSelect={setSelected}
              />
            )}
          </section>
        </main>
      </div>

      <FloatingActions view={view} onUpload={handlePickFiles} onNewFolder={createFolderInCurrent} />
      <MobileBottomNav view={view} setView={setView} />

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

function Brand({ appName }: { appName: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-primary text-white shadow-sm">
        <Cloud className="h-7 w-7" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold text-slate-950">{appName}</p>
        <p className="truncate text-sm text-slate-500">Private cloud</p>
      </div>
    </div>
  );
}

function MobileBottomNav({ view, setView }: { view: ViewMode; setView: (view: ViewMode) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-3 pb-3 pt-2 shadow-[0_-16px_40px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
      <div className="grid grid-cols-4 gap-1">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={cx('flex flex-col items-center justify-center gap-1 rounded-[22px] px-2 py-2 text-xs font-semibold transition', active ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-100')}
            >
              <Icon className="h-6 w-6" />
              {item.mobileLabel || item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function FloatingActions({ view, onUpload, onNewFolder }: { view: ViewMode; onUpload: () => void; onNewFolder: () => void }) {
  return (
    <div className="fixed bottom-24 right-4 z-30 flex flex-col items-end gap-3 lg:hidden">
      {view === 'drive' && (
        <button onClick={onNewFolder} className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-white text-slate-700 shadow-soft ring-1 ring-border">
          <FolderPlus className="h-6 w-6" />
        </button>
      )}
      <button onClick={onUpload} className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-slate-700 text-white shadow-soft">
        <Plus className="h-9 w-9" />
      </button>
    </div>
  );
}

function DriveView({
  title,
  files,
  folders,
  breadcrumbs,
  currentFolder,
  currentFolderId,
  loading,
  layoutMode,
  sortMode,
  typeFilter,
  onLayoutChange,
  onSortChange,
  onTypeFilterChange,
  onPickFiles,
  onDropFiles,
  onCreateFolder,
  onOpenFolder,
  onBackToRoot,
  onDeleteFile,
  onFavorite,
  onSelect,
  onMoveFile,
  draggingFileId,
  setDraggingFileId,
}: {
  title: string;
  files: StoredFile[];
  folders: FolderItem[];
  breadcrumbs: FolderItem[];
  currentFolder: FolderItem | null;
  currentFolderId: string | null;
  loading: boolean;
  layoutMode: LayoutMode;
  sortMode: SortMode;
  typeFilter: string;
  onLayoutChange: (mode: LayoutMode) => void;
  onSortChange: (mode: SortMode) => void;
  onTypeFilterChange: (type: string) => void;
  onPickFiles: () => void;
  onDropFiles: (files: File[]) => void;
  onCreateFolder: () => void;
  onOpenFolder: (folderId: string | null) => void;
  onBackToRoot: () => void;
  onDeleteFile: (file: StoredFile) => void;
  onFavorite: (file: StoredFile) => void;
  onSelect: (file: StoredFile) => void;
  onMoveFile: (fileId: string, folderId: string | null) => void;
  draggingFileId: string | null;
  setDraggingFileId: (id: string | null) => void;
}) {
  return (
    <DriveSurface onDropFiles={onDropFiles}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onBackToRoot} className="text-2xl font-semibold tracking-tight text-slate-950 hover:text-primary">{title}</button>
            {breadcrumbs.map((crumb) => (
              <div key={crumb.id} className="flex items-center gap-2 text-slate-500">
                <ChevronRight className="h-5 w-5" />
                <button onClick={() => onOpenFolder(crumb.id)} className="max-w-[160px] truncate text-2xl font-semibold tracking-tight text-slate-950 hover:text-primary">
                  {crumb.name}
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {folders.length} folder · {files.length} file {currentFolder ? `di ${currentFolder.name}` : 'di Root'}
          </p>
        </div>

        <div className="hidden flex-wrap gap-2 sm:flex">
          <button onClick={onCreateFolder} className="flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <FolderPlus className="h-4 w-4" /> Folder
          </button>
          <button onClick={onPickFiles} className="flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8]">
            <UploadCloud className="h-4 w-4" /> Upload
          </button>
        </div>
      </div>

      <DriveToolbar
        layoutMode={layoutMode}
        sortMode={sortMode}
        typeFilter={typeFilter}
        onLayoutChange={onLayoutChange}
        onSortChange={onSortChange}
        onTypeFilterChange={onTypeFilterChange}
      />

      {loading ? (
        <LoadingState />
      ) : folders.length === 0 && files.length === 0 ? (
        <EmptyDrive onPickFiles={onPickFiles} onCreateFolder={onCreateFolder} />
      ) : (
        <div className="mt-4 space-y-5">
          {folders.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-600">Folders</h3>
              <FolderGrid folders={folders} onOpenFolder={onOpenFolder} onMoveFile={onMoveFile} draggingFileId={draggingFileId} />
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-600">Files</h3>
              <span className="text-xs text-slate-400">Drag file ke folder untuk memindahkan</span>
            </div>
            {layoutMode === 'grid' ? (
              <FileGrid files={files} onSelect={onSelect} onFavorite={onFavorite} onDelete={onDeleteFile} setDraggingFileId={setDraggingFileId} />
            ) : (
              <FileList files={files} onSelect={onSelect} onFavorite={onFavorite} onDelete={onDeleteFile} setDraggingFileId={setDraggingFileId} />
            )}
          </section>
        </div>
      )}

      <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 p-4 text-center text-sm text-slate-500">
        Drop file ke area ini untuk upload ke {currentFolder ? currentFolder.name : 'Root'}.
      </div>
    </DriveSurface>
  );
}

function DriveSurface({ children, onDropFiles }: { children: React.ReactNode; onDropFiles: (files: File[]) => void }) {
  const [active, setActive] = useState(false);
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setActive(false);
    const droppedFiles = Array.from(event.dataTransfer.files || []);
    if (droppedFiles.length) onDropFiles(droppedFiles);
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={handleDrop}
      className={cx('rounded-[32px] border border-border bg-white/90 p-4 shadow-soft backdrop-blur lg:p-6', active && 'file-drop-active')}
    >
      {children}
    </div>
  );
}

function DriveToolbar({
  layoutMode,
  sortMode,
  typeFilter,
  onLayoutChange,
  onSortChange,
  onTypeFilterChange,
}: {
  layoutMode: LayoutMode;
  sortMode: SortMode;
  typeFilter: string;
  onLayoutChange: (mode: LayoutMode) => void;
  onSortChange: (mode: SortMode) => void;
  onTypeFilterChange: (type: string) => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[26px] bg-slate-50 p-2">
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
        <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-border">
          <SlidersHorizontal className="h-4 w-4" /> Filter
        </div>
        <select value={typeFilter} onChange={(event) => onTypeFilterChange(event.target.value)} className="rounded-full border border-border bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
          {typeFilters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
        </select>
        <select value={sortMode} onChange={(event) => onSortChange(event.target.value as SortMode)} className="rounded-full border border-border bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
          {sortOptions.map((option) => <option key={option.value} value={option.value}>Sort: {option.label}</option>)}
        </select>
      </div>

      <div className="flex rounded-full bg-slate-200 p-1">
        <button onClick={() => onLayoutChange('list')} className={cx('rounded-full p-2 transition', layoutMode === 'list' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white')} title="List view">
          <List className="h-5 w-5" />
        </button>
        <button onClick={() => onLayoutChange('grid')} className={cx('rounded-full p-2 transition', layoutMode === 'grid' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white')} title="Grid view">
          <Grid3X3 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function HomeView({
  title,
  view,
  files,
  loading,
  layoutMode,
  sortMode,
  typeFilter,
  onLayoutChange,
  onSortChange,
  onTypeFilterChange,
  onPickFiles,
  onDelete,
  onFavorite,
  onSelect,
}: {
  title: string;
  view: ViewMode;
  files: StoredFile[];
  loading: boolean;
  layoutMode: LayoutMode;
  sortMode: SortMode;
  typeFilter: string;
  onLayoutChange: (mode: LayoutMode) => void;
  onSortChange: (mode: SortMode) => void;
  onTypeFilterChange: (type: string) => void;
  onPickFiles: () => void;
  onDelete: (file: StoredFile) => void;
  onFavorite: (file: StoredFile) => void;
  onSelect: (file: StoredFile) => void;
}) {
  return (
    <div className="rounded-[32px] border border-border bg-white/90 p-4 shadow-soft backdrop-blur lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-4 text-lg font-semibold text-slate-700">
            <span className="border-b-4 border-slate-700 pb-2">{title}</span>
            {view === 'photos' && <span className="pb-2 text-slate-400">Activity</span>}
          </div>
          <p className="mt-3 text-sm text-slate-500">{files.length} file tersimpan</p>
        </div>
        <button onClick={onPickFiles} className="hidden rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8] sm:block">Upload</button>
      </div>

      <DriveToolbar layoutMode={layoutMode} sortMode={sortMode} typeFilter={typeFilter} onLayoutChange={onLayoutChange} onSortChange={onSortChange} onTypeFilterChange={onTypeFilterChange} />

      <div className="mt-4">
        {loading ? <LoadingState /> : files.length === 0 ? <EmptyDrive onPickFiles={onPickFiles} /> : layoutMode === 'grid' ? <FileGrid files={files} onSelect={onSelect} onFavorite={onFavorite} onDelete={onDelete} /> : <FileList files={files} onSelect={onSelect} onFavorite={onFavorite} onDelete={onDelete} />}
      </div>
    </div>
  );
}

function FolderGrid({ folders, onOpenFolder, onMoveFile, draggingFileId }: { folders: FolderItem[]; onOpenFolder: (id: string) => void; onMoveFile: (fileId: string, folderId: string | null) => void; draggingFileId: string | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {folders.map((folder) => (
        <button
          key={folder.id}
          onClick={() => onOpenFolder(folder.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (draggingFileId) onMoveFile(draggingFileId, folder.id);
          }}
          className="group flex items-center gap-3 rounded-[24px] border border-border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-blue-50 text-primary group-hover:bg-primary group-hover:text-white">
            <Folder className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-950">{folder.name}</span>
            <span className="block text-xs text-slate-500">Folder</span>
          </span>
          <ChevronRight className="h-5 w-5 text-slate-300" />
        </button>
      ))}
    </div>
  );
}

function FileGrid({ files, onSelect, onFavorite, onDelete, setDraggingFileId }: { files: StoredFile[]; onSelect: (file: StoredFile) => void; onFavorite: (file: StoredFile) => void; onDelete: (file: StoredFile) => void; setDraggingFileId?: (id: string | null) => void }) {
  if (!files.length) return <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">Tidak ada file di tampilan ini.</div>;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
      {files.map((file) => (
        <FileCard key={file.id} file={file} onSelect={onSelect} onFavorite={onFavorite} onDelete={onDelete} setDraggingFileId={setDraggingFileId} />
      ))}
    </div>
  );
}

function FileCard({ file, onSelect, onFavorite, onDelete, setDraggingFileId }: { file: StoredFile; onSelect: (file: StoredFile) => void; onFavorite: (file: StoredFile) => void; onDelete: (file: StoredFile) => void; setDraggingFileId?: (id: string | null) => void }) {
  const Icon = iconForMime(file.mime_type);
  const isImage = getTypeGroup(file.mime_type) === 'image';

  return (
    <article draggable={Boolean(setDraggingFileId)} onDragStart={() => setDraggingFileId?.(file.id)} onDragEnd={() => setDraggingFileId?.(null)} className="group overflow-hidden rounded-[26px] border border-border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
      <button onClick={() => onSelect(file)} className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-slate-100 text-slate-400">
        {isImage ? (
          <img src={getPreviewUrl(file.id)} alt={file.original_name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-white text-slate-500 shadow-sm">
            <Icon className="h-8 w-8" />
          </div>
        )}
        <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">{typeLabel(file.mime_type)}</span>
      </button>
      <div className="p-3">
        <button onClick={() => onSelect(file)} className="block w-full truncate text-left text-sm font-semibold text-slate-950" title={file.original_name}>{file.original_name}</button>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>{formatBytes(file.size_bytes)}</span>
          <span>{shortDate(file.created_at)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button onClick={() => onFavorite(file)} className={cx('rounded-xl p-2', file.is_favorite ? 'bg-amber-50 text-amber-600' : 'text-slate-400 hover:bg-slate-100')} title="Starred">
            <Star className={cx('h-4 w-4', file.is_favorite && 'fill-current')} />
          </button>
          <div className="flex items-center gap-1">
            <a href={getDownloadUrl(file.id)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-primary" title="Download"><Download className="h-4 w-4" /></a>
            <button onClick={() => onDelete(file)} className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </article>
  );
}

function FileList({ files, onSelect, onFavorite, onDelete, setDraggingFileId }: { files: StoredFile[]; onSelect: (file: StoredFile) => void; onFavorite: (file: StoredFile) => void; onDelete: (file: StoredFile) => void; setDraggingFileId?: (id: string | null) => void }) {
  if (!files.length) return <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">Tidak ada file di tampilan ini.</div>;

  return (
    <div className="overflow-hidden rounded-[26px] border border-border bg-white">
      <div className="hidden grid-cols-[1fr_140px_120px_170px_120px] gap-4 border-b border-border bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 md:grid">
        <span>Name</span><span>Type</span><span>Size</span><span>Uploaded</span><span className="text-right">Actions</span>
      </div>
      <div className="divide-y divide-border">
        {files.map((file) => {
          const Icon = iconForMime(file.mime_type);
          const isImage = getTypeGroup(file.mime_type) === 'image';
          return (
            <div
              key={file.id}
              draggable={Boolean(setDraggingFileId)}
              onDragStart={() => setDraggingFileId?.(file.id)}
              onDragEnd={() => setDraggingFileId?.(null)}
              className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 hover:bg-slate-50 md:grid-cols-[1fr_140px_120px_170px_120px] md:gap-4 md:px-5"
            >
              <button onClick={() => onSelect(file)} className="flex min-w-0 items-center gap-3 text-left">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-slate-100 text-slate-500">
                  {isImage ? <img src={getPreviewUrl(file.id)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon className="h-6 w-6" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-base font-medium text-slate-950">{file.original_name}</span>
                  <span className="block truncate text-sm text-slate-500 md:hidden">{typeLabel(file.mime_type)} · {formatBytes(file.size_bytes)} · {shortDate(file.created_at)}</span>
                  <span className="hidden truncate text-xs text-slate-500 md:block">{file.mime_type}</span>
                </span>
              </button>
              <span className="hidden text-sm text-slate-600 md:block">{typeLabel(file.mime_type)}</span>
              <span className="hidden text-sm text-slate-600 md:block">{formatBytes(file.size_bytes)}</span>
              <span className="hidden text-sm text-slate-600 md:block">{formatDate(file.created_at)}</span>
              <div className="flex justify-end gap-1">
                <button onClick={() => onFavorite(file)} className={cx('rounded-xl p-2', file.is_favorite ? 'text-amber-600' : 'text-slate-400 hover:bg-slate-100')} title="Starred"><Star className={cx('h-5 w-5', file.is_favorite && 'fill-current')} /></button>
                <a href={getDownloadUrl(file.id)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-primary" title="Download"><Download className="h-5 w-5" /></a>
                <button onClick={() => onDelete(file)} className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 className="h-5 w-5" /></button>
              </div>
            </div>
          );
        })}
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
    <div className="rounded-[32px] border border-border bg-white/90 p-4 shadow-soft backdrop-blur lg:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Uploads</h2>
          <p className="text-sm text-slate-500">Maksimal {formatBytes(maxBytes)} per file · {completedCount} selesai</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onPickFiles} className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Add files</button>
          <button onClick={onStart} disabled={!hasQueued} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">Start upload</button>
          <button onClick={onRetry} disabled={!hasFailed} className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Retry failed</button>
        </div>
      </div>

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const droppedFiles = Array.from(event.dataTransfer.files || []);
          if (droppedFiles.length) onAddFiles(droppedFiles);
        }}
        className="mt-4 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-4"
      >
        {items.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <UploadCloud className="h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold text-slate-950">Pilih banyak file sekaligus</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Drop file ke sini atau klik tombol. Queue akan upload satu per satu agar lebih stabil.</p>
            <button onClick={onPickFiles} className="mt-5 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-[#1d4ed8]">Select files</button>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => <UploadQueueRow key={item.id} item={item} />)}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={onClearCompleted} className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Clear completed</button>
          <button onClick={onCancelWaiting} className="rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel waiting</button>
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
    <div className="rounded-[24px] border border-border bg-white p-3">
      <div className="flex items-center gap-3">
        <div className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px]', statusStyle)}>
          <StatusIcon className={cx('h-5 w-5', (item.status === 'uploading' || item.status === 'retrying') && 'animate-spin')} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold text-slate-950">{item.file.name}</p>
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

function SettingsView({ settings, onLogout }: { settings: Settings | null; onLogout: () => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="rounded-[32px] border border-border bg-white/90 p-5 shadow-soft backdrop-blur xl:col-span-2">
        <h2 className="text-2xl font-semibold text-slate-950">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">Konfigurasi runtime dari Cloudflare Environment Variables.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <SettingCard label="Storage mode" value={settings?.storage_provider || 'telegram_bot_api'} />
          <SettingCard label="Max file size" value={`${settings?.max_file_size_mb || 20} MB/file`} />
          <SettingCard label="Upload mode" value={settings?.upload_mode || 'document'} />
          <SettingCard label="Telegram API" value={settings?.telegram_api_base || 'https://api.telegram.org'} />
          <SettingCard label="Bot token" value={settings?.bot_token_configured ? 'Configured' : 'Missing'} tone={settings?.bot_token_configured ? 'success' : 'danger'} />
          <SettingCard label="Channel ID" value={settings?.telegram_chat_id_configured ? 'Configured' : 'Missing'} tone={settings?.telegram_chat_id_configured ? 'success' : 'danger'} />
        </div>
        <button onClick={onLogout} className="mt-5 rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 lg:hidden">Logout</button>
      </div>

      <div className="rounded-[32px] border border-blue-100 bg-blue-50/80 p-5 shadow-soft">
        <h3 className="font-semibold text-blue-950">Migration-ready</h3>
        <p className="mt-2 text-sm leading-6 text-blue-800">Folder, preview, dan metadata tetap kompatibel untuk upgrade ke Local Bot API Server nanti.</p>
        <div className="mt-4 rounded-[22px] bg-white/70 p-3 text-xs leading-5 text-blue-900">Buka <code>MIGRATION.md</code> untuk upgrade VPS + Local Bot API Server.</div>
      </div>
    </div>
  );
}

function SettingCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'danger' }) {
  return (
    <div className="rounded-[28px] border border-border bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx('mt-2 break-words text-sm font-semibold', tone === 'success' ? 'text-green-700' : tone === 'danger' ? 'text-red-700' : 'text-slate-950')}>{value}</p>
    </div>
  );
}

function FileDrawer({ file, folders, onClose, onFavorite, onDelete, onSaved }: { file: StoredFile; folders: FolderItem[]; onClose: () => void; onFavorite: () => void; onDelete: () => void; onSaved: (file: StoredFile) => void }) {
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
      <aside className="w-full max-w-md overflow-hidden rounded-[32px] border border-border bg-white shadow-soft" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="font-semibold text-slate-950">File details</h3>
            <p className="text-xs text-slate-500">{typeLabel(file.mime_type)} · {formatBytes(file.size_bytes)}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><XCircle className="h-5 w-5" /></button>
        </div>

        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto p-4">
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-[28px] bg-slate-100 text-slate-400">
            {isImage ? <img src={getPreviewUrl(file.id)} alt={file.original_name} className="h-full w-full object-contain" /> : <Icon className="h-16 w-16" />}
          </div>

          <label className="mt-5 block text-sm font-medium text-slate-700">Nama file</label>
          <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-[22px] border border-border bg-white px-4 py-3 text-sm outline-none focus:border-primary" />

          <label className="mt-4 block text-sm font-medium text-slate-700">Folder</label>
          <select value={folderId || 'root'} onChange={(event) => setFolderId(event.target.value === 'root' ? null : event.target.value)} className="mt-2 w-full rounded-[22px] border border-border bg-white px-4 py-3 text-sm outline-none focus:border-primary">
            <option value="root">Root</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>

          <div className="mt-5 grid gap-3 text-sm text-slate-600">
            <MetaRow label="MIME" value={file.mime_type} />
            <MetaRow label="Ukuran" value={formatBytes(file.size_bytes)} />
            <MetaRow label="Uploaded" value={formatDate(file.created_at)} />
            <MetaRow label="Telegram message" value={String(file.telegram_message_id)} />
          </div>

          {error && <div className="mt-4 rounded-[22px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={onFavorite} className="rounded-full border border-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">{file.is_favorite ? 'Unstar' : 'Star'}</button>
            <a href={getDownloadUrl(file.id)} className="rounded-full border border-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Download</a>
            <button onClick={onDelete} className="rounded-full border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100">Delete</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 rounded-[18px] bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="break-all text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}

function EmptyDrive({ onPickFiles, onCreateFolder }: { onPickFiles: () => void; onCreateFolder?: () => void }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <Cloud className="h-12 w-12 text-primary" />
      <h3 className="mt-4 text-base font-semibold text-slate-950">Belum ada file</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Upload file pribadi kamu ke Telegram Cloud dan kelola metadata-nya dari dashboard ini.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {onCreateFolder && <button onClick={onCreateFolder} className="rounded-full border border-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">New folder</button>}
        <button onClick={onPickFiles} className="rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8]">Upload files</button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[240px] items-center justify-center rounded-[28px] border border-border bg-white/70 text-slate-500">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading files...
    </div>
  );
}

function buildBreadcrumbs(folders: FolderItem[], folderId: string | null): FolderItem[] {
  if (!folderId) return [];
  const map = new Map(folders.map((folder) => [folder.id, folder]));
  const path: FolderItem[] = [];
  let current = map.get(folderId) || null;
  const guard = new Set<string>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    path.unshift(current);
    current = current.parent_id ? map.get(current.parent_id) || null : null;
  }
  return path;
}

function sortFiles(files: StoredFile[], sortMode: SortMode): StoredFile[] {
  return [...files].sort((a, b) => {
    if (sortMode === 'name_asc') return a.original_name.localeCompare(b.original_name);
    if (sortMode === 'name_desc') return b.original_name.localeCompare(a.original_name);
    if (sortMode === 'size_desc') return b.size_bytes - a.size_bytes;
    if (sortMode === 'size_asc') return a.size_bytes - b.size_bytes;
    if (sortMode === 'type') return typeLabel(a.mime_type).localeCompare(typeLabel(b.mime_type)) || a.original_name.localeCompare(b.original_name);
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    if (sortMode === 'oldest') return aTime - bTime;
    return bTime - aTime;
  });
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(date);
}

function iconForMime(mime: string) {
  const group = getTypeGroup(mime);
  if (group === 'image') return Image;
  if (group === 'video') return Video;
  if (group === 'archive') return Archive;
  return FileIcon;
}

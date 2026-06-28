import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import {
  Archive,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  X,
  Cloud,
  Download,
  File as FileIcon,
  FileText,
  Folder,
  FolderPlus,
  Grid3X3,
  HardDrive,
  Home,
  Image,
  LayoutGrid,
  List,
  Loader2,
  LogOut,
  Music,
  MoreVertical,
  RefreshCcw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Star,
  Table2,
  Trash2,
  UploadCloud,
  Video,
  XCircle,
} from 'lucide-react';
import {
  ApiError,
  bulkFileAction,
  createFolder,
  deleteFile,
  deleteFolder,
  getDownloadUrl,
  getMe,
  getPreviewUrl,
  getSettings,
  listFiles,
  listFolders,
  login,
  logout,
  updateFile,
  updateFolder,
  uploadFile,
} from './lib/api';
import { formatBytes, formatDate, getTypeGroup, typeLabel } from './lib/format';
import type { FolderItem, Settings, StoredFile, UploadItem, ViewMode } from './lib/types';

type LayoutMode = 'list' | 'grid';
type SortMode = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc' | 'type';
type NavItem = { key: ViewMode; label: string; icon: typeof Folder; hint?: string };

const typeFilters = [
  { value: 'all', label: 'All types' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'document', label: 'Documents' },
  { value: 'audio', label: 'Audio' },
  { value: 'archive', label: 'Archives' },
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

const navItems: NavItem[] = [
  { key: 'drive', label: 'My Files', icon: Folder, hint: 'Folders and files' },
  { key: 'photos', label: 'Media', icon: Image, hint: 'Images and videos' },
  { key: 'uploads', label: 'Upload Queue', icon: UploadCloud, hint: 'Bulk upload status' },
  { key: 'favorites', label: 'Starred', icon: Star, hint: 'Pinned files' },
  { key: 'settings', label: 'Settings', icon: SettingsIcon, hint: 'Runtime config' },
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
        <div className="flex items-center gap-3 rounded-lg border border-border bg-white px-5 py-4 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-slate-600">Loading private cloud...</span>
        </div>
      </div>
    );
  }

  if (!authenticated) return <LoginScreen appName={appName} onLoggedIn={() => setAuthenticated(true)} />;

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
    <div className="flex min-h-screen items-center justify-center bg-[#F6F8FB] px-5 py-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-sm">
        <div className="mb-8 flex items-center gap-3 border-b border-border pb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-white">
            <Cloud className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-950">{appName}</h1>
            <p className="text-sm text-slate-500">Corporate private cloud console</p>
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
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-primary"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}

          <button
            type="submit"
            disabled={loading || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1e40af] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Login
          </button>
        </form>

        <p className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          Bot token dan Telegram channel ID hanya dipakai oleh Pages Functions, tidak diekspos ke browser.
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
  const [lightboxFileId, setLightboxFileId] = useState<string | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkTargetFolderId, setBulkTargetFolderId] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const maxBytes = useMemo(() => Math.round((settings?.max_file_size_mb || 20) * 1024 * 1024), [settings]);
  const currentFolder = useMemo(() => folders.find((folder) => folder.id === currentFolderId) || null, [folders, currentFolderId]);
  const childFolders = useMemo(
    () => folders.filter((folder) => (folder.parent_id || null) === currentFolderId).sort((a, b) => a.name.localeCompare(b.name)),
    [folders, currentFolderId],
  );
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
    const timer = window.setTimeout(() => refresh(), 250);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (view !== 'photos') setLightboxFileId(null);
  }, [view]);

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
    for (const item of queued) await processOne(item);
    await refresh();
  }

  async function retryFailed() {
    const failed = uploadItems.filter((item) => item.status === 'failed' && item.file.size <= maxBytes);
    setUploadItems((prev) => prev.map((item) => (item.status === 'failed' && item.file.size <= maxBytes ? { ...item, status: 'retrying', error: undefined } : item)));
    for (const item of failed) await processOne({ ...item, status: 'retrying', error: undefined });
    await refresh();
  }

  async function toggleFavorite(file: StoredFile) {
    try {
      const updated = await updateFile(file.id, { is_favorite: !file.is_favorite });
      setFiles((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (selected?.id === updated.id) setSelected(updated);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal update starred');
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

  async function renameFolder(folder: FolderItem) {
    const name = window.prompt('Rename folder', folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;
    try {
      const updated = await updateFolder(folder.id, { name: name.trim() });
      setFolders((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(`Folder renamed to "${updated.name}"`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal rename folder');
    }
  }

  async function removeFolder(folder: FolderItem) {
    if (!window.confirm(`Delete empty folder "${folder.name}"?`)) return;
    try {
      await deleteFolder(folder.id);
      setFolders((prev) => prev.filter((item) => item.id !== folder.id));
      if (currentFolderId === folder.id) setCurrentFolderId(folder.parent_id || null);
      setNotice(`Folder "${folder.name}" deleted`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Gagal menghapus folder');
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

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? visibleFiles.map((file) => file.id) : []);
  }

  async function runBulkAction(action: 'move' | 'delete' | 'copy') {
    if (!selectedIds.length) return;
    if (action === 'delete' && !window.confirm(`Move ${selectedIds.length} selected files to trash?`)) return;
    setBulkBusy(true);
    try {
      const folderId = bulkTargetFolderId || null;
      const result = await bulkFileAction(action, selectedIds, { folder_id: folderId });
      await refresh();
      setSelectedIds([]);
      if (action === 'delete') setNotice(`${result.count} file(s) moved to trash`);
      if (action === 'move') setNotice(`${result.count} file(s) moved to ${folderId ? folders.find((folder) => folder.id === folderId)?.name || 'folder' : 'Root'}`);
      if (action === 'copy') setNotice(`${result.count} file(s) copied`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Bulk action failed');
    } finally {
      setBulkBusy(false);
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
  }, [files, sortMode, view]);

  const mediaLightboxFiles = useMemo(
    () => visibleFiles.filter((file) => ['image', 'video'].includes(getTypeGroup(file.mime_type))),
    [visibleFiles],
  );
  const lightboxFile = useMemo(
    () => mediaLightboxFiles.find((file) => file.id === lightboxFileId) || null,
    [lightboxFileId, mediaLightboxFiles],
  );
  const selectedFiles = useMemo(() => visibleFiles.filter((file) => selectedIds.includes(file.id)), [selectedIds, visibleFiles]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => visibleFiles.some((file) => file.id === id)));
  }, [visibleFiles]);

  useEffect(() => {
    setBulkTargetFolderId(view === 'drive' ? currentFolderId || '' : '');
  }, [view, currentFolderId]);

  const title = view === 'drive' ? 'My Files' : view === 'photos' ? 'Media' : view === 'favorites' ? 'Starred' : view === 'uploads' ? 'Upload Queue' : 'Settings';

  return (
    <div className="min-h-screen bg-[#F6F8FB] pb-16 text-slate-950 lg:pb-0">
      <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFileInput} />

      <div className="flex min-h-screen">
        <DesktopSidebar appName={appName} view={view} setView={setView} settings={settings} />

        <main className="min-w-0 flex-1">
          <TopHeader
            title={title}
            appName={appName}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            view={view}
            onUpload={handlePickFiles}
            onNewFolder={createFolderInCurrent}
            onRefresh={refresh}
            onLogout={doLogout}
          />

          <div className="mx-auto max-w-[1500px] px-3 py-4 lg:px-6">
            {notice && (
              <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span>{notice}</span>
                <button onClick={() => setNotice('')} className="font-semibold">Close</button>
              </div>
            )}

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
              <CorporateDriveView
                files={visibleFiles}
                folders={childFolders}
                breadcrumbs={breadcrumbs}
                loading={loadingFiles}
                layoutMode={layoutMode}
                sortMode={sortMode}
                typeFilter={typeFilter}
                draggingFileId={draggingFileId}
                setDraggingFileId={setDraggingFileId}
                onLayoutChange={setLayoutMode}
                onSortChange={setSortMode}
                onTypeFilterChange={setTypeFilter}
                onPickFiles={handlePickFiles}
                onDropFiles={(droppedFiles) => addFiles(droppedFiles, currentFolderId)}
                onCreateFolder={createFolderInCurrent}
                onOpenFolder={(folderId) => setCurrentFolderId(folderId)}
                onBackToRoot={() => setCurrentFolderId(null)}
                onMoveFile={moveFileToFolder}
                onRenameFolder={renameFolder}
                onDeleteFolder={removeFolder}
                onDeleteFile={removeFile}
                onFavorite={toggleFavorite}
                onSelect={setSelected}
                onPreview={(file) => setLightboxFileId(file.id)}
                allFolders={folders}
                selectedIds={selectedIds}
                selectedCount={selectedFiles.length}
                bulkTargetFolderId={bulkTargetFolderId}
                bulkBusy={bulkBusy}
                onBulkTargetFolderChange={setBulkTargetFolderId}
                onToggleSelected={toggleSelected}
                onToggleSelectAll={toggleSelectAll}
                onClearSelection={() => setSelectedIds([])}
                onBulkDelete={() => runBulkAction('delete')}
                onBulkMove={() => runBulkAction('move')}
                onBulkCopy={() => runBulkAction('copy')}
              />
            ) : (
              <CorporateCollectionView
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
                onDelete={removeFile}
                onFavorite={toggleFavorite}
                onSelect={setSelected}
                onPreview={view === 'photos' ? (file) => setLightboxFileId(file.id) : undefined}
                setDraggingFileId={setDraggingFileId}
                folders={folders}
                selectedIds={selectedIds}
                selectedCount={selectedFiles.length}
                bulkTargetFolderId={bulkTargetFolderId}
                bulkBusy={bulkBusy}
                onBulkTargetFolderChange={setBulkTargetFolderId}
                onToggleSelected={toggleSelected}
                onToggleSelectAll={toggleSelectAll}
                onClearSelection={() => setSelectedIds([])}
                onBulkDelete={() => runBulkAction('delete')}
                onBulkMove={() => runBulkAction('move')}
                onBulkCopy={() => runBulkAction('copy')}
              />
            )}
          </div>
        </main>
      </div>

      <MobileBottomNav view={view} setView={setView} />

      {lightboxFile && (
        <MediaLightbox
          files={mediaLightboxFiles}
          file={lightboxFile}
          onClose={() => setLightboxFileId(null)}
          onNext={() => {
            if (!mediaLightboxFiles.length) return;
            const index = mediaLightboxFiles.findIndex((item) => item.id === lightboxFile.id);
            const next = mediaLightboxFiles[(index + 1) % mediaLightboxFiles.length];
            if (next) setLightboxFileId(next.id);
          }}
          onPrev={() => {
            if (!mediaLightboxFiles.length) return;
            const index = mediaLightboxFiles.findIndex((item) => item.id === lightboxFile.id);
            const prev = mediaLightboxFiles[(index - 1 + mediaLightboxFiles.length) % mediaLightboxFiles.length];
            if (prev) setLightboxFileId(prev.id);
          }}
          onDetails={(file) => {
            setLightboxFileId(null);
            setSelected(file);
          }}
          onFavorite={toggleFavorite}
          onDelete={removeFile}
        />
      )}

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

function DesktopSidebar({ appName, view, setView, settings }: { appName: string; view: ViewMode; setView: (view: ViewMode) => void; settings: Settings | null }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-white lg:block">
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white"><Cloud className="h-5 w-5" /></div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{appName}</p>
          <p className="text-xs text-slate-500">Corporate Console</p>
        </div>
      </div>

      <nav className="p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={cx(
                'mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition',
                active ? 'bg-blue-50 font-semibold text-primary' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mx-3 mt-2 rounded-lg border border-border bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><HardDrive className="h-4 w-4" /> Storage mode</div>
        <p className="mt-2 text-xs leading-5 text-slate-500">Telegram Bot API · max {settings?.max_file_size_mb || 20} MB/file.</p>
      </div>
    </aside>
  );
}

function TopHeader({
  title,
  appName,
  searchQuery,
  setSearchQuery,
  view,
  onUpload,
  onNewFolder,
  onRefresh,
  onLogout,
}: {
  title: string;
  appName: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  view: ViewMode;
  onUpload: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const canCreateFolder = view === 'drive';
  const canUpload = view === 'drive' || view === 'photos';
  const canRefresh = view !== 'settings';

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-[1500px] px-3 py-3 lg:px-6">
        <div className="flex items-start justify-between gap-3 lg:hidden">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{appName}</p>
            <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950">{title}</h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canCreateFolder && (
              <button onClick={onNewFolder} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-slate-600 hover:bg-slate-50" aria-label="New Folder" title="New Folder">
                <FolderPlus className="h-4 w-4" />
              </button>
            )}
            {canUpload && (
              <button onClick={onUpload} className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white hover:bg-[#1e40af]" aria-label="Upload" title="Upload">
                <UploadCloud className="h-4 w-4" />
              </button>
            )}
            {canRefresh && (
              <button onClick={onRefresh} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-slate-600 hover:bg-slate-50" aria-label="Refresh" title="Refresh">
                <RefreshCcw className="h-4 w-4" />
              </button>
            )}
            <button onClick={onLogout} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-slate-600 hover:bg-slate-50" aria-label="Logout" title="Logout">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 lg:mt-0 lg:flex-row lg:items-center lg:gap-3">
          <div className="hidden min-w-[170px] max-w-[240px] shrink-0 lg:block">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950">{title}</h1>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-slate-50 px-3 py-2 lg:max-w-[540px]">
            <Search className="h-4 w-4 shrink-0 text-slate-500" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search files, folders, or media"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="hidden flex-wrap gap-2 lg:flex lg:shrink-0">
            {canCreateFolder && (
              <button onClick={onNewFolder} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <FolderPlus className="h-4 w-4" /> New Folder
              </button>
            )}
            {canUpload && (
              <button onClick={onUpload} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-[#1e40af]">
                <UploadCloud className="h-4 w-4" /> Upload
              </button>
            )}
            {canRefresh && (
              <button onClick={onRefresh} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <RefreshCcw className="h-4 w-4" /> Refresh
              </button>
            )}
            <button onClick={onLogout} className="inline-flex rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function Toolbar({
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
  onSortChange: (sort: SortMode) => void;
  onTypeFilterChange: (type: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Type
          <select value={typeFilter} onChange={(event) => onTypeFilterChange(event.target.value)} className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm font-normal normal-case text-slate-700 outline-none focus:border-primary">
            {typeFilters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Sort
          <select value={sortMode} onChange={(event) => onSortChange(event.target.value as SortMode)} className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm font-normal normal-case text-slate-700 outline-none focus:border-primary">
            {sortOptions.map((sort) => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
          </select>
        </label>
      </div>

      <div className="inline-flex w-fit rounded-lg border border-border bg-slate-50 p-1">
        <button onClick={() => onLayoutChange('list')} className={cx('inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm', layoutMode === 'list' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-950')}>
          <List className="h-4 w-4" /> List
        </button>
        <button onClick={() => onLayoutChange('grid')} className={cx('inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm', layoutMode === 'grid' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-950')}>
          <Grid3X3 className="h-4 w-4" /> Grid
        </button>
      </div>
    </div>
  );
}

function CorporateDriveView(props: {
  files: StoredFile[];
  folders: FolderItem[];
  allFolders: FolderItem[];
  breadcrumbs: FolderItem[];
  loading: boolean;
  layoutMode: LayoutMode;
  sortMode: SortMode;
  typeFilter: string;
  draggingFileId: string | null;
  setDraggingFileId: (id: string | null) => void;
  onLayoutChange: (mode: LayoutMode) => void;
  onSortChange: (sort: SortMode) => void;
  onTypeFilterChange: (type: string) => void;
  onPickFiles: () => void;
  onDropFiles: (files: File[]) => void;
  onCreateFolder: () => void;
  onOpenFolder: (folderId: string) => void;
  onBackToRoot: () => void;
  onMoveFile: (fileId: string, folderId: string | null) => void;
  onRenameFolder: (folder: FolderItem) => void;
  onDeleteFolder: (folder: FolderItem) => void;
  onDeleteFile: (file: StoredFile) => void;
  onFavorite: (file: StoredFile) => void;
  onSelect: (file: StoredFile) => void;
  onPreview?: (file: StoredFile) => void;
  selectedIds: string[];
  selectedCount: number;
  bulkTargetFolderId: string;
  bulkBusy: boolean;
  onBulkTargetFolderChange: (value: string) => void;
  onToggleSelected: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkMove: () => void;
  onBulkCopy: () => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-white shadow-sm"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const droppedFiles = Array.from(event.dataTransfer.files || []);
        if (droppedFiles.length) props.onDropFiles(droppedFiles);
      }}
    >
      <div className="border-b border-border bg-white px-4 py-4">
        <Breadcrumbs breadcrumbs={props.breadcrumbs} onBackToRoot={props.onBackToRoot} onOpenFolder={props.onOpenFolder} />
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Drop files here to upload to this folder. Drag stored files into folder cards to move them.
        </div>
      </div>

      <Toolbar layoutMode={props.layoutMode} sortMode={props.sortMode} typeFilter={props.typeFilter} onLayoutChange={props.onLayoutChange} onSortChange={props.onSortChange} onTypeFilterChange={props.onTypeFilterChange} />

      <div className="p-4">
        <FolderSection folders={props.folders} onOpenFolder={props.onOpenFolder} onMoveFile={props.onMoveFile} onRenameFolder={props.onRenameFolder} onDeleteFolder={props.onDeleteFolder} draggingFileId={props.draggingFileId} />
        {props.loading ? <LoadingState /> : props.layoutMode === 'grid' ? (
          <GridFiles files={props.files} onSelect={props.onSelect} onPreview={props.onPreview} onFavorite={props.onFavorite} onDelete={props.onDeleteFile} setDraggingFileId={props.setDraggingFileId} />
        ) : (
          <FilesTable files={props.files} folders={props.allFolders} onSelect={props.onSelect} onPreview={props.onPreview} onFavorite={props.onFavorite} onDelete={props.onDeleteFile} setDraggingFileId={props.setDraggingFileId} selectedIds={props.selectedIds} selectedCount={props.selectedCount} bulkTargetFolderId={props.bulkTargetFolderId} bulkBusy={props.bulkBusy} onBulkTargetFolderChange={props.onBulkTargetFolderChange} onToggleSelected={props.onToggleSelected} onToggleSelectAll={props.onToggleSelectAll} onClearSelection={props.onClearSelection} onBulkDelete={props.onBulkDelete} onBulkMove={props.onBulkMove} onBulkCopy={props.onBulkCopy} />
        )}
      </div>
    </div>
  );
}

function CorporateCollectionView({
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
  onDelete,
  onFavorite,
  onSelect,
  onPreview,
  setDraggingFileId,
  folders,
  selectedIds,
  selectedCount,
  bulkTargetFolderId,
  bulkBusy,
  onBulkTargetFolderChange,
  onToggleSelected,
  onToggleSelectAll,
  onClearSelection,
  onBulkDelete,
  onBulkMove,
  onBulkCopy,
}: {
  title: string;
  view: ViewMode;
  files: StoredFile[];
  loading: boolean;
  layoutMode: LayoutMode;
  sortMode: SortMode;
  typeFilter: string;
  onLayoutChange: (mode: LayoutMode) => void;
  onSortChange: (sort: SortMode) => void;
  onTypeFilterChange: (type: string) => void;
  onDelete: (file: StoredFile) => void;
  onFavorite: (file: StoredFile) => void;
  onSelect: (file: StoredFile) => void;
  onPreview?: (file: StoredFile) => void;
  setDraggingFileId: (id: string | null) => void;
  folders: FolderItem[];
  selectedIds: string[];
  selectedCount: number;
  bulkTargetFolderId: string;
  bulkBusy: boolean;
  onBulkTargetFolderChange: (value: string) => void;
  onToggleSelected: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkMove: () => void;
  onBulkCopy: () => void;
}) {
  const openFile = view === 'photos' && onPreview ? onPreview : onSelect;
  const detailAction = view === 'photos' ? onSelect : undefined;
  const description = view === 'photos' ? 'Images and videos stored in Telegram channel.' : 'Files marked as starred.';
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
      <div className="border-b border-border px-4 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <Toolbar layoutMode={layoutMode} sortMode={sortMode} typeFilter={typeFilter} onLayoutChange={onLayoutChange} onSortChange={onSortChange} onTypeFilterChange={onTypeFilterChange} />
      <div className="p-4">
        {loading ? <LoadingState /> : layoutMode === 'grid' ? (
          <GridFiles files={files} onSelect={openFile} onPreview={onPreview} onDetails={detailAction} onFavorite={onFavorite} onDelete={onDelete} setDraggingFileId={setDraggingFileId} />
        ) : (
          <FilesTable files={files} folders={folders} onSelect={openFile} onPreview={onPreview} onDetails={detailAction} onFavorite={onFavorite} onDelete={onDelete} setDraggingFileId={setDraggingFileId} selectedIds={selectedIds} selectedCount={selectedCount} bulkTargetFolderId={bulkTargetFolderId} bulkBusy={bulkBusy} onBulkTargetFolderChange={onBulkTargetFolderChange} onToggleSelected={onToggleSelected} onToggleSelectAll={onToggleSelectAll} onClearSelection={onClearSelection} onBulkDelete={onBulkDelete} onBulkMove={onBulkMove} onBulkCopy={onBulkCopy} />
        )}
      </div>
    </div>
  );
}

function Breadcrumbs({ breadcrumbs, onBackToRoot, onOpenFolder }: { breadcrumbs: FolderItem[]; onBackToRoot: () => void; onOpenFolder: (folderId: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <button onClick={onBackToRoot} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"><Home className="h-4 w-4" /> Root</button>
      {breadcrumbs.map((folder) => (
        <span key={folder.id} className="inline-flex items-center gap-1">
          <ChevronRight className="h-4 w-4 text-slate-400" />
          <button onClick={() => onOpenFolder(folder.id)} className="rounded-md px-2 py-1 font-medium text-slate-700 hover:bg-slate-100">{folder.name}</button>
        </span>
      ))}
    </div>
  );
}

function FolderSection({
  folders,
  onOpenFolder,
  onMoveFile,
  onRenameFolder,
  onDeleteFolder,
  draggingFileId,
}: {
  folders: FolderItem[];
  onOpenFolder: (folderId: string) => void;
  onMoveFile: (fileId: string, folderId: string | null) => void;
  onRenameFolder: (folder: FolderItem) => void;
  onDeleteFolder: (folder: FolderItem) => void;
  onDropFilesToFolder?: (files: File[], folderId: string) => void;
  draggingFileId: string | null;
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  if (!folders.length) return null;

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Folders</h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {folders.map((folder) => (
          <div
            key={folder.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (draggingFileId) onMoveFile(draggingFileId, folder.id);
            }}
            className="group relative flex items-center gap-3 rounded-lg border border-border bg-slate-50 p-3 text-left hover:border-primary hover:bg-blue-50/50"
          >
            <button onClick={() => onOpenFolder(folder.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary"><Folder className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-950">{folder.name}</span>
                <span className="text-xs text-slate-500">Folder</span>
              </span>
            </button>

            <button
              onClick={(event) => {
                event.stopPropagation();
                setOpenMenuId((value) => (value === folder.id ? null : folder.id));
              }}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-950"
              aria-label={`Folder actions for ${folder.name}`}
              title="Folder actions"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {openMenuId === folder.id && (
              <div className="absolute right-2 top-12 z-20 w-40 overflow-hidden rounded-lg border border-border bg-white shadow-lg">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenMenuId(null);
                    onOpenFolder(folder.id);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  Open
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenMenuId(null);
                    onRenameFolder(folder);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  Rename
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenMenuId(null);
                    onDeleteFolder(folder);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                >
                  Delete empty folder
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FilesTable({
  files,
  folders,
  onSelect,
  onPreview,
  onDetails,
  onFavorite,
  onDelete,
  setDraggingFileId,
  selectedIds,
  selectedCount,
  bulkTargetFolderId,
  bulkBusy,
  onBulkTargetFolderChange,
  onToggleSelected,
  onToggleSelectAll,
  onClearSelection,
  onBulkDelete,
  onBulkMove,
  onBulkCopy,
}: {
  files: StoredFile[];
  folders: FolderItem[];
  onSelect: (file: StoredFile) => void;
  onPreview?: (file: StoredFile) => void;
  onDetails?: (file: StoredFile) => void;
  onFavorite: (file: StoredFile) => void;
  onDelete: (file: StoredFile) => void;
  setDraggingFileId: (id: string | null) => void;
  selectedIds: string[];
  selectedCount: number;
  bulkTargetFolderId: string;
  bulkBusy: boolean;
  onBulkTargetFolderChange: (value: string) => void;
  onToggleSelected: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkMove: () => void;
  onBulkCopy: () => void;
}) {
  if (!files.length) return <EmptyState />;
  const allSelected = files.length > 0 && selectedIds.length === files.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {selectedCount > 0 && (
        <div className="flex flex-col gap-3 border-b border-border bg-blue-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">{selectedCount} selected</p>
            <p className="text-xs text-slate-500">Bulk actions are available for the selected files.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <select
              value={bulkTargetFolderId}
              onChange={(event) => onBulkTargetFolderChange(event.target.value)}
              className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Root</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
            <button onClick={onBulkMove} disabled={bulkBusy} className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Move</button>
            <button onClick={onBulkCopy} disabled={bulkBusy} className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Copy</button>
            <button onClick={onBulkDelete} disabled={bulkBusy} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Delete</button>
            <button onClick={onClearSelection} disabled={bulkBusy} className="rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-slate-500 hover:bg-white disabled:opacity-50">Clear</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-12 px-4 py-3 font-semibold">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={(event) => onToggleSelectAll(event.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Type</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Size</th>
              <th className="hidden px-4 py-3 font-semibold xl:table-cell">Uploaded</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white">
            {files.map((file) => {
              const isSelected = selectedIds.includes(file.id);
              return (
                <tr key={file.id} draggable onDragStart={() => setDraggingFileId(file.id)} onDragEnd={() => setDraggingFileId(null)} className={cx(isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50')}>
                  <td className="px-4 py-3 align-middle">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelected(file.id)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      aria-label={`Select ${file.original_name}`}
                    />
                  </td>
                  <td className="max-w-[420px] px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <button
                        onClick={() => (isPreviewable(file) && onPreview ? onPreview(file) : onSelect(file))}
                        className="shrink-0"
                        title={isPreviewable(file) ? 'Preview' : 'Open details'}
                      >
                        <FileThumb file={file} size="sm" />
                      </button>
                      <button onClick={() => onSelect(file)} className="min-w-0 text-left">
                        <span className="block truncate font-medium text-slate-950">{file.original_name}</span>
                        <span className="block truncate text-xs text-slate-500 md:hidden">{typeLabel(file.mime_type)} · {formatBytes(file.size_bytes)}</span>
                      </button>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{typeLabel(file.mime_type)}</td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{formatBytes(file.size_bytes)}</td>
                  <td className="hidden px-4 py-3 text-slate-600 xl:table-cell">{formatDate(file.created_at)}</td>
                  <td className="px-4 py-3">
                    <RowActions file={file} onDetails={onDetails} onFavorite={onFavorite} onDelete={onDelete} />
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

function GridFiles({ files, onSelect, onPreview, onDetails, onFavorite, onDelete, setDraggingFileId }: { files: StoredFile[]; onSelect: (file: StoredFile) => void; onPreview?: (file: StoredFile) => void; onDetails?: (file: StoredFile) => void; onFavorite: (file: StoredFile) => void; onDelete: (file: StoredFile) => void; setDraggingFileId: (id: string | null) => void }) {
  if (!files.length) return <EmptyState />;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
      {files.map((file) => (
        <div key={file.id} draggable onDragStart={() => setDraggingFileId(file.id)} onDragEnd={() => setDraggingFileId(null)} className="overflow-hidden rounded-lg border border-border bg-white hover:border-primary">
          <button onClick={() => (isPreviewable(file) && onPreview ? onPreview(file) : onSelect(file))} className="flex aspect-video w-full items-center justify-center border-b border-border bg-slate-50">
            <FileThumb file={file} size="lg" />
          </button>
          <div className="p-3">
            <button onClick={() => onSelect(file)} className="block w-full truncate text-left text-sm font-semibold text-slate-950" title={file.original_name}>{file.original_name}</button>
            <p className="mt-1 text-xs text-slate-500">{typeLabel(file.mime_type)} · {formatBytes(file.size_bytes)}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-400">{formatDate(file.created_at)}</span>
              <RowActions file={file} onDetails={onDetails} onFavorite={onFavorite} onDelete={onDelete} compact />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


function MediaLightbox({
  files,
  file,
  onClose,
  onNext,
  onPrev,
  onDetails,
  onFavorite,
  onDelete,
}: {
  files: StoredFile[];
  file: StoredFile;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onDetails: (file: StoredFile) => void;
  onFavorite: (file: StoredFile) => void;
  onDelete: (file: StoredFile) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const group = getTypeGroup(file.mime_type);
  const currentIndex = files.findIndex((item) => item.id === file.id);
  const canNavigate = files.length > 1;

  useEffect(() => {
    setShowDetails(false);
  }, [file.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight' && canNavigate) onNext();
      if (event.key === 'ArrowLeft' && canNavigate) onPrev();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canNavigate, onClose, onNext, onPrev]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 text-slate-950 backdrop-blur-sm md:p-6" onClick={onClose}>
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-border bg-white px-3 py-3 md:px-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950 md:text-base">{file.original_name}</p>
            <p className="text-xs text-slate-500">{currentIndex + 1} of {files.length} · {typeLabel(file.mime_type)} · {formatBytes(file.size_bytes)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => onFavorite(file)} className={cx('inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-950', file.is_favorite && 'text-amber-500')} title="Starred">
              <Star className={cx('h-4 w-4', file.is_favorite && 'fill-current')} />
            </button>
            <a href={getDownloadUrl(file.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-950" title="Download">
              <Download className="h-4 w-4" />
            </a>
            <button onClick={() => setShowDetails((value) => !value)} className={cx('inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-950', showDetails && 'bg-blue-50 text-primary')} title="Details">
              <Info className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-950" title="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 bg-slate-50 md:grid-cols-[1fr_auto]">
          <div className="relative flex min-h-0 items-center justify-center p-3 md:p-6">
            {canNavigate && (
              <button onClick={onPrev} className="absolute left-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-slate-700 shadow-sm backdrop-blur hover:bg-slate-100 md:left-5" title="Previous">
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            <div className="flex h-full w-full items-center justify-center overflow-hidden bg-transparent">
              {group === 'video' ? (
                <video src={getPreviewUrl(file.id)} controls className="max-h-full max-w-full rounded-lg shadow-sm" />
              ) : (
                <img src={getPreviewUrl(file.id)} alt={file.original_name} className="max-h-full max-w-full rounded-lg object-contain shadow-sm" />
              )}
            </div>

            {canNavigate && (
              <button onClick={onNext} className="absolute right-3 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-slate-700 shadow-sm backdrop-blur hover:bg-slate-100 md:right-5" title="Next">
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          {showDetails && (
            <aside className="flex max-h-[44vh] w-full flex-col overflow-hidden border-t border-border bg-white md:h-full md:max-h-none md:w-80 md:border-l md:border-t-0">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4">
                <h3 className="font-semibold text-slate-950">Details</h3>
                <button onClick={() => setShowDetails(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"><X className="h-4 w-4" /></button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-3 text-sm">
                  <LightboxMeta label="Name" value={file.original_name} />
                  <LightboxMeta label="Type" value={file.mime_type} />
                  <LightboxMeta label="Size" value={formatBytes(file.size_bytes)} />
                  <LightboxMeta label="Uploaded" value={formatDate(file.created_at)} />
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-500">Use the full details panel to rename files or move them to another folder.</p>
              </div>
              <div className="border-t border-border bg-white px-4 py-4">
                <div className="grid gap-2">
                  <button onClick={() => onDetails(file)} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-[#1e40af]">Open full details</button>
                  <a href={getDownloadUrl(file.id)} className="rounded-lg border border-border px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">Download</a>
                  <button onClick={() => onFavorite(file)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{file.is_favorite ? 'Unstar' : 'Star'}</button>
                  <button onClick={() => onDelete(file)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Delete</button>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function LightboxMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-slate-900">{value}</p>
    </div>
  );
}

function RowActions({ file, onDetails, onFavorite, onDelete, compact = false }: { file: StoredFile; onDetails?: (file: StoredFile) => void; onFavorite: (file: StoredFile) => void; onDelete: (file: StoredFile) => void; compact?: boolean }) {
  const buttonClass = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900';
  return (
    <div className="flex justify-end gap-1">
      {onDetails && <button onClick={() => onDetails(file)} className={buttonClass} title="Details"><Info className="h-4 w-4" /></button>}
      <button onClick={() => onFavorite(file)} className={cx(buttonClass, file.is_favorite && 'text-amber-600 hover:text-amber-700')} title="Starred"><Star className={cx('h-4 w-4', file.is_favorite && 'fill-current')} /></button>
      <a href={getDownloadUrl(file.id)} className={buttonClass} title="Download"><Download className="h-4 w-4" /></a>
      {!compact && <button onClick={() => onDelete(file)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>}
    </div>
  );
}

function isPreviewable(file: StoredFile) {
  const group = getTypeGroup(file.mime_type);
  return group === 'image' || group === 'video';
}

function FileThumb({ file, size }: { file: StoredFile; size: 'sm' | 'lg' }) {
  const group = getTypeGroup(file.mime_type);
  const Icon = iconForMime(file.mime_type);
  if (group === 'image') {
    return <img src={getPreviewUrl(file.id)} alt={file.original_name} className={cx(size === 'sm' ? 'h-10 w-10 rounded-md' : 'h-full w-full', 'object-cover')} loading="lazy" />;
  }
  return (
    <span className={cx('flex shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500', size === 'sm' ? 'h-10 w-10' : 'h-16 w-16')}>
      <Icon className={size === 'sm' ? 'h-5 w-5' : 'h-8 w-8'} />
    </span>
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
    <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Upload Queue</h2>
          <p className="text-sm text-slate-500">Maksimal {formatBytes(maxBytes)} per file · {completedCount} selesai</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onPickFiles} className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Add files</button>
          <button onClick={onStart} disabled={!hasQueued} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50">Start upload</button>
          <button onClick={onRetry} disabled={!hasFailed} className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Retry failed</button>
        </div>
      </div>

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const droppedFiles = Array.from(event.dataTransfer.files || []);
          if (droppedFiles.length) onAddFiles(droppedFiles);
        }}
        className="m-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4"
      >
        {items.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
            <UploadCloud className="h-10 w-10 text-primary" />
            <h3 className="mt-3 font-semibold text-slate-950">Drop files here</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Queue uploads one by one for a more stable bulk upload flow.</p>
            <button onClick={onPickFiles} className="mt-5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1e40af]">Select files</button>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => <UploadQueueRow key={item.id} item={item} />)}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          <button onClick={onClearCompleted} className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Clear completed</button>
          <button onClick={onCancelWaiting} className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel waiting</button>
        </div>
      )}
    </div>
  );
}

function UploadQueueRow({ item }: { item: UploadItem }) {
  const statusStyle = {
    queued: 'text-slate-600 bg-slate-100',
    uploading: 'text-blue-700 bg-blue-50',
    uploaded: 'text-green-700 bg-green-50',
    failed: 'text-red-700 bg-red-50',
    retrying: 'text-amber-700 bg-amber-50',
    skipped: 'text-slate-500 bg-slate-100',
  }[item.status];
  const StatusIcon = item.status === 'uploaded' ? CheckCircle2 : item.status === 'failed' ? XCircle : item.status === 'uploading' || item.status === 'retrying' ? Loader2 : FileIcon;

  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="flex items-center gap-3">
        <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', statusStyle)}>
          <StatusIcon className={cx('h-5 w-5', (item.status === 'uploading' || item.status === 'retrying') && 'animate-spin')} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold text-slate-950">{item.file.name}</p>
            <span className="shrink-0 text-xs text-slate-500">{formatBytes(item.file.size)}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Destination: {item.folder_name || 'Root'}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className={cx('h-full transition-all', item.status === 'failed' ? 'bg-red-500' : item.status === 'uploaded' ? 'bg-green-500' : 'bg-primary')} style={{ width: `${item.progress}%` }} />
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
      <div className="rounded-lg border border-border bg-white p-5 shadow-sm xl:col-span-2">
        <h2 className="text-lg font-semibold text-slate-950">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">Runtime configuration from Cloudflare Environment Variables.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <SettingCard label="Storage mode" value={settings?.storage_provider || 'telegram_bot_api'} />
          <SettingCard label="Max file size" value={`${settings?.max_file_size_mb || 20} MB/file`} />
          <SettingCard label="Upload mode" value={settings?.upload_mode || 'document'} />
          <SettingCard label="Telegram API" value={settings?.telegram_api_base || 'https://api.telegram.org'} />
          <SettingCard label="Bot token" value={settings?.bot_token_configured ? 'Configured' : 'Missing'} tone={settings?.bot_token_configured ? 'success' : 'danger'} />
          <SettingCard label="Channel ID" value={settings?.telegram_chat_id_configured ? 'Configured' : 'Missing'} tone={settings?.telegram_chat_id_configured ? 'success' : 'danger'} />
        </div>
        <button onClick={onLogout} className="mt-5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 lg:hidden">Logout</button>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 shadow-sm">
        <h3 className="font-semibold text-blue-950">Migration-ready</h3>
        <p className="mt-2 text-sm leading-6 text-blue-800">Folders, preview, and metadata remain compatible for a future VPS + Local Bot API Server upgrade.</p>
        <div className="mt-4 rounded-lg bg-white/70 p-3 text-xs leading-5 text-blue-900">Read <code>MIGRATION.md</code> for the upgrade path.</div>
      </div>
    </div>
  );
}

function SettingCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'danger' }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
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
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30 p-3" onClick={onClose}>
      <aside className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="font-semibold text-slate-950">File details</h3>
            <p className="text-xs text-slate-500">{typeLabel(file.mime_type)} · {formatBytes(file.size_bytes)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">Close</button>
        </div>
        <div className="max-h-[calc(100vh-120px)] overflow-y-auto p-4">
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-border bg-slate-50">
            {isImage ? <img src={getPreviewUrl(file.id)} alt={file.original_name} className="h-full w-full object-contain" /> : <Icon className="h-16 w-16 text-slate-400" />}
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">File name</label>
              <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Folder</label>
              <select value={folderId || ''} onChange={(event) => setFolderId(event.target.value || null)} className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary">
                <option value="">Root</option>
                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            </div>
            <Meta label="MIME type" value={file.mime_type} />
            <Meta label="Size" value={formatBytes(file.size_bytes)} />
            <Meta label="Telegram message" value={`${file.telegram_chat_id} / ${file.telegram_message_id}`} />
            <Meta label="Uploaded" value={formatDate(file.created_at)} />

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50">{saving ? 'Saving...' : 'Save changes'}</button>
              <a href={getDownloadUrl(file.id)} className="rounded-lg border border-border px-3 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-50">Download</a>
              <button onClick={onFavorite} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{file.is_favorite ? 'Unstar' : 'Star'}</button>
              <button onClick={onDelete} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Delete</button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-800">{value}</p>
    </div>
  );
}

function MobileBottomNav({ view, setView }: { view: ViewMode; setView: (view: ViewMode) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white lg:hidden">
      <div className="grid grid-cols-5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button key={item.key} onClick={() => setView(item.key)} className={cx('flex flex-col items-center gap-1 px-1 py-2 text-[11px]', active ? 'text-primary' : 'text-slate-500')}>
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.key === 'drive' ? 'Files' : item.key === 'photos' ? 'Media' : item.key === 'uploads' ? 'Uploads' : item.key === 'favorites' ? 'Starred' : 'Settings'}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[240px] items-center justify-center text-slate-500">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading files...
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <FileIcon className="h-10 w-10 text-slate-400" />
      <h3 className="mt-3 font-semibold text-slate-950">No files found</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Adjust the current filters or upload from the main toolbar when available.</p>
    </div>
  );
}

function buildBreadcrumbs(folders: FolderItem[], currentId: string | null): FolderItem[] {
  const chain: FolderItem[] = [];
  let cursor = currentId;
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor)) {
    guard.add(cursor);
    const folder = folders.find((item) => item.id === cursor);
    if (!folder) break;
    chain.unshift(folder);
    cursor = folder.parent_id;
  }
  return chain;
}

function sortFiles(files: StoredFile[], mode: SortMode) {
  const copy = [...files];
  return copy.sort((a, b) => {
    if (mode === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (mode === 'name_asc') return a.original_name.localeCompare(b.original_name);
    if (mode === 'name_desc') return b.original_name.localeCompare(a.original_name);
    if (mode === 'size_desc') return b.size_bytes - a.size_bytes;
    if (mode === 'size_asc') return a.size_bytes - b.size_bytes;
    if (mode === 'type') return typeLabel(a.mime_type).localeCompare(typeLabel(b.mime_type));
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function iconForMime(mime: string) {
  const group = getTypeGroup(mime);
  if (group === 'image') return Image;
  if (group === 'video') return Video;
  if (group === 'audio') return Music;
  if (group === 'archive') return Archive;
  if (group === 'document') return FileText;
  return FileIcon;
}

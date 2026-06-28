export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function typeLabel(mime: string): string {
  if (mime.startsWith('image/')) return 'Image';
  if (mime.startsWith('video/')) return 'Video';
  if (mime.startsWith('audio/')) return 'Audio';
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || mime.includes('gzip')) return 'Archive';
  if (mime.includes('text')) return 'Text';
  if (mime.includes('spreadsheet')) return 'Spreadsheet';
  if (mime.includes('presentation')) return 'Presentation';
  if (mime.includes('document')) return 'Document';
  return 'File';
}

export function getTypeGroup(mime: string): 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || mime.includes('gzip')) return 'archive';
  if (mime.includes('pdf') || mime.includes('text') || mime.includes('document') || mime.includes('spreadsheet') || mime.includes('presentation')) return 'document';
  return 'other';
}

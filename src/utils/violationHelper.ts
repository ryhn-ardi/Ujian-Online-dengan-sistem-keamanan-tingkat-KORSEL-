import { Student, ViolationCategory, ViolationLogEntry } from '../types';

export interface ViolationCategoryMeta {
  label: string;
  shortLabel: string;
  badgeClass: string;
  darkBadgeClass: string;
}

export const getViolationCategoryMeta = (category?: ViolationCategory): ViolationCategoryMeta => {
  switch (category) {
    case 'QUICK_CHAT':
      return {
        label: 'Membuka Quick Chatting',
        shortLabel: 'Quick Chatting',
        badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
        darkBadgeClass: 'bg-sky-500/20 text-sky-300 border-sky-400/30',
      };
    case 'FLOATING_WINDOW':
      return {
        label: 'Membuka Floating Windows',
        shortLabel: 'Floating Windows',
        badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
        darkBadgeClass: 'bg-purple-500/20 text-purple-300 border-purple-400/30',
      };
    case 'SPLIT_SCREEN':
      return {
        label: 'Melakukan Split Screen',
        shortLabel: 'Split Screen',
        badgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
        darkBadgeClass: 'bg-orange-500/20 text-orange-300 border-orange-400/30',
      };
    case 'GOOGLE_LENS':
      return {
        label: 'Membuka Google Lens',
        shortLabel: 'Google Lens',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
        darkBadgeClass: 'bg-rose-500/20 text-rose-300 border-rose-400/30',
      };
    case 'GOOGLE_ASSISTANT':
      return {
        label: 'Membuka Google Assistant',
        shortLabel: 'Google Assistant',
        badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        darkBadgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-400/30',
      };
    case 'QUICK_SETTINGS':
      return {
        label: 'Menarik Quick Settings / Notifikasi',
        shortLabel: 'Quick Settings',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
        darkBadgeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
      };
    case 'TAB_SWITCH':
      return {
        label: 'Beralih Tab / Membuka Aplikasi Lain',
        shortLabel: 'Pindah Tab / App',
        badgeClass: 'bg-red-100 text-red-800 border-red-200',
        darkBadgeClass: 'bg-red-500/20 text-red-300 border-red-400/30',
      };
    case 'FULLSCREEN_EXIT':
      return {
        label: 'Keluar Layar Penuh (Fullscreen)',
        shortLabel: 'Keluar Fullscreen',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
        darkBadgeClass: 'bg-rose-500/20 text-rose-300 border-rose-400/30',
      };
    case 'SHORTCUT':
      return {
        label: 'Menekan Tombol / Pintasan Terlarang',
        shortLabel: 'Tombol Terlarang',
        badgeClass: 'bg-slate-200 text-slate-800 border-slate-300',
        darkBadgeClass: 'bg-slate-500/20 text-slate-300 border-slate-400/30',
      };
    default:
      return {
        label: 'Aktivitas Mencurigakan Lainnya',
        shortLabel: 'Pelanggaran Lain',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        darkBadgeClass: 'bg-slate-500/20 text-slate-300 border-slate-400/30',
      };
  }
};

export const formatViolationTime = (isoString?: string): string => {
  if (!isoString) return '-';
  try {
    return new Date(isoString).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + ' WIB';
  } catch {
    return '-';
  }
};

export const createViolationLogEntry = (
  reason: string,
  category: ViolationCategory = 'OTHER',
  mode: 'STRICT' | 'PASSIVE' = 'STRICT'
): ViolationLogEntry => ({
  id: `vlog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  timestamp: new Date().toISOString(),
  reason,
  category,
  mode,
});

export const formatViolationLogsForExport = (student: Student): string => {
  const logs = student.violationLogs || [];
  if (logs.length === 0) {
    return student.lockedReason ? student.lockedReason : '-';
  }
  return logs
    .map((log, i) => {
      const meta = getViolationCategoryMeta(log.category);
      const timeStr = formatViolationTime(log.timestamp);
      return `${i + 1}. [${timeStr} | ${meta.shortLabel}] ${log.reason}`;
    })
    .join('\n');
};

import { useState, useEffect } from 'react';
import { ExamSubject } from '../types';

/**
 * Format date in Western Indonesia Time (WIB / UTC+7 / Asia/Jakarta).
 */
export function formatWIBDateTime(date: Date | string | number | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(d) + ' WIB';
  } catch {
    return String(date);
  }
}

export function formatWIBShort(date: Date | string | number | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d) + ' WIB';
  } catch {
    return String(date);
  }
}

export function formatWIBTimeOnly(date: Date | string | number | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(d) + ' WIB';
  } catch {
    return String(date);
  }
}

/**
 * Convert ISO or Date into HTML datetime-local input string value in WIB timezone (YYYY-MM-DDTHH:mm).
 */
export function toWIBDateTimeInputValue(dateStr?: string | Date): string {
  if (!dateStr) return '';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return '';

  // Get parts in Asia/Jakarta timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(d);
  const partMap: Record<string, string> = {};
  parts.forEach(p => { partMap[p.type] = p.value; });

  const year = partMap.year || '2026';
  const month = partMap.month || '01';
  const day = partMap.day || '01';
  let hour = partMap.hour || '00';
  if (hour === '24') hour = '00';
  const minute = partMap.minute || '00';

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/**
 * Parse an HTML datetime-local input string (assumed to be entered in WIB UTC+7) into ISO string.
 */
export function parseWIBInputValueToISO(inputValue: string): string {
  if (!inputValue || !inputValue.trim()) return '';
  // Format: YYYY-MM-DDTHH:mm
  // WIB is UTC+07:00
  const trimmed = inputValue.trim();
  if (trimmed.includes('Z') || trimmed.includes('+')) return new Date(trimmed).toISOString();
  // Append +07:00 timezone offset
  const fullWIBString = `${trimmed}:00+07:00`;
  const parsed = new Date(fullWIBString);
  if (isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

export interface SubjectScheduleStatus {
  isVisible: boolean; // Dapat dilihat siswa pada daftar mapel
  canStartExam: boolean; // Tombol Mulai Ujian aktif dan siswa boleh mengerjakan
  statusType: 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'INACTIVE';
  statusLabel: string;
  detailMessage: string;
  badgeBg: string;
  badgeText: string;
  secondsUntilStart?: number;
  secondsUntilEnd?: number;
}

/**
 * Calculates current schedule status for a given ExamSubject relative to current WIB time.
 */
export function evaluateSubjectSchedule(subject: ExamSubject, now: Date = new Date()): SubjectScheduleStatus {
  // If explicitly disabled by admin
  if (subject.isActive === false) {
    return {
      isVisible: false,
      canStartExam: false,
      statusType: 'INACTIVE',
      statusLabel: 'Tidak Aktif',
      detailMessage: 'Mata pelajaran ini sedang dinonaktifkan oleh administrator.',
      badgeBg: 'bg-slate-100 text-slate-500 border-slate-200',
      badgeText: 'TIDAK AKTIF'
    };
  }

  // If scheduling is not enabled for this subject, it's always visible & ready to start
  if (!subject.scheduleEnabled) {
    return {
      isVisible: true,
      canStartExam: true,
      statusType: 'ACTIVE',
      statusLabel: 'Siap Dikerjakan (Tanpa Jadwal)',
      detailMessage: 'Dapat langsung dikerjakan sewaktu-waktu.',
      badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      badgeText: 'TERBUKA BEBAS'
    };
  }

  const nowMs = now.getTime();

  const displayStartMs = subject.scheduleDisplayStart ? new Date(subject.scheduleDisplayStart).getTime() : null;
  const displayEndMs = subject.scheduleDisplayEnd ? new Date(subject.scheduleDisplayEnd).getTime() : null;
  const examStartMs = subject.scheduleExamStart ? new Date(subject.scheduleExamStart).getTime() : null;
  const examEndMs = subject.scheduleExamEnd ? new Date(subject.scheduleExamEnd).getTime() : null;

  // 1. Check Display Window (Kapan mapel tampil di portal siswa)
  if (displayStartMs && !isNaN(displayStartMs) && nowMs < displayStartMs) {
    // Belum waktunya tampil di portal siswa sama sekali
    return {
      isVisible: false,
      canStartExam: false,
      statusType: 'INACTIVE',
      statusLabel: 'Belum Ditampilkan di Portal',
      detailMessage: `Akan tampil pada portal siswa: ${formatWIBShort(subject.scheduleDisplayStart)}`,
      badgeBg: 'bg-slate-100 text-slate-500 border-slate-200',
      badgeText: 'BELUM TAMPIL'
    };
  }

  if (displayEndMs && !isNaN(displayEndMs) && nowMs > displayEndMs) {
    // Lewat batas akhir tampil
    return {
      isVisible: false,
      canStartExam: false,
      statusType: 'EXPIRED',
      statusLabel: 'Masa Tayang Selesai',
      detailMessage: `Selesai ditayangkan sejak: ${formatWIBShort(subject.scheduleDisplayEnd)}`,
      badgeBg: 'bg-slate-100 text-slate-500 border-slate-200',
      badgeText: 'TUTUP'
    };
  }

  // At this point, the subject is visible to students. Now evaluate whether they can start the exam.

  // 2. Check if before exam start time (Belum Mulai Dikerjakan)
  if (examStartMs && !isNaN(examStartMs) && nowMs < examStartMs) {
    const diffSec = Math.max(0, Math.floor((examStartMs - nowMs) / 1000));
    return {
      isVisible: true,
      canStartExam: false,
      statusType: 'UPCOMING',
      statusLabel: 'Terjadwal - Belum Dimulai',
      detailMessage: `Ujian baru dapat mulai dikerjakan pada: ${formatWIBDateTime(subject.scheduleExamStart)}`,
      badgeBg: 'bg-amber-100 text-amber-800 border-amber-300',
      badgeText: 'BELUM DIMULAI',
      secondsUntilStart: diffSec
    };
  }

  // 3. Check if after exam end time (Waktu Mengerjakan Telah Berakhir)
  if (examEndMs && !isNaN(examEndMs) && nowMs > examEndMs) {
    return {
      isVisible: true,
      canStartExam: false,
      statusType: 'EXPIRED',
      statusLabel: 'Waktu Ujian Berakhir',
      detailMessage: `Batas waktu mulai mengerjakan telah ditutup pada: ${formatWIBDateTime(subject.scheduleExamEnd)}`,
      badgeBg: 'bg-rose-100 text-rose-800 border-rose-300',
      badgeText: 'TELAH BERAKHIR'
    };
  }

  // 4. In active exam window!
  const secondsLeft = examEndMs && !isNaN(examEndMs) ? Math.max(0, Math.floor((examEndMs - nowMs) / 1000)) : undefined;

  return {
    isVisible: true,
    canStartExam: true,
    statusType: 'ACTIVE',
    statusLabel: 'Sedang Berlangsung - Siap Dikerjakan',
    detailMessage: examEndMs
      ? `Batas waktu masuk ujian sampai: ${formatWIBShort(subject.scheduleExamEnd)}`
      : 'Ujian aktif dan dapat langsung dikerjakan.',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    badgeText: 'SEDANG BERLANGSUNG',
    secondsUntilEnd: secondsLeft
  };
}

/**
 * Real-time WIB Clock Hook.
 * Updates every second and provides formatted time strings.
 */
export function useRealtimeWIB() {
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return {
    now: currentDate,
    formattedDateTime: formatWIBDateTime(currentDate),
    formattedTimeOnly: formatWIBTimeOnly(currentDate),
    formattedDateOnly: new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(currentDate)
  };
}

/**
 * Format seconds into HH:MM:SS or DD:HH:MM:SS countdown format.
 */
export function formatDurationCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00:00';
  const days = Math.floor(seconds / 86400);
  const rem1 = seconds % 86400;
  const hours = Math.floor(rem1 / 3600);
  const rem2 = rem1 % 3600;
  const mins = Math.floor(rem2 / 60);
  const secs = rem2 % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  if (days > 0) {
    return `${days} hari ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

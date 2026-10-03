import { ExamSubject } from '../types';

export const GRADE_PRESETS = [
  { id: 'ALL', label: 'Semua Tingkatan (Umum)', shortLabel: 'Semua Kelas', description: 'Dapat diakses oleh seluruh siswa dari semua kelas', badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: '7', label: 'Khusus Kelas 7 (VII)', shortLabel: 'Kelas 7', description: 'Hanya ditampilkan untuk siswa Kelas 7 / VII', badgeBg: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: '8', label: 'Khusus Kelas 8 (VIII)', shortLabel: 'Kelas 8', description: 'Hanya ditampilkan untuk siswa Kelas 8 / VIII', badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: '9', label: 'Khusus Kelas 9 (IX)', shortLabel: 'Kelas 9', description: 'Hanya ditampilkan untuk siswa Kelas 9 / IX', badgeBg: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: '10', label: 'Khusus Kelas 10 (X)', shortLabel: 'Kelas 10', description: 'Hanya ditampilkan untuk siswa Kelas 10 / X', badgeBg: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: '11', label: 'Khusus Kelas 11 (XI)', shortLabel: 'Kelas 11', description: 'Hanya ditampilkan untuk siswa Kelas 11 / XI', badgeBg: 'bg-orange-50 text-orange-700 border-orange-200' },
  { id: '12', label: 'Khusus Kelas 12 (XII)', shortLabel: 'Kelas 12', description: 'Hanya ditampilkan untuk siswa Kelas 12 / XII', badgeBg: 'bg-rose-50 text-rose-700 border-rose-200' }
];

/**
 * Normalizes Roman and Arabic grade levels from student class string.
 * Examples:
 * - "8A", "8-B", "8.1", "KELAS 8", "8" -> "8"
 * - "VIII A", "VIII-1", "KELAS VIII" -> "8"
 * - "7B", "VII A", "VII" -> "7"
 * - "9C", "IX B", "IX" -> "9"
 * - "10 IPA 1", "X MIPA", "X" -> "10"
 * - "11 IPS 2", "XI IPA", "XI" -> "11"
 * - "12 TKJ 1", "XII RPL", "XII" -> "12"
 */
export function extractGradeFromClass(studentClass?: string): string | null {
  if (!studentClass || !studentClass.trim()) return null;
  const normalized = studentClass.trim().toUpperCase();

  // 1. Check for "KELAS X", "KELAS 8", etc.
  const kelasMatch = normalized.match(/KELAS\s*(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I|\d+)/i);
  if (kelasMatch && kelasMatch[1]) {
    const raw = kelasMatch[1].toUpperCase();
    const romanConverted = romanToNumber(raw);
    if (romanConverted) return romanConverted;
    if (/^\d+$/.test(raw)) return raw;
  }

  // 2. Check Roman numerals at start or standalone (XII, XI, X, IX, VIII, VII, etc.)
  const romanMatch = normalized.match(/^(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)(?:\b|[-_.\s]|$)/i);
  if (romanMatch && romanMatch[1]) {
    const romanConverted = romanToNumber(romanMatch[1].toUpperCase());
    if (romanConverted) return romanConverted;
  }

  // 3. Check leading digits (e.g., 10, 11, 12, 7, 8, 9)
  const numMatch = normalized.match(/^(\d+)/);
  if (numMatch && numMatch[1]) {
    return numMatch[1];
  }

  // 4. Check any isolated number token (e.g., "SMP 8 A", "TINGKAT 9")
  const tokenMatch = normalized.match(/\b(1[0-2]|[1-9])\b/);
  if (tokenMatch && tokenMatch[1]) {
    return tokenMatch[1];
  }

  return null;
}

function romanToNumber(roman: string): string | null {
  switch (roman) {
    case 'XII': return '12';
    case 'XI': return '11';
    case 'X': return '10';
    case 'IX': return '9';
    case 'VIII': return '8';
    case 'VII': return '7';
    case 'VI': return '6';
    case 'V': return '5';
    case 'IV': return '4';
    case 'III': return '3';
    case 'II': return '2';
    case 'I': return '1';
    default: return null;
  }
}

/**
 * Checks whether an exam subject is accessible / intended for a student given their class.
 */
export function isSubjectMatchingStudentClass(subject: ExamSubject, studentClass?: string): boolean {
  // If no targetGrade specified, or set to ALL or empty -> accessible to everyone
  const target = (subject.targetGrade || 'ALL').trim().toUpperCase();
  if (target === 'ALL' || target === 'SEMUA' || target === '') {
    return true;
  }

  // If student class is not specified yet (e.g. before login/typing in manual mode),
  // default to allowing so options are visible or prompt student
  if (!studentClass || !studentClass.trim()) {
    return true;
  }

  const cleanStudentClass = studentClass.trim().toUpperCase();
  const studentGrade = extractGradeFromClass(cleanStudentClass);

  // Split targetGrade by comma in case of multiple grades/classes (e.g., "7, 8" or "8A, 8B")
  const targets = target.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);

  for (const t of targets) {
    // 1. Direct class exact match (e.g. target "8A" === student "8A")
    if (t === cleanStudentClass) return true;

    // 2. Direct grade match (e.g. target "8" === studentGrade "8")
    if (studentGrade && (t === studentGrade || t === `KELAS ${studentGrade}` || t === `KELAS ${studentGrade}`.toUpperCase())) {
      return true;
    }

    // 3. Roman equivalent match (e.g. target "VIII" -> "8" matches studentGrade "8")
    const tRomanNum = romanToNumber(t);
    if (tRomanNum && studentGrade && tRomanNum === studentGrade) {
      return true;
    }

    // 4. Target extraction match
    const targetExtracted = extractGradeFromClass(t);
    if (targetExtracted && studentGrade && targetExtracted === studentGrade) {
      return true;
    }
  }

  return false;
}

/**
 * Returns human-readable label and visual styling badge for targetGrade configuration.
 */
export function getGradeBadge(targetGrade?: string) {
  const target = (targetGrade || 'ALL').trim().toUpperCase();
  if (target === 'ALL' || target === 'SEMUA' || target === '') {
    return {
      label: 'Semua Kelas',
      fullLabel: 'Semua Tingkatan (Umum)',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      tagColor: 'text-emerald-700 bg-emerald-100/70 border-emerald-300'
    };
  }

  const preset = GRADE_PRESETS.find(p => p.id === target);
  if (preset) {
    return {
      label: preset.shortLabel,
      fullLabel: preset.label,
      badgeBg: preset.badgeBg,
      tagColor: preset.badgeBg
    };
  }

  return {
    label: `Kelas ${target}`,
    fullLabel: `Khusus Kelas ${target}`,
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    tagColor: 'bg-indigo-50 text-indigo-700 border-indigo-200'
  };
}

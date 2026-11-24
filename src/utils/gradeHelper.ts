import { ExamSubject, Question, Student, StudentAttemptHistory } from '../types';

export const GRADE_PRESETS = [
  { id: 'ALL', label: 'Semua Tingkatan (Umum)', shortLabel: 'Semua Kelas', description: 'Dapat diakses oleh seluruh siswa dari semua kelas', badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: '7', label: 'Khusus Kelas 7 (VII)', shortLabel: 'Kelas 7', description: 'Hanya ditampilkan untuk siswa Kelas 7 / VII', badgeBg: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: '8', label: 'Khusus Kelas 8 (VIII)', shortLabel: 'Kelas 8', description: 'Hanya ditampilkan untuk siswa Kelas 8 / VIII', badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: '9', label: 'Khusus Kelas 9 (IX)', shortLabel: 'Kelas 9', description: 'Hanya ditampilkan untuk siswa Kelas 9 / IX', badgeBg: 'bg-purple-50 text-purple-700 border-purple-200' },
  { id: '10', label: 'Khusus Kelas 10 (X)', shortLabel: 'Kelas 10', description: 'Hanya ditampilkan untuk siswa Kelas 10 / X', badgeBg: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: '11', label: 'Khusus Kelas 11 (XI)', shortLabel: 'Kelas 11', description: 'Hanya ditampilkan untuk siswa Kelas 11 / XI', badgeBg: 'bg-orange-50 text-orange-700 border-orange-200' },
  { id: '12', label: 'Khusus Kelas 12 (XII)', shortLabel: 'Kelas 12', description: 'Hanya ditampilkan untuk siswa Kelas 12 / XII', badgeBg: 'bg-rose-50 text-rose-700 border-rose-200' }
];

const ROMAN_NUMERALS_PATTERN = '(XII|XI|IX|VIII|VII|VI|IV|III|II|X|V|I)';

function romanToNumber(roman: string): string | null {
  switch (roman.toUpperCase()) {
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
 * Strips common Indonesian class prefixes ("KELAS", "KLS", "TINGKAT", "GRADE", "LEVEL")
 */
function stripGradePrefixes(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/^(?:KELAS|KLS|TINGKAT|GRADE|LEVEL)\s*[-.:]?\s*/i, '')
    .trim();
}

/**
 * Canonicalizes a class identifier so variations like "VIII-A", "8 A", "Kelas 8A"
 * all resolve cleanly to "8A", and "X IPA 1" resolves to "10IPA1".
 */
export function normalizeClassCanonical(studentClass?: string): string {
  if (!studentClass || !studentClass.trim()) return '';
  let clean = stripGradePrefixes(studentClass);

  // Convert leading Roman numeral grade (e.g. "VIII A", "VIII-B", "VIIIA", "X IPA 1", "IXA")
  const romanPrefixMatch = clean.match(new RegExp(`^${ROMAN_NUMERALS_PATTERN}(?=$|[\\s\\-_.A-Z0-9])`, 'i'));
  if (romanPrefixMatch && romanPrefixMatch[1]) {
    const romanToken = romanPrefixMatch[1].toUpperCase();
    const rest = clean.slice(romanToken.length);
    // Avoid misreading words starting with "I" like "IPA 1" or "IPS 2" as Grade 1 ("I")
    const isRomanIWord = romanToken === 'I' && /^[A-Z]/.test(rest);
    const validBoundary = rest === '' || /^[\s\-_.]/.test(rest) || (romanToken.length >= 2 && /^[A-Z0-9]/.test(rest)) || (romanToken === 'X' && /^[A-Z0-9]/.test(rest));
    if (validBoundary && !isRomanIWord) {
      const converted = romanToNumber(romanToken);
      if (converted) {
        clean = converted + rest;
      }
    }
  }

  return clean.replace(/[\s\-_.]+/g, '').toUpperCase();
}

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

  // 1. Explicit "KELAS X", "KELAS 8", "TINGKAT 9", etc.
  const kelasMatch = normalized.match(/(?:KELAS|KLS|TINGKAT|GRADE|LEVEL)\s*[-.:]?\s*(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I|\d+)/i);
  if (kelasMatch && kelasMatch[1]) {
    const raw = kelasMatch[1].toUpperCase();
    const romanConverted = romanToNumber(raw);
    if (romanConverted) return romanConverted;
    if (/^\d+$/.test(raw)) return String(parseInt(raw, 10));
  }

  // 2. Leading Roman numerals at start (XII, XI, X, IX, VIII, VII, etc.) with clear boundary
  const stripped = stripGradePrefixes(normalized);
  const romanMatch = stripped.match(new RegExp(`^${ROMAN_NUMERALS_PATTERN}(?=$|[\\s\\-_.]|(?:[A-Z0-9]))`, 'i'));
  if (romanMatch && romanMatch[1]) {
    const token = romanMatch[1].toUpperCase();
    const rest = stripped.slice(token.length);
    // Avoid misreading words like "IPA 1" or "IPS 2" as Roman "I"
    const isRomanIWord = token === 'I' && /^[A-Z]/.test(rest);
    const hasWordBoundary = rest === '' || /^[\s\-_.]/.test(rest) || (token.length >= 2 && /^[A-Z0-9]/.test(rest));
    if (!isRomanIWord && hasWordBoundary) {
      const romanConverted = romanToNumber(token);
      if (romanConverted) return romanConverted;
    }
  }

  // 3. Leading digits (e.g., 10, 11, 12, 7, 8, 9)
  const numMatch = stripped.match(/^(\d{1,2})(?=$|[^0-9])/);
  if (numMatch && numMatch[1]) {
    return String(parseInt(numMatch[1], 10));
  }

  return null;
}

/**
 * Returns true if a target token represents an entire grade level (e.g. "8", "VIII", "KELAS 8")
 * rather than a specific class section (e.g. "8A", "VIII-B", "10 IPA 1").
 */
function isWholeGradeToken(targetToken: string): boolean {
  const stripped = stripGradePrefixes(targetToken);
  if (/^\d{1,2}$/.test(stripped)) return true;
  if (romanToNumber(stripped) !== null) return true;
  return false;
}

/**
 * Checks whether an exam subject is accessible / intended for a student given their class.
 * @param allowEmptyClass When true (default, for UI preview before typing), empty class returns true.
 *                        Pass false when enforcing class access at exam start/restore.
 */
export function isSubjectMatchingStudentClass(
  subject: ExamSubject,
  studentClass?: string,
  allowEmptyClass = true
): boolean {
  // If no targetGrade specified, or set to ALL or empty -> accessible to everyone
  const target = (subject.targetGrade || 'ALL').trim().toUpperCase();
  if (target === 'ALL' || target === 'SEMUA' || target === '') {
    return true;
  }

  // Handle missing/empty student class
  if (!studentClass || !studentClass.trim()) {
    return allowEmptyClass;
  }

  const cleanStudentClass = studentClass.trim().toUpperCase();
  const canonicalStudent = normalizeClassCanonical(cleanStudentClass);
  const studentGrade = extractGradeFromClass(cleanStudentClass);

  // Split targetGrade by comma/semicolon in case of multiple grades/classes (e.g., "7, 8" or "8A, 8B")
  const targets = target.split(/[,;]+/).map(t => t.trim().toUpperCase()).filter(Boolean);

  for (const t of targets) {
    if (t === 'ALL' || t === 'SEMUA') return true;

    // 1. Direct canonical class exact match (e.g. "8A" matches "8A", "8 A", "8-A", "VIII A", "Kelas 8A")
    const canonicalTarget = normalizeClassCanonical(t);
    if (canonicalTarget && canonicalStudent && canonicalTarget === canonicalStudent) {
      return true;
    }

    // 2. Whole-grade target match ONLY if target token specifies a whole grade (e.g. "8", "VIII", "KELAS 8")
    //    NEVER treat a specific section target like "8A" as matching all of Grade 8 ("8B", "8C", etc.)!
    if (isWholeGradeToken(t)) {
      const targetGrade = extractGradeFromClass(t);
      if (targetGrade && studentGrade && targetGrade === studentGrade) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Consistent check whether a Question belongs to a target subjectId across Admin, Registration, and Exam views.
 */
export function doesQuestionBelongToSubject(
  q: Question,
  targetSubId: string | undefined,
  subjects?: ExamSubject[]
): boolean {
  const firstSubId = subjects && subjects.length > 0 ? subjects[0].id : 'sub1';
  const normalizedTarget = targetSubId || firstSubId;
  if (q.subjectId) {
    return q.subjectId === normalizedTarget;
  }
  // Legacy unassigned questions without subjectId belong to the primary/first slot or 'sub1'
  return normalizedTarget === firstSubId || normalizedTarget === 'sub1';
}

/**
 * Matches a Student exam session against login credentials without falsely colliding
 * students who share the same display name in different accounts or classes.
 */
export function isSameStudentAccount(
  session: { username?: string; name?: string; studentClass?: string },
  target: { username?: string; name?: string; studentClass?: string }
): boolean {
  const sUser = (session.username || '').trim().toLowerCase();
  const tUser = (target.username || '').trim().toLowerCase();

  // If both have usernames, they MUST match cleanly by username — never fall back to name
  if (sUser && tUser) {
    return sUser === tUser;
  }

  // Fallback to normalized name when username is missing on either side
  const sName = (session.name || '').trim().toLowerCase().replace(/\s+/g, '');
  const tName = (target.name || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!sName || !tName || sName !== tName) {
    return false;
  }

  // When falling back to name matching, if both have class info, also require same canonical class
  const sClass = normalizeClassCanonical(session.studentClass);
  const tClass = normalizeClassCanonical(target.studentClass);
  if (sClass && tClass && sClass !== 'UMUM' && tClass !== 'UMUM') {
    return sClass === tClass;
  }

  return true;
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

export interface StudentScoreBreakdown {
  mainScore: number | '-';
  remedialScore: number | '-';
  finalScore: number;
  sessionLabel: string;
  historySummary: string;
}

/**
 * Extracts Nilai Ujian Utama, Nilai Remedial, and Nilai Akhir consistently
 * from attemptHistory and active student attempt state for Excel & reporting exports.
 */
export function getStudentScoreBreakdown(
  s: Student,
  computedScore: number
): StudentScoreBreakdown {
  const hasAnswers = Object.keys(s.answers || {}).length > 0;
  const hasCurrentResult = s.status === 'SELESAI' || typeof s.score === 'number' || hasAnswers;
  const roundedCurrent = Number(
    (s.status === 'SELESAI'
      ? computedScore
      : typeof s.score === 'number'
      ? s.score
      : computedScore
    ).toFixed(1)
  );

  const currentAttemptNum = s.attemptNumber || 1;
  const isCurrentRemidi = Boolean(s.isRemedial) || currentAttemptNum > 1;

  const sortedHistory = [...(s.attemptHistory || [])].sort(
    (a, b) => (a.attemptNumber || 1) - (b.attemptNumber || 1)
  );

  const utamaEntry = sortedHistory.find(
    (h) => h.attemptType === 'UTAMA' || h.attemptNumber === 1
  );

  let mainScore: number | '-' = '-';
  if (utamaEntry) {
    mainScore = Number((utamaEntry.score || 0).toFixed(1));
  } else if (!isCurrentRemidi && hasCurrentResult) {
    mainScore = roundedCurrent;
  }

  const remedialMap = new Map<number, number>();
  sortedHistory
    .filter((h) => h.attemptType === 'REMIDI' || h.attemptNumber > 1)
    .forEach((h) => {
      const attemptIdx = h.attemptNumber > 1 ? h.attemptNumber : 2;
      remedialMap.set(attemptIdx, Number((h.score || 0).toFixed(1)));
    });

  if (isCurrentRemidi && hasCurrentResult) {
    remedialMap.set(currentAttemptNum, roundedCurrent);
  }

  const orderedRemedials = Array.from(remedialMap.entries()).sort((a, b) => a[0] - b[0]);
  const remedialScore: number | '-' =
    orderedRemedials.length > 0
      ? orderedRemedials[orderedRemedials.length - 1][1]
      : '-';

  const finalScore =
    remedialScore !== '-'
      ? remedialScore
      : mainScore !== '-'
      ? mainScore
      : 0;

  const sessionLabel = isCurrentRemidi
    ? `REMIDI (Ke-${currentAttemptNum})`
    : orderedRemedials.length > 0
    ? 'REMIDI'
    : 'UTAMA';

  const parts: string[] = [];
  if (mainScore !== '-') {
    parts.push(`Utama: ${mainScore}`);
  }
  orderedRemedials.forEach(([num, sc]) => {
    const label = orderedRemedials.length > 1 ? `Remidi ${num - 1}` : 'Remidi';
    parts.push(`${label}: ${sc}`);
  });

  return {
    mainScore,
    remedialScore,
    finalScore,
    sessionLabel,
    historySummary: parts.length > 0 ? parts.join(' | ') : '-'
  };
}

/**
 * Builds updated attemptHistory when finalizing an exam attempt (submit or force-submit).
 */
export function buildAttemptHistoryOnSubmit(
  student: Student,
  score: number,
  correctAnswersCount: number,
  totalQuestions: number,
  completedAt: string
): StudentAttemptHistory[] {
  const currentAttemptNum = student.attemptNumber || 1;
  const currentAttemptType: 'UTAMA' | 'REMIDI' =
    currentAttemptNum > 1 || student.isRemedial ? 'REMIDI' : 'UTAMA';

  const newRecord: StudentAttemptHistory = {
    attemptNumber: currentAttemptNum,
    attemptType: currentAttemptType,
    score,
    correctAnswersCount,
    totalQuestions,
    completedAt,
    answers: student.answers || {}
  };

  const existingHistory = student.attemptHistory || [];
  const filtered = existingHistory.filter((h) => h.attemptNumber !== currentAttemptNum);
  return [...filtered, newRecord];
}

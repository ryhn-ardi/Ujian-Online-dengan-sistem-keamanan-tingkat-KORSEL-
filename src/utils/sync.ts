import { Student, Question, ExamConfig, ExamSubject, StudentUser } from '../types';
import { INITIAL_QUESTIONS, INITIAL_CONFIG } from '../data';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  getDoc,
  writeBatch,
  doc as fsDoc,
  getDocFromServer,
  getDocsFromServer,
  query,
  where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  setCustomAlarmAudioData,
  getCustomAlarmAudioData,
  setCustomAnnouncementAudioData,
  getCustomAnnouncementAudioData
} from './alarmAudio';
import { isSameStudentAccount } from './gradeHelper';

const STUDENTS_KEY = 'proktor_students';
const QUESTIONS_KEY = 'proktor_questions';
const CONFIG_KEY = 'proktor_config';
const STUDENT_USERS_KEY = 'proktor_student_users';

export const DEFAULT_STUDENT_USERS: StudentUser[] = [
  { id: 'usr_1', username: 'siswa1', password: '123', name: 'Ahmad Fauzan', studentClass: '8A', absentNumber: '01' },
  { id: 'usr_2', username: 'siswa2', password: '123', name: 'Bella Safitri', studentClass: '8A', absentNumber: '02' },
  { id: 'usr_3', username: 'siswa3', password: '123', name: 'Dimas Pratama', studentClass: '8B', absentNumber: '01' },
  { id: 'usr_4', username: 'siswa4', password: '123', name: 'Eka Rahmawati', studentClass: '8B', absentNumber: '02' },
  { id: 'usr_5', username: 'siswa5', password: '123', name: 'Fikri Ramadhan', studentClass: '8C', absentNumber: '01' },
];

// Helpers to safely load and cache data across page reloads
function getStored<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    return JSON.parse(item) as T;
  } catch {
    return fallback;
  }
}

function setStored(key: string, value: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`LocalStorage write skipped for "${key}":`, e);
  }
}

function removeStored(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch (e) {}
}

const QUESTIONS_PENDING_SYNC_KEY = 'proktor_questions_pending_sync';
const CONFIG_PENDING_SYNC_KEY = 'proktor_config_pending_sync';
const SUBJECTS_BACKUP_KEY = 'proktor_subjects_backup';

// Clean and sanitize data before saving to Firestore (removes undefined values and ensures valid structures)
export function sanitizeForFirestore<T>(data: T): any {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item));
  }
  if (typeof data === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        cleaned[key] = sanitizeForFirestore(val);
      }
    }
    return cleaned;
  }
  return data;
}

export function cleanStudent(s: Student): Student {
  const cleaned: Student = {
    id: String(s.id || '').trim(),
    name: String(s.name || '').trim(),
    absentNumber: String(s.absentNumber !== undefined && s.absentNumber !== null ? s.absentNumber : '').trim(),
    studentClass: String(s.studentClass || '').trim(),
    status: s.status || 'BELUM_MULAI',
    violationCount: typeof s.violationCount === 'number' ? s.violationCount : 0,
    answers: s.answers || {},
    lastActive: s.lastActive || new Date().toISOString()
  };
  if (s.username && String(s.username).trim()) cleaned.username = String(s.username).trim();
  if (s.subjectId && String(s.subjectId).trim()) cleaned.subjectId = String(s.subjectId).trim();
  if (s.lockedReason) cleaned.lockedReason = String(s.lockedReason);
  if (typeof s.score === 'number' && !isNaN(s.score)) cleaned.score = s.score;
  if (typeof s.correctAnswersCount === 'number') cleaned.correctAnswersCount = s.correctAnswersCount;
  if (typeof s.totalQuestions === 'number') cleaned.totalQuestions = s.totalQuestions;
  if (s.startTime) cleaned.startTime = s.startTime;
  if (s.endTime) cleaned.endTime = s.endTime;
  if (Array.isArray(s.usedTokens)) cleaned.usedTokens = s.usedTokens;
  if (typeof s.tokenUnlockCount === 'number') cleaned.tokenUnlockCount = s.tokenUnlockCount;
  if (Array.isArray(s.assignedQuestionIds) && s.assignedQuestionIds.length > 0) {
    cleaned.assignedQuestionIds = s.assignedQuestionIds;
  }
  if (Array.isArray(s.violationLogs)) {
    cleaned.violationLogs = s.violationLogs
      .filter((v) => v && typeof v.reason === 'string')
      .slice(-100)
      .map((v, idx) => ({
        id: String(v.id || `vlog_${idx}_${Date.now()}`),
        timestamp: String(v.timestamp || new Date().toISOString()),
        reason: String(v.reason).slice(0, 240),
        category: v.category || 'OTHER',
        mode: v.mode === 'PASSIVE' ? 'PASSIVE' : 'STRICT'
      }));
  }
  return cleaned;
}

export function cleanStudentUser(u: StudentUser, idx = 0): StudentUser {
  return {
    id: String(u.id || `usr_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 4)}`).trim(),
    username: String(u.username || '').trim(),
    password: String(u.password || '123').trim(),
    name: String(u.name || '').trim(),
    studentClass: String(u.studentClass || 'UMUM').trim().toUpperCase(),
    absentNumber: String(u.absentNumber !== undefined && u.absentNumber !== null ? u.absentNumber : '').trim(),
    createdAt: u.createdAt || new Date().toISOString()
  };
}

// 1. In-memory states initialized from local storage then kept live via Firestore
let localStudents: Student[] = getStored<Student[]>(STUDENTS_KEY, []);
let localQuestions: Question[] = getStored<Question[]>(QUESTIONS_KEY, []);
let localStudentUsers: StudentUser[] = getStored<StudentUser[]>(STUDENT_USERS_KEY, DEFAULT_STUDENT_USERS);
let localConfig: ExamConfig = getStored<ExamConfig>(CONFIG_KEY, INITIAL_CONFIG);

const initialSyncCompleted = {
  config: false,
  questions: false,
  students: false,
  studentUsers: false
};

let hasHydratedConfigFromServer = false;
let hasHydratedQuestionsFromServer = false;
let configSeedingInProgress = false;
let questionsSeedingInProgress = false;

export function isInitialSyncCompleted(): boolean {
  return initialSyncCompleted.config && initialSyncCompleted.questions;
}

export function isCloudConfigReady(): boolean {
  return hasHydratedConfigFromServer;
}

export function isCloudQuestionsReady(): boolean {
  return hasHydratedQuestionsFromServer;
}

export function isLikelyDefaultSubjects(subjects?: ExamSubject[]): boolean {
  if (!subjects || !Array.isArray(subjects) || subjects.length === 0) return true;
  if (subjects.length !== 2) return false;
  const s0 = subjects[0];
  const s1 = subjects[1];
  return (
    s0?.id === 'sub2' &&
    s0?.name === 'Matematika TKA' &&
    s1?.id === 'sub3' &&
    s1?.name === 'Bahasa Indonesia TKA'
  );
}

export function isLikelyDefaultConfig(cfg?: ExamConfig | null): boolean {
  if (!cfg) return true;
  return isLikelyDefaultSubjects(cfg.subjects) && cfg.examTitle === INITIAL_CONFIG.examTitle;
}

const DEFAULT_SAMPLE_QUESTION_IDS = new Set(INITIAL_QUESTIONS.map(q => q.id));

async function saveSubjectsBackupToCloud(subjects: ExamSubject[]): Promise<void> {
  if (!Array.isArray(subjects) || subjects.length === 0 || isLikelyDefaultSubjects(subjects)) {
    return;
  }
  setStored(SUBJECTS_BACKUP_KEY, subjects);
  try {
    await setDoc(doc(db, 'config', 'subjectsBackup'), sanitizeForFirestore({
      subjects,
      updatedAt: new Date().toISOString()
    }));
  } catch (err) {
    console.warn('Silent subjects backup warning:', err);
  }
}

// Getters returning the synchronized local state instantly
export function getStudents(): Student[] {
  return localStudents;
}

export function getQuestions(): Question[] {
  return localQuestions;
}

export function getExamConfig(): ExamConfig {
  return localConfig;
}

export function getStudentUsers(): StudentUser[] {
  return localStudentUsers;
}

export function getExamSubjects(config?: ExamConfig): ExamSubject[] {
  const cfg = config || localConfig;
  if (cfg.subjects && Array.isArray(cfg.subjects) && cfg.subjects.length > 0) {
    return cfg.subjects;
  }
  if (cfg.subject1Name || cfg.subject2Name) {
    const list: ExamSubject[] = [];
    if (cfg.subject1Name) list.push({ id: 'sub2', name: cfg.subject1Name, code: 'MTK-TKA', isActive: true });
    if (cfg.subject2Name) list.push({ id: 'sub3', name: cfg.subject2Name, code: 'TKA-IND', isActive: true });
    return list;
  }
  return [];
}

// 2. Real-time Subscription management for React components
type SyncCallback = (type: string) => void;
const subscribers = new Set<SyncCallback>();

export function subscribeToSync(callback: SyncCallback): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

function notifySubscribers(type: string) {
  subscribers.forEach((cb) => {
    try {
      cb(type);
    } catch (e) {
      console.error('Error triggering sync callback:', e);
    }
  });
}

// 3. SECURE ERROR HANDLERS as per the Firebase Skill guidelines
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

// -------------------------------------------------------------
// FIRESTORE TELEMETRY & QUOTA LOGGER
// -------------------------------------------------------------
export const SPARK_DAILY_READ_LIMIT = 50000;
export const SPARK_DAILY_WRITE_LIMIT = 20000;

const TELEMETRY_KEY = 'firestore_telemetry_stats';
const LOGS_KEY = 'firestore_telemetry_logs';

export interface FirestoreLogEntry {
  id: string;
  timestamp: string; // ISO date
  timeFormatted: string; // HH:mm:ss WIB
  type: 'READ' | 'WRITE' | 'ERROR' | 'ECO_SAVE';
  operation: string;
  path?: string;
  details: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR';
  count: number;
}

export interface FirestoreStats {
  readsToday: number;
  writesToday: number;
  errorsToday: number;
  ecoSavedWrites: number;
  maxDailyReads: number;
  maxDailyWrites: number;
  isQuotaExceeded: boolean;
  dateKey: string;
}

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let memoryStats: FirestoreStats = (() => {
  const today = getTodayKey();
  const stored = getStored<FirestoreStats | null>(TELEMETRY_KEY, null);
  if (stored && stored.dateKey === today) {
    return { ...stored, maxDailyReads: SPARK_DAILY_READ_LIMIT, maxDailyWrites: SPARK_DAILY_WRITE_LIMIT };
  }
  return {
    readsToday: 0,
    writesToday: 0,
    errorsToday: 0,
    ecoSavedWrites: 0,
    maxDailyReads: SPARK_DAILY_READ_LIMIT,
    maxDailyWrites: SPARK_DAILY_WRITE_LIMIT,
    isQuotaExceeded: false,
    dateKey: today
  };
})();

let memoryLogs: FirestoreLogEntry[] = getStored<FirestoreLogEntry[]>(LOGS_KEY, []);

function persistTelemetry() {
  try {
    localStorage.setItem(TELEMETRY_KEY, JSON.stringify(memoryStats));
    localStorage.setItem(LOGS_KEY, JSON.stringify(memoryLogs.slice(0, 200)));
  } catch (e) {}
  notifySubscribers('SYNC_TELEMETRY');
}

export function getFirestoreStats(): FirestoreStats {
  return { ...memoryStats, isQuotaExceeded: quotaExceededState || memoryStats.isQuotaExceeded };
}

export function getFirestoreLogs(): FirestoreLogEntry[] {
  return [...memoryLogs];
}

export function clearFirestoreLogs(): void {
  memoryLogs = [];
  try {
    localStorage.removeItem(LOGS_KEY);
  } catch (e) {}
  notifySubscribers('SYNC_TELEMETRY');
}

export function resetDailyFirestoreStats(): void {
  memoryStats = {
    readsToday: 0,
    writesToday: 0,
    errorsToday: 0,
    ecoSavedWrites: 0,
    maxDailyReads: SPARK_DAILY_READ_LIMIT,
    maxDailyWrites: SPARK_DAILY_WRITE_LIMIT,
    isQuotaExceeded: false,
    dateKey: getTodayKey()
  };
  quotaExceededState = false;
  persistTelemetry();
}

function addLog(entry: Omit<FirestoreLogEntry, 'id' | 'timestamp' | 'timeFormatted'>) {
  const now = new Date();
  const timeFormatted = now.toLocaleTimeString('id-ID', { hour12: false });
  const logItem: FirestoreLogEntry = {
    ...entry,
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    timestamp: now.toISOString(),
    timeFormatted
  };
  memoryLogs.unshift(logItem);
  if (memoryLogs.length > 200) {
    memoryLogs = memoryLogs.slice(0, 200);
  }
  persistTelemetry();
}

export function recordFirestoreRead(count: number, operation: string, path: string, details: string) {
  memoryStats.readsToday += count;
  addLog({
    type: 'READ',
    operation,
    path,
    details,
    status: 'SUCCESS',
    count
  });
}

export function recordFirestoreWrite(count: number, operation: string, path: string, details: string) {
  memoryStats.writesToday += count;
  addLog({
    type: 'WRITE',
    operation,
    path,
    details,
    status: 'SUCCESS',
    count
  });
}

export function recordEcoSave(operation: string, path: string, details: string) {
  memoryStats.ecoSavedWrites += 1;
  addLog({
    type: 'ECO_SAVE',
    operation,
    path,
    details,
    status: 'SUCCESS',
    count: 1
  });
}

export function recordFirestoreError(operation: string, path: string, errorMsg: string) {
  memoryStats.errorsToday += 1;
  if (errorMsg.includes('resource-exhausted') || errorMsg.includes('Quota exceeded') || errorMsg.includes('quota')) {
    quotaExceededState = true;
    memoryStats.isQuotaExceeded = true;
  }
  addLog({
    type: 'ERROR',
    operation,
    path,
    details: errorMsg,
    status: 'ERROR',
    count: 1
  });
}

let quotaExceededState = false;

export function isFirestoreQuotaExceeded(): boolean {
  return quotaExceededState || memoryStats.isQuotaExceeded;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  recordFirestoreError(operationType, path || '-', errMsg);
  if (errMsg.includes('resource-exhausted') || errMsg.includes('Quota exceeded') || errMsg.includes('quota')) {
    quotaExceededState = true;
    console.warn(`[Firestore Quota Exceeded] Path: ${path} (${operationType}). Switched to local persistent storage.`);
    return;
  }
  
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error Details: ', JSON.stringify(errInfo));
}

// 4. Test database connection on startup
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'config', 'examConfig'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration. Client is offline.');
    }
  }
}
testConnection();

// Populate / Sync from firestore in real-time
// A. Real-time Config Sync & Seeding Helper (Hardened against unverified INITIAL_CONFIG overwrites)
onSnapshot(
  doc(db, 'config', 'examConfig'),
  { includeMetadataChanges: true },
  async (snapshot) => {
    const isFromCache = snapshot.metadata.fromCache;

    if (snapshot.exists()) {
      const data = snapshot.data() as ExamConfig;
      if (!isFromCache) {
        recordFirestoreRead(1, 'CONFIG_SYNC', 'config/examConfig', 'Sinkronisasi konfigurasi ujian');
        hasHydratedConfigFromServer = true;
        initialSyncCompleted.config = true;
      }

      // Preserve in-memory custom audio data URIs if cloud doc omits them due to 1MB split
      const mergedData: ExamConfig = {
        ...data,
        customAlarmAudioUrl: data.customAlarmAudioUrl || localConfig.customAlarmAudioUrl,
        customAnnouncementAudioUrl: data.customAnnouncementAudioUrl || localConfig.customAnnouncementAudioUrl
      };

      localConfig = mergedData;
      setStored(CONFIG_KEY, mergedData);
      if (Array.isArray(mergedData.subjects) && !isLikelyDefaultSubjects(mergedData.subjects)) {
        setStored(SUBJECTS_BACKUP_KEY, mergedData.subjects);
      }

      if (typeof document !== 'undefined' && mergedData.examTitle) {
        document.title = mergedData.examTitle;
      }
      notifySubscribers('SYNC_CONFIG');

      // Auto load custom audio in background if configured and not present locally
      if ((mergedData.alarmType === 'CUSTOM_AUDIO' || mergedData.hasCustomAlarmAudio) && !getCustomAlarmAudioData()) {
        fetchCustomAlarmAudioFromCloud();
      }
      if ((mergedData.announcementSoundType === 'CUSTOM_AUDIO' || mergedData.hasCustomAnnouncementAudio) && !getCustomAnnouncementAudioData()) {
        fetchCustomAnnouncementAudioFromCloud();
      }
    } else {
      // NEVER seed INITIAL_CONFIG based on a cache-only or offline snapshot!
      if (isFromCache || configSeedingInProgress) {
        return;
      }

      configSeedingInProgress = true;
      try {
        // Double-check directly against Firestore Server before ever deciding examConfig doesn't exist
        const serverSnap = await getDocFromServer(doc(db, 'config', 'examConfig'));
        if (serverSnap.exists()) {
          const serverData = serverSnap.data() as ExamConfig;
          hasHydratedConfigFromServer = true;
          initialSyncCompleted.config = true;
          localConfig = serverData;
          setStored(CONFIG_KEY, serverData);
          if (Array.isArray(serverData.subjects) && !isLikelyDefaultSubjects(serverData.subjects)) {
            setStored(SUBJECTS_BACKUP_KEY, serverData.subjects);
          }
          if (typeof document !== 'undefined' && serverData.examTitle) {
            document.title = serverData.examTitle;
          }
          notifySubscribers('SYNC_CONFIG');
          return;
        }

        // Confirmed on server that config/examConfig truly does not exist yet.
        // Check cloud subjectsBackup or local cached config before falling back to INITIAL_CONFIG.
        let backupSubjects: ExamSubject[] | null = null;
        try {
          const backupSnap = await getDocFromServer(doc(db, 'config', 'subjectsBackup'));
          if (backupSnap.exists() && Array.isArray(backupSnap.data()?.subjects) && backupSnap.data()!.subjects.length > 0) {
            backupSubjects = backupSnap.data()!.subjects as ExamSubject[];
          }
        } catch {}

        const cachedCfg = getStored<ExamConfig | null>(CONFIG_KEY, null);
        const seedCfg: ExamConfig = (cachedCfg && cachedCfg.subjects && cachedCfg.subjects.length > 0 && !isLikelyDefaultConfig(cachedCfg))
          ? cachedCfg
          : backupSubjects
            ? {
                ...INITIAL_CONFIG,
                subjects: backupSubjects,
                subject1Name: backupSubjects[0]?.name,
                subject2Name: backupSubjects[1]?.name
              }
            : INITIAL_CONFIG;

        localConfig = seedCfg;
        setStored(CONFIG_KEY, seedCfg);
        hasHydratedConfigFromServer = true;
        initialSyncCompleted.config = true;
        notifySubscribers('SYNC_CONFIG');

        await setDoc(doc(db, 'config', 'examConfig'), sanitizeForFirestore(seedCfg));
        recordFirestoreWrite(1, 'SAVE_CONFIG', 'config/examConfig', 'Inisialisasi config ke cloud');
      } catch (err) {
        // Offline / server unreachable: keep localConfig safe, NEVER overwrite cloud with INITIAL_CONFIG
        console.warn('Skipped config auto-seeding because server check failed:', err);
      } finally {
        configSeedingInProgress = false;
      }
    }
  },
  (error) => {
    console.warn('Config snapshot warning:', error);
    initialSyncCompleted.config = true;
    notifySubscribers('SYNC_CONFIG');
  }
);

/**
 * Standardize and repair any malformed question options so that questions
 * are guaranteed to always have distinct, non-empty options.
 */
export function sanitizeQuestionItem(q: any, fallbackId: string): Question {
  const qId = String(q?.id || fallbackId).trim();
  let rawOpts: any[] = Array.isArray(q?.options) ? q.options : [];
  
  // If options array is empty or corrupted, create standard default options
  if (rawOpts.length === 0) {
    rawOpts = ['Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D'];
  }

  // Ensure every option has valid distinct non-empty text
  const cleanOpts = rawOpts.map((opt: any, idx: number) => {
    const s = typeof opt === 'string' ? opt.trim() : String(opt ?? '').trim();
    const labelLetter = String.fromCharCode(65 + idx);
    return s && s.length > 0 ? s : `Pilihan ${labelLetter}`;
  });

  const primaryCorrect = typeof q?.correctAnswerIndex === 'number' ? q.correctAnswerIndex : 0;
  const correctIndices = Array.isArray(q?.correctAnswerIndices) && q.correctAnswerIndices.length > 0
    ? q.correctAnswerIndices
    : [primaryCorrect];

  return {
    ...q,
    id: qId,
    questionText: String(q?.questionText || '').trim() || 'Pertanyaan Ujian',
    options: cleanOpts,
    correctAnswerIndex: primaryCorrect,
    correctAnswerIndices: correctIndices,
    type: q?.type === 'MR' ? 'MR' : 'MC',
    score: typeof q?.score === 'number' ? q.score : 10,
    subjectId: q?.subjectId || 'sub1'
  };
}

// B. Real-time Questions Sync & Seeding Helper (Hardened against empty-cache/offline wipes)
onSnapshot(
  collection(db, 'questions'),
  { includeMetadataChanges: true },
  async (snapshot) => {
    const isFromCache = snapshot.metadata.fromCache;

    if (!snapshot.empty) {
      if (!isFromCache) {
        recordFirestoreRead(snapshot.size, 'QUESTIONS_SYNC', 'questions', `Mengunduh ${snapshot.size} butir bank soal aktif`);
        hasHydratedQuestionsFromServer = true;
        initialSyncCompleted.questions = true;
      }

      const list: Question[] = [];
      snapshot.forEach((docSnap) => {
        const q = docSnap.data();
        list.push(sanitizeQuestionItem(q, docSnap.id));
      });
      list.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));

      // Safe cache protection: Only merge local cached questions if THIS device has pending unsynced edits
      const hasPendingLocalSync = getStored<boolean>(QUESTIONS_PENDING_SYNC_KEY, false);
      const cached = getStored<Question[]>(QUESTIONS_KEY, []);
      if (hasPendingLocalSync && list.length < cached.length && cached.length > 0) {
        const remoteIds = new Set(list.map(q => q.id));
        const missingLocal = cached.filter(q => !remoteIds.has(q.id));
        if (missingLocal.length > 0) {
          const merged = [...list, ...missingLocal.map((q, idx) => sanitizeQuestionItem(q, `q_cached_${idx}`))];
          merged.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
          localQuestions = merged;
          setStored(QUESTIONS_KEY, merged);
          notifySubscribers('SYNC_QUESTIONS');
          saveQuestions(merged, false).catch(e => console.warn('Silent upload of merged cached questions to cloud:', e));
          return;
        }
      }

      localQuestions = list;
      setStored(QUESTIONS_KEY, list);
      notifySubscribers('SYNC_QUESTIONS');
    } else {
      // NEVER wipe/re-seed based on a cache-only empty snapshot!
      if (isFromCache || questionsSeedingInProgress) {
        return;
      }

      questionsSeedingInProgress = true;
      try {
        // Confirm directly with server before concluding questions collection is empty
        const serverSnap = await getDocsFromServer(collection(db, 'questions'));
        if (!serverSnap.empty) {
          const serverList: Question[] = [];
          serverSnap.forEach((docSnap) => {
            serverList.push(sanitizeQuestionItem(docSnap.data(), docSnap.id));
          });
          serverList.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
          localQuestions = serverList;
          setStored(QUESTIONS_KEY, serverList);
          hasHydratedQuestionsFromServer = true;
          initialSyncCompleted.questions = true;
          notifySubscribers('SYNC_QUESTIONS');
          return;
        }

        const hasPendingLocalSync = getStored<boolean>(QUESTIONS_PENDING_SYNC_KEY, false);
        const cached = getStored<Question[]>(QUESTIONS_KEY, []);

        // Check seedMeta directly on server first to respect intentional admin clear
        let intentionallyCleared = false;
        try {
          const seedSnap = await getDocFromServer(doc(db, 'config', 'seedMeta'));
          if (seedSnap.exists() && seedSnap.data()?.questionsInitialized === true && (seedSnap.data()?.count ?? 0) === 0) {
            intentionallyCleared = true;
          }
        } catch (e) {}

        if (cached.length > 0 && (hasPendingLocalSync || !intentionallyCleared)) {
          const restored = cached.map((q, idx) => sanitizeQuestionItem(q, `q_cached_${idx}`));
          localQuestions = restored;
          setStored(QUESTIONS_KEY, restored);
          hasHydratedQuestionsFromServer = true;
          initialSyncCompleted.questions = true;
          notifySubscribers('SYNC_QUESTIONS');
          if (hasPendingLocalSync) {
            saveQuestions(restored, false).catch(e => console.warn('Silent upload of cached questions to empty cloud:', e));
          }
          return;
        }

        if (intentionallyCleared) {
          localQuestions = [];
          setStored(QUESTIONS_KEY, []);
          hasHydratedQuestionsFromServer = true;
          initialSyncCompleted.questions = true;
          notifySubscribers('SYNC_QUESTIONS');
          return;
        }

        // Before seeding INITIAL_QUESTIONS, check if cloud checkpoint has saved user questions!
        try {
          const cpSnap = await getDocFromServer(doc(db, 'config', 'questionCheckpoint'));
          if (cpSnap.exists() && Array.isArray(cpSnap.data()?.questions) && cpSnap.data()!.questions.length > 0) {
            const cpQuestions = (cpSnap.data()!.questions as Question[]).map((q, idx) => sanitizeQuestionItem(q, `q_cp_${idx}`));
            localQuestions = cpQuestions;
            setStored(QUESTIONS_KEY, cpQuestions);
            hasHydratedQuestionsFromServer = true;
            initialSyncCompleted.questions = true;
            notifySubscribers('SYNC_QUESTIONS');
            saveQuestions(cpQuestions, false).catch(e => console.warn('Silent checkpoint restoration warning:', e));
            return;
          }
        } catch (e) {}

        // Initial installation seeding fallback (only when server is confirmed brand new)
        const initialList = INITIAL_QUESTIONS.map((q, idx) => sanitizeQuestionItem(q, `q_init_${idx}`));
        localQuestions = initialList;
        setStored(QUESTIONS_KEY, initialList);
        hasHydratedQuestionsFromServer = true;
        initialSyncCompleted.questions = true;
        notifySubscribers('SYNC_QUESTIONS');
        saveQuestions(initialList, false).catch(e => console.warn('Silent seeding of initial questions:', e));
      } catch (err) {
        console.warn('Skipped questions seeding because server check failed:', err);
      } finally {
        questionsSeedingInProgress = false;
      }
    }
  },
  (error) => {
    console.warn('Questions snapshot warning:', error);
    initialSyncCompleted.questions = true;
    notifySubscribers('SYNC_QUESTIONS');
  }
);

// C. Real-time Students List Sync (Dynamically managed to save 98% of Firestore reads)
let unsubscribeAllStudents: (() => void) | null = null;

export function enableAllStudentsSync(): void {
  if (unsubscribeAllStudents) return;
  unsubscribeAllStudents = onSnapshot(
    collection(db, 'students'),
    async (snapshot) => {
      if (!snapshot.empty) {
        recordFirestoreRead(snapshot.size, 'STUDENTS_SYNC', 'students', `Sinkronisasi pemantauan ${snapshot.size} siswa (Admin Dashboard)`);
        const list: Student[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data() as Student);
        });
        // Sort alphabetically by student name
        list.sort((a, b) => a.name.localeCompare(b.name));

        localStudents = list;
        setStored(STUDENTS_KEY, list);
        initialSyncCompleted.students = true;
        notifySubscribers('SYNC_STUDENTS');
      } else {
        localStudents = [];
        setStored(STUDENTS_KEY, []);
        initialSyncCompleted.students = true;
        notifySubscribers('SYNC_STUDENTS');
      }
    },
    (error) => {
      console.warn('Students collection snapshot warning:', error);
      initialSyncCompleted.students = true;
      notifySubscribers('SYNC_STUDENTS');
    }
  );
}

export function disableAllStudentsSync(): void {
  if (unsubscribeAllStudents) {
    unsubscribeAllStudents();
    unsubscribeAllStudents = null;
  }
}

// Student single document listener: only listens to that specific student's own doc during exam (saves reads)
let unsubscribeMyStudent: (() => void) | null = null;

export function subscribeToMyStudentSession(studentId: string): () => void {
  if (unsubscribeMyStudent) {
    unsubscribeMyStudent();
    unsubscribeMyStudent = null;
  }
  if (!studentId) return () => {};

  unsubscribeMyStudent = onSnapshot(
    doc(db, 'students', studentId),
    (snap) => {
      if (snap.exists()) {
        recordFirestoreRead(1, 'STUDENT_DOC_SYNC', `students/${studentId}`, 'Sinkronisasi status sesi siswa');
        const studentData = cleanStudent(snap.data() as Student);
        const index = localStudents.findIndex((s) => s.id === studentData.id);
        let changed = false;
        if (index !== -1) {
          if (JSON.stringify(localStudents[index]) !== JSON.stringify(studentData)) {
            localStudents[index] = studentData;
            changed = true;
          }
        } else {
          localStudents.push(studentData);
          changed = true;
        }
        if (changed) {
          setStored(STUDENTS_KEY, localStudents);
          notifySubscribers('SYNC_STUDENTS');
        }
      } else {
        // Document was deleted from Firestore by Admin! Purge local cache immediately
        const existed = localStudents.some((s) => s.id === studentId);
        if (existed) {
          localStudents = localStudents.filter((s) => s.id !== studentId);
          setStored(STUDENTS_KEY, localStudents);
          try {
            if (typeof localStorage !== 'undefined' && localStorage.getItem('active_student_id') === studentId) {
              localStorage.removeItem('active_student_id');
            }
          } catch (e) {}
          notifySubscribers('SYNC_STUDENTS');
        }
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `students/${studentId}`);
    }
  );

  return () => {
    if (unsubscribeMyStudent) {
      unsubscribeMyStudent();
      unsubscribeMyStudent = null;
    }
  };
}

// D. Real-time Student Accounts Sync (Pre-registered users database for 1,200+ students)
onSnapshot(
  collection(db, 'studentAccounts'),
  async (snapshot) => {
    if (!snapshot.empty) {
      const allUsers: StudentUser[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (Array.isArray(data.users)) {
          allUsers.push(...(data.users as StudentUser[]));
        }
      });
      // Sort users by class then name
      allUsers.sort((a, b) => (a.studentClass || '').localeCompare(b.studentClass || '') || (a.name || '').localeCompare(b.name || ''));
      localStudentUsers = allUsers;
      setStored(STUDENT_USERS_KEY, allUsers);
      initialSyncCompleted.studentUsers = true;
      notifySubscribers('SYNC_STUDENT_USERS');
    } else {
      // If collection empty in Firestore, check if we have cached student users
      const cachedUsers = getStored<StudentUser[]>(STUDENT_USERS_KEY, []);
      if (cachedUsers.length > 0) {
        localStudentUsers = cachedUsers;
        initialSyncCompleted.studentUsers = true;
        notifySubscribers('SYNC_STUDENT_USERS');
        try {
          await saveStudentUsers(cachedUsers, false);
        } catch (e) {
          console.warn('Silent sync of cached student accounts to cloud:', e);
        }
        return;
      }

      try {
        const userMetaSnap = await getDoc(doc(db, 'config', 'userMeta'));
        if (userMetaSnap.exists()) {
          // Admin intentionally emptied users
          localStudentUsers = [];
          setStored(STUDENT_USERS_KEY, []);
          initialSyncCompleted.studentUsers = true;
          notifySubscribers('SYNC_STUDENT_USERS');
          return;
        }

        // Seed initial default demo users once if brand new installation
        await saveStudentUsers(DEFAULT_STUDENT_USERS, false);
        await setDoc(doc(db, 'config', 'userMeta'), { usersInitialized: true });
        initialSyncCompleted.studentUsers = true;
        notifySubscribers('SYNC_STUDENT_USERS');
      } catch (err) {
        localStudentUsers = [...DEFAULT_STUDENT_USERS];
        initialSyncCompleted.studentUsers = true;
        notifySubscribers('SYNC_STUDENT_USERS');
      }
    }
  },
  (error) => {
    console.warn('Student accounts snapshot warning:', error);
    initialSyncCompleted.studentUsers = true;
  }
);

// 5. CLOUD PROPAGATION API EXPORTS

// Fetch custom audio documents from cloud if needed
export async function fetchCustomAlarmAudioFromCloud(): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'config', 'customAlarmAudio'));
    if (snap.exists()) {
      const data = snap.data();
      if (data?.audioData) {
        setCustomAlarmAudioData(data.audioData);
        recordFirestoreRead(1, 'FETCH_CUSTOM_AUDIO', 'config/customAlarmAudio', 'Mengunduh audio alarm kustom dari cloud');
        return data.audioData;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch custom alarm audio from cloud:', e);
  }
  return null;
}

export async function fetchCustomAnnouncementAudioFromCloud(): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'config', 'customAnnouncementAudio'));
    if (snap.exists()) {
      const data = snap.data();
      if (data?.audioData) {
        setCustomAnnouncementAudioData(data.audioData);
        recordFirestoreRead(1, 'FETCH_CUSTOM_ANNOUNCEMENT_AUDIO', 'config/customAnnouncementAudio', 'Mengunduh audio pengumuman kustom dari cloud');
        return data.audioData;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch custom announcement audio from cloud:', e);
  }
  return null;
}

// Clear local questions cache
export function clearLocalQuestionsCache(): void {
  try {
    removeStored(QUESTIONS_KEY);
    removeStored(QUESTIONS_PENDING_SYNC_KEY);
    localQuestions = [];
    notifySubscribers('SYNC_QUESTIONS');
  } catch (e) {
    console.warn('Failed to clear local questions cache:', e);
  }
}

// Force download fresh questions directly from Firestore server
export async function refreshQuestionsFromServer(): Promise<Question[]> {
  try {
    let snap;
    try {
      snap = await getDocsFromServer(collection(db, 'questions'));
    } catch {
      snap = await getDocs(collection(db, 'questions'));
    }
    recordFirestoreRead(snap.size, 'REFRESH_QUESTIONS', 'questions', `Mengunduh ulang ${snap.size} butir bank soal aktif dari server`);

    const list: Question[] = [];
    snap.forEach((d) => {
      const q = d.data();
      list.push(sanitizeQuestionItem(q, d.id));
    });
    list.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));

    localQuestions = list;
    setStored(QUESTIONS_KEY, list);
    removeStored(QUESTIONS_PENDING_SYNC_KEY);

    hasHydratedQuestionsFromServer = true;
    initialSyncCompleted.questions = true;
    notifySubscribers('SYNC_QUESTIONS');
    return list;
  } catch (err) {
    console.warn('Failed to refresh questions from server:', err);
    return localQuestions;
  }
}

// Force download fresh examConfig directly from Firestore server
export async function refreshExamConfigFromServer(): Promise<ExamConfig> {
  try {
    let snap;
    try {
      snap = await getDocFromServer(doc(db, 'config', 'examConfig'));
    } catch {
      snap = await getDoc(doc(db, 'config', 'examConfig'));
    }
    if (snap && snap.exists()) {
      const data = snap.data() as ExamConfig;
      const mergedData: ExamConfig = {
        ...data,
        customAlarmAudioUrl: data.customAlarmAudioUrl || localConfig.customAlarmAudioUrl,
        customAnnouncementAudioUrl: data.customAnnouncementAudioUrl || localConfig.customAnnouncementAudioUrl
      };
      localConfig = mergedData;
      setStored(CONFIG_KEY, mergedData);
      if (Array.isArray(mergedData.subjects) && !isLikelyDefaultSubjects(mergedData.subjects)) {
        setStored(SUBJECTS_BACKUP_KEY, mergedData.subjects);
      }
      hasHydratedConfigFromServer = true;
      initialSyncCompleted.config = true;
      notifySubscribers('SYNC_CONFIG');
      return mergedData;
    }
  } catch (err) {
    console.warn('Failed to refresh config from server:', err);
  }
  return localConfig;
}

/**
 * Admin triggers mass refresh signal for all active student devices
 * Uses partial merge update so subjects/other fields are never overwritten!
 */
export async function triggerStudentsRefresh(
  type: 'SOFT' | 'HARD' = 'SOFT',
  reason = 'Admin telah memperbarui konfigurasi ujian & naskah soal'
): Promise<void> {
  await patchExamConfig(
    {
      forcedRefreshTimestamp: Date.now(),
      forcedRefreshType: type,
      forcedRefreshReason: reason
    },
    true
  );
}

/**
 * Partial, merge-safe ExamConfig updater!
 * Merges `partial` onto the latest synced `localConfig` (never stale React closures)
 * and writes ONLY the changed fields via Firestore `{ merge: true }` so `subjects`
 * can NEVER be accidentally overwritten by unrelated config edits or announcements.
 */
export async function patchExamConfig(partial: Partial<ExamConfig>, broadcast = true): Promise<boolean> {
  // If config hasn't hydrated from server yet, pull server config first so localConfig is never stale INITIAL_CONFIG
  if (!hasHydratedConfigFromServer) {
    await refreshExamConfigFromServer();
  }

  const baseConfig = getExamConfig();

  // Critical Safety Guard:
  // If we STILL haven't hydrated from server (e.g. offline/network error) and baseConfig is still default,
  // NEVER write `subjects` to Firestore (prevents an unhydrated client from overwriting cloud subjects)!
  if (partial.subjects && !hasHydratedConfigFromServer && isLikelyDefaultSubjects(baseConfig.subjects)) {
    console.warn('Blocked attempt to write subjects before server hydration completed.');
    return false;
  }

  // Protect against accidental downgrade of custom subjects back to DEFAULT_SUBJECTS
  if (
    partial.subjects &&
    isLikelyDefaultSubjects(partial.subjects) &&
    !isLikelyDefaultSubjects(baseConfig.subjects)
  ) {
    console.warn('Blocked attempt to overwrite custom subjects with DEFAULT_SUBJECTS via patchExamConfig.');
    return false;
  }

  const mergedConfig: ExamConfig = {
    ...baseConfig,
    ...partial
  };

  localConfig = mergedConfig;
  setStored(CONFIG_KEY, mergedConfig);
  if (typeof document !== 'undefined' && mergedConfig.examTitle) {
    document.title = mergedConfig.examTitle;
  }
  if (broadcast) notifySubscribers('SYNC_CONFIG');

  const customAlarmData = partial.customAlarmAudioUrl;
  const isAlarmDataUri = Boolean(customAlarmData && customAlarmData.startsWith('data:'));

  const customAnnouncementData = partial.customAnnouncementAudioUrl;
  const isAnnouncementDataUri = Boolean(customAnnouncementData && customAnnouncementData.startsWith('data:'));

  const firestorePatch: Record<string, any> = { ...partial };
  if (isAlarmDataUri) {
    delete firestorePatch.customAlarmAudioUrl;
    firestorePatch.hasCustomAlarmAudio = true;
  }
  if (isAnnouncementDataUri) {
    delete firestorePatch.customAnnouncementAudioUrl;
    firestorePatch.hasCustomAnnouncementAudio = true;
  }

  let writeOk = true;
  try {
    await setDoc(doc(db, 'config', 'examConfig'), sanitizeForFirestore(firestorePatch), { merge: true });
    recordFirestoreWrite(1, 'PATCH_CONFIG', 'config/examConfig', `Memperbarui konfigurasi (${Object.keys(firestorePatch).join(', ')})`);
  } catch (err) {
    writeOk = false;
    handleFirestoreError(err, OperationType.WRITE, 'config/examConfig');
  }

  if (partial.subjects && Array.isArray(partial.subjects) && !isLikelyDefaultSubjects(partial.subjects)) {
    saveSubjectsBackupToCloud(partial.subjects).catch(() => {});
    saveQuestionCheckpoint(localQuestions, 'AUTO_WRITEBACK', partial.subjects).catch(() => {});
  }

  if (isAlarmDataUri && customAlarmData) {
    try {
      setCustomAlarmAudioData(customAlarmData);
      await setDoc(doc(db, 'config', 'customAlarmAudio'), {
        audioData: customAlarmData,
        name: mergedConfig.customAlarmName || 'audio_alarm_kustom',
        updatedAt: new Date().toISOString()
      });
      recordFirestoreWrite(1, 'SAVE_CUSTOM_AUDIO', 'config/customAlarmAudio', 'Menyimpan berkas audio alarm kustom ke cloud');
    } catch (err) {
      console.warn('Failed to upload custom alarm audio document:', err);
    }
  }

  if (isAnnouncementDataUri && customAnnouncementData) {
    try {
      setCustomAnnouncementAudioData(customAnnouncementData);
      await setDoc(doc(db, 'config', 'customAnnouncementAudio'), {
        audioData: customAnnouncementData,
        name: mergedConfig.customAnnouncementName || 'audio_pengumuman_kustom',
        updatedAt: new Date().toISOString()
      });
      recordFirestoreWrite(1, 'SAVE_CUSTOM_ANNOUNCEMENT_AUDIO', 'config/customAnnouncementAudio', 'Menyimpan audio pengumuman kustom ke cloud');
    } catch (err) {
      console.warn('Failed to upload custom announcement audio document:', err);
    }
  }

  return writeOk;
}

/**
 * Atomic, server-hydrated subject list mutator.
 * Always reads fresh server-synced subjects BEFORE applying the mutation function,
 * eliminating stale-closure or pre-hydration overwrites when adding, editing, duplicating,
 * toggling, or deleting subject slots.
 */
export async function mutateExamSubjects(
  mutator: (currentSubjects: ExamSubject[]) => ExamSubject[] | null,
  broadcast = true
): Promise<boolean> {
  if (!hasHydratedConfigFromServer) {
    await refreshExamConfigFromServer();
  }

  const latestSubjects = getExamSubjects(getExamConfig());
  if (!hasHydratedConfigFromServer && isLikelyDefaultSubjects(latestSubjects)) {
    console.warn('Aborted subject mutation: server config has not hydrated yet.');
    return false;
  }

  const updated = mutator([...latestSubjects]);
  if (!updated) {
    return false;
  }

  return patchExamConfig(
    {
      subjects: updated,
      subject1Name: updated[0]?.name,
      subject2Name: updated[1]?.name
    },
    broadcast
  );
}

// Save global config parameters (Hardened with server hydration check & anti-default-downgrade protection)
export async function saveExamConfig(config: ExamConfig, broadcast = true): Promise<boolean> {
  if (!hasHydratedConfigFromServer) {
    await refreshExamConfigFromServer();
  }

  let safeConfig = { ...config };
  const currentCloudOrLocal = getExamConfig();

  // Critical Anti-Reversion Guard:
  // If incoming `config` still holds DEFAULT_SUBJECTS (e.g. from an unhydrated/stale React closure)
  // while `localConfig` (from server) already has custom subjects, NEVER overwrite custom subjects!
  if (
    isLikelyDefaultSubjects(safeConfig.subjects) &&
    !isLikelyDefaultSubjects(currentCloudOrLocal.subjects)
  ) {
    console.warn('Anti-reversion guard: Preserving server subjects instead of stale DEFAULT_SUBJECTS.');
    safeConfig = {
      ...safeConfig,
      subjects: currentCloudOrLocal.subjects,
      subject1Name: currentCloudOrLocal.subject1Name,
      subject2Name: currentCloudOrLocal.subject2Name
    };
  }

  localConfig = safeConfig;
  setStored(CONFIG_KEY, safeConfig);
  if (typeof document !== 'undefined' && safeConfig.examTitle) {
    document.title = safeConfig.examTitle;
  }
  if (broadcast) notifySubscribers('SYNC_CONFIG');

  const customAlarmData = safeConfig.customAlarmAudioUrl;
  const isAlarmDataUri = Boolean(customAlarmData && customAlarmData.startsWith('data:'));

  const customAnnouncementData = safeConfig.customAnnouncementAudioUrl;
  const isAnnouncementDataUri = Boolean(customAnnouncementData && customAnnouncementData.startsWith('data:'));

  // Separate huge base64 data URIs from config document to respect Firestore 1MB document limit
  const firestoreSafeConfig: ExamConfig = {
    ...safeConfig,
    customAlarmAudioUrl: isAlarmDataUri ? undefined : safeConfig.customAlarmAudioUrl,
    hasCustomAlarmAudio: Boolean(safeConfig.hasCustomAlarmAudio || isAlarmDataUri || safeConfig.customAlarmAudioUrl),
    customAnnouncementAudioUrl: isAnnouncementDataUri ? undefined : safeConfig.customAnnouncementAudioUrl,
    hasCustomAnnouncementAudio: Boolean(safeConfig.hasCustomAnnouncementAudio || isAnnouncementDataUri || safeConfig.customAnnouncementAudioUrl)
  };

  let writeOk = true;
  try {
    await setDoc(doc(db, 'config', 'examConfig'), sanitizeForFirestore(firestoreSafeConfig), { merge: true });
    recordFirestoreWrite(1, 'SAVE_CONFIG', 'config/examConfig', 'Memperbarui konfigurasi ujian ke cloud');
  } catch (err) {
    writeOk = false;
    handleFirestoreError(err, OperationType.WRITE, 'config/examConfig');
  }

  if (Array.isArray(safeConfig.subjects) && !isLikelyDefaultSubjects(safeConfig.subjects)) {
    saveSubjectsBackupToCloud(safeConfig.subjects).catch(() => {});
  }

  // If custom alarm data URI was provided, save to dedicated doc
  if (isAlarmDataUri && customAlarmData) {
    try {
      setCustomAlarmAudioData(customAlarmData);
      await setDoc(doc(db, 'config', 'customAlarmAudio'), {
        audioData: customAlarmData,
        name: safeConfig.customAlarmName || 'audio_alarm_kustom',
        updatedAt: new Date().toISOString()
      });
      recordFirestoreWrite(1, 'SAVE_CUSTOM_AUDIO', 'config/customAlarmAudio', 'Menyimpan berkas audio alarm kustom ke cloud');
    } catch (err) {
      console.warn('Failed to upload custom alarm audio document:', err);
    }
  }

  // If custom announcement data URI was provided, save to dedicated doc
  if (isAnnouncementDataUri && customAnnouncementData) {
    try {
      setCustomAnnouncementAudioData(customAnnouncementData);
      await setDoc(doc(db, 'config', 'customAnnouncementAudio'), {
        audioData: customAnnouncementData,
        name: safeConfig.customAnnouncementName || 'audio_pengumuman_kustom',
        updatedAt: new Date().toISOString()
      });
      recordFirestoreWrite(1, 'SAVE_CUSTOM_ANNOUNCEMENT_AUDIO', 'config/customAnnouncementAudio', 'Menyimpan audio pengumuman kustom ke cloud');
    } catch (err) {
      console.warn('Failed to upload custom announcement audio document:', err);
    }
  }

  return writeOk;
}

// Surgical single-question upsert (NEVER wipes or touches other questions in Firestore)
export async function upsertSingleQuestion(question: Question, broadcast = true): Promise<boolean> {
  const sanitized = sanitizeQuestionItem(question, question.id || `q_generated_${Date.now()}`);
  const idx = localQuestions.findIndex((q) => q.id === sanitized.id);
  const nextList = idx !== -1
    ? localQuestions.map((q) => (q.id === sanitized.id ? sanitized : q))
    : [...localQuestions, sanitized];

  localQuestions = nextList;
  setStored(QUESTIONS_KEY, nextList);
  if (broadcast) notifySubscribers('SYNC_QUESTIONS');

  try {
    await setDoc(doc(db, 'questions', sanitized.id), sanitizeForFirestore(sanitized));
    await setDoc(
      doc(db, 'config', 'seedMeta'),
      { questionsInitialized: true, lastUpdated: new Date().toISOString(), count: nextList.length },
      { merge: true }
    );
    recordFirestoreWrite(1, 'UPSERT_QUESTION', `questions/${sanitized.id}`, `Menyimpan 1 butir soal (${sanitized.subjectId})`);
    saveQuestionCheckpoint(nextList, 'AUTO_WRITEBACK', getExamSubjects()).catch(() => {});
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `questions/${sanitized.id}`);
    return false;
  }
}

// Surgical single-question delete (NEVER wipes other questions in Firestore)
export async function deleteSingleQuestion(questionId: string, broadcast = true): Promise<boolean> {
  const nextList = localQuestions.filter((q) => q.id !== questionId);
  localQuestions = nextList;
  setStored(QUESTIONS_KEY, nextList);
  if (broadcast) notifySubscribers('SYNC_QUESTIONS');

  try {
    await deleteDoc(doc(db, 'questions', questionId));
    await setDoc(
      doc(db, 'config', 'seedMeta'),
      { questionsInitialized: true, lastUpdated: new Date().toISOString(), count: nextList.length },
      { merge: true }
    );
    recordFirestoreWrite(1, 'DELETE_QUESTION', `questions/${questionId}`, 'Menghapus 1 butir soal');
    saveQuestionCheckpoint(nextList, 'AUTO_WRITEBACK', getExamSubjects()).catch(() => {});
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `questions/${questionId}`);
    return false;
  }
}

// Surgical per-subject question replacement/append (NEVER touches other subjects' documents in Firestore!)
export async function replaceQuestionsForSubject(
  subjectId: string,
  newSubjectQuestions: Question[],
  mode: 'OVERWRITE' | 'APPEND',
  broadcast = true
): Promise<boolean> {
  if (!hasHydratedQuestionsFromServer) {
    await refreshQuestionsFromServer();
  }

  const sanitizedIncoming = newSubjectQuestions.map((q, idx) =>
    sanitizeQuestionItem({ ...q, subjectId }, `q_${Date.now()}_${idx}`)
  );

  const otherSubjectQuestions = localQuestions.filter((q) => (q.subjectId || 'sub1') !== subjectId);
  const currentSubjectQuestions = localQuestions.filter((q) => (q.subjectId || 'sub1') === subjectId);
  const nextSubjectQuestions = mode === 'OVERWRITE'
    ? sanitizedIncoming
    : [...currentSubjectQuestions, ...sanitizedIncoming];
  const nextAllQuestions = [...otherSubjectQuestions, ...nextSubjectQuestions];

  localQuestions = nextAllQuestions;
  setStored(QUESTIONS_PENDING_SYNC_KEY, true);
  setStored(QUESTIONS_KEY, nextAllQuestions);
  if (broadcast) notifySubscribers('SYNC_QUESTIONS');

  try {
    const CHUNK_SIZE = 200;

    if (mode === 'OVERWRITE') {
      // Query ONLY this subject's docs on server so other subjects are NEVER touched
      const qSnap = await getDocs(query(collection(db, 'questions'), where('subjectId', '==', subjectId)));
      const incomingIds = new Set(sanitizedIncoming.map((q) => q.id));
      const idsToDelete: string[] = [];
      qSnap.forEach((d) => {
        if (!incomingIds.has(d.id)) idsToDelete.push(d.id);
      });

      for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
        const chunk = idsToDelete.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((id) => batch.delete(doc(db, 'questions', id)));
        await batch.commit();
      }
    }

    for (let i = 0; i < sanitizedIncoming.length; i += CHUNK_SIZE) {
      const chunk = sanitizedIncoming.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((q) => batch.set(doc(db, 'questions', q.id), sanitizeForFirestore(q)));
      await batch.commit();
    }

    await setDoc(
      doc(db, 'config', 'seedMeta'),
      { questionsInitialized: true, lastUpdated: new Date().toISOString(), count: nextAllQuestions.length },
      { merge: true }
    );

    removeStored(QUESTIONS_PENDING_SYNC_KEY);
    recordFirestoreWrite(sanitizedIncoming.length, 'SAVE_SUBJECT_QUESTIONS', 'questions', `Menyimpan ${sanitizedIncoming.length} butir soal untuk slot ${subjectId}`);
    saveQuestionCheckpoint(nextAllQuestions, 'AUTO_WRITEBACK', getExamSubjects()).catch(() => {});
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'questions');
    return false;
  }
}

// Reset/Update entire bank of questions
export async function saveQuestions(questions: Question[], broadcast = true): Promise<boolean> {
  if (!hasHydratedQuestionsFromServer && questions.length === 0) {
    console.warn('Blocked full question wipe before cloud hydration completed.');
    return false;
  }

  const sanitized = questions.map((q, idx) => sanitizeQuestionItem(q, `q_${Date.now()}_${idx}`));
  localQuestions = sanitized;
  setStored(QUESTIONS_PENDING_SYNC_KEY, true);
  setStored(QUESTIONS_KEY, sanitized);
  if (broadcast) notifySubscribers('SYNC_QUESTIONS');

  try {
    const existingSnap = await getDocs(collection(db, 'questions'));
    const existingIds = new Set<string>();
    existingSnap.forEach((docSnap) => existingIds.add(docSnap.id));

    const CHUNK_SIZE = 200;
    const idsToKeep = new Set(sanitized.map((q) => q.id));
    const idsToDelete = Array.from(existingIds).filter((id) => !idsToKeep.has(id));

    // Save/update questions in batches of 200
    for (let i = 0; i < sanitized.length; i += CHUNK_SIZE) {
      const chunk = sanitized.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((q) => {
        const ref = doc(db, 'questions', q.id);
        batch.set(ref, sanitizeForFirestore(q));
      });
      await batch.commit();
    }

    // Clean up deleted ones in batches of 200
    for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
      const chunk = idsToDelete.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((id) => {
        batch.delete(doc(db, 'questions', id));
      });
      await batch.commit();
    }

    // Mark seedMeta so empty questions are tracked correctly
    await setDoc(doc(db, 'config', 'seedMeta'), {
      questionsInitialized: true,
      lastUpdated: new Date().toISOString(),
      count: sanitized.length
    });

    removeStored(QUESTIONS_PENDING_SYNC_KEY);
    recordFirestoreWrite(sanitized.length, 'SAVE_QUESTIONS', 'questions', `Menyimpan ${sanitized.length} butir bank soal ke cloud`);

    // Automatically trigger non-blocking Checkpoint & Write-Back to Cloud (including subjects!)
    saveQuestionCheckpoint(sanitized, 'AUTO_WRITEBACK', getExamSubjects()).catch((e) => console.warn('Silent checkpoint save warning:', e));
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'questions');
    return false;
  }
}

// -------------------------------------------------------------
// QUESTION BANK & SUBJECTS CHECKPOINT & WRITE-BACK DRAFT SYSTEM
// -------------------------------------------------------------
const CHECKPOINT_KEY = 'proktor_questions_checkpoint';
const CHECKPOINT_META_KEY = 'proktor_questions_checkpoint_meta';
const CHECKPOINT_SUBJECTS_KEY = 'proktor_subjects_checkpoint';

export interface QuestionCheckpointMeta {
  count: number;
  subjectCount?: number;
  timestamp: string;
  formattedTime: string;
  source: 'MANUAL' | 'AUTO_WRITEBACK' | 'IMPORT';
}

let memoryCheckpointMeta: QuestionCheckpointMeta | null = getStored<QuestionCheckpointMeta | null>(CHECKPOINT_META_KEY, null);

export function getQuestionCheckpointMeta(): QuestionCheckpointMeta | null {
  return memoryCheckpointMeta;
}

// 1. Instant local checkpoint save + background cloud write-back (Includes BOTH Questions & Subjects)
export async function saveQuestionCheckpoint(
  questions: Question[],
  source: 'MANUAL' | 'AUTO_WRITEBACK' | 'IMPORT' = 'AUTO_WRITEBACK',
  subjectsOverride?: ExamSubject[]
): Promise<void> {
  if (!questions) return;
  const sanitized = questions.map((q, idx) => sanitizeQuestionItem(q, `q_cp_${idx}`));
  const currentSubjects = subjectsOverride && subjectsOverride.length > 0 ? subjectsOverride : getExamSubjects();
  const shouldStoreSubjects = currentSubjects.length > 0 && !isLikelyDefaultSubjects(currentSubjects);

  const now = new Date();
  const meta: QuestionCheckpointMeta = {
    count: sanitized.length,
    subjectCount: currentSubjects.length,
    timestamp: now.toISOString(),
    formattedTime: now.toLocaleTimeString('id-ID', { hour12: false }) + ' WIB',
    source
  };

  memoryCheckpointMeta = meta;

  // Instant local checkpoint write (0ms latency, 100% offline-safe)
  try {
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(sanitized));
    localStorage.setItem(CHECKPOINT_META_KEY, JSON.stringify(meta));
    if (shouldStoreSubjects) {
      localStorage.setItem(CHECKPOINT_SUBJECTS_KEY, JSON.stringify(currentSubjects));
    }
  } catch (e) {
    console.warn('LocalStorage error saving question checkpoint:', e);
  }

  notifySubscribers('SYNC_CHECKPOINT');

  // Background Cloud Write-Back to Firestore
  try {
    // Preserve previously backed-up custom subjects in checkpoint if current call didn't have custom subjects
    let subjectsToPersist: ExamSubject[] | undefined = shouldStoreSubjects ? currentSubjects : undefined;
    if (!subjectsToPersist) {
      const localBackedUp = getStored<ExamSubject[] | null>(CHECKPOINT_SUBJECTS_KEY, null);
      if (localBackedUp && localBackedUp.length > 0 && !isLikelyDefaultSubjects(localBackedUp)) {
        subjectsToPersist = localBackedUp;
      }
    }

    const safeData = sanitizeForFirestore({
      questions: sanitized,
      subjects: subjectsToPersist,
      meta,
      updatedAt: now.toISOString()
    });

    await setDoc(doc(db, 'config', 'questionCheckpoint'), safeData, { merge: true });
    recordFirestoreWrite(1, 'SAVE_QUESTION_CHECKPOINT', 'config/questionCheckpoint', `Checkpoint write-back (${sanitized.length} soal)`);
  } catch (err) {
    console.warn('Cloud write-back of question checkpoint failed:', err);
  }
}

// Debounced Write-Back timer
let writeBackTimer: any = null;

export function debounceWriteBackQuestionCheckpoint(
  questions: Question[],
  delayMs = 1500,
  source: 'MANUAL' | 'AUTO_WRITEBACK' | 'IMPORT' = 'AUTO_WRITEBACK'
): void {
  if (!questions) return;
  const sanitized = questions.map((q, idx) => sanitizeQuestionItem(q, `q_cp_${idx}`));
  const currentSubjects = getExamSubjects();

  // 1. Save locally in 0ms
  try {
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(sanitized));
    if (currentSubjects.length > 0 && !isLikelyDefaultSubjects(currentSubjects)) {
      localStorage.setItem(CHECKPOINT_SUBJECTS_KEY, JSON.stringify(currentSubjects));
    }
    const now = new Date();
    const meta: QuestionCheckpointMeta = {
      count: sanitized.length,
      subjectCount: currentSubjects.length,
      timestamp: now.toISOString(),
      formattedTime: now.toLocaleTimeString('id-ID', { hour12: false }) + ' WIB',
      source
    };
    memoryCheckpointMeta = meta;
    localStorage.setItem(CHECKPOINT_META_KEY, JSON.stringify(meta));
  } catch (e) {}

  notifySubscribers('SYNC_CHECKPOINT');

  // 2. Debounce cloud write-back
  if (writeBackTimer) clearTimeout(writeBackTimer);
  writeBackTimer = setTimeout(() => {
    saveQuestionCheckpoint(sanitized, source, currentSubjects).catch(e => console.warn('Debounced write-back error:', e));
  }, delayMs);
}

// 2. Restore questions AND subjects from Checkpoint (Checks Cloud & Local intelligently)
export async function restoreQuestionsFromCheckpoint(): Promise<{ success: boolean; count: number; message: string; source: 'LOCAL' | 'CLOUD' }> {
  // Check Cloud Checkpoint first for subjects & freshest questions
  let cloudQuestions: Question[] = [];
  let cloudSubjects: ExamSubject[] = [];
  try {
    const snap = await getDocFromServer(doc(db, 'config', 'questionCheckpoint')).catch(() => getDoc(doc(db, 'config', 'questionCheckpoint')));
    if (snap && snap.exists()) {
      recordFirestoreRead(1, 'FETCH_CHECKPOINT', 'config/questionCheckpoint', 'Mengunduh checkpoint naskah soal dari cloud');
      const data = snap.data();
      if (Array.isArray(data?.questions)) {
        cloudQuestions = (data.questions as Question[]).map((q, idx) => sanitizeQuestionItem(q, `q_cloud_cp_${idx}`));
      }
      if (Array.isArray(data?.subjects)) {
        cloudSubjects = data.subjects as ExamSubject[];
      }
    }
  } catch (err) {
    console.warn('Error fetching checkpoint from cloud:', err);
  }

  const localCp = getStored<Question[]>(CHECKPOINT_KEY, []).map((q, idx) => sanitizeQuestionItem(q, `q_restored_${idx}`));
  const localCpSubjects = getStored<ExamSubject[]>(CHECKPOINT_SUBJECTS_KEY, []);

  // Prefer whichever checkpoint has more questions (or cloud if equal)
  const useCloud = cloudQuestions.length > 0 && cloudQuestions.length >= localCp.length;
  const chosenQuestions = useCloud ? cloudQuestions : localCp;
  const chosenSubjects = cloudSubjects.length > 0 && !isLikelyDefaultSubjects(cloudSubjects)
    ? cloudSubjects
    : (localCpSubjects.length > 0 && !isLikelyDefaultSubjects(localCpSubjects) ? localCpSubjects : []);

  if (chosenSubjects.length > 0) {
    await patchExamConfig({
      subjects: chosenSubjects,
      subject1Name: chosenSubjects[0]?.name,
      subject2Name: chosenSubjects[1]?.name
    }, true);
  }

  if (chosenQuestions.length > 0) {
    await saveQuestions(chosenQuestions, true);
    const srcLabel = useCloud ? 'Checkpoint Cloud Firestore' : 'Checkpoint Lokal';
    return {
      success: true,
      count: chosenQuestions.length,
      message: `Berhasil memulihkan ${chosenQuestions.length} butir soal${chosenSubjects.length > 0 ? ` dan ${chosenSubjects.length} slot naskah` : ''} dari ${srcLabel}!`,
      source: useCloud ? 'CLOUD' : 'LOCAL'
    };
  }

  return {
    success: false,
    count: 0,
    message: 'Tidak ditemukan berkas checkpoint di lokal maupun cloud.',
    source: 'CLOUD'
  };
}

// -------------------------------------------------------------
// ORPHANED QUESTION-SUBJECT DETECTION & RECOVERY HELPERS
// -------------------------------------------------------------
export interface OrphanedSubjectInfo {
  subjectId: string;
  count: number;
  sampleTexts: string[];
  suggestedName: string;
  suggestedCode: string;
  isLegacySampleOnly: boolean;
}

export interface MismatchedDefaultSlotInfo {
  subject: ExamSubject;
  count: number;
  suggestedName: string;
  sampleText: string;
}

export function inferSubjectTopicFromQuestions(qs: Question[], fallbackLabel = 'Naskah Pulihan'): { name: string; code: string } {
  const combined = qs.slice(0, 10).map(q => (q.questionText || '').toLowerCase()).join(' ');
  if (/(komputasional|algoritm|informatika|biner|komputer|pemrograman|perangkat lunak|hardware|software|jaringan)/.test(combined)) {
    return { name: 'Informatika', code: 'INF' };
  }
  if (/(nada|musik|birama|notasi|harmoni|melodi|seni|tari|lukis|rupa|klasik|orkestra|ritme|tempo)/.test(combined)) {
    return { name: 'Seni Budaya', code: 'SB' };
  }
  if (/(matematika|aljabar|persamaan|segitiga|geometri|trigonometri|pecahan|integral)/.test(combined)) {
    return { name: 'Matematika', code: 'MTK' };
  }
  if (/(paragraf|kalimat utama|puisi|cerpen|ejaan|antonim|sinonim|teks prosedur|bahasa indonesia)/.test(combined)) {
    return { name: 'Bahasa Indonesia', code: 'IND' };
  }
  if (/(grammar|english|tense|vocabulary|paragraph|choose the best)/.test(combined)) {
    return { name: 'Bahasa Inggris', code: 'ENG' };
  }
  return { name: fallbackLabel, code: 'REC' };
}

export function findOrphanedQuestionSubjects(
  questionsList: Question[] = localQuestions,
  subjectsList: ExamSubject[] = getExamSubjects()
): OrphanedSubjectInfo[] {
  const knownIds = new Set(subjectsList.map(s => s.id));
  const grouped = new Map<string, Question[]>();

  questionsList.forEach(q => {
    const sid = q.subjectId || 'sub1';
    if (!knownIds.has(sid)) {
      const arr = grouped.get(sid) || [];
      arr.push(q);
      grouped.set(sid, arr);
    }
  });

  const results: OrphanedSubjectInfo[] = [];
  Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([subjectId, qs]) => {
      const isLegacySampleOnly = qs.every(q => DEFAULT_SAMPLE_QUESTION_IDS.has(q.id));
      const inferred = inferSubjectTopicFromQuestions(qs, `Naskah ${subjectId.toUpperCase()}`);
      results.push({
        subjectId,
        count: qs.length,
        sampleTexts: qs.slice(0, 2).map(q => q.questionText),
        suggestedName: isLegacySampleOnly ? `Contoh Soal Bawaan (${subjectId})` : `${inferred.name} (${subjectId.toUpperCase()})`,
        suggestedCode: `${inferred.code}-${subjectId.replace(/[^0-9a-zA-Z]/g, '').toUpperCase()}`,
        isLegacySampleOnly
      });
    });

  return results;
}

export function detectMismatchedDefaultSubjectSlots(
  questionsList: Question[] = localQuestions,
  subjectsList: ExamSubject[] = getExamSubjects()
): MismatchedDefaultSlotInfo[] {
  const mismatched: MismatchedDefaultSlotInfo[] = [];

  subjectsList.forEach(sub => {
    const isDefaultMtK = sub.id === 'sub2' && sub.name === 'Matematika TKA';
    const isDefaultInd = sub.id === 'sub3' && sub.name === 'Bahasa Indonesia TKA';
    if (!isDefaultMtK && !isDefaultInd) return;

    const subQs = questionsList.filter(q => q.subjectId === sub.id);
    if (subQs.length === 0) return;

    const hasNonSampleQuestions = subQs.some(q => !DEFAULT_SAMPLE_QUESTION_IDS.has(q.id));
    if (!hasNonSampleQuestions) return;

    const inferred = inferSubjectTopicFromQuestions(subQs, sub.name);
    // Flag when slot name is still default "Matematika TKA" / "Bahasa Indonesia TKA" while questions clearly are not!
    if (
      (isDefaultMtK && inferred.name !== 'Matematika') ||
      (isDefaultInd && inferred.name !== 'Bahasa Indonesia')
    ) {
      mismatched.push({
        subject: sub,
        count: subQs.length,
        suggestedName: inferred.name,
        sampleText: subQs[0]?.questionText || ''
      });
    }
  });

  return mismatched;
}

export async function recoverSubjectsToConfig(
  orphansToAdd: OrphanedSubjectInfo[],
  renames?: Record<string, { name: string; code?: string }>
): Promise<boolean> {
  return await mutateExamSubjects((current) => {
    const updated = current.map(sub => {
      const r = renames?.[sub.id];
      if (r && r.name.trim()) {
        return {
          ...sub,
          name: r.name.trim(),
          code: r.code?.trim() || sub.code
        };
      }
      return sub;
    });

    orphansToAdd.forEach(orphan => {
      if (!updated.some(s => s.id === orphan.subjectId)) {
        updated.push({
          id: orphan.subjectId,
          name: orphan.suggestedName,
          code: orphan.suggestedCode,
          isActive: true,
          targetGrade: 'ALL'
        });
      }
    });

    return updated;
  }, true);
}

// Save/Synchronize student user database in chunks of 200 users (handles 1,200+ accounts in ~6 fast doc writes)
export async function saveStudentUsers(users: StudentUser[], broadcast = true): Promise<void> {
  const sanitizedUsers = users.map((u, i) => cleanStudentUser(u, i));
  localStudentUsers = sanitizedUsers;
  setStored(STUDENT_USERS_KEY, sanitizedUsers);
  if (broadcast) notifySubscribers('SYNC_STUDENT_USERS');

  try {
    const existingSnap = await getDocs(collection(db, 'studentAccounts'));
    const existingIds = new Set<string>();
    existingSnap.forEach((doc) => existingIds.add(doc.id));

    const batch = writeBatch(db);
    const CHUNK_SIZE = 200;
    const chunkCount = Math.ceil(sanitizedUsers.length / CHUNK_SIZE);

    if (sanitizedUsers.length === 0) {
      existingIds.forEach((id) => {
        batch.delete(doc(db, 'studentAccounts', id));
      });
      batch.set(doc(db, 'config', 'userMeta'), { usersInitialized: true, count: 0 });
      await batch.commit();
      recordFirestoreWrite(1, 'SAVE_STUDENT_USERS', 'studentAccounts', 'Mereset bersih data akun siswa');
      return;
    }

    for (let i = 0; i < chunkCount; i++) {
      const chunkId = `chunk_${i}`;
      const chunkUsers = sanitizedUsers.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const chunkRef = doc(db, 'studentAccounts', chunkId);
      batch.set(chunkRef, sanitizeForFirestore({ chunkIndex: i, users: chunkUsers, updatedAt: new Date().toISOString() }));
      existingIds.delete(chunkId);
    }

    existingIds.forEach((id) => {
      batch.delete(doc(db, 'studentAccounts', id));
    });

    batch.set(doc(db, 'config', 'userMeta'), { usersInitialized: true, count: sanitizedUsers.length, updatedAt: new Date().toISOString() });
    await batch.commit();
    recordFirestoreWrite(chunkCount, 'SAVE_STUDENT_USERS', 'studentAccounts', `Menyimpan ${sanitizedUsers.length} akun siswa dalam ${chunkCount} blok`);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'studentAccounts');
  }
}

// Save student list locally only (0 Firestore reads, 0 Firestore writes)
export function saveStudentsLocally(students: Student[], broadcast = true): void {
  const cleanedList = students.map(s => cleanStudent(s));
  localStudents = cleanedList;
  setStored(STUDENTS_KEY, cleanedList);
  if (broadcast) notifySubscribers('SYNC_STUDENTS');
}

// Save/Update multiple students in a single Firestore batch without doing full collection getDocs reads (Saves 100% redundant reads!)
export async function saveMultipleStudents(students: Student[], broadcast = true): Promise<boolean> {
  if (!students || students.length === 0) return true;
  const cleanedList = students.map(s => cleanStudent(s));
  
  // Update local cache
  cleanedList.forEach(s => {
    const idx = localStudents.findIndex(item => item.id === s.id);
    if (idx !== -1) {
      localStudents[idx] = s;
    } else {
      localStudents.push(s);
    }
  });
  setStored(STUDENTS_KEY, localStudents);
  if (broadcast) notifySubscribers('SYNC_STUDENTS');

  try {
    const CHUNK_SIZE = 300;
    for (let i = 0; i < cleanedList.length; i += CHUNK_SIZE) {
      const chunk = cleanedList.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((s) => {
        const ref = doc(db, 'students', s.id);
        batch.set(ref, sanitizeForFirestore(s));
      });
      await batch.commit();
    }
    recordFirestoreWrite(cleanedList.length, 'SAVE_STUDENTS_BATCH', 'students', `Menyimpan ${cleanedList.length} data siswa terperbarui secara efisien`);
    return true;
  } catch (err) {
    console.error('Error saving multiple students to cloud:', err);
    return false;
  }
}

// Delete multiple students by IDs without scanning the entire collection
export async function deleteMultipleStudents(studentIds: string[], broadcast = true): Promise<void> {
  if (!studentIds || studentIds.length === 0) return;
  const idSet = new Set(studentIds);
  localStudents = localStudents.filter(s => !idSet.has(s.id));
  setStored(STUDENTS_KEY, localStudents);
  if (broadcast) notifySubscribers('SYNC_STUDENTS');

  try {
    const CHUNK_SIZE = 300;
    for (let i = 0; i < studentIds.length; i += CHUNK_SIZE) {
      const chunk = studentIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((id) => {
        batch.delete(doc(db, 'students', id));
      });
      await batch.commit();
    }
  } catch (err) {
    console.error('Error deleting multiple students from cloud:', err);
  }
}

// Save/Synchronize student registry list (Optimized without getDocs read penalty)
export async function saveStudents(students: Student[], broadcast = true): Promise<void> {
  const cleanedList = students.map(s => cleanStudent(s));
  localStudents = cleanedList;
  setStored(STUDENTS_KEY, cleanedList);
  if (broadcast) notifySubscribers('SYNC_STUDENTS');

  try {
    // Save/update students in batches of 300 directly without reading all docs first
    const CHUNK_SIZE = 300;
    for (let i = 0; i < cleanedList.length; i += CHUNK_SIZE) {
      const chunk = cleanedList.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((s) => {
        const ref = doc(db, 'students', s.id);
        batch.set(ref, sanitizeForFirestore(s));
      });
      await batch.commit();
    }
    recordFirestoreWrite(cleanedList.length, 'SAVE_STUDENTS_BULK', 'students', `Menyimpan ${cleanedList.length} data siswa massal`);
  } catch (err) {
    console.error('Error saving students to cloud:', err);
  }
}

// Pending debounced cloud writes to prevent high-frequency write spam
const pendingStudentSaves = new Map<string, any>();

// Debounced cloud save for high-frequency events (e.g. clicking options in exam)
// Writes locally in 0ms, then sends to Firestore once student stops clicking for delayMs
export function debounceSaveSingleStudent(student: Student, delayMs = 3000, broadcast = true): void {
  const cleaned = cleanStudent(student);
  // 1. Instant local persistence (0ms, 100% offline-safe)
  const index = localStudents.findIndex((s) => s.id === cleaned.id);
  if (index !== -1) {
    localStudents[index] = cleaned;
  } else {
    localStudents.push(cleaned);
  }
  setStored(STUDENTS_KEY, localStudents);
  if (broadcast) notifySubscribers('SYNC_STUDENTS');

  // 2. Clear existing debounced timer for this student
  if (pendingStudentSaves.has(cleaned.id)) {
    clearTimeout(pendingStudentSaves.get(cleaned.id));
  }

  // 3. Queue cloud write (saving up to 80% of writes)
  const timer = setTimeout(async () => {
    pendingStudentSaves.delete(cleaned.id);
    try {
      await setDoc(doc(db, 'students', cleaned.id), sanitizeForFirestore(cleaned));
      recordFirestoreWrite(1, 'SAVE_STUDENT_DEBOUNCED', `students/${cleaned.id}`, `Sinkronisasi debounced siswa: ${cleaned.name}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `students/${cleaned.id}`);
    }
  }, delayMs);

  pendingStudentSaves.set(cleaned.id, timer);
}

// Save student data LOCALLY ONLY (Zero Firestore writes/reads, saves 99% quota in Eco Mode)
export function saveSingleStudentLocallyOnly(student: Student, broadcast = true): void {
  const cleaned = cleanStudent(student);
  const index = localStudents.findIndex((s) => s.id === cleaned.id);
  if (index !== -1) {
    localStudents[index] = cleaned;
  } else {
    localStudents.push(cleaned);
  }
  setStored(STUDENTS_KEY, localStudents);
  recordEcoSave('ECO_ANSWER_SAVE', `students/${cleaned.id}`, `Jawaban siswa '${cleaned.name}' disimpan di memori lokal (Menghemat 1 Write Cloud)`);
  if (broadcast) notifySubscribers('SYNC_STUDENTS');
}

// Save/Update a single student session document in Firestore (Immediate flush)
export async function saveSingleStudent(student: Student, broadcast = true): Promise<boolean> {
  const cleaned = cleanStudent(student);
  if (pendingStudentSaves.has(cleaned.id)) {
    clearTimeout(pendingStudentSaves.get(cleaned.id));
    pendingStudentSaves.delete(cleaned.id);
  }

  const index = localStudents.findIndex((s) => s.id === cleaned.id);
  if (index !== -1) {
    localStudents[index] = cleaned;
  } else {
    localStudents.push(cleaned);
  }
  setStored(STUDENTS_KEY, localStudents);
  if (broadcast) notifySubscribers('SYNC_STUDENTS');

  try {
    await setDoc(doc(db, 'students', cleaned.id), sanitizeForFirestore(cleaned));
    recordFirestoreWrite(1, 'SAVE_STUDENT', `students/${cleaned.id}`, `Kirim ke cloud: ${cleaned.name} (${cleaned.status})`);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `students/${cleaned.id}`);
    return false;
  }
}

// Delete a single student session document from Firestore
export async function deleteSingleStudent(studentId: string, broadcast = true): Promise<void> {
  localStudents = localStudents.filter((s) => s.id !== studentId);
  setStored(STUDENTS_KEY, localStudents);
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('active_student_id') === studentId) {
      localStorage.removeItem('active_student_id');
    }
  } catch (e) {}
  if (broadcast) notifySubscribers('SYNC_STUDENTS');

  try {
    await deleteDoc(doc(db, 'students', studentId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `students/${studentId}`);
  }
}

// Clear all students permanently from both memory, local cache, and cloud Firestore
export async function clearAllStudents(broadcast = true): Promise<void> {
  localStudents = [];
  setStored(STUDENTS_KEY, []);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('active_student_id');
    }
  } catch (e) {}
  if (broadcast) notifySubscribers('SYNC_STUDENTS');

  try {
    const existingSnap = await getDocs(collection(db, 'students'));
    const CHUNK_SIZE = 300;
    const docs = existingSnap.docs;
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const chunk = docs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
    }
  } catch (err) {
    console.error('Error clearing all students from Firestore:', err);
  }
}

// Explicitly purge a single student from local storage and memory (e.g. when deleted on cloud)
export function purgeStudentLocally(studentId: string): void {
  localStudents = localStudents.filter((s) => s.id !== studentId);
  try {
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(localStudents));
    if (localStorage.getItem('active_student_id') === studentId) {
      localStorage.removeItem('active_student_id');
    }
  } catch (e) {}
  notifySubscribers('SYNC_STUDENTS');
}

// Fetch single student data directly from server to override cache/snapshots
export async function getStudentFromServer(studentId: string): Promise<Student | null> {
  if (!studentId) return null;
  try {
    const docRef = fsDoc(db, 'students', studentId);
    let snap;
    try {
      snap = await getDocFromServer(docRef);
    } catch {
      snap = await getDoc(docRef);
    }
    if (snap && snap.exists()) {
      const student = cleanStudent(snap.data() as Student);
      // Also update local list in memory only if changed
      const index = localStudents.findIndex((s) => s.id === student.id);
      let changed = false;
      if (index !== -1) {
        if (JSON.stringify(localStudents[index]) !== JSON.stringify(student)) {
          localStudents[index] = student;
          changed = true;
        }
      } else {
        localStudents.push(student);
        changed = true;
      }
      if (changed) {
        setStored(STUDENTS_KEY, localStudents);
        notifySubscribers('SYNC_STUDENTS');
      }
      return student;
    } else if (snap && !snap.exists()) {
      // Document NOT found on server -> was permanently deleted by admin master!
      const existed = localStudents.some((s) => s.id === studentId);
      if (existed) {
        localStudents = localStudents.filter((s) => s.id !== studentId);
        setStored(STUDENTS_KEY, localStudents);
        try {
          if (typeof localStorage !== 'undefined' && localStorage.getItem('active_student_id') === studentId) {
            localStorage.removeItem('active_student_id');
          }
        } catch (e) {}
        notifySubscribers('SYNC_STUDENTS');
      }
      return null;
    }
  } catch (err) {
    console.warn('Error fetching student directly from server:', err);
  }
  return null;
}

// Synchronize and verify student sessions directly with Firestore server for a specific student/username
// Cleans up any zombie/stale deleted sessions from local cache if admin master deleted them from cloud
export async function syncStudentSessionsForUser(username?: string, name?: string, studentClass?: string): Promise<Student[]> {
  try {
    const rawUser = username ? username.trim() : '';
    const cleanUser = rawUser.toLowerCase();
    const cleanName = name ? name.trim().toLowerCase().replace(/\s+/g, '') : '';

    if (!cleanUser && !cleanName) return [];

    // Query Firestore server directly for all active sessions of this username or name
    const serverSessionMap = new Map<string, Student>();
    if (cleanUser) {
      const candidateUsers = Array.from(new Set([cleanUser, rawUser].filter(Boolean)));
      for (const cand of candidateUsers) {
        try {
          const q = query(collection(db, 'students'), where('username', '==', cand));
          const snap = await getDocs(q);
          snap.forEach(d => {
            serverSessionMap.set(d.id, d.data() as Student);
          });
        } catch (e) {
          console.warn('Query students by username warning:', e);
        }
      }
    } else if (cleanName) {
      try {
        const q = query(collection(db, 'students'), where('name', '==', name?.trim() || ''));
        const snap = await getDocs(q);
        snap.forEach(d => {
          const data = d.data() as Student;
          if (isSameStudentAccount(data, { username: rawUser, name, studentClass })) {
            serverSessionMap.set(d.id, data);
          }
        });
      } catch (e) {
        console.warn('Query students by name warning:', e);
      }
    }

    const serverSessions = Array.from(serverSessionMap.values());
    const serverSessionIds = new Set(serverSessions.map(s => s.id));
    let hasChanges = false;

    // Purge only local student sessions belonging to THIS specific account that are missing on server
    const prevCount = localStudents.length;
    localStudents = localStudents.filter(s => {
      const isThisAccount = isSameStudentAccount(s, { username: rawUser, name, studentClass });
      if (isThisAccount && !serverSessionIds.has(s.id)) {
        try {
          if (typeof localStorage !== 'undefined' && localStorage.getItem('active_student_id') === s.id) {
            localStorage.removeItem('active_student_id');
          }
        } catch (e) {}
        return false;
      }
      return true;
    });

    if (localStudents.length !== prevCount) {
      hasChanges = true;
    }

    // Merge fresh server sessions into localStudents
    serverSessions.forEach(srv => {
      const idx = localStudents.findIndex(s => s.id === srv.id);
      if (idx !== -1) {
        if (JSON.stringify(localStudents[idx]) !== JSON.stringify(srv)) {
          localStudents[idx] = srv;
          hasChanges = true;
        }
      } else {
        localStudents.push(srv);
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setStored(STUDENTS_KEY, localStudents);
      notifySubscribers('SYNC_STUDENTS');
    }

    return serverSessions;
  } catch (err) {
    console.warn('Error in syncStudentSessionsForUser:', err);
    return [];
  }
}

export async function saveSingleStudentUser(user: StudentUser): Promise<void> {
  const current = [...localStudentUsers];
  const idx = current.findIndex(u => u.id === user.id || u.username.toLowerCase() === user.username.toLowerCase());
  if (idx !== -1) {
    current[idx] = user;
  } else {
    current.push(user);
  }
  await saveStudentUsers(current);
}

export async function deleteSingleStudentUser(userId: string): Promise<void> {
  const updated = localStudentUsers.filter(u => u.id !== userId && u.username !== userId);
  await saveStudentUsers(updated);
}

export async function clearAllStudentUsers(): Promise<void> {
  await saveStudentUsers([]);
}


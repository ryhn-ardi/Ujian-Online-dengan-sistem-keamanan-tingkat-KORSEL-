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
  getDocFromServer
} from 'firebase/firestore';
import { db } from '../lib/firebase';

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
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    return JSON.parse(item) as T;
  } catch {
    return fallback;
  }
}

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

export function isInitialSyncCompleted(): boolean {
  return initialSyncCompleted.config && initialSyncCompleted.questions && initialSyncCompleted.students;
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

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
  throw new Error(JSON.stringify(errInfo));
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
// A. Real-time Config Sync & Seeding Helper
onSnapshot(
  doc(db, 'config', 'examConfig'),
  async (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data() as ExamConfig;
      localConfig = data;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(data));
      if (typeof document !== 'undefined' && data.examTitle) {
        document.title = data.examTitle;
      }
      initialSyncCompleted.config = true;
      notifySubscribers('SYNC_CONFIG');
    } else {
      // Config collection has not been seeded, check if we have cached config before writing initial
      const cachedCfg = getStored<ExamConfig>(CONFIG_KEY, null as any);
      if (cachedCfg && cachedCfg.subjects && cachedCfg.subjects.length > 0) {
        localConfig = cachedCfg;
        initialSyncCompleted.config = true;
        notifySubscribers('SYNC_CONFIG');
        try {
          await setDoc(doc(db, 'config', 'examConfig'), sanitizeForFirestore(cachedCfg));
        } catch (err) {
          console.warn('Silent sync of cached config to cloud:', err);
        }
      } else {
        try {
          await setDoc(doc(db, 'config', 'examConfig'), sanitizeForFirestore(INITIAL_CONFIG));
          initialSyncCompleted.config = true;
          notifySubscribers('SYNC_CONFIG');
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'config/examConfig');
        }
      }
    }
  },
  (error) => {
    console.warn('Config snapshot warning:', error);
    initialSyncCompleted.config = true;
  }
);

// B. Real-time Questions Sync & Seeding Helper
onSnapshot(
  collection(db, 'questions'),
  async (snapshot) => {
    if (!snapshot.empty) {
      const list: Question[] = [];
      snapshot.forEach((doc) => {
        list.push(doc.data() as Question);
      });
      // Sort to preserve original list index / ID structure
      list.sort((a, b) => a.id.localeCompare(b.id));

      localQuestions = list;
      localStorage.setItem(QUESTIONS_KEY, JSON.stringify(list));
      initialSyncCompleted.questions = true;
      notifySubscribers('SYNC_QUESTIONS');
    } else {
      // Questions bank snapshot is empty. Preserve cached questions if available to prevent accidental drops
      const cached = getStored<Question[]>(QUESTIONS_KEY, []);
      if (cached.length > 0) {
        localQuestions = cached;
      } else {
        localQuestions = [];
        localStorage.setItem(QUESTIONS_KEY, JSON.stringify([]));
      }
      initialSyncCompleted.questions = true;
      notifySubscribers('SYNC_QUESTIONS');
    }
  },
  (error) => {
    console.warn('Questions snapshot warning:', error);
    initialSyncCompleted.questions = true;
  }
);

// C. Real-time Students List Sync
onSnapshot(
  collection(db, 'students'),
  async (snapshot) => {
    if (!snapshot.empty) {
      const list: Student[] = [];
      snapshot.forEach((doc) => {
        list.push(doc.data() as Student);
      });
      // Sort alphabetically by student name
      list.sort((a, b) => a.name.localeCompare(b.name));

      localStudents = list;
      localStorage.setItem(STUDENTS_KEY, JSON.stringify(list));
      initialSyncCompleted.students = true;
      notifySubscribers('SYNC_STUDENTS');
    } else {
      // Snapshot is empty in Firestore. Check if we have cached local students
      const cached = getStored<Student[]>(STUDENTS_KEY, []);
      if (cached.length > 0) {
        localStudents = cached;
        initialSyncCompleted.students = true;
        notifySubscribers('SYNC_STUDENTS');
        // Persist local students to Firestore so they are never lost on reload
        try {
          await saveStudents(cached, false);
        } catch (e) {
          console.warn('Silent sync of cached students to cloud:', e);
        }
      } else {
        localStudents = [];
        localStorage.setItem(STUDENTS_KEY, JSON.stringify([]));
        initialSyncCompleted.students = true;
        notifySubscribers('SYNC_STUDENTS');
      }
    }
  },
  (error) => {
    console.warn('Students collection snapshot warning:', error);
    initialSyncCompleted.students = true;
  }
);

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
      localStorage.setItem(STUDENT_USERS_KEY, JSON.stringify(allUsers));
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
          localStorage.setItem(STUDENT_USERS_KEY, JSON.stringify([]));
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
// Save global config parameters
export async function saveExamConfig(config: ExamConfig, broadcast = true): Promise<void> {
  localConfig = config;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  if (typeof document !== 'undefined' && config.examTitle) {
    document.title = config.examTitle;
  }
  if (broadcast) notifySubscribers('SYNC_CONFIG');

  try {
    await setDoc(doc(db, 'config', 'examConfig'), sanitizeForFirestore(config));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'config/examConfig');
  }
}

// Reset/Update entire bank of questions
export async function saveQuestions(questions: Question[], broadcast = true): Promise<void> {
  localQuestions = questions;
  localStorage.setItem(QUESTIONS_KEY, JSON.stringify(questions));
  if (broadcast) notifySubscribers('SYNC_QUESTIONS');

  try {
    const existingSnap = await getDocs(collection(db, 'questions'));
    const existingIds = new Set<string>();
    existingSnap.forEach((doc) => existingIds.add(doc.id));

    const batch = writeBatch(db);
    
    // Save/update questions
    questions.forEach((q) => {
      const ref = doc(db, 'questions', q.id);
      batch.set(ref, sanitizeForFirestore(q));
      existingIds.delete(q.id);
    });

    // Clean up deleted ones
    existingIds.forEach((id) => {
      const ref = doc(db, 'questions', id);
      batch.delete(ref);
    });

    // Mark seedMeta so empty questions are NEVER re-seeded
    batch.set(doc(db, 'config', 'seedMeta'), {
      questionsInitialized: true,
      lastUpdated: new Date().toISOString(),
      count: questions.length
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'questions');
  }
}

// Save/Synchronize student user database in chunks of 200 users (handles 1,200+ accounts in ~6 fast doc writes)
export async function saveStudentUsers(users: StudentUser[], broadcast = true): Promise<void> {
  const sanitizedUsers = users.map((u, i) => cleanStudentUser(u, i));
  localStudentUsers = sanitizedUsers;
  localStorage.setItem(STUDENT_USERS_KEY, JSON.stringify(sanitizedUsers));
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
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'studentAccounts');
  }
}

// Save/Synchronize student registry list
export async function saveStudents(students: Student[], broadcast = true): Promise<void> {
  const cleanedList = students.map(s => cleanStudent(s));
  localStudents = cleanedList;
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(cleanedList));
  if (broadcast) notifySubscribers('SYNC_STUDENTS');

  try {
    const existingSnap = await getDocs(collection(db, 'students'));
    const existingIds = new Set<string>();
    existingSnap.forEach((doc) => existingIds.add(doc.id));

    // Save/update students in batches of 300 (well within Firestore 500 limit)
    const CHUNK_SIZE = 300;
    for (let i = 0; i < cleanedList.length; i += CHUNK_SIZE) {
      const chunk = cleanedList.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((s) => {
        const ref = doc(db, 'students', s.id);
        batch.set(ref, sanitizeForFirestore(s));
        existingIds.delete(s.id);
      });
      await batch.commit();
    }

    // Clean up deleted ones
    const deleteList = Array.from(existingIds);
    for (let i = 0; i < deleteList.length; i += CHUNK_SIZE) {
      const chunk = deleteList.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((id) => {
        batch.delete(doc(db, 'students', id));
      });
      await batch.commit();
    }
  } catch (err) {
    console.error('Error saving students to cloud:', err);
  }
}

// Save/Update a single student session document in Firestore
export async function saveSingleStudent(student: Student, broadcast = true): Promise<void> {
  const cleaned = cleanStudent(student);
  const index = localStudents.findIndex((s) => s.id === cleaned.id);
  if (index !== -1) {
    localStudents[index] = cleaned;
  } else {
    localStudents.push(cleaned);
  }
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(localStudents));
  if (broadcast) notifySubscribers('SYNC_STUDENTS');

  try {
    await setDoc(doc(db, 'students', cleaned.id), sanitizeForFirestore(cleaned));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `students/${cleaned.id}`);
  }
}

// Delete a single student session document from Firestore
export async function deleteSingleStudent(studentId: string, broadcast = true): Promise<void> {
  localStudents = localStudents.filter((s) => s.id !== studentId);
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(localStudents));
  if (broadcast) notifySubscribers('SYNC_STUDENTS');

  try {
    await deleteDoc(doc(db, 'students', studentId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `students/${studentId}`);
  }
}

// Fetch single student data directly from server to override cache/snapshots
export async function getStudentFromServer(studentId: string): Promise<Student | null> {
  try {
    const docRef = fsDoc(db, 'students', studentId);
    const snap = await getDocFromServer(docRef);
    if (snap.exists()) {
      const student = snap.data() as Student;
      // Also update local list in memory
      const index = localStudents.findIndex((s) => s.id === student.id);
      if (index !== -1) {
        localStudents[index] = student;
      } else {
        localStudents.push(student);
      }
      localStorage.setItem(STUDENTS_KEY, JSON.stringify(localStudents));
      notifySubscribers('SYNC_STUDENTS');
      return student;
    }
  } catch (err) {
    console.error('Error fetching student directly from server:', err);
  }
  return null;
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


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

// Automatically clear potential stale or outdated caches on application initialization
try {
  localStorage.removeItem(STUDENTS_KEY);
  localStorage.removeItem(QUESTIONS_KEY);
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(STUDENT_USERS_KEY);
} catch (e) {
  console.error('Failed to prune local storage:', e);
}

// 1. Clean in-memory states populated dynamically directly from Live Firestore docs
let localStudents: Student[] = [];
let localQuestions: Question[] = [];
let localStudentUsers: StudentUser[] = [];
let localConfig: ExamConfig = {
  durationMinutes: 15,
  examTitle: 'ujian berbasis keamanan tingkat korea utara + NASA',
  subject1Name: 'Seni Budaya dan P kelas 8',
  subject2Name: 'Informatika kelas 7',
  subjects: [
    { id: 'sub1', name: 'Seni Budaya dan P kelas 8', code: 'SB-8', isActive: true },
    { id: 'sub2', name: 'Informatika kelas 7', code: 'INF-7', isActive: true },
  ],
  unlockTokens: ['TOKEN-1', 'TOKEN-2'],
  usedGlobalTokens: [],
  enableRandomSampling: false,
  sampleQuestionCount: 50,
  requireStudentLogin: true
};

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
  return [
    { id: 'sub1', name: cfg.subject1Name || 'Seni Budaya dan P kelas 8', code: 'SB-8', isActive: true },
    { id: 'sub2', name: cfg.subject2Name || 'Informatika kelas 7', code: 'INF-7', isActive: true }
  ];
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
      let needUpgrade = false;
      if (data.examTitle === 'Ujian Tengah Semester - Pengetahuan Umum') {
        data.examTitle = 'ujian berbasis keamanan tingkat korea utara + NASA';
        needUpgrade = true;
      }
      if (!data.subject1Name || data.subject1Name === 'Matematika & Sains (IPA)') {
        data.subject1Name = 'Seni Budaya dan P kelas 8';
        needUpgrade = true;
      }
      if (!data.subject2Name || data.subject2Name === 'IPS & Pengetahuan Umum') {
        data.subject2Name = 'Informatika kelas 7';
        needUpgrade = true;
      }
      if (!data.subjects || !Array.isArray(data.subjects) || data.subjects.length === 0) {
        data.subjects = [
          { id: 'sub1', name: data.subject1Name || 'Seni Budaya dan P kelas 8', code: 'SB-8', isActive: true },
          { id: 'sub2', name: data.subject2Name || 'Informatika kelas 7', code: 'INF-7', isActive: true }
        ];
        needUpgrade = true;
      }
      if (needUpgrade) {
        try {
          await setDoc(doc(db, 'config', 'examConfig'), data);
        } catch (err) {
          console.warn('Failed to auto-upgrade configuration in database:', err);
        }
      }
      localConfig = data;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(data));
      if (typeof document !== 'undefined' && data.examTitle) {
        document.title = data.examTitle;
      }
      initialSyncCompleted.config = true;
      notifySubscribers('SYNC_CONFIG');
    } else {
      // Config collection has not been seeded, write initial parameters to public cloud
      try {
        await setDoc(doc(db, 'config', 'examConfig'), INITIAL_CONFIG);
        initialSyncCompleted.config = true;
        notifySubscribers('SYNC_CONFIG');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'config/examConfig');
      }
    }
  },
  (error) => {
    handleFirestoreError(error, OperationType.GET, 'config/examConfig');
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
      // Questions bank is empty on cloud instance
      try {
        const seedStatusSnap = await getDoc(doc(db, 'config', 'seedMeta'));
        if (seedStatusSnap.exists() && seedStatusSnap.data()?.questionsInitialized) {
          // PROCTOR INTENTIONALLY EMPTIED THE BANK - DO NOT RE-SEED!
          localQuestions = [];
          localStorage.setItem(QUESTIONS_KEY, JSON.stringify([]));
          initialSyncCompleted.questions = true;
          notifySubscribers('SYNC_QUESTIONS');
          return;
        }

        // Only on fresh first-ever project installation seed sample questions once
        const batch = writeBatch(db);
        INITIAL_QUESTIONS.forEach((q) => {
          const ref = doc(db, 'questions', q.id);
          batch.set(ref, q);
        });
        batch.set(doc(db, 'config', 'seedMeta'), { questionsInitialized: true });
        await batch.commit();
        initialSyncCompleted.questions = true;
        notifySubscribers('SYNC_QUESTIONS');
      } catch (err) {
        localQuestions = [];
        initialSyncCompleted.questions = true;
        notifySubscribers('SYNC_QUESTIONS');
      }
    }
  },
  (error) => {
    handleFirestoreError(error, OperationType.GET, 'questions');
  }
);

// C. Real-time Students List Sync
onSnapshot(
  collection(db, 'students'),
  (snapshot) => {
    const list: Student[] = [];
    snapshot.forEach((doc) => {
      list.push(doc.data() as Student);
    });
    // Sort alphabetially by student name
    list.sort((a, b) => a.name.localeCompare(b.name));

    localStudents = list;
    localStorage.setItem(STUDENTS_KEY, JSON.stringify(list));
    initialSyncCompleted.students = true;
    notifySubscribers('SYNC_STUDENTS');
  },
  (error) => {
    handleFirestoreError(error, OperationType.GET, 'students');
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
      // If collection empty, check if we should populate with initial default demo users
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

        // Seed initial default demo users once
        await saveStudentUsers(DEFAULT_STUDENT_USERS);
        await setDoc(doc(db, 'config', 'userMeta'), { usersInitialized: true });
        initialSyncCompleted.studentUsers = true;
      } catch (err) {
        localStudentUsers = [...DEFAULT_STUDENT_USERS];
        initialSyncCompleted.studentUsers = true;
        notifySubscribers('SYNC_STUDENT_USERS');
      }
    }
  },
  (error) => {
    console.warn('Student accounts snapshot warning:', error);
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
    await setDoc(doc(db, 'config', 'examConfig'), config);
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
      batch.set(ref, q);
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
  localStudentUsers = users;
  localStorage.setItem(STUDENT_USERS_KEY, JSON.stringify(users));
  if (broadcast) notifySubscribers('SYNC_STUDENT_USERS');

  try {
    const existingSnap = await getDocs(collection(db, 'studentAccounts'));
    const existingIds = new Set<string>();
    existingSnap.forEach((doc) => existingIds.add(doc.id));

    const batch = writeBatch(db);
    const CHUNK_SIZE = 200;
    const chunkCount = Math.ceil(users.length / CHUNK_SIZE);

    if (users.length === 0) {
      existingIds.forEach((id) => {
        batch.delete(doc(db, 'studentAccounts', id));
      });
      batch.set(doc(db, 'config', 'userMeta'), { usersInitialized: true, count: 0 });
      await batch.commit();
      return;
    }

    for (let i = 0; i < chunkCount; i++) {
      const chunkId = `chunk_${i}`;
      const chunkUsers = users.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const chunkRef = doc(db, 'studentAccounts', chunkId);
      batch.set(chunkRef, { chunkIndex: i, users: chunkUsers, updatedAt: new Date().toISOString() });
      existingIds.delete(chunkId);
    }

    existingIds.forEach((id) => {
      batch.delete(doc(db, 'studentAccounts', id));
    });

    batch.set(doc(db, 'config', 'userMeta'), { usersInitialized: true, count: users.length, updatedAt: new Date().toISOString() });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'studentAccounts');
  }
}

// Save/Synchronize student registry list
export async function saveStudents(students: Student[], broadcast = true): Promise<void> {
  localStudents = students;
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
  if (broadcast) notifySubscribers('SYNC_STUDENTS');

  try {
    const existingSnap = await getDocs(collection(db, 'students'));
    const existingIds = new Set<string>();
    existingSnap.forEach((doc) => existingIds.add(doc.id));

    const batch = writeBatch(db);

    // Synchronize documents
    students.forEach((s) => {
      const ref = doc(db, 'students', s.id);
      batch.set(ref, s);
      existingIds.delete(s.id);
    });

    // Remove any student records deleted from local administration panels
    existingIds.forEach((id) => {
      const ref = doc(db, 'students', id);
      batch.delete(ref);
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'students');
  }
}

// Save/Update a single student session document in Firestore
export async function saveSingleStudent(student: Student, broadcast = true): Promise<void> {
  const index = localStudents.findIndex((s) => s.id === student.id);
  if (index !== -1) {
    localStudents[index] = student;
  } else {
    localStudents.push(student);
  }
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(localStudents));
  if (broadcast) notifySubscribers('SYNC_STUDENTS');

  try {
    await setDoc(doc(db, 'students', student.id), student);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `students/${student.id}`);
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


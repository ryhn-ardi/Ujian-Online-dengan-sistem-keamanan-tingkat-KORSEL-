import React, { useState, useEffect, useRef } from 'react';
import {
  getStudents,
  saveStudents,
  getQuestions,
  saveQuestions,
  getExamConfig,
  saveExamConfig,
  getStudentUsers,
  saveStudentUsers,
  subscribeToSync,
  isInitialSyncCompleted,
  saveSingleStudent,
  deleteSingleStudent,
  getExamSubjects,
  debounceSaveSingleStudent,
  saveSingleStudentLocallyOnly,
  disableAllStudentsSync,
  enableAllStudentsSync,
  subscribeToMyStudentSession,
  refreshQuestionsFromServer
} from './utils/sync';
import { Student, Question, ExamConfig, StudentStatus, StudentUser, BroadcastAnnouncement } from './types';
import StudentRegistration from './components/StudentRegistration';
import StudentExam from './components/StudentExam';
import AdminPanel from './components/AdminPanel';
import ProctorPanel from './components/ProctorPanel';
import { ShieldCheck, GraduationCap, Award, RefreshCw, XCircle, ArrowRight, CheckCircle2, ChevronRight, AlertTriangle, BookOpen, Radio, Sparkles } from 'lucide-react';

// Shared helper to calculate actual slot/subject questions, score, and correct count for a student
export function getStudentMetrics(s: Student, questionsList: Question[]) {
  let studentQuestions = questionsList.filter(
    (q) => (!q.subjectId && (!s.subjectId || s.subjectId === 'sub1')) || q.subjectId === s.subjectId
  );

  // If student has randomized assigned question subset, respect and use exact assigned questions
  if (s.assignedQuestionIds && s.assignedQuestionIds.length > 0) {
    const map = new Map(studentQuestions.map(q => [q.id, q]));
    const ordered: Question[] = [];
    s.assignedQuestionIds.forEach(id => {
      const found = map.get(id);
      if (found) ordered.push(found);
    });
    if (ordered.length > 0) {
      studentQuestions = ordered;
    }
  }

  const totalQuestions = studentQuestions.length;

  let correctAnswersCount = 0;
  let earnedPoints = 0;
  let maxPoints = 0;

  studentQuestions.forEach((q) => {
    const qScore = typeof q.score === 'number' ? q.score : 10;
    maxPoints += qScore;

    const ans = s.answers?.[q.id];
    if (ans !== undefined) {
      if (q.type === 'MR') {
        const correctSet = q.correctAnswerIndices || [];
        const studentSet = Array.isArray(ans) ? ans : [ans];
        const isCorrect = studentSet.length === correctSet.length &&
          studentSet.every(idx => correctSet.includes(idx));

        if (isCorrect) {
          correctAnswersCount++;
          earnedPoints += qScore;
        }
      } else {
        const correctIdx = typeof q.correctAnswerIndex === 'number' ? q.correctAnswerIndex : (q.correctAnswerIndices?.[0] ?? 0);
        const isCorrect = Array.isArray(ans) ? ans.includes(correctIdx) : ans === correctIdx;
        if (isCorrect) {
          correctAnswersCount++;
          earnedPoints += qScore;
        }
      }
    }
  });

  const finalScore = maxPoints > 0 ? (earnedPoints / maxPoints) * 100 : 0;

  return {
    correctAnswersCount,
    totalQuestions,
    score: finalScore
  };
}

export default function App() {
  const [role, setRole] = useState<'SETUP' | 'STUDENT_EXAM' | 'STUDENT_FINISHED' | 'ADMIN' | 'PROCTOR'>('SETUP');
  const [students, setStudents] = useState<Student[]>(() => [...getStudents()]);
  const [questions, setQuestions] = useState<Question[]>(() => [...getQuestions()]);
  const [studentUsers, setStudentUsers] = useState<StudentUser[]>(() => [...getStudentUsers()]);
  const [config, setConfig] = useState<ExamConfig>(() => ({ ...getExamConfig() }));
  const [currentStudentId, setCurrentStudentId] = useState<string>(() => {
    try {
      return localStorage.getItem('active_student_id') || '';
    } catch (e) {
      return '';
    }
  });
  const [isPreparing, setIsPreparing] = useState<boolean>(true);

  // 1. Load initial states on mount
  useEffect(() => {
    setStudents([...getStudents()]);
    setQuestions([...getQuestions()]);
    setStudentUsers([...getStudentUsers()]);
    const cfg = getExamConfig();
    setConfig({ ...cfg });
    if (typeof document !== 'undefined' && cfg.examTitle) {
      document.title = cfg.examTitle;
    }

    // Smooth guaranteed transition: Displays "Mempersiapkan Lembar Ujian..." briefly then enters
    const timer = setTimeout(() => {
      setIsPreparing(false);
    }, 1200);

    // 2. Subscribe to real-time tab updates
    const unsubscribe = subscribeToSync((syncType) => {
      if (syncType === 'SYNC_STUDENTS') {
        const freshStudents = getStudents();
        setStudents([...freshStudents]);
      } else if (syncType === 'SYNC_QUESTIONS') {
        setQuestions([...getQuestions()]);
      } else if (syncType === 'SYNC_CONFIG') {
        const freshCfg = getExamConfig();
        setConfig({ ...freshCfg });
        if (typeof document !== 'undefined' && freshCfg.examTitle) {
          document.title = freshCfg.examTitle;
        }
      } else if (syncType === 'SYNC_STUDENT_USERS') {
        setStudentUsers([...getStudentUsers()]);
      }
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  // Monitor initial database and student sync to restore student session on refresh
  useEffect(() => {
    if (currentStudentId) {
      const active = students.find((s) => s.id === currentStudentId);
      if (active) {
        if (active.status === 'SELESAI') {
          setRole('STUDENT_FINISHED');
        } else {
          // Check if subject is still active in system
          const subjects = getExamSubjects(config);
          const studentSub = subjects.find(sub => sub.id === (active.subjectId || 'sub1'));
          
          if (studentSub && studentSub.isActive === false) {
            console.warn(`Subject ${active.subjectId} (${studentSub.name}) is currently deactivated by admin.`);
            setCurrentStudentId('');
            try {
              localStorage.removeItem('active_student_id');
            } catch (e) {}
            setRole('SETUP');
            return;
          }

          setRole('STUDENT_EXAM');
        }
      } else if (students.length > 0) {
        // Cached session was deleted from admin panel, wipe local cache
        setCurrentStudentId('');
        try {
          localStorage.removeItem('active_student_id');
        } catch (e) {}
        setRole('SETUP');
      }
    }
  }, [students, currentStudentId, config]);

  // Dynamic smart sync listener: ONLY enable heavy all-students sync on ADMIN and PROCTOR dashboards!
  // Student devices (SETUP, STUDENT_EXAM, STUDENT_FINISHED) NEVER subscribe to the full 400+ students collection!
  useEffect(() => {
    if (role === 'ADMIN' || role === 'PROCTOR') {
      enableAllStudentsSync();
      return () => {
        disableAllStudentsSync();
      };
    } else {
      // Student views: disable global student monitoring listener
      disableAllStudentsSync();
      if (currentStudentId && role === 'STUDENT_EXAM') {
        const unsub = subscribeToMyStudentSession(currentStudentId);
        return () => {
          unsub();
        };
      }
    }
  }, [role, currentStudentId]);

  // Active Anti-Auto-Translate Runtime Guard (100% Client-Side In-Memory, 0 Firestore Reads/Writes)
  useEffect(() => {
    const enforceNoTranslate = () => {
      if (document.documentElement.getAttribute('translate') !== 'no') {
        document.documentElement.setAttribute('translate', 'no');
      }
      if (!document.documentElement.classList.contains('notranslate')) {
        document.documentElement.classList.add('notranslate');
      }
      if (document.body && document.body.getAttribute('translate') !== 'no') {
        document.body.setAttribute('translate', 'no');
        document.body.classList.add('notranslate');
      }
    };

    enforceNoTranslate();
    const observer = new MutationObserver(() => {
      enforceNoTranslate();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'lang', 'translate'],
      subtree: false
    });

    return () => observer.disconnect();
  }, []);

  // Admin Forced Mass Refresh Listener for Students (Khusus Admin Trigger)
  const [studentRefreshNotice, setStudentRefreshNotice] = useState<{
    show: boolean;
    reason: string;
    type: 'SOFT' | 'HARD';
  } | null>(null);

  const lastProcessedRefreshRef = useRef<number>(
    (() => {
      try {
        const stored = localStorage.getItem('last_handled_admin_refresh');
        return stored ? parseInt(stored, 10) : (config.forcedRefreshTimestamp || 0);
      } catch (e) {
        return config.forcedRefreshTimestamp || 0;
      }
    })()
  );

  useEffect(() => {
    if (!config.forcedRefreshTimestamp) return;

    if (config.forcedRefreshTimestamp > lastProcessedRefreshRef.current) {
      lastProcessedRefreshRef.current = config.forcedRefreshTimestamp;
      try {
        localStorage.setItem('last_handled_admin_refresh', String(config.forcedRefreshTimestamp));
      } catch (e) {}

      // Refresh applies to student views (SETUP, STUDENT_EXAM, STUDENT_FINISHED)
      if (role === 'SETUP' || role === 'STUDENT_EXAM' || role === 'STUDENT_FINISHED') {
        const refreshType = config.forcedRefreshType || 'SOFT';
        const reason = config.forcedRefreshReason || 'Pembaruan konfigurasi ujian & naskah soal dari Admin.';

        setStudentRefreshNotice({
          show: true,
          reason,
          type: refreshType
        });

        // Silently re-fetch latest questions from server
        refreshQuestionsFromServer().then((freshQs) => {
          if (freshQs && freshQs.length > 0) {
            setQuestions([...freshQs]);
          }
        });

        if (refreshType === 'HARD') {
          setTimeout(() => {
            window.location.reload();
          }, 2500);
        } else {
          // Auto hide banner after 6s
          setTimeout(() => {
            setStudentRefreshNotice(null);
          }, 6000);
        }
      }
    }
  }, [config.forcedRefreshTimestamp, config.forcedRefreshType, config.forcedRefreshReason, role]);

  // Sync state helpers
  const handleUpdateStudents = (updatedList: Student[]) => {
    setStudents(updatedList);
    saveStudents(updatedList);
  };

  const handleUpdateQuestions = (updatedList: Question[]) => {
    setQuestions(updatedList);
    saveQuestions(updatedList);
  };

  const handleUpdateConfig = (updatedConfig: ExamConfig) => {
    setConfig(updatedConfig);
    saveExamConfig(updatedConfig);
  };

  // 3. STUDENT FLOW: Registration Action (Supports Multi-Subject exams, Reconnection & Randomized question sampling)
  const handleRegisterStudent = (data: { name: string; absentNumber: string; studentClass: string; subjectId: string; username?: string }) => {
    const existingStudents = getStudents();
    
    const normalizedNewName = data.name.trim().toLowerCase().replace(/\s+/g, '');
    const normalizedUsername = data.username ? data.username.trim().toLowerCase() : '';
    const targetSubjectId = data.subjectId || 'sub1';

    // Look for existing session for THIS SPECIFIC SUBJECT so students can take multiple subjects
    const existing = existingStudents.find((s) => {
      const sSubId = s.subjectId || 'sub1';
      if (sSubId !== targetSubjectId) return false;

      if (normalizedUsername && s.username && s.username.toLowerCase() === normalizedUsername) {
        return true;
      }
      const normalizedExisting = s.name.trim().toLowerCase().replace(/\s+/g, '');
      return normalizedExisting === normalizedNewName;
    });

    const sampleQuestionsForSubject = (subId: string): string[] | undefined => {
      // Find the specific subject configuration
      const subjects = config.subjects || [];
      const targetSub = subjects.find(s => s.id === subId) || (subId === 'sub1' ? subjects[0] : undefined);

      // Check per-subject random sampling first, then fall back to global config if set
      const isRandomSamplingEnabled = targetSub?.enableRandomSampling !== undefined
        ? targetSub.enableRandomSampling
        : !!config.enableRandomSampling;

      if (!isRandomSamplingEnabled) return undefined;

      const subQuestions = questions.filter(
        (q) => (!q.subjectId && (!subId || subId === 'sub1')) || q.subjectId === subId
      );
      if (subQuestions.length === 0) return undefined;

      const desiredCount = (targetSub?.sampleQuestionCount && targetSub.sampleQuestionCount > 0)
        ? targetSub.sampleQuestionCount
        : (config.sampleQuestionCount && config.sampleQuestionCount > 0 ? config.sampleQuestionCount : subQuestions.length);

      const targetCount = Math.min(desiredCount, subQuestions.length);

      const shuffled = [...subQuestions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.slice(0, targetCount).map(q => q.id);
    };

    if (existing) {
      if (existing.status === 'SELESAI') {
        // Student already finished this specific subject
        setCurrentStudentId(existing.id);
        localStorage.setItem('active_student_id', existing.id);
        setRole('STUDENT_FINISHED');
        return;
      }

      // Reconnect to existing session, ensuring assigned questions strictly match current subject pool
      const subQuestions = questions.filter(
        (q) => (!q.subjectId && (!targetSubjectId || targetSubjectId === 'sub1')) || q.subjectId === targetSubjectId
      );
      const subQuestionIdSet = new Set(subQuestions.map(q => q.id));
      const hasValidAssignedIds = Array.isArray(existing.assignedQuestionIds) &&
        existing.assignedQuestionIds.length > 0 &&
        existing.assignedQuestionIds.every(id => subQuestionIdSet.has(id));

      const updatedStudent: Student = {
        ...existing,
        username: data.username || existing.username || '',
        studentClass: data.studentClass.trim(),
        absentNumber: data.absentNumber.trim(),
        subjectId: targetSubjectId,
        assignedQuestionIds: hasValidAssignedIds ? existing.assignedQuestionIds : sampleQuestionsForSubject(targetSubjectId),
        lastActive: new Date().toISOString()
      };
      
      saveSingleStudent(updatedStudent);
      setCurrentStudentId(existing.id);
      localStorage.setItem('active_student_id', existing.id);
      setRole('STUDENT_EXAM');
      return;
    }

    // Create new student session object for this subject
    const newStudentId = `siswa_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const sampledQuestionIds = sampleQuestionsForSubject(targetSubjectId);
    const newStudent: Student = {
      id: newStudentId,
      username: data.username || '',
      name: data.name.trim(),
      absentNumber: data.absentNumber.trim(),
      studentClass: data.studentClass.trim(),
      status: 'BELUM_MULAI',
      violationCount: 0,
      answers: {},
      lastActive: new Date().toISOString(),
      subjectId: targetSubjectId,
      assignedQuestionIds: sampledQuestionIds && sampledQuestionIds.length > 0 ? sampledQuestionIds : undefined
    };

    saveSingleStudent(newStudent);
    setCurrentStudentId(newStudentId);
    localStorage.setItem('active_student_id', newStudentId);
    setRole('STUDENT_EXAM');
  };

  // 3b. STUDENT FLOW: Start Exam Action
  const handleStartExam = () => {
    const freshStudents = getStudents();
    const active = freshStudents.find((s) => s.id === currentStudentId);
    if (active) {
      const updatedActive: Student = {
        ...active,
        status: 'SEDANG_MENGERJAKAN',
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + config.durationMinutes * 60 * 1000).toISOString(),
        lastActive: new Date().toISOString()
      };
      saveSingleStudent(updatedActive);
    }
  };

  // 3c. STUDENT FLOW: Save/Update Answers in Real-time (with continuous score recalculation)
  const handleStudentAnswersUpdate = (updatedAnswers: Record<string, number | number[]>) => {
    const freshStudents = getStudents();
    const active = freshStudents.find((s) => s.id === currentStudentId);
    if (active) {
      const activeWithNewAnswers = { ...active, answers: updatedAnswers };
      const metrics = getStudentMetrics(activeWithNewAnswers, questions);
      const updatedActive: Student = {
        ...active,
        answers: updatedAnswers,
        score: metrics.score,
        correctAnswersCount: metrics.correctAnswersCount,
        totalQuestions: metrics.totalQuestions,
        lastActive: new Date().toISOString()
      };
      
      // Mode Hemat Kuota Ekstrem: Simpan 100% lokal di HP siswa (0 write ke Firebase per soal)
      // Hanya kirim ke Firebase saat Pelanggaran, Unlock, atau Kumpul Ujian (Submit)
      if (config.ecoSyncMode !== false) {
        saveSingleStudentLocallyOnly(updatedActive);
      } else {
        // Mode Live Sync: Kirim debounced ke Firebase
        debounceSaveSingleStudent(updatedActive, 3000);
      }
    }
  };

  // 4. STUDENT FLOW: Violation detection (Strict lock trigger)
  const handleStudentViolation = (reason: string) => {
    const freshStudents = getStudents(); // pull fresh to preserve parallel answers
    const active = freshStudents.find((s) => s.id === currentStudentId);
    if (active) {
      if (reason === 'unlocked_locally') {
        const updatedActive: Student = {
          ...active,
          status: 'SEDANG_MENGERJAKAN',
          violationCount: 0,
          lockedReason: undefined
        };
        saveSingleStudent(updatedActive);
        return;
      }

      const tolerance = config.maxAllowedViolations !== undefined ? config.maxAllowedViolations : 3;
      const maxAllowed = (active.tokenUnlockCount && active.tokenUnlockCount > 0) ? 1 : tolerance;
      const nextViolationCount = (active.violationCount || 0) + 1;

      if (nextViolationCount >= maxAllowed) {
        // Lock exam immediately
        const updatedActive: Student = {
          ...active,
          status: 'TERKUNCI',
          lockedReason: reason,
          violationCount: nextViolationCount,
          answers: config.clearAnswersOnViolation ? {} : active.answers, // Wipe answers if option is active
          lastActive: new Date().toISOString()
        };
        saveSingleStudent(updatedActive);
      } else {
        // Just increment violation count and save, letting him continue with warning
        const updatedActive: Student = {
          ...active,
          violationCount: nextViolationCount,
          lastActive: new Date().toISOString()
        };
        saveSingleStudent(updatedActive);
      }
    }
  };

  // 4b. STUDENT FLOW: Token-based Self Unlock (Channel 2: Single-use burned token)
  const handleStudentTokenUnlock = async (tokenCode: string): Promise<{ success: boolean; message: string }> => {
    const freshStudents = getStudents();
    const active = freshStudents.find((s) => s.id === currentStudentId);
    if (!active) {
      return { success: false, message: 'Data sesi siswa tidak ditemukan.' };
    }

    const normalizedInput = tokenCode.trim().toUpperCase();
    const availableTokens = (config.unlockTokens && config.unlockTokens.length > 0 ? config.unlockTokens : ['TOKEN-1', 'TOKEN-2'])
      .map(t => t.trim().toUpperCase());

    // 1. Verify token exists in admin's active token list
    if (!availableTokens.includes(normalizedInput)) {
      return { success: false, message: 'Kode token tidak valid. Silakan minta token yang benar kepada Pengawas/Proktor.' };
    }

    // 2. Strict Check: Has this token been burned globally or by this student?
    const currentUsedTokens = (active.usedTokens || []).map(t => t.trim().toUpperCase());
    const currentGlobalTokens = (config.usedGlobalTokens || []).map(t => t.trim().toUpperCase());

    if (currentUsedTokens.includes(normalizedInput) || currentGlobalTokens.includes(normalizedInput)) {
      return {
        success: false,
        message: `Token "${tokenCode.trim()}" sudah TERPAKAI dan hangus! Setiap token hanya dapat digunakan 1 kali. Harap minta kode token lain yang belum terpakai kepada Pengawas/Proktor.`
      };
    }

    // 3. Verify student has not exceeded the total number of allowed token uses
    const maxAllowedTokens = availableTokens.length;
    if (currentUsedTokens.length >= maxAllowedTokens) {
      return {
        success: false,
        message: `Batas pengulangan Anda sudah habis (${maxAllowedTokens}/${maxAllowedTokens} kali). Harap hubungi Pengawas/Proktor utama untuk membuka kunci langsung via Channel 1 (Remote).`
      };
    }

    // 4. Update student state & burn token globally in exam config
    const nextUsedTokens = [...(active.usedTokens || []), normalizedInput];
    const nextGlobalTokens = [...(config.usedGlobalTokens || []), normalizedInput];
    const nextUnlockCount = (active.tokenUnlockCount || 0) + 1;
    const remainingAttempts = Math.max(0, maxAllowedTokens - nextUsedTokens.length);

    const updatedActive: Student = {
      ...active,
      status: 'SEDANG_MENGERJAKAN',
      violationCount: 0, // Reset violations so tolerance restarts cleanly
      lockedReason: undefined,
      usedTokens: nextUsedTokens,
      tokenUnlockCount: nextUnlockCount,
      answers: active.answers || {}, // Strictly preserve student answers
      lastActive: new Date().toISOString()
    };

    await saveSingleStudent(updatedActive);
    setStudents(prev => prev.map(s => s.id === updatedActive.id ? updatedActive : s));
    setConfig(prev => ({ ...prev, usedGlobalTokens: nextGlobalTokens }));

    return {
      success: true,
      message: `Token valid! Kunci dibuka (Sisa kesempatan: ${remainingAttempts}x). Membuka lembar soal...`
    };
  };

  // 5. STUDENT FLOW: Final Answers Submission & Calculation
  const handleStudentSubmit = async (selectedAnswers: Record<string, number | number[]>) => {
    const freshStudents = getStudents();
    const active = freshStudents.find(s => s.id === currentStudentId);
    if (!active) return;

    // Use shared slot-specific helper
    const activeWithNewAnswers = { ...active, answers: selectedAnswers };
    const metrics = getStudentMetrics(activeWithNewAnswers, questions);

    const updatedActive: Student = {
      ...active,
      status: 'SELESAI',
      answers: selectedAnswers,
      correctAnswersCount: metrics.correctAnswersCount,
      totalQuestions: metrics.totalQuestions,
      score: metrics.score,
      endTime: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };

    await saveSingleStudent(updatedActive);
    setRole('STUDENT_FINISHED');
  };

  // Fetching currently active student object from reactive state
  const activeStudent = students.find((s) => s.id === currentStudentId);

  // Monitor real-time status transitions (e.g. if admin unlocks from their dashboard)
  useEffect(() => {
    if (role === 'STUDENT_EXAM' && activeStudent && activeStudent.status === 'SELESAI') {
      setRole('STUDENT_FINISHED');
    }
  }, [students, role, activeStudent]);

  if (isPreparing) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-sm w-full space-y-6">
          <div className="relative flex justify-center">
            {/* Spinning elegant custom loader */}
            <div className="w-16 h-16 border-4 border-indigo-500/10 border-t-indigo-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-indigo-400 animate-pulse" />
            </div>
          </div>
          
          <div className="space-y-1.5">
            <h2 className="text-white font-bold tracking-tight text-lg">Mempersiapkan Lembar Ujian...</h2>
            <p className="text-[10px] text-indigo-200/50 font-mono text-center tracking-wider px-4">
              SINKRONISASI REAL-TIME DENGAN CLOUD DATABASE
            </p>
          </div>
          
          <div className="bg-slate-800/40 p-4.5 rounded-2xl border border-slate-700/30 text-[10px] font-mono text-slate-400 space-y-2 text-left leading-relaxed">
            <div className="flex items-center justify-between">
              <span>Menghubungkan ke Cloud...</span>
              <span className="text-emerald-400 font-bold">TERKONEKSI</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Membersihkan Cache Presensi...</span>
              <span className="text-indigo-400 font-bold uppercase">OTOMATIS</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Mengunduh Bank Soal Aktif...</span>
              <span className="text-emerald-400 font-bold">SELESAI</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPreparing(false)}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white font-mono text-xs rounded-xl border border-slate-700 transition cursor-pointer"
          >
            Masuk Langsung &rarr;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Admin Forced Mass Refresh Toast for Students */}
      {studentRefreshNotice?.show && (
        <div className="fixed top-4 inset-x-4 max-w-md mx-auto z-[99999] bg-slate-900/95 backdrop-blur-md text-white border border-indigo-500/50 shadow-2xl rounded-2xl p-4 flex items-start gap-3.5 animate-fade-in select-none">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 shadow-xs">
            <RefreshCw className={`w-5 h-5 text-white ${studentRefreshNotice.type === 'HARD' ? 'animate-spin' : ''}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-black text-indigo-300 font-mono uppercase tracking-wider flex items-center gap-1.5">
                <span>Pembaruan dari Admin</span>
                <span className="px-1.5 py-0.2 bg-indigo-500/30 text-indigo-200 text-[10px] rounded">Live Sync</span>
              </h4>
              <button
                onClick={() => setStudentRefreshNotice(null)}
                className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                title="Tutup Notifikasi"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-200 mt-1 leading-snug font-medium">
              {studentRefreshNotice.reason}
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                {studentRefreshNotice.type === 'HARD'
                  ? 'Memuat ulang halaman browser... Jawaban tersimpan aman.'
                  : 'Naskah soal & konfigurasi telah diperbarui. Jawaban Anda tetap aman.'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 1. SETUP / WELCOME SCREEN */}
      {role === 'SETUP' && (
        <StudentRegistration
          students={students}
          questions={questions}
          config={config}
          studentUsers={studentUsers}
          onRegister={handleRegisterStudent}
          onAdminLogin={() => setRole('ADMIN')}
          onProctorLogin={() => setRole('PROCTOR')}
          examTitle={config.examTitle || 'Ujian Digital'}
          durationMinutes={config.durationMinutes}
          totalQuestions={questions.length}
          subject1Name={config.subject1Name}
          subject2Name={config.subject2Name}
        />
      )}

      {/* 2. ACTIVE STUDENT EXAM VIEW */}
      {role === 'STUDENT_EXAM' && activeStudent && (
        <StudentExam
          student={activeStudent}
          questions={(() => {
            const pool = questions.filter(q => (!q.subjectId && (!activeStudent.subjectId || activeStudent.subjectId === 'sub1')) || q.subjectId === activeStudent.subjectId);
            if (activeStudent.assignedQuestionIds && activeStudent.assignedQuestionIds.length > 0) {
              const map = new Map<string, Question>(pool.map(q => [q.id, q]));
              const ordered: Question[] = [];
              activeStudent.assignedQuestionIds.forEach(id => {
                const found = map.get(id);
                if (found) ordered.push(found);
              });
              if (ordered.length > 0) return ordered;
            }
            return pool;
          })()}
          config={config}
          onViolation={handleStudentViolation}
          onTokenUnlock={handleStudentTokenUnlock}
          onStartExam={handleStartExam}
          onSubmitAnswers={handleStudentSubmit}
          onAnswersUpdate={handleStudentAnswersUpdate}
          onExit={() => {
            // Exit to menu without deleting student exam record
            setCurrentStudentId('');
            localStorage.removeItem('active_student_id');
            setRole('SETUP');
          }}
        />
      )}

      {/* 3. STUDENT SCORE & SUBMISSION ANALYSIS PREVIEW */}
      {role === 'STUDENT_FINISHED' && activeStudent && (() => {
        const metrics = getStudentMetrics(activeStudent, questions);
        return (
          <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
            <div className="max-w-2xl mx-auto">
              
              {/* Header Success Card */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center relative overflow-hidden mb-6">
                <div className="absolute top-0 inset-x-0 h-2 bg-emerald-500"></div>
                
                <div className="inline-flex items-center justify-center p-3 bg-emerald-50 rounded-full text-emerald-500 mb-4">
                  <CheckCircle2 className="w-12 h-12" />
                </div>

                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Jawaban Berhasil Dikirim!</h1>
                <p className="mt-1 text-sm text-slate-500 font-mono">UJIAN SELESAI • DATA TERKAM REKAM AMAN</p>

                {/* Student Metadata Card info */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 my-6 text-left space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400 font-medium">Nama Siswa:</span> <span className="font-bold text-slate-800">{activeStudent.name}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400 font-medium">No Absen / Kelas:</span> <span className="font-bold text-slate-800">{activeStudent.absentNumber} / {activeStudent.studentClass}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400 font-medium">Status Pengawasan:</span> <span className="text-green-600 font-bold flex items-center gap-1">Lulus Verifikasi ({activeStudent.violationCount} Pelanggaran)</span></div>
                </div>

                {/* Real-time score display */}
                <div className="p-6 bg-slate-900 rounded-2xl text-white">
                  <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase block mb-1 font-mono">Nilai Hasil Ujian</span>
                  <div className="text-5xl font-black tracking-tight text-yellow-400 font-mono">
                    {metrics.score !== undefined ? metrics.score.toFixed(1) : '0.0'}
                  </div>
                  <div className="text-xs text-slate-300 mt-2">
                    Berhasil menjawab benar <strong className="text-white">{metrics.correctAnswersCount}</strong> dari <strong className="text-white">{metrics.totalQuestions}</strong> pertanyaan.
                  </div>
                </div>
              </div>

              {/* Navigation Back */}
              <div className="text-center space-y-4">
                <button
                  id="btn-return-home"
                  onClick={() => {
                    setCurrentStudentId('');
                    localStorage.removeItem('active_student_id');
                    setRole('SETUP');
                  }}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-2xl transition duration-150 flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  Selesai & Kerjakan Naskah Ujian Lain / Keluar
                  <ArrowRight className="w-4 h-4 text-slate-400 animate-pulse" />
                </button>
                <div className="text-xs text-slate-400 font-medium">
                  Created &amp; Developed by <span className="font-bold text-slate-600">@ryhnn.hannn</span>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* 4. MASTER ADMIN DASHBOARD CONSOLE */}
      {role === 'ADMIN' && (
        <AdminPanel
          students={students}
          questions={questions}
          config={config}
          studentUsers={studentUsers}
          onUpdateStudents={handleUpdateStudents}
          onUpdateQuestions={handleUpdateQuestions}
          onUpdateConfig={handleUpdateConfig}
          onUpdateStudentUsers={(users) => {
            setStudentUsers(users);
            saveStudentUsers(users);
          }}
          onExit={() => setRole('SETUP')}
        />
      )}

      {/* 5. PROCTOR (PENGAWAS RUANG) CONSOLE */}
      {role === 'PROCTOR' && (
        <ProctorPanel
          students={students}
          questions={questions}
          config={config}
          onUnlockStudent={(studentId) => {
            const updated = students.map((s) => {
              if (s.id === studentId) {
                const refreshed: Student = {
                  ...s,
                  status: 'SEDANG_MENGERJAKAN',
                  lockedReason: undefined,
                  violationCount: 0,
                  tokenUnlockCount: (s.tokenUnlockCount || 0) + 1,
                  lastActive: new Date().toISOString()
                };
                saveSingleStudent(refreshed);
                return refreshed;
              }
              return s;
            });
            setStudents(updated);
          }}
          onUnlockAllStudents={() => {
            const locked = students.filter(s => s.status === 'TERKUNCI');
            if (locked.length === 0) {
              alert('Tidak ada siswa yang berstatus TERKUNCI saat ini.');
              return;
            }
            const updated = students.map(s => {
              if (s.status === 'TERKUNCI') {
                const refreshed: Student = {
                  ...s,
                  status: 'SEDANG_MENGERJAKAN',
                  lockedReason: undefined,
                  violationCount: 0,
                  tokenUnlockCount: (s.tokenUnlockCount || 0) + 1,
                  lastActive: new Date().toISOString()
                };
                saveSingleStudent(refreshed);
                return refreshed;
              }
              return s;
            });
            setStudents(updated);
          }}
          onResetStudentAttempt={(studentId) => {
            const freshStudents = getStudents();
            const updated = freshStudents.map((s) => {
              if (s.id === studentId) {
                const refreshed: Student = {
                  ...s,
                  status: 'BELUM_MULAI',
                  answers: {},
                  score: undefined,
                  correctAnswersCount: undefined,
                  totalQuestions: undefined,
                  violationCount: 0,
                  lockedReason: undefined,
                  startTime: undefined,
                  endTime: undefined,
                  lastActive: new Date().toISOString()
                };
                saveSingleStudent(refreshed);
                return refreshed;
              }
              return s;
            });
            setStudents(updated);
          }}
          onResetStudentViolations={(studentId) => {
            const freshStudents = getStudents();
            const updated = freshStudents.map((s) => {
              if (s.id === studentId) {
                const refreshed: Student = {
                  ...s,
                  status: s.status === 'TERKUNCI' ? 'SEDANG_MENGERJAKAN' : s.status,
                  violationCount: 0,
                  lockedReason: undefined,
                  lastActive: new Date().toISOString()
                };
                saveSingleStudent(refreshed);
                return refreshed;
              }
              return s;
            });
            setStudents(updated);
          }}
          onForceSubmitStudent={(studentId) => {
            const freshStudents = getStudents();
            const target = freshStudents.find(s => s.id === studentId);
            if (!target) return;
            const metrics = getStudentMetrics(target, questions);
            const updated = freshStudents.map((s) => {
              if (s.id === studentId) {
                const refreshed: Student = {
                  ...s,
                  status: 'SELESAI',
                  score: metrics.score,
                  correctAnswersCount: metrics.correctAnswersCount,
                  totalQuestions: metrics.totalQuestions,
                  endTime: new Date().toISOString(),
                  lastActive: new Date().toISOString()
                };
                saveSingleStudent(refreshed);
                return refreshed;
              }
              return s;
            });
            setStudents(updated);
          }}
          onChangeStudentSubject={(studentId, newSubjectId) => {
            const freshStudents = getStudents();
            const updated = freshStudents.map((s) => {
              if (s.id === studentId) {
                const subStudent: Student = {
                  ...s,
                  subjectId: newSubjectId,
                  lastActive: new Date().toISOString()
                };
                const metrics = getStudentMetrics(subStudent, questions);
                const refreshed: Student = {
                  ...subStudent,
                  score: s.status === 'SELESAI' ? metrics.score : s.score,
                  correctAnswersCount: s.status === 'SELESAI' ? metrics.correctAnswersCount : s.correctAnswersCount,
                  totalQuestions: metrics.totalQuestions
                };
                saveSingleStudent(refreshed);
                return refreshed;
              }
              return s;
            });
            setStudents(updated);
          }}
          onBroadcastAnnouncement={(message, sender = 'Pengawas Ruangan', targetSubjectId = 'all', targetStudentId, targetStudentName) => {
            const newAnnouncement: BroadcastAnnouncement = {
              id: `ann_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              message: message.trim(),
              sender,
              timestamp: new Date().toISOString(),
              soundType: config.announcementSoundType || 'CHIME_AIRPORT',
              customAudioUrl: config.customAnnouncementAudioUrl,
              targetSubjectId: targetSubjectId || 'all',
              targetStudentId: targetStudentId || undefined,
              targetStudentName: targetStudentName || undefined,
              active: true
            };
            handleUpdateConfig({
              ...config,
              activeAnnouncement: newAnnouncement
            });
          }}
          onClearAnnouncement={() => {
            handleUpdateConfig({
              ...config,
              activeAnnouncement: null
            });
          }}
          onExit={() => setRole('SETUP')}
        />
      )}
    </div>
  );
}

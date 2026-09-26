import React, { useState, useEffect } from 'react';
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
  deleteSingleStudent
} from './utils/sync';
import { Student, Question, ExamConfig, StudentStatus, StudentUser } from './types';
import StudentRegistration from './components/StudentRegistration';
import StudentExam from './components/StudentExam';
import AdminPanel from './components/AdminPanel';
import { ShieldCheck, GraduationCap, Award, RefreshCw, XCircle, ArrowRight, CheckCircle2, ChevronRight, AlertTriangle, BookOpen } from 'lucide-react';

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
  const [role, setRole] = useState<'SETUP' | 'STUDENT_EXAM' | 'STUDENT_FINISHED' | 'ADMIN'>('SETUP');
  const [students, setStudents] = useState<Student[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [studentUsers, setStudentUsers] = useState<StudentUser[]>([]);
  const [config, setConfig] = useState<ExamConfig>({ durationMinutes: 15, examTitle: '' });
  const [currentStudentId, setCurrentStudentId] = useState<string>(() => {
    try {
      return localStorage.getItem('active_student_id') || '';
    } catch (e) {
      return '';
    }
  });
  const [isDbSynced, setIsDbSynced] = useState<boolean>(false);

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
    setIsDbSynced(isInitialSyncCompleted());

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
      setIsDbSynced(isInitialSyncCompleted());
    });

    return () => unsubscribe();
  }, []);

  // Monitor initial database and student sync to restore student session on refresh
  useEffect(() => {
    if (isDbSynced && currentStudentId) {
      const active = students.find((s) => s.id === currentStudentId);
      if (active) {
        if (active.status === 'SELESAI') {
          setRole('STUDENT_FINISHED');
        } else {
          setRole('STUDENT_EXAM');
        }
      } else {
        // Cached session was deleted from admin panel, wipe local cache
        setCurrentStudentId('');
        localStorage.removeItem('active_student_id');
        setRole('SETUP');
      }
    }
  }, [isDbSynced, students, currentStudentId]);

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

  // 3. STUDENT FLOW: Registration Action (Supports Reconnection after reset / reload & Randomized question sampling)
  const handleRegisterStudent = (data: { name: string; absentNumber: string; studentClass: string; subjectId: string; username?: string }) => {
    const existingStudents = getStudents();
    
    // Check if there's an existing registered student with matching username or name
    const normalizedNewName = data.name.trim().toLowerCase().replace(/\s+/g, '');
    const normalizedUsername = data.username ? data.username.trim().toLowerCase() : '';

    const existing = existingStudents.find((s) => {
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
      // Reconnect to existing session, updating basic parameters if they changed
      const updatedStudent: Student = {
        ...existing,
        username: data.username || existing.username || '',
        studentClass: data.studentClass.trim(),
        absentNumber: data.absentNumber.trim(),
        subjectId: data.subjectId,
        assignedQuestionIds: existing.assignedQuestionIds || sampleQuestionsForSubject(data.subjectId),
        lastActive: new Date().toISOString()
      };
      
      saveSingleStudent(updatedStudent);
      setCurrentStudentId(existing.id);
      localStorage.setItem('active_student_id', existing.id);
      setRole('STUDENT_EXAM');
      return;
    }

    // Create new student session object for first-time registration
    const newStudentId = `siswa_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const sampledQuestionIds = sampleQuestionsForSubject(data.subjectId);
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
      subjectId: data.subjectId,
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

  // 3c. STUDENT FLOW: Save/Update Answers in Real-time
  const handleStudentAnswersUpdate = (updatedAnswers: Record<string, number | number[]>) => {
    const freshStudents = getStudents();
    const active = freshStudents.find((s) => s.id === currentStudentId);
    if (active) {
      const updatedActive: Student = {
        ...active,
        answers: updatedAnswers,
        lastActive: new Date().toISOString()
      };
      saveSingleStudent(updatedActive);
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

    const updatedConfig: ExamConfig = {
      ...config,
      usedGlobalTokens: nextGlobalTokens
    };

    await saveSingleStudent(updatedActive);
    await saveExamConfig(updatedConfig);
    setStudents(prev => prev.map(s => s.id === updatedActive.id ? updatedActive : s));
    setConfig(updatedConfig);

    return {
      success: true,
      message: `Token valid! Kunci dibuka (Sisa kesempatan: ${remainingAttempts}x). Membuka lembar soal...`
    };
  };

  // 5. STUDENT FLOW: Final Answers Submission & Calculation
  const handleStudentSubmit = (selectedAnswers: Record<string, number | number[]>) => {
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

    saveSingleStudent(updatedActive);
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

  if (!isDbSynced) {
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
              <span className="text-amber-400 font-bold animate-pulse">MEMPROSES</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* 1. SETUP / WELCOME SCREEN */}
      {role === 'SETUP' && (
        <StudentRegistration
          students={students}
          questions={questions}
          config={config}
          studentUsers={studentUsers}
          onRegister={handleRegisterStudent}
          onAdminLogin={() => setRole('ADMIN')}
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
          onExit={async () => {
            // Delete incomplete record & exit
            if (currentStudentId) {
              await deleteSingleStudent(currentStudentId);
            }
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
              <div className="text-center">
                <button
                  id="btn-return-home"
                  onClick={() => {
                    setCurrentStudentId('');
                    localStorage.removeItem('active_student_id');
                    setRole('SETUP');
                  }}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-2xl transition duration-150 flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  Selesai & Keluar Aplikasi
                  <ArrowRight className="w-4 h-4 text-slate-400 animate-pulse" />
                </button>
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
    </div>
  );
}

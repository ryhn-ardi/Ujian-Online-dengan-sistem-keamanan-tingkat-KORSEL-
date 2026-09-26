import React, { useState, useEffect, useRef } from 'react';
import { Play, AlertTriangle, ShieldAlert, KeyRound, Clock, ChevronLeft, ChevronRight, CheckSquare, Send, CheckCircle, RefreshCw, Check, Radio, Ticket, Lock, Unlock } from 'lucide-react';
import { Student, Question, ExamConfig } from '../types';
import { getStudentFromServer } from '../utils/sync';

// Synthesizer Siren Alarm (Emergency high-frequency sweeping pitch)
function playSirenAlarm() {
  try {
    // 1. Trigger repetitive intense physical vibration to make loud mechanical rattling noise on desks
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([600, 200, 600, 200, 600, 200, 600, 200, 600, 200, 600]);
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const mainGain = ctx.createGain();
    
    osc1.type = 'sawtooth';
    osc2.type = 'square';
    
    osc1.frequency.setValueAtTime(600, ctx.currentTime);
    osc2.frequency.setValueAtTime(800, ctx.currentTime);
    
    lfo.frequency.setValueAtTime(4, ctx.currentTime); // 4 sweeps per second
    lfoGain.gain.setValueAtTime(150, ctx.currentTime); // sweep frequency amplitude
    
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);
    lfoGain.connect(osc2.frequency);
    
    const oscGain1 = ctx.createGain();
    const oscGain2 = ctx.createGain();
    // Maximize wave-shaping level
    oscGain1.gain.setValueAtTime(0.8, ctx.currentTime);
    oscGain2.gain.setValueAtTime(0.7, ctx.currentTime);
    
    osc1.connect(oscGain1);
    osc2.connect(oscGain2);
    
    oscGain1.connect(mainGain);
    oscGain2.connect(mainGain);
    
    mainGain.connect(ctx.destination);
    
    // Play with highly amplified envelope (+250% software boost)
    mainGain.gain.setValueAtTime(0, ctx.currentTime);
    mainGain.gain.linearRampToValueAtTime(2.5, ctx.currentTime + 0.1); // Ultra-loud rise
    mainGain.gain.setValueAtTime(2.5, ctx.currentTime + 4.7);
    mainGain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 5.0); // Fast fall
    
    osc1.start();
    osc2.start();
    lfo.start();
    
    osc1.stop(ctx.currentTime + 5.0);
    osc2.stop(ctx.currentTime + 5.0);
    lfo.stop(ctx.currentTime + 5.0);
    
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 5500);
  } catch (err) {
    console.error('Failed to play synthesized siren sound:', err);
  }
}

interface StudentExamProps {
  student: Student;
  questions: Question[];
  onViolation: (reason: string) => void;
  onSubmitAnswers: (answers: Record<string, number | number[]>) => void;
  onAnswersUpdate?: (answers: Record<string, number | number[]>) => void;
  onTokenUnlock?: (tokenCode: string) => Promise<{ success: boolean; message: string }>;
  onStartExam: () => void;
  onExit: () => void;
  config: ExamConfig;
}

export default function StudentExam({
  student,
  questions,
  onViolation,
  onSubmitAnswers,
  onAnswersUpdate,
  onTokenUnlock,
  onStartExam,
  onExit,
  config
}: StudentExamProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number | number[]>>(student.answers || {});
  const [fullscreenFailed, setFullscreenFailed] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [isSubmittingToken, setIsSubmittingToken] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [isCheckingProctorStatus, setIsCheckingProctorStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [unlockProgress, setUnlockProgress] = useState(0);
  const [isCurrentlyFullscreen, setIsCurrentlyFullscreen] = useState(!!document.fullscreenElement);
  const [examStatus, setExamStatus] = useState(student.status);
  const [isGraceActive, setIsGraceActive] = useState(false);
  const [violationToast, setViolationToast] = useState<{ message: string; count: number; max: number } | null>(null);
  const isUnlockingRef = useRef(false);

  const isFullscreenSupported = typeof document !== 'undefined' && !!(
    document.documentElement?.requestFullscreen ||
    (document.documentElement as any)?.webkitRequestFullscreen ||
    (document.documentElement as any)?.mozRequestFullScreen ||
    (document.documentElement as any)?.msRequestFullscreen
  );

  // Core auto-unlock sequence triggered by Admin Proktor (Channel 1) or Token (Channel 2)
  const performAutoUnlock = (customNotice = 'KUNCI TELAH DIBUKA! Membuka halaman ujian...') => {
    if (isUnlockingRef.current) return;
    isUnlockingRef.current = true;

    setStatusMessage(customNotice);
    setIsGraceActive(true); // Temporary grace for screen transition
    setUnlockProgress(100);

    setTimeout(() => {
      setExamStatus('SEDANG_MENGERJAKAN');
      setStatusMessage('');
      setUnlockProgress(0);
      isUnlockingRef.current = false;
      setIsCurrentlyFullscreen(!!document.fullscreenElement);

      // Brief grace period (2.5 seconds) so animations complete without accidental trigger
      setTimeout(() => {
        setIsGraceActive(false);
        setIsCurrentlyFullscreen(!!document.fullscreenElement);
      }, 2500);
    }, 600);
  };

  const prevStudentStatusRef = useRef(student.status);

  // Keep local exam status synchronized with student.status prop from Firestore
  useEffect(() => {
    // Only auto-unlock if the server student status transitioned from TERKUNCI to SEDANG_MENGERJAKAN (Proctor remote action)
    if (prevStudentStatusRef.current === 'TERKUNCI' && student.status === 'SEDANG_MENGERJAKAN') {
      performAutoUnlock('KUNCI TELAH DIBUKA OLEH PENGAWAS!');
    } else if (!isUnlockingRef.current) {
      setExamStatus(student.status);
    }
    prevStudentStatusRef.current = student.status;
  }, [student.status]);

  // Periodic fallback status checks every 1s when locked (detects admin unlock even if WebSocket/background tab suspended)
  useEffect(() => {
    if (examStatus !== 'TERKUNCI') return;

    const interval = setInterval(async () => {
      if (isUnlockingRef.current) return;
      try {
        const serverStudent = await getStudentFromServer(student.id);
        if (serverStudent && serverStudent.status === 'SEDANG_MENGERJAKAN' && prevStudentStatusRef.current === 'TERKUNCI') {
          performAutoUnlock('KUNCI TELAH DIBUKA OLEH PENGAWAS!');
        }
      } catch (err) {
        console.error('Background check status failed:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [examStatus, student.id]);

  // Synchronize local answers state if student answers are reset/modified from parent (e.g. locks/resets)
  useEffect(() => {
    setSelectedAnswers(student.answers || {});
  }, [student.answers]);

  const initialWidth = useRef(window.innerWidth);
  const initialHeight = useRef(window.innerHeight);
  const examStartedRef = useRef(false);
  const lastViolationTime = useRef(0);

  // Set up timer based on remaining time
  useEffect(() => {
    if (examStatus !== 'SEDANG_MENGERJAKAN') return;

    if (!student.startTime) {
      // First time starting
      const endTime = new Date(Date.now() + config.durationMinutes * 60 * 1000).toISOString();
      const startTime = new Date().toISOString();
      setTimeRemaining(config.durationMinutes * 60);
    } else {
      // Resume remaining time
      const end = new Date(student.endTime || '').getTime();
      const remain = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setTimeRemaining(remain);
    }
  }, [examStatus, student.startTime, student.endTime, config.durationMinutes]);

  // Countdown clock loop
  useEffect(() => {
    if (examStatus !== 'SEDANG_MENGERJAKAN' || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Auto submit when time runs out
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [examStatus, timeRemaining]);

  // Request Fullscreen on entering active exam state
  const requestFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      setFullscreenFailed(false);
      setIsCurrentlyFullscreen(true);
    } catch (err) {
      console.error('Request fullscreen failed:', err);
      setFullscreenFailed(true);
      setIsCurrentlyFullscreen(false);
    }
  };

  const triggerViolation = (reason: string) => {
    if (config.strictSecurityEnabled === false) return; // Ignore if security is off
    if (isGraceActive) return; // Skip if in brief grace period

    const now = Date.now();
    if (now - lastViolationTime.current < 1500) return; // Prevent double trigger
    lastViolationTime.current = now;

    // Siren alarm if enabled in config
    if (config.sirenAlarmEnabled !== false) {
      playSirenAlarm();
    }

    const tolerance = config.maxAllowedViolations !== undefined ? config.maxAllowedViolations : 3;
    const maxAllowed = (student.tokenUnlockCount && student.tokenUnlockCount > 0) ? 1 : tolerance;
    const nextCount = (student.violationCount || 0) + 1;

    setViolationToast({
      message: reason,
      count: nextCount,
      max: maxAllowed
    });

    if (nextCount >= maxAllowed) {
      setExamStatus('TERKUNCI');
    }

    onViolation(reason);
  };

  // Monitor Fullscreen Exit and Focus shifts (THE PROCTOR SENTINELS)
  useEffect(() => {
    if (examStatus !== 'SEDANG_MENGERJAKAN') return;
    if (config.strictSecurityEnabled === false) return; // Ignore if security is off

    let blurTimeout: NodeJS.Timeout | null = null;

    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsCurrentlyFullscreen(isFs);
      if (!isFs && !isGraceActive) {
        triggerViolation('Mencoba Keluar dari Layar Penuh (Fullscreen)');
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && !isGraceActive) {
        triggerViolation('Berpindah Tab / Meminimalkan Jendela Browser');
      }
    };

    const handleWindowBlur = () => {
      if (isGraceActive) return;
      if (blurTimeout) clearTimeout(blurTimeout);
      blurTimeout = setTimeout(() => {
        if ((!document.hasFocus() || document.hidden) && !isGraceActive) {
          triggerViolation('Membuka Aplikasi Lain / Keluar dari Fokus Layar');
        }
      }, 500);
    };

    const handleWindowFocus = () => {
      if (blurTimeout) {
        clearTimeout(blurTimeout);
        blurTimeout = null;
      }
    };

    const handleResize = () => {
      if (isGraceActive) return;
      const parsedWidthDiff = Math.abs(window.innerWidth - initialWidth.current);
      const parsedHeightDiff = Math.abs(window.innerHeight - initialHeight.current);
      
      // If viewport drops significantly during exam, could be split screen
      if (window.innerWidth < 640 || parsedWidthDiff > 250 || parsedHeightDiff > 200) {
        triggerViolation('Mendeteksi Perubahan Jendela (Split Screen / Floating Apps)');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isGraceActive) return;
      if (
        e.key === 'Escape' ||
        e.key === 'F11' ||
        e.key === 'F12' ||
        (e.altKey && e.key === 'Tab') ||
        (e.ctrlKey && ['c', 'v', 'u', 'p', 's', 'a'].includes(e.key.toLowerCase())) ||
        (e.metaKey && ['c', 'v', 'u', 'p', 's', 'a'].includes(e.key.toLowerCase()))
      ) {
        e.preventDefault();
        triggerViolation(`Menekan Tombol Terlarang (${e.key})`);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (isGraceActive) return;
      e.preventDefault();
      triggerViolation('Klik Kanan Terlarang');
    };

    // Quick delay listeners to allow user to enter fullscreen without immediate triggers
    const setupTimer = setTimeout(() => {
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      document.addEventListener('contextmenu', handleContextMenu);
      window.addEventListener('blur', handleWindowBlur);
      window.addEventListener('focus', handleWindowFocus);
      window.addEventListener('resize', handleResize);
      window.addEventListener('keydown', handleKeyDown);
      examStartedRef.current = true;
    }, 800);

    return () => {
      clearTimeout(setupTimer);
      if (blurTimeout) clearTimeout(blurTimeout);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [examStatus, config.strictSecurityEnabled, isGraceActive]);

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    const questionObj = questions.find(q => q.id === questionId);
    let updated;

    if (questionObj?.type === 'MR') {
      const currentSelection = Array.isArray(selectedAnswers[questionId])
        ? (selectedAnswers[questionId] as number[])
        : selectedAnswers[questionId] !== undefined && selectedAnswers[questionId] !== null
          ? [selectedAnswers[questionId] as number]
          : [];

      let nextSelection;
      if (currentSelection.includes(optionIndex)) {
        nextSelection = currentSelection.filter(item => item !== optionIndex);
      } else {
        if (currentSelection.length >= 2) {
          // Keep max 2 by replacing the oldest (index 0)
          nextSelection = [...currentSelection.slice(1), optionIndex];
        } else {
          nextSelection = [...currentSelection, optionIndex];
        }
      }
      updated = { ...selectedAnswers, [questionId]: nextSelection };
    } else {
      updated = { ...selectedAnswers, [questionId]: optionIndex };
    }

    setSelectedAnswers(updated);
    // Silent background sync
    student.answers = updated;
    if (onAnswersUpdate) {
      onAnswersUpdate(updated);
    }
  };

  const handleAutoSubmit = () => {
    // Escape fullscreen peacefully
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onSubmitAnswers(selectedAnswers);
  };

  const triggerDirectSubmit = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onSubmitAnswers(selectedAnswers);
  };

  const activeTokens = config.unlockTokens && config.unlockTokens.length > 0
    ? config.unlockTokens
    : ['TOKEN-1', 'TOKEN-2'];
  const maxTokens = activeTokens.length;
  const usedTokensList = student.usedTokens || [];
  const globalBurnedTokens = config.usedGlobalTokens || [];
  const usedCount = usedTokensList.length;
  const remainingAttempts = Math.max(0, maxTokens - usedCount);
  const isTokenExhausted = remainingAttempts <= 0;

  const handleTokenSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tokenInput.trim()) {
      setTokenError('Silakan ketik kode token terlebih dahulu.');
      return;
    }

    if (isTokenExhausted) {
      setTokenError(`Batas token Anda sudah habis (${maxTokens}/${maxTokens} kali). Harap hubungi Proktor.`);
      return;
    }

    // Instant check: if this specific token was already used globally or on this account
    const normalized = tokenInput.trim().toUpperCase();
    const usedUpper = (student.usedTokens || []).map(t => t.trim().toUpperCase());
    const globalUpper = (config.usedGlobalTokens || []).map(t => t.trim().toUpperCase());
    
    if (usedUpper.includes(normalized) || globalUpper.includes(normalized)) {
      setTokenError(`Token "${tokenInput.trim()}" sudah TERPAKAI dan tidak bisa digunakan lagi! Harap minta token berikutnya dari Pengawas.`);
      return;
    }

    if (isSubmittingToken) return;
    setIsSubmittingToken(true);
    setTokenError('');

    try {
      if (onTokenUnlock) {
        // Direct fullscreen request immediately inside the click handler
        if (document.documentElement.requestFullscreen) {
          try {
            await document.documentElement.requestFullscreen();
            setIsCurrentlyFullscreen(true);
          } catch (e) {
            console.warn('Direct requestFullscreen error:', e);
          }
        }
        const res = await onTokenUnlock(tokenInput.trim());
        if (res.success) {
          performAutoUnlock(res.message);
          setTokenInput('');
        } else {
          setTokenError(res.message);
        }
      } else {
        if (activeTokens.map(t => t.toUpperCase()).includes(normalized)) {
          if (document.documentElement.requestFullscreen) {
            try {
              await document.documentElement.requestFullscreen();
              setIsCurrentlyFullscreen(true);
            } catch (e) {}
          }
          performAutoUnlock('Token Valid! Membuka halaman ujian...');
          setTokenInput('');
          onViolation('unlocked_locally');
        } else {
          setTokenError('Kode token salah atau tidak valid.');
        }
      }
    } catch (err: any) {
      setTokenError(err?.message || 'Gagal memverifikasi token.');
    } finally {
      setIsSubmittingToken(false);
    }
  };

  const handleManualCheckProctor = async () => {
    setIsCheckingProctorStatus(true);
    setStatusMessage('Menghubungkan ke server Proktor...');

    try {
      const serverStudent = await getStudentFromServer(student.id);
      if (serverStudent) {
        if (serverStudent.status !== 'TERKUNCI') {
          performAutoUnlock('KUNCI TELAH DIBUKA OLEH PROKTOR! Membuka lembar ujian...');
        } else {
          setStatusMessage('');
          alert('Status ujian Anda masih TERKUNCI di komputer Proktor. Silakan tunggu Proktor menekan "Unlock" atau gunakan Token Mandiri (Channel 2).');
        }
      } else {
        setStatusMessage('');
        alert('Gagal mengambil data dari server. Silakan coba lagi.');
      }
    } catch (err) {
      console.error(err);
      setStatusMessage('');
      alert('Gagal tersambung ke server.');
    } finally {
      setIsCheckingProctorStatus(false);
    }
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // 1. --- RENDERING: TERKUNCI MODE (BLOCKED EXAM WITH DUAL-CHANNEL UNLOCK) ---
  if (examStatus === 'TERKUNCI') {
    return (
      <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col justify-center items-center p-4 sm:p-6 text-white text-center z-50 overflow-y-auto font-sans">
        <div className="max-w-xl w-full bg-slate-900 rounded-3xl p-6 sm:p-8 border border-red-500/30 shadow-2xl relative my-auto">
          <div className="inline-flex items-center justify-center p-4 bg-red-500/10 rounded-2xl mb-4 border border-red-500/20">
            <ShieldAlert className="w-12 h-12 text-rose-500 animate-bounce" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-1 text-white uppercase">Akses Ujian Terkunci</h1>
          <p className="text-xs text-rose-400 font-mono tracking-wider mb-5">INTEGRITY & PROCTOR SECURITY ACTIVATED</p>

          {/* Student Info & Violation Details */}
          <div className="bg-slate-950/80 p-4 border border-white/10 rounded-2xl text-left mb-6 space-y-2">
            <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
              <span>Identitas Siswa:</span>
              <span className="text-white font-bold">{student.name} (Absen {student.absentNumber}) - Kelas {student.studentClass}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
              <span>Alasan Terkunci:</span>
              <span className="text-yellow-400 font-bold">{student.lockedReason || 'Keluar dari layar penuh'}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
              <span>Jumlah Pelanggaran:</span>
              <span className="text-rose-400 font-bold">{student.violationCount || 0} Kali</span>
            </div>
          </div>

          {/* Global Real-time Unlock Status Notice */}
          {statusMessage && (
            <div className="mb-6 p-4 bg-emerald-950/80 border border-emerald-500/40 rounded-2xl text-left flex items-center gap-3 animate-pulse">
              <span className="w-3 h-3 rounded-full bg-emerald-400 shrink-0 animate-ping" />
              <p className="text-xs text-emerald-300 font-black leading-relaxed uppercase tracking-wide">
                {statusMessage}
              </p>
            </div>
          )}

          {/* DUAL CHANNEL SYSTEM EXPLANATION */}
          <div className="text-left mb-4">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Pilihan Buka Kunci (Dual-Channel):
            </span>
            <p className="text-xs text-slate-400 leading-relaxed">
              Anda dapat membuka lembar ujian melalui 2 saluran resmi di bawah ini. Jawaban Anda tetap tersimpan utuh dan aman.
            </p>
          </div>

          <div className="space-y-4 text-left">
            {/* CHANNEL 1: AUTO-UNLOCK VIA REMOTE ADMIN PROKTOR */}
            <div className="p-4 bg-slate-950/60 border border-indigo-500/30 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
                    <Radio className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wide font-mono">Channel 1: Unlock Otomatis (Proktor)</h3>
                    <span className="text-[10px] text-slate-400">Terbuka langsung jika pengawas klik "Unlock" di dasbor admin</span>
                  </div>
                </div>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" title="Monitoring Real-time" />
              </div>

              <p className="text-[11px] text-slate-300 leading-normal">
                Sistem memantau perintah Proktor secara live. Jika Proktor membuka kunci dari komputernya, layar ini akan otomatis terbuka seketika tanpa token.
              </p>

              <button
                type="button"
                id="btn-check-proctor-status"
                disabled={isCheckingProctorStatus}
                onClick={handleManualCheckProctor}
                className="w-full py-2 bg-indigo-900/40 hover:bg-indigo-900/70 border border-indigo-500/40 text-indigo-200 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingProctorStatus ? 'animate-spin' : ''}`} />
                {isCheckingProctorStatus ? 'Memeriksa ke Proktor...' : 'Cek Status ke Proktor Sekarang'}
              </button>
            </div>

            {/* CHANNEL 2: CUSTOMIZABLE TOKEN SYSTEM */}
            <div className="p-4 bg-slate-950/60 border border-amber-500/30 rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg">
                    <Ticket className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wide font-mono">Channel 2: Token Khusus (Mandiri)</h3>
                    <span className="text-[10px] text-slate-400">Disediakan pengawas di ruangan kelas</span>
                  </div>
                </div>

                {/* Quota Badge */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-mono font-bold self-start sm:self-auto">
                  <span className="text-slate-400">Sisa Kuota Token:</span>
                  <span className={remainingAttempts > 0 ? 'text-amber-400' : 'text-rose-400'}>
                    {remainingAttempts} / {maxTokens} Kali
                  </span>
                </div>
              </div>

              {/* Mini Token Usage Indicators */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Array.from({ length: maxTokens }).map((_, idx) => {
                  const isUsed = idx < usedCount;
                  return (
                    <span
                      key={idx}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-md flex items-center gap-1 border ${
                        isUsed
                          ? 'bg-rose-950/50 border-rose-500/30 text-rose-300 line-through'
                          : 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300'
                      }`}
                    >
                      {isUsed ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                      Token #{idx + 1} {isUsed ? '(Terpakai)' : '(Tersedia)'}
                    </span>
                  );
                })}
              </div>

              {/* Form Input Token */}
              {!isTokenExhausted ? (
                <form onSubmit={handleTokenSubmit} className="space-y-2 pt-1">
                  {usedCount > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-950/40 border border-amber-500/30 rounded-lg text-[10px] text-amber-300 font-mono">
                      <span>ℹ</span>
                      <span>
                        Token #{usedCount} sudah Anda gunakan. Masukkan <strong>Token #{usedCount + 1}</strong> untuk membuka ujian ini.
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={usedCount > 0 ? `Ketik Token Ke-${usedCount + 1} dari Pengawas...` : "Ketik Kode Token dari Pengawas..."}
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      disabled={isSubmittingToken}
                      className="flex-1 px-3 py-2.5 bg-slate-900 border border-amber-500/40 rounded-xl text-white font-mono text-sm tracking-wider placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 uppercase font-bold"
                    />
                    <button
                      type="submit"
                      id="btn-submit-token"
                      disabled={isSubmittingToken}
                      className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-4 py-2.5 rounded-xl transition text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-sm disabled:opacity-50 active:scale-[0.98]"
                    >
                      <KeyRound className="w-4 h-4" />
                      {isSubmittingToken ? 'Verifikasi...' : 'Buka Ujian'}
                    </button>
                  </div>

                  {tokenError && (
                    <p className="text-xs text-rose-400 font-semibold mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {tokenError}
                    </p>
                  )}

                  <p className="text-[10px] text-slate-400 leading-normal italic">
                    *Masing-masing token hanya berlaku 1 kali per akun/username. Jika Token 1 sudah pernah dipakai, Anda wajib memasukkan Token 2.
                  </p>
                </form>
              ) : (
                <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-300">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    Batas Token Mandiri Anda Telah Habis
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Anda telah menggunakan seluruh jatah ({maxTokens}x) token pengulangan mandiri. Harap segera melapor kepada Proktor utama di ruangan agar membuka kunci Anda secara remote melalui <strong>Channel 1</strong>.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 1b. --- RENDERING: BLOCKED SCENE IF EXITING FULLSCREEN ---
  if (config.strictSecurityEnabled !== false && isFullscreenSupported && !isCurrentlyFullscreen && !isGraceActive && examStatus === 'SEDANG_MENGERJAKAN') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 text-white text-center font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-red-600 animate-pulse"></div>
          
          <div className="inline-flex items-center justify-center p-4 bg-red-500/10 rounded-2xl mb-6 text-red-500">
            <AlertTriangle className="w-12 h-12" />
          </div>
          
          <h2 className="text-xl font-extrabold tracking-tight text-red-400 mb-2 uppercase">Layar Ujian Dibekukan</h2>
          <p className="text-slate-300 text-sm mb-6 leading-relaxed">
            Anda terdeteksi keluar dari mode Layar Penuh (Fullscreen). Silakan klik tombol di bawah untuk masuk kembali ke mode ujian.
          </p>

          <div className="bg-slate-950/85 p-4 rounded-xl border border-white/5 mb-6 text-left text-xs space-y-1.5 font-mono">
            <div className="flex justify-between text-slate-400">
              <span>Siswa:</span>
              <span className="text-white font-bold">{student.name}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Pelanggaran Saat Ini:</span>
              <span className="text-red-400 font-bold">{student.violationCount || 0} Kali</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Batas Toleransi:</span>
              <span className="text-yellow-400 font-bold">{config.maxAllowedViolations !== undefined ? config.maxAllowedViolations : 3} Kali</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Sisa Kesempatan:</span>
              <span className="text-emerald-400 font-extrabold">
                {Math.max(0, (config.maxAllowedViolations !== undefined ? config.maxAllowedViolations : 3) - (student.violationCount || 0))} Kali
              </span>
            </div>
          </div>

          <button
            type="button"
            id="btn-re-enter-fullscreen"
            onClick={async () => {
              await requestFullscreen();
            }}
            className="w-full bg-red-650 bg-red-600 hover:bg-red-500 text-white font-black py-3.5 px-6 rounded-xl transition duration-155 flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-[0.98]"
          >
            <RefreshCw className="w-4 h-4" />
            Kembali ke Layar Penuh (Ujian)
          </button>
        </div>
      </div>
    );
  }

  // 2. --- RENDERING: PINDAH LAYAR PENUH INTI ---
  if (examStatus === 'BELUM_MULAI') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 text-white text-center font-sans">
        <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-xl">
          <div className="inline-flex items-center justify-center p-4 bg-teal-500/10 rounded-2xl mb-6 text-teal-400">
            <Play className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Masuk Layar Pengawasan</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            Untuk memulai pengerjaan, Anda harus menyetujui program masuk ke Layar Penuh. Hal ini mencegah gangguan selama ujian berlangsung.
          </p>

          {fullscreenFailed && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs text-left">
              Gagal mematikan mode desktop normal. Pastikan izin fullscreen aktif di browser Anda atau tekan tombol manual di bawah ini.
            </div>
          )}

          <div className="space-y-3">
            <button
              id="btn-trigger-fullscreen-start"
              onClick={async () => {
                await requestFullscreen();
                onStartExam();
              }}
              className="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold py-3.5 px-6 rounded-xl transition duration-200 flex items-center justify-center gap-2 shadow-lg"
            >
              Masukkan Layar Penuh & Mulai
            </button>
            <button
              id="btn-abort-exam"
              onClick={onExit}
              className="w-full bg-transparent hover:bg-slate-700 font-semibold text-slate-300 border border-slate-600/50 py-2.5 rounded-xl transition duration-150 text-sm"
            >
              Kembali
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. --- RENDERING: SOAL AKTIF (ACTIVE EXAM SESSION) ---
  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans relative select-none">
      {/* Real-time Violation Alert Toast */}
      {violationToast && (
        <div className="fixed top-20 inset-x-4 max-w-lg mx-auto z-50 animate-bounce">
          <div className="p-4 bg-red-600 text-white rounded-2xl shadow-2xl border-2 border-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-6 h-6 text-white shrink-0 animate-pulse" />
              <div className="text-left">
                <p className="font-extrabold text-sm uppercase tracking-wide">
                  Pelanggaran Terdeteksi! ({violationToast.count}/{violationToast.max} Kali)
                </p>
                <p className="text-xs text-red-100 font-mono">
                  {violationToast.message}
                </p>
              </div>
            </div>
            <button
              onClick={() => setViolationToast(null)}
              className="px-2.5 py-1 bg-black/20 hover:bg-black/40 text-white rounded-lg text-xs font-bold cursor-pointer"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Header Panel */}
      <header className="bg-slate-900 text-white shadow-sm border-b border-slate-800 px-6 py-4 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-red-600 text-white font-mono text-[10px] font-bold tracking-widest rounded uppercase">
                PROCTOR ACTIVE
              </span>
              <span className="text-slate-400 text-xs font-mono">
                KELAS {student.studentClass} • ABSEN {student.absentNumber}
              </span>
            </div>
            <h2 className="text-lg font-bold truncate tracking-tight">{student.name}</h2>
          </div>

          <div className="flex items-center gap-4">
            {/* Timer countdown view */}
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl text-yellow-400 font-mono font-bold text-lg min-w-[120px] justify-center shadow-inner">
              <Clock className="w-5 h-5 shrink-0" />
              <span>{formatTime(timeRemaining)}</span>
            </div>

            <button
              id="btn-direct-submit-header"
              onClick={() => setShowConfirmSubmit(true)}
              className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-xl text-sm transition flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              Kirim
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout Area */}
      <main className="max-w-5xl mx-auto w-full flex-1 px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Hand: Question Box */}
        <section className="lg:col-span-2 space-y-6">
          {isGraceActive && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm animate-pulse">
              <div className="flex items-center gap-2.5 text-xs text-emerald-800 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                <span>UJIAN DIAKTIFKAN KEMBALI! Silakan lanjut mengerjakan soal.</span>
              </div>
              {isFullscreenSupported && (
                <button
                  type="button"
                  id="btn-re-enter-fs-grace"
                  onClick={async () => {
                    await requestFullscreen();
                    setIsGraceActive(false);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] rounded-lg tracking-wide uppercase cursor-pointer"
                >
                  Aktifkan Layar Penuh
                </button>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-6 md:p-8 relative">
            
            {/* Index heading */}
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-bold text-indigo-500 uppercase font-mono tracking-widest">
                Pertanyaan {currentQuestionIndex + 1} dari {questions.length}
              </span>
              <span className="px-2.5 py-1 bg-slate-100 text-slate-500 text-xs rounded-full font-semibold font-mono">
                {selectedAnswers[currentQuestion.id] !== undefined && 
                 (!Array.isArray(selectedAnswers[currentQuestion.id]) || (selectedAnswers[currentQuestion.id] as number[]).length > 0)
                  ? `✓ Terjawab${currentQuestion.type === 'MR' ? ` (${(selectedAnswers[currentQuestion.id] as number[]).length}/2)` : ''}`
                  : '• Belum Terjawab'}
              </span>
            </div>

            {currentQuestion.type === 'MR' && (
              <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-850 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 mr-1 shrink-0 animate-ping" />
                <span>PILIHAN GANDA 2 JAWABAN: Pilih tepat 2 (dua) opsi jawaban yang benar!</span>
              </div>
            )}

            {/* Question Text */}
            <h3 className="text-lg font-bold text-slate-800 leading-relaxed mb-8">
              {currentQuestion.questionText}
            </h3>

            {/* Multiple Choice Options */}
            <div className="space-y-4">
              {currentQuestion.options.map((option, idx) => {
                const labelLetter = String.fromCharCode(65 + idx); // A, B, C, D
                const qAns = selectedAnswers[currentQuestion.id];
                const isSelected = Array.isArray(qAns) ? qAns.includes(idx) : qAns === idx;
                
                return (
                  <button
                    key={idx}
                    id={`btn-option-${idx}`}
                    onClick={() => handleSelectOption(currentQuestion.id, idx)}
                    className={`w-full text-left px-5 py-4 rounded-xl border text-sm transition-all flex items-center justify-between gap-4 ${
                      isSelected
                        ? 'bg-indigo-50/70 border-indigo-500 text-indigo-900 font-semibold ring-1 ring-indigo-500'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold font-mono text-sm border shrink-0 ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-700 text-white'
                          : 'bg-white border-slate-300 text-slate-500'
                      }`}>
                        {labelLetter}
                      </span>
                      <span className="leading-snug">{option}</span>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between">
            <button
              id="btn-prev-question"
              disabled={currentQuestionIndex === 0}
              onClick={() => setCurrentQuestionIndex((p) => p - 1)}
              className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 disabled:opacity-40 transition flex items-center gap-1 text-sm shadow-xs"
            >
              <ChevronLeft className="w-4 h-4" />
              Kembali
            </button>

            {currentQuestionIndex < questions.length - 1 ? (
              <button
                id="btn-next-question"
                onClick={() => setCurrentQuestionIndex((p) => p + 1)}
                className="px-5 py-2.5 bg-slate-900 border border-slate-950 text-white rounded-xl font-bold hover:bg-slate-800 transition flex items-center gap-1 text-sm shadow-xs"
              >
                Selanjutnya
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                id="btn-finish-exam"
                onClick={() => setShowConfirmSubmit(true)}
                className="px-6 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl font-extrabold transition flex items-center gap-1 text-sm shadow-sm"
              >
                Selesaikan Ujian
                <CheckCircle className="w-5 h-5 text-slate-950" />
              </button>
            )}
          </div>
        </section>

        {/* Right Hand: Question Grid Index */}
        <section className="bg-white rounded-2xl shadow-xs border border-slate-200 p-6 space-y-6 h-fit">
          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 font-mono uppercase tracking-wide">
            <CheckSquare className="w-4 h-4 text-indigo-500" />
            Navigasi Lembar Soal
          </h4>
          
          <div className="grid grid-cols-5 gap-2.5">
            {questions.map((q, idx) => {
              const qAns = selectedAnswers[q.id];
              const isAnswered = qAns !== undefined && qAns !== null && (!Array.isArray(qAns) || qAns.length > 0);
              const isCurrent = currentQuestionIndex === idx;

              return (
                <button
                  key={q.id}
                  id={`btn-nav-sq-${idx}`}
                  onClick={() => setCurrentQuestionIndex(idx)}
                  className={`aspect-square rounded-xl text-xs font-bold font-mono transition-all border flex items-center justify-center ${
                    isCurrent
                      ? 'bg-indigo-600 border-indigo-700 text-white ring-2 ring-indigo-250'
                      : isAnswered
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500'
                  }`}
                >
                  {(idx + 1).toString().padStart(2, '0')}
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-2 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 bg-indigo-600 rounded"></span>
              <span>Posisi Soal Aktif</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 bg-emerald-100 border border-emerald-300 rounded"></span>
              <span>Sudah Terjawab</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 bg-slate-50 border border-slate-200 rounded"></span>
              <span>Belum Dikerjakan</span>
            </div>
          </div>
        </section>
      </main>

      {/* Strict Guardian Warning watermark at bottom */}
      <footer className="bg-slate-100 text-center py-3 text-[10px] text-slate-400 font-mono tracking-wider border-t border-slate-200 select-none">
        PROKTOR AKTIF • KUNCI MANDIRI • JANGAN KELUAR FULLSCREEN ATAU BERPINDAH TAB
      </footer>

      {/* Manual Submit Confirmation Dialog */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-6 text-center animate-fade-in">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Selesaikan Ujian?</h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              Anda telah menjawab {Object.keys(selectedAnswers).length} dari {questions.length} soal. Setelah Anda mengonfirmasi pengiriman, jawaban Anda tidak dapat diubah lagi.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                id="btn-cancel-submit"
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-xl transition"
              >
                Batal
              </button>
              <button
                type="button"
                id="btn-confirm-submit-active"
                onClick={triggerDirectSubmit}
                className="flex-1 py-2.5 text-sm font-extrabold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-md"
              >
                Ya, Kirim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

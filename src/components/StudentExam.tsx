import React, { useState, useEffect, useRef } from 'react';
import { Play, AlertTriangle, Wifi, WifiOff, CloudOff, ShieldAlert, KeyRound, Clock, ChevronLeft, ChevronRight, CheckSquare, Send, CheckCircle, CheckCircle2, RefreshCw, Check, Radio, Ticket, Lock, Unlock, BellOff, Smartphone, Volume2, Info, BookOpen, Megaphone, X, ChevronDown, ChevronUp, Maximize2, Minimize2, LayoutGrid, History } from 'lucide-react';
import { Student, Question, ExamConfig, BroadcastAnnouncement, ViolationCategory, ViolationLogEntry } from '../types';
import { getStudentFromServer, getExamSubjects } from '../utils/sync';
import { RichExamContent } from './RichExamContent';
import { useRealtimeWIB } from '../utils/timeWib';
import { playAlarmSound, playAnnouncementSound, warmUpAlarmAudioContext, stopAllAlarmSounds } from '../utils/alarmAudio';
import { createViolationLogEntry, formatViolationTime, getViolationCategoryMeta } from '../utils/violationHelper';

export function warmUpAudioContext(): AudioContext | null {
  return warmUpAlarmAudioContext();
}

function checkIsFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement
  );
}

interface StudentExamProps {
  student: Student;
  questions: Question[];
  onViolation: (reason: string, category?: ViolationCategory) => void;
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
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncStatus, setSyncStatus] = useState<'SYNCED' | 'SAVING' | 'OFFLINE'>('SYNCED');

  // Network online/offline listener for unobtrusive real-time indicator
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus('SYNCED');
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('OFFLINE');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const currentAttempt = student.attemptNumber || 1;
  const answerStorageKey = `exam_answers_${student.id}_att${currentAttempt}`;
  const legacyAnswerStorageKey = `exam_answers_${student.id}`;
  const prevAttemptRef = useRef<number>(currentAttempt);

  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number | number[]>>(() => {
    const serverAnswersEmpty = !student.answers || Object.keys(student.answers).length === 0;
    if (student.status === 'BELUM_MULAI' && serverAnswersEmpty) {
      try {
        localStorage.removeItem(answerStorageKey);
        localStorage.removeItem(legacyAnswerStorageKey);
      } catch (e) {}
      return {};
    }
    try {
      const localAttempt = localStorage.getItem(answerStorageKey);
      const localLegacy = currentAttempt === 1 ? localStorage.getItem(legacyAnswerStorageKey) : null;
      const local = localAttempt || localLegacy;
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed && typeof parsed === 'object') {
          return { ...(student.answers || {}), ...parsed };
        }
      }
    } catch (e) {}
    return student.answers || {};
  });
  const [fullscreenFailed, setFullscreenFailed] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [isSubmittingToken, setIsSubmittingToken] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [isCheckingProctorStatus, setIsCheckingProctorStatus] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [unlockProgress, setUnlockProgress] = useState(0);
  const [isCurrentlyFullscreen, setIsCurrentlyFullscreen] = useState<boolean>(() => checkIsFullscreenActive());
  const [needsFullscreenResume, setNeedsFullscreenResume] = useState(false);
  const [examStatus, setExamStatus] = useState(student.status);
  const [isGraceActive, setIsGraceActive] = useState(false);
  const [violationToast, setViolationToast] = useState<{ message: string; count: number; max: number } | null>(null);
  const [passiveToast, setPassiveToast] = useState<{ reason: string; category: ViolationCategory; count: number } | null>(null);
  const [localViolationCount, setLocalViolationCount] = useState<number>(student.violationCount || 0);
  const [localViolationLogs, setLocalViolationLogs] = useState<ViolationLogEntry[]>(student.violationLogs || []);
  const [showViolationDetailsPanel, setShowViolationDetailsPanel] = useState(false);
  const [dndConfirmed, setDndConfirmed] = useState(false);
  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [showQuestionGridDrawer, setShowQuestionGridDrawer] = useState(false);

  const isGraceActiveRef = useRef(false);
  isGraceActiveRef.current = isGraceActive;
  const needsFullscreenResumeRef = useRef(false);
  needsFullscreenResumeRef.current = needsFullscreenResume;
  const lockWritePendingUntilRef = useRef(0);
  const graceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isStrictMode = config.strictSecurityEnabled !== false;
  const isPassiveLoggingMode = !isStrictMode && config.passiveViolationLoggingEnabled !== false;
  const isMonitoringActive = isStrictMode || isPassiveLoggingMode;

  useEffect(() => {
    setLocalViolationCount(student.violationCount || 0);
    if (Array.isArray(student.violationLogs)) {
      setLocalViolationLogs(student.violationLogs);
    }
  }, [student.violationCount, student.violationLogs]);

  const handleTestAudioInExam = () => {
    if (isTestingAudio) {
      stopAllAlarmSounds();
      setIsTestingAudio(false);
      return;
    }
    warmUpAlarmAudioContext();
    setIsTestingAudio(true);
    playAlarmSound(config);
    setTimeout(() => {
      setIsTestingAudio(false);
    }, 4000);
  };

  const getAlarmTypeName = (type?: string) => {
    switch (type) {
      case 'BUZZER': return 'Buzzer Elektronik';
      case 'NUCLEAR': return 'Sirine Darurat Nuklir';
      case 'BELL': return 'Lonceng Peringatan';
      case 'HORN': return 'Klakson Peringatan Ganda';
      case 'AMBULANCE': return 'Sirine Dua Nada Ambulans';
      case 'CUSTOM_AUDIO': return config.customAlarmName ? `Kustom (${config.customAlarmName})` : 'Audio Kustom';
      default: return 'Sirine Polisi / SWAT';
    }
  };

  const [displayedAnnouncement, setDisplayedAnnouncement] = useState<BroadcastAnnouncement | null>(null);
  const [isAnnouncementMinimized, setIsAnnouncementMinimized] = useState(false);
  const dismissedAnnouncementIdRef = useRef<string>('');
  const isUnlockingRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const wibClock = useRealtimeWIB();

  // Real-time broadcast announcement listener (Supports mass broadcast & 1-on-1 private proctor message)
  useEffect(() => {
    const ann = config.activeAnnouncement;
    if (ann && ann.active && ann.id !== dismissedAnnouncementIdRef.current) {
      // 1. Check if announcement is targeted to a specific subject
      if (ann.targetSubjectId && ann.targetSubjectId !== 'all' && ann.targetSubjectId !== student.subjectId) {
        return;
      }
      // 2. Check if announcement is targeted to a specific student (1-on-1 private message)
      if (
        ann.targetStudentId &&
        ann.targetStudentId !== 'all' &&
        ann.targetStudentId !== student.id &&
        ann.targetStudentId !== student.username
      ) {
        return;
      }

      setDisplayedAnnouncement(ann);
      setIsAnnouncementMinimized(false);
      // Play polite, non-startling announcement chime
      playAnnouncementSound({
        announcementSoundType: ann.soundType || config.announcementSoundType || 'CHIME_AIRPORT',
        customAnnouncementAudioUrl: ann.customAudioUrl || config.customAnnouncementAudioUrl
      });
    } else if (!ann || !ann.active) {
      setDisplayedAnnouncement(null);
      setIsAnnouncementMinimized(false);
    }
  }, [config.activeAnnouncement, student.subjectId, student.id, student.username]);

  const handleDismissAnnouncement = () => {
    if (displayedAnnouncement) {
      dismissedAnnouncementIdRef.current = displayedAnnouncement.id;
      setDisplayedAnnouncement(null);
      setIsAnnouncementMinimized(false);
    }
  };

  // Real-time admin mass refresh notice inside active exam
  const lastExamRefreshTimestampRef = useRef<number>(config.forcedRefreshTimestamp || 0);
  const [examRefreshToast, setExamRefreshToast] = useState<{
    show: boolean;
    reason: string;
    type?: 'SOFT' | 'HARD';
  } | null>(null);

  useEffect(() => {
    if (config.forcedRefreshTimestamp && config.forcedRefreshTimestamp > lastExamRefreshTimestampRef.current) {
      lastExamRefreshTimestampRef.current = config.forcedRefreshTimestamp;
      setExamRefreshToast({
        show: true,
        reason: config.forcedRefreshReason || 'Pembaruan konfigurasi ujian & naskah soal dari Admin.',
        type: config.forcedRefreshType || 'SOFT'
      });
      const timer = setTimeout(() => {
        setExamRefreshToast(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [config.forcedRefreshTimestamp, config.forcedRefreshReason, config.forcedRefreshType]);

  const allSubjects = getExamSubjects(config);
  const activeSubject = allSubjects.find(s => s.id === (student.subjectId || allSubjects[0]?.id || 'sub1')) || allSubjects[0];
  const activeSubjectName = activeSubject ? activeSubject.name : (student.subjectId || 'Ujian Digital');

  const isFullscreenSupported = typeof document !== 'undefined' && !!(
    document.documentElement?.requestFullscreen ||
    (document.documentElement as any)?.webkitRequestFullscreen ||
    (document.documentElement as any)?.mozRequestFullScreen ||
    (document.documentElement as any)?.msRequestFullscreen
  );

  // Core auto-unlock sequence triggered by Admin Proktor (Channel 1) or Token (Channel 2)
  const performAutoUnlock = async (customNotice = 'KUNCI TELAH DIBUKA! Membuka halaman ujian...', skipAutoFs = false) => {
    if (isUnlockingRef.current) return;
    isUnlockingRef.current = true;

    stopAllAlarmSounds();
    setViolationToast(null);
    setPassiveToast(null);
    setTokenError('');
    setStatusMessage(customNotice);
    setUnlockProgress(100);
    setIsGraceActive(true);
    isGraceActiveRef.current = true;
    lockWritePendingUntilRef.current = 0;

    if (graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current);
    }

    // Attempt automatic fullscreen entry immediately upon unlock
    let fsActive = checkIsFullscreenActive();
    if (isStrictMode && isFullscreenSupported && !fsActive && !skipAutoFs) {
      fsActive = await requestFullscreen();
    }

    setExamStatus('SEDANG_MENGERJAKAN');
    setIsCurrentlyFullscreen(fsActive);

    if (isStrictMode && isFullscreenSupported && !fsActive) {
      // Browser blocked fullscreen outside direct click gesture:
      // show non-penalizing 1-tap Fullscreen Resume screen instead of freezing/penalizing!
      setNeedsFullscreenResume(true);
      needsFullscreenResumeRef.current = true;
    } else {
      setNeedsFullscreenResume(false);
      needsFullscreenResumeRef.current = false;
    }

    setStatusMessage('');
    setUnlockProgress(0);
    isUnlockingRef.current = false;

    // Grace period so layout/fullscreen transitions settle cleanly without false violation
    graceTimeoutRef.current = setTimeout(() => {
      setIsGraceActive(false);
      isGraceActiveRef.current = false;
      const latestFs = checkIsFullscreenActive();
      setIsCurrentlyFullscreen(latestFs);
      if (latestFs) {
        setNeedsFullscreenResume(false);
        needsFullscreenResumeRef.current = false;
      }
    }, 2000);
  };

  const prevStudentStatusRef = useRef(student.status);

  useEffect(() => {
    return () => {
      if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isStrictMode || !isFullscreenSupported || examStatus !== 'SEDANG_MENGERJAKAN') {
      setNeedsFullscreenResume(false);
      needsFullscreenResumeRef.current = false;
    }
  }, [isStrictMode, isFullscreenSupported, examStatus]);

  // Allow desktop students on the 1-tap Fullscreen Resume overlay to press Enter/Space to re-enter Fullscreen
  useEffect(() => {
    if (!needsFullscreenResume || !isStrictMode || !isFullscreenSupported || examStatus !== 'SEDANG_MENGERJAKAN') {
      return;
    }
    const handleResumeKey = async (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsGraceActive(true);
        isGraceActiveRef.current = true;
        const ok = await requestFullscreen();
        if (ok) {
          setNeedsFullscreenResume(false);
          needsFullscreenResumeRef.current = false;
        }
        if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
        graceTimeoutRef.current = setTimeout(() => {
          setIsGraceActive(false);
          isGraceActiveRef.current = false;
          setIsCurrentlyFullscreen(checkIsFullscreenActive());
        }, 1500);
      }
    };
    window.addEventListener('keydown', handleResumeKey);
    return () => window.removeEventListener('keydown', handleResumeKey);
  }, [needsFullscreenResume, isStrictMode, isFullscreenSupported, examStatus]);

  // Keep local exam status synchronized with student.status prop from Firestore
  useEffect(() => {
    const waitingLocalLockWrite =
      examStatus === 'TERKUNCI' &&
      student.status === 'SEDANG_MENGERJAKAN' &&
      Date.now() <= lockWritePendingUntilRef.current;

    if (
      student.status === 'SEDANG_MENGERJAKAN' &&
      (prevStudentStatusRef.current === 'TERKUNCI' || examStatus === 'TERKUNCI') &&
      !waitingLocalLockWrite
    ) {
      performAutoUnlock('KUNCI TELAH DIBUKA OLEH PENGAWAS!');
    } else if (!isUnlockingRef.current && !waitingLocalLockWrite) {
      setExamStatus(student.status);
    }
    prevStudentStatusRef.current = student.status;
  }, [student.status]);

  // Periodic fallback status checks every 1s when locked (detects admin unlock even if WebSocket/background tab suspended)
  useEffect(() => {
    if (examStatus !== 'TERKUNCI') return;

    const interval = setInterval(async () => {
      if (isUnlockingRef.current) return;
      if (Date.now() < lockWritePendingUntilRef.current) return;
      try {
        const serverStudent = await getStudentFromServer(student.id);
        if (serverStudent && serverStudent.status !== 'TERKUNCI') {
          if (serverStudent.status === 'SEDANG_MENGERJAKAN') {
            performAutoUnlock('KUNCI TELAH DIBUKA OLEH PENGAWAS!');
          } else {
            setExamStatus(serverStudent.status);
          }
        }
      } catch (err) {
        console.error('Background check status failed:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [examStatus, student.id]);

  // Synchronize local answers state: reset cleanly on remedial/admin reset, otherwise safely merge with server
  useEffect(() => {
    const serverAnswersEmpty = !student.answers || Object.keys(student.answers).length === 0;
    const attemptChanged = currentAttempt !== prevAttemptRef.current;

    if (attemptChanged || (student.status === 'BELUM_MULAI' && serverAnswersEmpty)) {
      prevAttemptRef.current = currentAttempt;
      try {
        localStorage.removeItem(legacyAnswerStorageKey);
        localStorage.removeItem(answerStorageKey);
      } catch (e) {}
      setSelectedAnswers(student.answers || {});
      setCurrentQuestionIndex(0);
      return;
    }

    if (student.answers && Object.keys(student.answers).length > 0) {
      setSelectedAnswers((prev) => {
        const merged = {
          ...student.answers,
          ...prev // Local choices take precedence during active attempt
        };
        try {
          localStorage.setItem(answerStorageKey, JSON.stringify(merged));
        } catch (e) {}
        return merged;
      });
    }
  }, [student.answers, student.id, student.status, currentAttempt, answerStorageKey, legacyAnswerStorageKey]);

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
  const requestFullscreen = async (): Promise<boolean> => {
    warmUpAudioContext();
    try {
      if (checkIsFullscreenActive()) {
        setFullscreenFailed(false);
        setIsCurrentlyFullscreen(true);
        setNeedsFullscreenResume(false);
        needsFullscreenResumeRef.current = false;
        return true;
      }
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      } else if (docEl.mozRequestFullScreen) {
        await docEl.mozRequestFullScreen();
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen();
      }
      const activeFs = checkIsFullscreenActive();
      setFullscreenFailed(!activeFs);
      setIsCurrentlyFullscreen(activeFs);
      if (activeFs) {
        setNeedsFullscreenResume(false);
        needsFullscreenResumeRef.current = false;
      }
      return activeFs;
    } catch (err) {
      console.warn('Request fullscreen failed/blocked:', err);
      const activeFs = checkIsFullscreenActive();
      setFullscreenFailed(!activeFs);
      setIsCurrentlyFullscreen(activeFs);
      return activeFs;
    }
  };

  // Exit Fullscreen helper
  const exitFullscreen = async () => {
    try {
      const doc = document as any;
      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        await doc.mozCancelFullScreen();
      } else if (doc.msExitFullscreen) {
        await doc.msExitFullscreen();
      }
      setIsCurrentlyFullscreen(false);
    } catch (err) {
      console.warn('Exit fullscreen error:', err);
    }
  };

  // Full Screen Mode Toggle using Screen Fullscreen API
  const toggleFullscreen = async () => {
    if (checkIsFullscreenActive()) {
      await exitFullscreen();
    } else {
      await requestFullscreen();
    }
  };

  const passiveToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localViolationCountRef = useRef(localViolationCount);
  localViolationCountRef.current = localViolationCount;

  const triggerViolation = (reason: string, category: ViolationCategory = 'OTHER') => {
    if (isSubmittingRef.current) return; // Do not trigger violation during exam submission
    if (isGraceActiveRef.current || needsFullscreenResumeRef.current || isUnlockingRef.current) return;
    const strictActive = config.strictSecurityEnabled !== false;
    const passiveActive = !strictActive && config.passiveViolationLoggingEnabled !== false;
    if (!strictActive && !passiveActive) return; // Ignore completely if both strict & passive logging are off

    const now = Date.now();
    if (now - lastViolationTime.current < 1500) return; // Prevent double trigger
    lastViolationTime.current = now;

    const nextCount = Math.max(student.violationCount || 0, localViolationCountRef.current) + 1;
    const logEntry = createViolationLogEntry(reason, category, strictActive ? 'STRICT' : 'PASSIVE');

    setLocalViolationCount(nextCount);
    setLocalViolationLogs(prev => [...prev, logEntry].slice(-100));

    if (strictActive) {
      // Alarm sound if enabled in config
      if (config.sirenAlarmEnabled !== false) {
        playAlarmSound(config);
      }

      const tolerance = config.maxAllowedViolations !== undefined ? config.maxAllowedViolations : 3;
      const maxAllowed = (student.tokenUnlockCount && student.tokenUnlockCount > 0) ? 1 : tolerance;

      setViolationToast({
        message: reason,
        count: nextCount,
        max: maxAllowed
      });

      if (nextCount >= maxAllowed) {
        lockWritePendingUntilRef.current = Date.now() + 3000;
        setExamStatus('TERKUNCI');
      }
    } else {
      // Passive mode: Record & inform student via non-blocking toast WITHOUT locking screen
      setPassiveToast({
        reason,
        category,
        count: nextCount
      });
      if (passiveToastTimerRef.current) clearTimeout(passiveToastTimerRef.current);
      passiveToastTimerRef.current = setTimeout(() => {
        setPassiveToast(null);
      }, 4500);
    }

    onViolation(reason, category);
  };

  // Monitor Fullscreen Exit, Overlays, Split Screen, Quick Chat, Google Lens/Assistant & Focus shifts
  useEffect(() => {
    if (examStatus !== 'SEDANG_MENGERJAKAN') return;
    const strictActive = config.strictSecurityEnabled !== false;
    const passiveActive = !strictActive && config.passiveViolationLoggingEnabled !== false;
    if (!strictActive && !passiveActive) return;

    let blurTimeout: ReturnType<typeof setTimeout> | null = null;
    let touchStartY = 0;
    let touchStartX = 0;
    let touchStartTime = 0;
    let touchOnImage = false;
    let lastRightClickTime = 0;
    let focusLostSince: number | null = null;
    let preBlurViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    let preBlurViewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;

    const checkIsFs = () => checkIsFullscreenActive();

    const classifyVisibleOverlayViolation = (): { reason: string; category: ViolationCategory } => {
      const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const screenW = window.screen?.width || preBlurViewportWidth || window.innerWidth;
      const screenH = window.screen?.height || preBlurViewportHeight || window.innerHeight;
      const recentTouchAge = Date.now() - touchStartTime;
      const heightDrop = preBlurViewportHeight - vh;

      // 1. Top edge pull-down -> Quick Settings / Notifikasi
      if (touchStartY > 0 && touchStartY <= 60 && recentTouchAge < 2500) {
        return {
          reason: 'Menarik bilah Quick Settings / panel notifikasi HP',
          category: 'QUICK_SETTINGS'
        };
      }

      // 2. Bottom corner swipe -> Google Assistant
      if (
        touchStartY >= window.innerHeight - 75 &&
        (touchStartX <= 75 || touchStartX >= window.innerWidth - 75) &&
        recentTouchAge < 2500
      ) {
        return {
          reason: 'Membuka Google Assistant melalui gestur sudut layar',
          category: 'GOOGLE_ASSISTANT'
        };
      }

      // 3. Bottom navigation bar hold or image inspection -> Google Lens / Circle to Search
      if ((touchStartY >= window.innerHeight - 48 || touchOnImage) && recentTouchAge < 2500) {
        return {
          reason: 'Membuka Google Lens / Circle to Search di layar ujian',
          category: 'GOOGLE_LENS'
        };
      }

      // 4. Split screen / multi-window width or large height shrink
      if ((screenW > 0 && vw < screenW * 0.78) || (screenH > 0 && vh < screenH * 0.58 && heightDrop > 80)) {
        return {
          reason: 'Melakukan Split Screen (membagi layar dengan aplikasi lain)',
          category: 'SPLIT_SCREEN'
        };
      }

      // 5. Quick Chatting (floating chat bubble / inline notification reply opening keyboard while blurred)
      if (heightDrop >= 120 && heightDrop < screenH * 0.48) {
        return {
          reason: 'Membuka Quick Chatting / membalas pesan mengambang (pop-up reply)',
          category: 'QUICK_CHAT'
        };
      }

      // 6. Default visible focus loss -> Floating Window / Bubble / Pop-up overlay
      return {
        reason: 'Membuka Floating Windows / jendela aplikasi mengambang di atas ujian',
        category: 'FLOATING_WINDOW'
      };
    };

    const handleFullscreenChange = () => {
      const isFs = checkIsFs();
      setIsCurrentlyFullscreen(isFs);
      if (isFs) {
        setNeedsFullscreenResume(false);
        needsFullscreenResumeRef.current = false;
        setFullscreenFailed(false);
      }
      if (
        strictActive &&
        isFullscreenSupported &&
        !isFs &&
        !isGraceActiveRef.current &&
        !needsFullscreenResumeRef.current &&
        examStartedRef.current
      ) {
        triggerViolation('Keluar dari Mode Layar Penuh (Fullscreen)', 'FULLSCREEN_EXIT');
      }
    };

    const handleVisibilityChange = () => {
      if (
        (document.hidden || document.visibilityState === 'hidden') &&
        !isGraceActiveRef.current &&
        !needsFullscreenResumeRef.current &&
        examStartedRef.current
      ) {
        triggerViolation('Beralih ke aplikasi lain / meminimalkan tab ujian', 'TAB_SWITCH');
      }
    };

    const handleWindowBlur = () => {
      if (isGraceActiveRef.current || needsFullscreenResumeRef.current || !examStartedRef.current) return;
      if (Date.now() - lastRightClickTime < 1500) return;
      if (blurTimeout) clearTimeout(blurTimeout);
      if (!focusLostSince) focusLostSince = Date.now();

      blurTimeout = setTimeout(() => {
        if (!isGraceActiveRef.current && !needsFullscreenResumeRef.current && examStartedRef.current) {
          if (document.hidden || document.visibilityState === 'hidden') {
            triggerViolation('Beralih ke aplikasi lain / meninggalkan jendela ujian', 'TAB_SWITCH');
          } else if (!document.hasFocus()) {
            const detected = classifyVisibleOverlayViolation();
            triggerViolation(detected.reason, detected.category);
          }
        }
      }, 350);
    };

    const handleWindowFocus = () => {
      focusLostSince = null;
      if (window.visualViewport) {
        preBlurViewportHeight = window.visualViewport.height;
        preBlurViewportWidth = window.visualViewport.width;
      } else {
        preBlurViewportHeight = window.innerHeight;
        preBlurViewportWidth = window.innerWidth;
      }
      if (blurTimeout) {
        clearTimeout(blurTimeout);
        blurTimeout = null;
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      warmUpAudioContext();
      focusLostSince = null;
      if (document.hasFocus()) {
        preBlurViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        preBlurViewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
      }
      if (e.touches && e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        touchStartTime = Date.now();
        const targetEl = e.target as HTMLElement | null;
        touchOnImage = Boolean(targetEl && (targetEl.tagName === 'IMG' || targetEl.closest('img')));
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isGraceActiveRef.current || needsFullscreenResumeRef.current || !examStartedRef.current) return;
      if (e.touches && e.touches.length > 0) {
        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;
        const dy = currentY - touchStartY;
        const dx = Math.abs(currentX - touchStartX);

        // 1. Top status bar swipe -> Quick Settings
        if (touchStartY <= 60 && dy > 35 && dy > dx * 1.3) {
          triggerViolation('Menarik bilah Quick Settings / panel notifikasi HP', 'QUICK_SETTINGS');
          return;
        }

        // 2. Bottom corner diagonal swipe -> Google Assistant
        const nearBottomCorner =
          touchStartY >= window.innerHeight - 75 &&
          (touchStartX <= 75 || touchStartX >= window.innerWidth - 75);
        if (nearBottomCorner && (touchStartY - currentY) > 45) {
          triggerViolation('Membuka Google Assistant melalui gestur sudut bawah', 'GOOGLE_ASSISTANT');
        }
      }
    };

    const handleTouchCancel = () => {
      if (isGraceActiveRef.current || needsFullscreenResumeRef.current || !examStartedRef.current) return;
      const elapsed = Date.now() - touchStartTime;
      if (elapsed > 1500) return;

      if (touchStartY <= 60) {
        triggerViolation('Menarik bilah Quick Settings / notifikasi HP (Terdeteksi Sistem)', 'QUICK_SETTINGS');
      } else if (
        touchStartY >= window.innerHeight - 75 &&
        (touchStartX <= 75 || touchStartX >= window.innerWidth - 75)
      ) {
        triggerViolation('Membuka Google Assistant (Terdeteksi Interupsi Sistem)', 'GOOGLE_ASSISTANT');
      } else if (touchStartY >= window.innerHeight - 48 || touchOnImage) {
        triggerViolation('Membuka Google Lens / Circle to Search di layar ujian', 'GOOGLE_LENS');
      }
    };

    const handlePageHide = () => {
      if (!isGraceActiveRef.current && !needsFullscreenResumeRef.current && examStartedRef.current) {
        triggerViolation('Aplikasi ujian berpindah ke latar belakang (Page Hide)', 'TAB_SWITCH');
      }
    };

    const handleResize = () => {
      if (isGraceActiveRef.current || needsFullscreenResumeRef.current || !examStartedRef.current) return;
      const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const screenW = window.screen?.width || window.innerWidth;
      const screenH = window.screen?.height || window.innerHeight;
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInputActive = activeTag === 'input' || activeTag === 'textarea';

      if (!isInputActive) {
        if (screenW > 0 && vw < screenW * 0.78) {
          triggerViolation('Melakukan Split Screen (membagi lebar layar dengan aplikasi lain)', 'SPLIT_SCREEN');
          return;
        }
        if (screenH > 0 && vh < screenH * 0.58) {
          if (!document.hasFocus() && (preBlurViewportHeight - vh) >= 120 && (preBlurViewportHeight - vh) < screenH * 0.48) {
            triggerViolation('Membuka Quick Chatting / membalas pesan mengambang (pop-up reply)', 'QUICK_CHAT');
          } else {
            triggerViolation('Melakukan Split Screen / mengecilkan jendela aplikasi ujian', 'SPLIT_SCREEN');
          }
          return;
        }
        // Keyboard / overlay appeared while exam window is unfocused -> Quick Chatting
        if (!document.hasFocus() && (preBlurViewportHeight - vh) >= 120) {
          triggerViolation('Membuka Quick Chatting / membalas pesan mengambang saat ujian berlangsung', 'QUICK_CHAT');
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isGraceActiveRef.current || needsFullscreenResumeRef.current || !examStartedRef.current) return;
      const keyLower = e.key.toLowerCase();

      // Screenshot / Lens capture shortcuts
      if (
        e.key === 'PrintScreen' ||
        (e.metaKey && e.shiftKey && ['3', '4', '5', 's'].includes(keyLower)) ||
        (e.ctrlKey && e.shiftKey && keyLower === 's')
      ) {
        e.preventDefault();
        triggerViolation('Mengambil tangkapan layar / mencoba memindai soal via Google Lens', 'GOOGLE_LENS');
        return;
      }

      // Google Assistant / Spotlight / Voice Search keys
      if (
        e.key === 'Assistant' ||
        e.key === 'LaunchAssistant' ||
        (e.metaKey && e.key === ' ') ||
        (e.altKey && e.key === ' ')
      ) {
        e.preventDefault();
        triggerViolation('Membuka Google Assistant / pencarian cepat sistem', 'GOOGLE_ASSISTANT');
        return;
      }

      if (
        (strictActive && (e.key === 'Escape' || e.key === 'F11')) ||
        e.key === 'F12' ||
        (e.altKey && e.key === 'Tab') ||
        (e.ctrlKey && ['c', 'v', 'u', 'p', 's', 'a'].includes(keyLower)) ||
        (e.metaKey && ['c', 'v', 'u', 'p', 's', 'a'].includes(keyLower))
      ) {
        e.preventDefault();
        triggerViolation(`Menekan tombol / pintasan terlarang (${e.key})`, 'SHORTCUT');
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const targetEl = e.target as HTMLElement | null;
      if (targetEl && (targetEl.tagName === 'IMG' || targetEl.closest('img'))) {
        triggerViolation('Mencoba memindai / mencari gambar soal (Google Lens)', 'GOOGLE_LENS');
        return false;
      }
      lastRightClickTime = Date.now();
      return false;
    };

    const handleMouseDown = (e: MouseEvent) => {
      focusLostSince = null;
      warmUpAudioContext();
      if (e.button === 2) {
        lastRightClickTime = Date.now();
      }
    };

    // Continuous Active Sentinel Heartbeat Monitor
    const heartbeatInterval = setInterval(() => {
      if (
        !examStartedRef.current ||
        isGraceActiveRef.current ||
        needsFullscreenResumeRef.current ||
        isUnlockingRef.current ||
        isSubmittingRef.current
      ) {
        return;
      }
      if (Date.now() - lastRightClickTime < 1500) return;

      if (document.hidden || document.visibilityState === 'hidden') {
        triggerViolation('Beralih ke aplikasi lain / menutup layar ujian', 'TAB_SWITCH');
        return;
      }

      if (!document.hasFocus()) {
        if (!focusLostSince) {
          focusLostSince = Date.now();
        } else if (Date.now() - focusLostSince >= 650) {
          focusLostSince = Date.now();
          const detected = classifyVisibleOverlayViolation();
          triggerViolation(detected.reason, detected.category);
          return;
        }
      } else {
        focusLostSince = null;
      }

      // Check fullscreen element presence ONLY when Strict Security is enabled
      if (strictActive && isFullscreenSupported && !checkIsFs()) {
        triggerViolation('Keluar dari Mode Layar Penuh (Fullscreen)', 'FULLSCREEN_EXIT');
        return;
      }
    }, 300);

    const setupTimer = setTimeout(() => {
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.addEventListener('mozfullscreenchange', handleFullscreenChange);
      document.addEventListener('MSFullscreenChange', handleFullscreenChange);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      document.addEventListener('contextmenu', handleContextMenu);
      window.addEventListener('mousedown', handleMouseDown, true);
      window.addEventListener('blur', handleWindowBlur);
      window.addEventListener('focus', handleWindowFocus);
      window.addEventListener('pagehide', handlePageHide);
      (window as any).addEventListener?.('freeze', handlePageHide);
      window.addEventListener('resize', handleResize);
      window.visualViewport?.addEventListener('resize', handleResize);
      window.addEventListener('keydown', handleKeyDown);
      document.addEventListener('touchstart', handleTouchStart, { passive: true });
      document.addEventListener('touchmove', handleTouchMove, { passive: true });
      document.addEventListener('touchcancel', handleTouchCancel, { passive: true });
      examStartedRef.current = true;
    }, 300);

    return () => {
      clearTimeout(setupTimer);
      clearInterval(heartbeatInterval);
      if (blurTimeout) clearTimeout(blurTimeout);
      if (passiveToastTimerRef.current) clearTimeout(passiveToastTimerRef.current);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pagehide', handlePageHide);
      (window as any).removeEventListener?.('freeze', handlePageHide);
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [examStatus, config.strictSecurityEnabled, config.passiveViolationLoggingEnabled]);

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    warmUpAudioContext();
    const questionObj = questions.find(q => q.id === questionId);
    let updated;

    const isMulti = questionObj?.type === 'MR' || (questionObj?.correctAnswerIndices && questionObj.correctAnswerIndices.length > 1);

    if (isMulti) {
      const maxAllowed = questionObj?.correctAnswerIndices && questionObj.correctAnswerIndices.length > 1
        ? questionObj.correctAnswerIndices.length
        : 2;

      const currentSelection = Array.isArray(selectedAnswers[questionId])
        ? (selectedAnswers[questionId] as number[])
        : selectedAnswers[questionId] !== undefined && selectedAnswers[questionId] !== null
          ? [selectedAnswers[questionId] as number]
          : [];

      let nextSelection;
      if (currentSelection.includes(optionIndex)) {
        nextSelection = currentSelection.filter(item => item !== optionIndex);
      } else {
        if (currentSelection.length >= maxAllowed) {
          // Keep max by replacing the oldest
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
    // Silent background sync and persistent per-attempt local backup
    try {
      localStorage.setItem(answerStorageKey, JSON.stringify(updated));
    } catch (e) {}
    if (onAnswersUpdate) {
      onAnswersUpdate(updated);
    }
  };

  const handleAutoSubmit = () => {
    isSubmittingRef.current = true;
    // Escape fullscreen peacefully
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    // Read directly from per-attempt localStorage backup to ensure all answers are included
    let finalAnswers = selectedAnswers;
    try {
      const local = localStorage.getItem(answerStorageKey);
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed && typeof parsed === 'object') {
          finalAnswers = { ...finalAnswers, ...parsed };
        }
      }
    } catch (e) {}
    onSubmitAnswers(finalAnswers);
  };

  const triggerDirectSubmit = () => {
    isSubmittingRef.current = true;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    // Read directly from per-attempt localStorage backup to ensure all answers are included
    let finalAnswers = selectedAnswers;
    try {
      const local = localStorage.getItem(answerStorageKey);
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed && typeof parsed === 'object') {
          finalAnswers = { ...finalAnswers, ...parsed };
        }
      }
    } catch (e) {}
    onSubmitAnswers(finalAnswers);
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

    // Instant check: if this specific token was already used on this account attempt
    const normalized = tokenInput.trim().toUpperCase();
    const usedUpper = (student.usedTokens || []).map(t => t.trim().toUpperCase());
    
    if (usedUpper.includes(normalized)) {
      setTokenError(`Token "${tokenInput.trim()}" sudah TERPAKAI pada naskah soal ini! Harap minta token berikutnya dari Pengawas.`);
      return;
    }

    const activeTokenSet = new Set(activeTokens.map(t => t.trim().toUpperCase()));
    if (isSubmittingToken) return;
    setIsSubmittingToken(true);
    setTokenError('');

    try {
      // Request fullscreen synchronously inside the user submit gesture if token format is valid
      let enteredFsEarly = checkIsFullscreenActive();
      if (isStrictMode && isFullscreenSupported && !enteredFsEarly && activeTokenSet.has(normalized)) {
        enteredFsEarly = await requestFullscreen();
      }

      if (onTokenUnlock) {
        const res = await onTokenUnlock(tokenInput.trim());
        if (res.success) {
          setTokenInput('');
          await performAutoUnlock(res.message, enteredFsEarly);
        } else {
          if (enteredFsEarly && checkIsFullscreenActive()) {
            await exitFullscreen();
          }
          setTokenError(res.message);
        }
      } else {
        if (activeTokenSet.has(normalized)) {
          setTokenInput('');
          await performAutoUnlock('Token Valid! Membuka halaman ujian...', enteredFsEarly);
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
          await performAutoUnlock('KUNCI TELAH DIBUKA OLEH PROKTOR! Membuka lembar ujian...');
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
                    *Masing-masing token hanya berlaku 1 kali per naskah soal. Jika Token 1 sudah pernah dipakai di naskah ini, Anda wajib memasukkan Token 2.
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

  // 1a. --- RENDERING: AUTO-FULLSCREEN RESUME OVERLAY AFTER REMOTE UNLOCK ---
  if (needsFullscreenResume && isStrictMode && isFullscreenSupported && !isCurrentlyFullscreen && examStatus === 'SEDANG_MENGERJAKAN') {
    const handleTapToResumeFullscreen = async () => {
      warmUpAudioContext();
      setIsGraceActive(true);
      isGraceActiveRef.current = true;
      const ok = await requestFullscreen();
      if (ok) {
        setNeedsFullscreenResume(false);
        needsFullscreenResumeRef.current = false;
      }
      if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = setTimeout(() => {
        setIsGraceActive(false);
        isGraceActiveRef.current = false;
        setIsCurrentlyFullscreen(checkIsFullscreenActive());
      }, 1500);
    };

    return (
      <div
        onClick={handleTapToResumeFullscreen}
        className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex flex-col justify-center items-center p-4 text-white text-center font-sans cursor-pointer select-none"
      >
        <div className="max-w-md w-full bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-emerald-500"></div>

          <div className="inline-flex items-center justify-center p-4 bg-emerald-500/15 rounded-2xl mb-4 text-emerald-400 border border-emerald-500/30">
            <Maximize2 className="w-11 h-11 animate-pulse" />
          </div>

          <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold uppercase tracking-wider mb-3">
            Akses Ujian Aktif Kembali • 0 Pelanggaran
          </span>

          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mb-2">
            Kunci Ujian Telah Dibuka!
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm mb-6 leading-relaxed">
            Pengawas telah membuka kunci naskah Anda. Ketuk layar di mana saja untuk langsung masuk kembali ke <strong>Mode Layar Penuh (Fullscreen)</strong> dan melanjutkan ujian.
          </p>

          <button
            type="button"
            id="btn-resume-fullscreen-after-unlock"
            onClick={(e) => {
              e.stopPropagation();
              handleTapToResumeFullscreen();
            }}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3.5 px-6 rounded-2xl transition flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-[0.98] text-sm"
          >
            <Maximize2 className="w-4 h-4" />
            Masuk Layar Penuh &amp; Lanjut Ujian
          </button>

          {fullscreenFailed && (
            <p className="text-[11px] text-amber-300 font-medium mt-3 leading-snug">
              Browser memerlukan ketukan langsung pada layar di atas untuk mengaktifkan mode layar penuh. Jawaban Anda tetap tersimpan aman.
            </p>
          )}
        </div>
      </div>
    );
  }

  // 1b. --- RENDERING: BLOCKED SCENE IF EXITING FULLSCREEN ---
  if (config.strictSecurityEnabled !== false && isFullscreenSupported && !isCurrentlyFullscreen && !isGraceActive && !needsFullscreenResume && examStatus === 'SEDANG_MENGERJAKAN') {
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

  // 2. --- RENDERING: PINDAH LAYAR PENUH INTI & PANDUAN DND ---
  if (examStatus === 'BELUM_MULAI') {
    const handleStartWithDnd = async () => {
      if (!dndConfirmed) {
        alert('Harap centang konfirmasi Mode Jangan Ganggu (DND) dan pemahaman aturan ujian terlebih dahulu!');
        return;
      }
      warmUpAudioContext();
      if (isStrictMode) {
        await requestFullscreen();
      }
      onStartExam();
    };

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 text-white font-sans py-8">
        <div className="max-w-lg w-full bg-slate-800 rounded-3xl p-6 sm:p-8 border border-slate-700 shadow-2xl relative">
          
          <div className="text-center mb-5">
            <div className="inline-flex items-center justify-center p-3.5 bg-teal-500/10 rounded-2xl mb-3 text-teal-400 border border-teal-500/20">
              <Play className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white uppercase">Siap Memulai Ujian</h2>
            <p className="text-slate-400 text-xs mt-1">
              {student.name} • Kelas {student.studentClass} • No. Absen {student.absentNumber}
            </p>
          </div>

          {/* Active Exam Subject Card */}
          <div className="p-4 bg-indigo-950/70 border border-indigo-500/40 rounded-2xl mb-4 flex items-center justify-between gap-3 text-left">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                <BookOpen className="w-5 h-5 text-indigo-100" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-mono uppercase font-bold text-indigo-300 tracking-wider block">
                  Naskah Soal yang Dikerjakan
                </span>
                <h4 className="text-sm sm:text-base font-extrabold text-white truncate">
                  {activeSubjectName}
                </h4>
              </div>
            </div>
            <span className="px-3 py-1 bg-indigo-900/80 border border-indigo-400/30 rounded-lg text-xs font-mono font-bold text-indigo-200 shrink-0">
              {questions.length} Butir Soal
            </span>
          </div>

          {/* Full Screen Mode Toggle Card */}
          {isStrictMode && isFullscreenSupported && (
            <div className="p-3.5 bg-slate-950/80 border border-indigo-500/40 rounded-2xl mb-4 flex items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  isCurrentlyFullscreen ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white animate-pulse'
                }`}>
                  {isCurrentlyFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-mono uppercase font-bold text-indigo-300 tracking-wider block">
                    Mode Layar Penuh (Fullscreen API):
                  </span>
                  <span className="text-xs font-extrabold text-white truncate block">
                    {isCurrentlyFullscreen ? '✓ Layar Penuh Aktif' : '⚠️ Belum Fullscreen'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                id="btn-toggle-fullscreen-preexam"
                onClick={toggleFullscreen}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs active:scale-95 ${
                  isCurrentlyFullscreen
                    ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    : 'bg-amber-500 text-slate-950 hover:bg-amber-400 font-black'
                }`}
              >
                {isCurrentlyFullscreen ? 'Kecilkan' : 'Aktifkan Fullscreen'}
              </button>
            </div>
          )}

          {/* Audio Alarm Verification & Pre-warm Card */}
          <div className="p-3.5 bg-slate-950/80 border border-indigo-500/40 rounded-2xl mb-5 flex items-center justify-between gap-3 text-left">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isTestingAudio ? 'bg-rose-600 text-white animate-pulse' : 'bg-indigo-600 text-white'
              }`}>
                <Volume2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-mono uppercase font-bold text-indigo-300 tracking-wider block">
                  Alarm Pelanggaran di HP Ini:
                </span>
                <span className="text-xs font-extrabold text-white truncate block">
                  {getAlarmTypeName(config.alarmType)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleTestAudioInExam}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs active:scale-95 ${
                isTestingAudio
                  ? 'bg-rose-600 text-white hover:bg-rose-500 animate-pulse'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {isTestingAudio ? 'Hentikan' : '🔊 Uji Suara HP'}
            </button>
          </div>

          {/* DND MODE & PROCTOR SECURITY GUIDE */}
          <div className="bg-slate-950/70 border border-amber-500/40 rounded-2xl p-4 sm:p-5 mb-5 space-y-3.5 text-left">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs sm:text-sm font-mono uppercase tracking-wide">
              <BellOff className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Wajib: Aktifkan Mode Jangan Ganggu (DND)</span>
            </div>

            <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
              <div className="p-3 bg-amber-950/30 border border-amber-500/20 rounded-xl space-y-1.5">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Panduan untuk Pengguna HP / Smartphone:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px] pl-1">
                  <li>
                    Tarik bilah atas layar HP (Quick Settings) sekarang juga.
                  </li>
                  <li>
                    Nyalakan fitur <strong>"Jangan Ganggu" (Do Not Disturb / DND)</strong> atau <strong>"Heningkan Pemberitahuan"</strong>.
                  </li>
                  <li>
                    Pastikan tidak ada notifikasi mengambang (pop-up) WhatsApp/telepon yang muncul saat ujian.
                  </li>
                </ul>
              </div>

              <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-xl space-y-1 text-rose-200 text-[11px]">
                <div className="font-extrabold text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>
                    {isStrictMode
                      ? 'Peringatan Keras Pelanggaran Proktor (Mode Kunci Aktif):'
                      : isPassiveLoggingMode
                      ? 'Catatan Pengawasan Tanpa Kunci Layar Aktif:'
                      : 'Informasi Pengawasan Ujian:'}
                  </span>
                </div>
                {isStrictMode ? (
                  <>
                    <p>
                      Sistem website tidak dapat mematikan notifikasi HP secara sepihak karena batasan keamanan sistem Android/iOS.
                    </p>
                    <p className="font-semibold text-rose-300">
                      ⚠️ Menarik bilah notifikasi / Quick Settings, membuka quick chat / floating window, split screen, Google Lens/Assistant, atau keluar dari fullscreen akan <strong>LANGSUNG MEMBUNYIKAN ALARM SIRINE KERAS</strong> dan mengunci ujian!
                    </p>
                  </>
                ) : isPassiveLoggingMode ? (
                  <p className="font-semibold text-amber-200">
                    ℹ️ Proktor ketat sedang dinonaktifkan (layar tidak dikunci), namun sistem <strong>TETAP MENCATAT DETIL PELANGGARAN</strong> secara otomatis (Quick Chatting, Floating Windows, Split Screen, Google Lens, Google Assistant, dll) ke layar Anda & dasbor Pengawas.
                  </p>
                ) : (
                  <p className="text-slate-300">
                    Harap kerjakan ujian dengan jujur dan tetap menjaga fokus pada lembar soal Anda.
                  </p>
                )}
              </div>
            </div>

            {/* Checkbox Konfirmasi DND */}
            <label className="flex items-start gap-3 p-3 bg-slate-900 border border-slate-700 rounded-xl cursor-pointer hover:border-amber-400 transition select-none">
              <input
                type="checkbox"
                checked={dndConfirmed}
                onChange={(e) => setDndConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-teal-500 focus:ring-teal-400 border-slate-600 bg-slate-800 cursor-pointer shrink-0"
              />
              <span className="text-xs text-slate-200 leading-snug">
                {isStrictMode
                  ? <>Saya telah mengaktifkan <strong>Mode Jangan Ganggu (DND)</strong> di HP saya dan paham bahwa membuka notifikasi atau keluar fullscreen akan membunyikan alarm sirine.</>
                  : <>Saya memahami tata tertib ujian dan siap mengerjakan dengan jujur tanpa membuka aplikasi curang.</>
                }
              </span>
            </label>
          </div>

          {fullscreenFailed && isStrictMode && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs text-left">
              Browser Anda memerlukan izin manual untuk Layar Penuh. Silakan klik tombol di bawah untuk mengizinkan.
            </div>
          )}

          <div className="space-y-2.5">
            <button
              id="btn-trigger-fullscreen-start"
              onClick={handleStartWithDnd}
              className={`w-full py-3.5 px-6 rounded-xl font-black text-sm transition duration-200 flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                dndConfirmed
                  ? 'bg-teal-500 hover:bg-teal-400 text-slate-950 active:scale-[0.98]'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              <Play className="w-4 h-4 shrink-0" />
              {isStrictMode ? 'Masukkan Layar Penuh & Mulai Ujian' : 'Mulai Kerjakan Ujian Sekarang'}
            </button>
            <button
              id="btn-abort-exam"
              onClick={onExit}
              className="w-full bg-transparent hover:bg-slate-700 font-semibold text-slate-400 hover:text-white border border-slate-700 py-2.5 rounded-xl transition duration-150 text-xs cursor-pointer"
            >
              Kembali ke Menu
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
      {/* Real-time Non-Blocking Passive Violation Toast (Strict Proctor OFF) */}
      {passiveToast && !violationToast && (
        <div className="fixed top-4 inset-x-3 max-w-md mx-auto z-[999998] bg-slate-900/95 backdrop-blur-md text-white border-2 border-amber-400/70 shadow-2xl rounded-2xl p-3.5 sm:p-4 flex items-start gap-3 animate-fade-in notranslate select-none" translate="no">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono font-black uppercase tracking-wider text-amber-300">
                Pelanggaran #{passiveToast.count} Tercatat (Tanpa Kunci)
              </span>
              <button
                type="button"
                onClick={() => setPassiveToast(null)}
                className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                title="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold font-mono ${getViolationCategoryMeta(passiveToast.category).darkBadgeClass}`}>
                {getViolationCategoryMeta(passiveToast.category).label}
              </span>
            </div>
            <p className="text-xs text-slate-200 mt-1 leading-snug">
              {passiveToast.reason}
            </p>
          </div>
        </div>
      )}

      {/* Real-time Violation Alert Dialog with Large Touch-Friendly OK Button */}
      {violationToast && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="p-6 sm:p-7 bg-gradient-to-br from-red-600 via-rose-700 to-red-800 text-white rounded-3xl shadow-2xl border-2 border-white/40 max-w-lg w-full text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert className="w-9 h-9 text-white animate-pulse" />
            </div>
            
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 bg-black/40 border border-white/20 px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase">
                <span>Pelanggaran {violationToast.count} / {violationToast.max} Kali</span>
              </div>
              <h3 className="font-black text-xl sm:text-2xl uppercase tracking-tight">
                Peringatan Pelanggaran!
              </h3>
              <p className="text-sm sm:text-base text-red-100 font-medium leading-relaxed max-w-md mx-auto">
                {violationToast.message}
              </p>
            </div>

            <div className="p-3 bg-red-950/40 rounded-xl border border-white/10 text-xs text-red-200 leading-snug">
              Jangan membuka aplikasi lain, membagi layar (split screen), atau menarik bilah notifikasi agar ujian tidak dibekukan secara permanen.
            </div>

            <button
              id="btn-dismiss-violation-toast"
              type="button"
              onClick={() => {
                stopAllAlarmSounds();
                warmUpAudioContext();
                setViolationToast(null);
              }}
              className="w-full py-4 px-8 bg-white hover:bg-slate-100 active:scale-95 text-red-700 text-base sm:text-lg font-black rounded-2xl shadow-2xl ring-4 ring-white/60 transition-all flex items-center justify-center gap-3 cursor-pointer min-h-[54px]"
            >
              <Check className="w-6 h-6 text-red-700 stroke-[3]" />
              <span>SAYA MENGERTI (OK)</span>
            </button>
          </div>
        </div>
      )}

      {/* Real-time Admin Forced Mass Refresh Toast Inside Exam */}
      {examRefreshToast?.show && (
        <div className="fixed top-4 inset-x-4 max-w-md mx-auto z-50 bg-slate-900/95 backdrop-blur-md text-white border border-indigo-500/50 shadow-2xl rounded-2xl p-4 flex items-start gap-3.5 animate-fade-in notranslate select-none" translate="no">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 shadow-xs">
            <RefreshCw className={`w-5 h-5 text-white ${examRefreshToast.type === 'HARD' ? 'animate-spin' : ''}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-black text-indigo-300 font-mono uppercase tracking-wider flex items-center gap-1.5">
                <span>Pembaruan dari Admin</span>
                <span className="px-1.5 py-0.2 bg-indigo-500/30 text-indigo-200 text-[10px] rounded font-bold">Live Sync</span>
              </h4>
              <button
                type="button"
                onClick={() => setExamRefreshToast(null)}
                className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                title="Tutup Notifikasi"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-200 mt-1 leading-snug font-medium">
              {examRefreshToast.reason}
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                {examRefreshToast.type === 'HARD'
                  ? 'Memuat ulang halaman browser... Jawaban tersimpan aman.'
                  : 'Naskah soal & konfigurasi telah diperbarui. Jawaban Anda tetap aman.'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Floating Non-Intrusive Broadcast Announcement Card */}
      {displayedAnnouncement && (() => {
        const isTargetedToMe = displayedAnnouncement.targetStudentId && displayedAnnouncement.targetStudentId === student.id;

        return (
          <div className="fixed top-2.5 sm:top-4 right-2.5 left-2.5 sm:left-auto sm:right-4 sm:max-w-md z-[999999] animate-fade-in notranslate select-none" translate="no">
            <div className={`backdrop-blur-md text-white rounded-2xl shadow-2xl p-4 sm:p-5 space-y-3 ${
              isTargetedToMe
                ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/90 border-2 border-amber-400 shadow-amber-500/20'
                : 'bg-slate-900/95 border-2 border-indigo-400/50'
            }`}>
              {/* Floating Card Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                    isTargetedToMe
                      ? 'bg-amber-500/30 border border-amber-400 text-amber-300'
                      : 'bg-indigo-500/20 border border-indigo-400/30 text-amber-300'
                  }`}>
                    <Megaphone className="w-4 h-4 animate-bounce" />
                  </div>
                  <div className="min-w-0 truncate">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-wider uppercase">
                      <span className={`w-2 h-2 rounded-full animate-pulse shrink-0 ${
                        isTargetedToMe ? 'bg-amber-400' : 'bg-emerald-400'
                      }`} />
                      <span className={isTargetedToMe ? 'text-amber-300 font-extrabold' : 'text-indigo-300'}>
                        {isTargetedToMe ? 'Pesan Khusus Untuk Anda' : 'Pengumuman'}
                      </span>
                      <span>•</span>
                      <span className="text-slate-400">
                        {displayedAnnouncement.timestamp
                          ? new Date(displayedAnnouncement.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB'
                          : 'Sekarang'}
                      </span>
                    </div>
                    <h4 className="font-extrabold text-xs sm:text-sm text-white truncate flex items-center gap-1.5">
                      <span>{displayedAnnouncement.sender || 'Pengawas Ruang'}</span>
                      {isTargetedToMe && (
                        <span className="px-1.5 py-0.5 bg-amber-400/20 border border-amber-300/40 text-amber-200 text-[10px] rounded font-mono font-bold">
                          Privat (1-on-1)
                        </span>
                      )}
                    </h4>
                  </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsAnnouncementMinimized(!isAnnouncementMinimized)}
                    className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                    title={isAnnouncementMinimized ? 'Buka Lengkap' : 'Kecilkan'}
                  >
                    {isAnnouncementMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    id="btn-dismiss-announcement-header"
                    onClick={handleDismissAnnouncement}
                    className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition cursor-pointer"
                    title="Tutup Pengumuman"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Collapsible Message Content */}
              {!isAnnouncementMinimized && (
                <>
                  <div className={`p-3 rounded-xl border text-xs sm:text-sm font-medium leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap shadow-inner ${
                    isTargetedToMe
                      ? 'bg-amber-950/40 border-amber-400/30 text-amber-100'
                      : 'bg-white/10 border-white/10 text-indigo-100'
                  }`}>
                    {displayedAnnouncement.message}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[10px] text-slate-400 font-mono">
                      Waktu ujian tetap berjalan normal
                    </span>
                    <button
                      id="btn-dismiss-announcement"
                      type="button"
                      onClick={handleDismissAnnouncement}
                      className={`px-3 py-1.5 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer ${
                        isTargetedToMe
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                          : 'bg-indigo-600 hover:bg-indigo-500'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Saya Mengerti</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

            {/* Unobtrusive Offline Warning Indicator */}
      {!isOnline && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold shadow-sm border-b border-amber-600/40 sticky top-0 z-50 animate-fade-in select-none">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-950 animate-ping shrink-0" />
              <WifiOff className="w-4 h-4 text-amber-950 shrink-0" />
              <span>
                <strong>Mode Offline / Sinkronisasi Terputus:</strong> Jawaban Anda tetap aman tersimpan di browser ini & otomatis disinkronkan ke server saat jaringan terhubung kembali.
              </span>
            </div>
            <span className="text-[10px] font-mono bg-amber-950/15 text-amber-950 px-2 py-0.5 rounded font-bold uppercase shrink-0 hidden sm:inline-block">
              Penyimpanan Lokal Aktif
            </span>
          </div>
        </div>
      )}

      {/* Header Panel */}
      <header className="bg-slate-900 text-white shadow-sm border-b border-slate-800 px-6 py-4 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              {isStrictMode ? (
                <span className="px-2 py-0.5 bg-red-600 text-white font-mono text-[10px] font-bold tracking-widest rounded uppercase">
                  PROCTOR ACTIVE
                </span>
              ) : isPassiveLoggingMode ? (
                <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-mono text-[10px] font-black tracking-wider rounded uppercase">
                  CATAT PELANGGARAN AKTIF
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-slate-700 text-slate-300 font-mono text-[10px] font-bold tracking-wider rounded uppercase">
                  PROCTOR NONAKTIF
                </span>
              )}
              {isMonitoringActive && (
                <button
                  type="button"
                  id="btn-header-violation-counter"
                  onClick={() => setShowViolationDetailsPanel(prev => !prev)}
                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold flex items-center gap-1 transition cursor-pointer border ${
                    localViolationCount > 0
                      ? 'bg-rose-600/90 hover:bg-rose-500 text-white border-rose-400/50'
                      : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700'
                  }`}
                  title="Klik untuk melihat riwayat detail pelanggaran"
                >
                  <History className="w-3 h-3" />
                  <span>Pelanggaran: {localViolationCount}x</span>
                </button>
              )}
              <span className="text-slate-400 text-xs font-mono">
                KELAS {student.studentClass} • ABSEN {student.absentNumber}
              </span>
              {/* Highlight Active Exam Subject */}
              <span className="px-2.5 py-0.5 bg-indigo-600/90 text-indigo-100 font-bold text-xs rounded-md border border-indigo-400/30 flex items-center gap-1.5 shadow-2xs">
                <BookOpen className="w-3.5 h-3.5 text-indigo-300" />
                <span>Naskah: {activeSubjectName}</span>
              </span>
              {(student.isRemedial || (student.attemptNumber && student.attemptNumber > 1)) && (
                <span className="px-2.5 py-0.5 bg-purple-600 text-purple-100 font-bold text-xs rounded-md border border-purple-400/30 flex items-center gap-1 shadow-2xs">
                  <span>MODE REMIDI (Percobaan {student.attemptNumber || 2})</span>
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold truncate tracking-tight">{student.name}</h2>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* Real-time WIB Clock */}
            <div className="hidden sm:flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-3 py-2 rounded-xl text-slate-300 font-mono text-xs shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[10px] text-slate-400 font-bold uppercase">WIB:</span>
              <span className="font-bold text-white tracking-wide">{wibClock.formattedTimeOnly}</span>
            </div>

            {/* Full Screen Mode Toggle Button */}
            {isFullscreenSupported && (
              <button
                type="button"
                id="btn-toggle-fullscreen-header"
                onClick={toggleFullscreen}
                title={isCurrentlyFullscreen ? 'Keluar Mode Layar Penuh' : 'Masuk Mode Layar Penuh (Fullscreen)'}
                className={`px-3 py-2 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs border ${
                  isCurrentlyFullscreen
                    ? 'bg-slate-800 text-emerald-300 border-emerald-500/40 hover:bg-slate-700'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30 animate-pulse'
                }`}
              >
                {isCurrentlyFullscreen ? (
                  <>
                    <Minimize2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="hidden md:inline">Layar Penuh</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Layar Penuh</span>
                  </>
                )}
              </button>
            )}

            {/* Quick Question Jump Grid Button */}
            <button
              type="button"
              id="btn-open-question-grid-drawer"
              onClick={() => setShowQuestionGridDrawer(true)}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm border border-indigo-400/40 shrink-0"
              title="Buka Navigasi Cepat Nomor Soal (Pilih Nomor Soal Langsung)"
            >
              <LayoutGrid className="w-4 h-4 text-indigo-200 shrink-0" />
              <span className="hidden sm:inline">Nomor Soal</span>
              <span className="px-1.5 py-0.5 bg-indigo-950/80 text-indigo-200 text-[10px] font-mono rounded font-extrabold border border-indigo-500/30">
                {Object.keys(selectedAnswers).length}/{questions.length}
              </span>
            </button>

            {/* Timer countdown view */}
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 px-3.5 py-2 rounded-xl text-yellow-400 font-mono font-bold text-base sm:text-lg min-w-[110px] sm:min-w-[120px] justify-center shadow-inner">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
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
      <main className="max-w-5xl mx-auto w-full flex-1 px-4 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        
        {/* Live Student Screen Violation Counter & Detailed Activity Log Panel */}
        {isMonitoringActive && (
          <div className="lg:col-span-3">
            <div className={`rounded-2xl border p-3.5 sm:p-4 shadow-2xs transition-all ${
              localViolationCount > 0
                ? 'bg-rose-50/90 border-rose-200'
                : isPassiveLoggingMode
                ? 'bg-amber-50/70 border-amber-200/80'
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    localViolationCount > 0
                      ? 'bg-rose-600 text-white'
                      : isPassiveLoggingMode
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-900 text-emerald-400'
                  }`}>
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-slate-900">
                        Pelanggaran Tercatat: <span className={localViolationCount > 0 ? 'text-rose-600' : 'text-emerald-700'}>{localViolationCount} Kali</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        isStrictMode
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-amber-200/80 text-amber-950'
                      }`}>
                        {isStrictMode ? 'Mode Kunci Proktor' : 'Mode Catat Tanpa Kunci Layar'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 truncate">
                      {localViolationLogs.length > 0
                        ? `Terakhir: ${getViolationCategoryMeta(localViolationLogs[localViolationLogs.length - 1].category).label} — ${localViolationLogs[localViolationLogs.length - 1].reason}`
                        : isPassiveLoggingMode
                        ? 'Sistem aktif mencatat detil aktivitas (Quick Chat, Floating Window, Split Screen, Google Lens, Google Assistant) tanpa mengunci layar.'
                        : 'Tetap fokus pada lembar ujian. Belum ada pelanggaran tercatat.'}
                    </p>
                  </div>
                </div>

                {(localViolationLogs.length > 0 || localViolationCount > 0) && (
                  <button
                    type="button"
                    id="btn-toggle-violation-details"
                    onClick={() => setShowViolationDetailsPanel(prev => !prev)}
                    className="px-3 py-1.5 bg-white hover:bg-rose-100/70 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-2xs transition"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>{showViolationDetailsPanel ? 'Tutup Detail' : `Lihat Detail (${localViolationLogs.length || localViolationCount})`}</span>
                    {showViolationDetailsPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>

              {showViolationDetailsPanel && (
                <div className="mt-3 pt-3 border-t border-rose-200/80 space-y-2 max-h-56 overflow-y-auto pr-1">
                  {localViolationLogs.length > 0 ? (
                    [...localViolationLogs].reverse().map((entry, idx) => {
                      const meta = getViolationCategoryMeta(entry.category);
                      const entryNo = localViolationLogs.length - idx;
                      return (
                        <div key={entry.id || idx} className="p-2.5 bg-white rounded-xl border border-rose-200/70 text-xs flex flex-col gap-1 shadow-2xs">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-black text-[10px] text-slate-500">#{entryNo}</span>
                              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold font-mono ${meta.badgeClass}`}>
                                {meta.label}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                                entry.mode === 'PASSIVE' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {entry.mode === 'PASSIVE' ? 'Tercatat (Tanpa Kunci)' : 'Proktor Ketat'}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">
                              {formatViolationTime(entry.timestamp)}
                            </span>
                          </div>
                          <p className="text-[11px] font-medium text-slate-700 leading-snug">
                            {entry.reason}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-2.5 bg-white rounded-xl border border-rose-200/70 text-xs text-slate-600">
                      Tercatat {localViolationCount} kali pelanggaran ({student.lockedReason || 'Keluar fokus layar'}).
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

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

          <div key={currentQuestion.id} className="notranslate bg-white rounded-2xl shadow-xs border border-slate-200/80 p-6 md:p-8 relative" translate="no">
            
            {/* Index heading */}
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-bold text-indigo-500 uppercase font-mono tracking-widest">
                Pertanyaan {currentQuestionIndex + 1} dari {questions.length}
              </span>
              {(() => {
                const isMulti = currentQuestion.type === 'MR' || (currentQuestion.correctAnswerIndices && currentQuestion.correctAnswerIndices.length > 1);
                const maxChoices = currentQuestion.correctAnswerIndices && currentQuestion.correctAnswerIndices.length > 1
                  ? currentQuestion.correctAnswerIndices.length
                  : 2;
                const ans = selectedAnswers[currentQuestion.id];
                const selectedCount = Array.isArray(ans) ? ans.length : (ans !== undefined && ans !== null ? 1 : 0);
                const isAnswered = selectedCount > 0;

                return (
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-500 text-xs rounded-full font-semibold font-mono">
                    {isAnswered
                      ? `✓ Terjawab${isMulti ? ` (${selectedCount}/${maxChoices})` : ''}`
                      : '• Belum Terjawab'}
                  </span>
                );
              })()}
            </div>

            {(() => {
              const isMulti = currentQuestion.type === 'MR' || (currentQuestion.correctAnswerIndices && currentQuestion.correctAnswerIndices.length > 1);
              const maxChoices = currentQuestion.correctAnswerIndices && currentQuestion.correctAnswerIndices.length > 1
                ? currentQuestion.correctAnswerIndices.length
                : 2;
              const ans = selectedAnswers[currentQuestion.id];
              const selectedCount = Array.isArray(ans) ? ans.length : (ans !== undefined && ans !== null ? 1 : 0);

              if (isMulti) {
                return (
                  <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-900 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-1 shrink-0 animate-ping" />
                      <span>PILIHAN GANDA KOMPLEKS: Pilih tepat {maxChoices} (dua atau lebih) opsi jawaban yang benar!</span>
                    </div>
                    <span className="text-[11px] font-mono font-bold bg-amber-200/60 text-amber-950 px-2 py-0.5 rounded">
                      {selectedCount} / {maxChoices} Terpilih
                    </span>
                  </div>
                );
              }

              return (
                <div className="mb-5 p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <span className="font-medium">PILIHAN GANDA TUNGGAL: Pilih 1 (satu) opsi jawaban yang paling tepat.</span>
                </div>
              );
            })()}

            {/* Question Text & Media */}
            <div className="mb-6 notranslate" translate="no">
              <RichExamContent
                text={currentQuestion.questionText}
                imageUrl={currentQuestion.imageUrl}
                isReadingPassage={currentQuestion.isReadingPassage}
                className="text-base sm:text-lg font-medium text-slate-900"
              />
            </div>

            {/* Multiple Choice Options */}
            <div className="space-y-4 notranslate select-none" translate="no">
              {(() => {
                const rawOptions = (currentQuestion.options && currentQuestion.options.length > 0)
                  ? currentQuestion.options
                  : ['Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D'];

                return rawOptions.map((option, idx) => {
                  const labelLetter = String.fromCharCode(65 + idx); // A, B, C, D
                  const qAns = selectedAnswers[currentQuestion.id];
                  const isSelected = Array.isArray(qAns) ? qAns.includes(idx) : qAns === idx;
                  const optImage = currentQuestion.optionImages?.[idx];
                  const optText = (typeof option === 'string' && option.trim().length > 0) ? option : `Pilihan ${labelLetter}`;
                  
                  return (
                    <button
                      key={`${currentQuestion.id}_opt_${idx}`}
                      id={`btn-option-${idx}`}
                      translate="no"
                      onClick={() => handleSelectOption(currentQuestion.id, idx)}
                      className={`w-full text-left px-5 py-4 rounded-xl border text-sm transition-all flex items-center justify-between gap-4 notranslate ${
                        isSelected
                          ? 'bg-indigo-50/70 border-indigo-500 text-indigo-900 font-semibold ring-1 ring-indigo-500'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1 notranslate" translate="no">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold font-mono text-sm border shrink-0 notranslate ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-700 text-white'
                            : 'bg-white border-slate-300 text-slate-500'
                        }`} translate="no">
                          {labelLetter}
                        </span>
                        <div className="leading-snug flex-1 notranslate" translate="no">
                          <RichExamContent text={optText} zoomableImage={false} />
                          {optImage && (
                            <div className="mt-2.5 max-w-sm rounded-xl overflow-hidden border border-slate-200 bg-white p-1 shadow-2xs">
                              <img
                                src={optImage}
                                alt={`Gambar Opsi ${labelLetter}`}
                                className="max-h-36 sm:max-h-44 w-auto rounded-lg object-contain"
                                loading="lazy"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                });
              })()}
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
            <footer className="bg-slate-100 text-center py-3 text-[10px] text-slate-500 font-mono tracking-wider border-t border-slate-200 select-none space-y-0.5">
        <div>{config.examTitle} • SISTEM UJIAN BERBASIS KOMPUTER</div>
        <div className="text-[11px] font-sans font-medium text-slate-600">Created &amp; Developed by <span className="font-bold text-slate-800">@ryhnn.hannn</span></div>
      </footer>

      {/* Manual Submit Confirmation Dialog */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-6 text-center animate-fade-in">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full text-xs font-bold mb-3">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Naskah: {activeSubjectName}</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Selesaikan Ujian?</h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              Anda telah menjawab {Object.keys(selectedAnswers).length} dari {questions.length} soal untuk <strong>"{activeSubjectName}"</strong>. Setelah mengonfirmasi, jawaban Anda tidak dapat diubah lagi.
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

      {/* Floating Quick Access Question Grid Trigger Button (Khusus HP / Mobile) */}
      {examStatus === 'SEDANG_MENGERJAKAN' && (
        <button
          type="button"
          id="btn-floating-question-grid-trigger"
          onClick={() => setShowQuestionGridDrawer(true)}
          className="fixed bottom-6 left-6 z-40 p-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl shadow-2xl border border-indigo-400/50 font-bold text-xs flex items-center gap-2 transition-all duration-200 cursor-pointer active:scale-95 backdrop-blur-md"
          title="Pilih Nomor Soal Langsung"
        >
          <LayoutGrid className="w-5 h-5 text-indigo-100" />
          <span className="font-mono text-xs font-black">
            Soal ({Object.keys(selectedAnswers).length}/{questions.length})
          </span>
        </button>
      )}

      {/* Floating Quick Access Full Screen Mode Toggle Button */}
      {isStrictMode && isFullscreenSupported && examStatus === 'SEDANG_MENGERJAKAN' && (
        <button
          type="button"
          id="btn-floating-fullscreen-toggle"
          onClick={toggleFullscreen}
          title={isCurrentlyFullscreen ? 'Kecilkan / Keluar Fullscreen' : 'Masuk Mode Layar Penuh (Fullscreen)'}
          className={`fixed bottom-6 right-6 z-40 p-3.5 rounded-2xl shadow-2xl border font-bold text-xs flex items-center gap-2 transition-all duration-200 cursor-pointer active:scale-95 ${
            isCurrentlyFullscreen
              ? 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700 backdrop-blur-sm'
              : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 animate-bounce'
          }`}
        >
          {isCurrentlyFullscreen ? (
            <>
              <Minimize2 className="w-5 h-5 text-emerald-400" />
              <span className="hidden sm:inline font-mono">Layar Penuh (Aktif)</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-5 h-5" />
              <span className="font-mono font-extrabold">Masuk Layar Penuh</span>
            </>
          )}
        </button>
      )}

      {/* DEDICATED QUICK QUESTION JUMP DRAWER / MODAL */}
      {showQuestionGridDrawer && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[999999] flex items-center justify-center p-3 sm:p-4 animate-fade-in notranslate select-none" translate="no">
          <div className="bg-slate-900 border border-slate-700 text-white rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                  <LayoutGrid className="w-5 h-5 text-indigo-100" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-white tracking-tight">Navigasi Cepat Nomor Soal</h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Terjawab: <strong className="text-emerald-400">{Object.keys(selectedAnswers).length}</strong> dari {questions.length} Soal
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-question-grid-drawer"
                onClick={() => setShowQuestionGridDrawer(false)}
                className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono mb-3.5 bg-slate-850 p-2.5 rounded-xl border border-slate-700/60">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-500 border border-emerald-400"></span>
                <span className="text-slate-300">Terjawab</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-indigo-600 border border-indigo-400"></span>
                <span className="text-slate-300">Posisi Soal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-800 border border-slate-700"></span>
                <span className="text-slate-400">Belum Diisi</span>
              </div>
            </div>

            {/* Scrollable Questions Grid */}
            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
                {questions.map((q, idx) => {
                  const qAns = selectedAnswers[q.id];
                  const isAnswered = qAns !== undefined && qAns !== null && (!Array.isArray(qAns) || qAns.length > 0);
                  const isCurrent = idx === currentQuestionIndex;

                  return (
                    <button
                      key={`modal_q_${q.id}`}
                      type="button"
                      id={`btn-grid-jump-${idx}`}
                      onClick={() => {
                        setCurrentQuestionIndex(idx);
                        setShowQuestionGridDrawer(false);
                      }}
                      className={`py-3.5 rounded-xl font-mono text-sm font-extrabold border transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 active:scale-95 ${
                        isCurrent
                          ? 'bg-indigo-600 text-white border-indigo-400 ring-2 ring-indigo-400 shadow-md'
                          : isAnswered
                          ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white border-emerald-500 shadow-xs'
                          : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 border-slate-700'
                      }`}
                    >
                      <span>{(idx + 1).toString().padStart(2, '0')}</span>
                      {isAnswered && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Close Action */}
            <div className="pt-3 border-t border-slate-800 mt-3">
              <button
                type="button"
                onClick={() => setShowQuestionGridDrawer(false)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Tutup & Kembali ke Lembar Soal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

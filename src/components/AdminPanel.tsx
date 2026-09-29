import React, { useState, useRef } from 'react';
import { Users, FileSpreadsheet, RefreshCw, KeyRound, Edit, Trash2, Plus, Save, BookOpen, Clock, X, ChevronRight, Check, AlertTriangle, ShieldCheck, Search, Eye, EyeOff, Layers, Settings2, Sparkles, Ticket, Download, Upload, Shuffle, UserCheck, Lock, CheckCircle2, ChevronLeft, Image as ImageIcon, AlignLeft, HelpCircle, FileText, Calendar, Timer, CheckSquare, Radio, BarChart3 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student, Question, ExamConfig, ExamSubject, StudentUser } from '../types';
import { getExamSubjects, saveSingleStudent } from '../utils/sync';
import { RichExamContent } from './RichExamContent';
import { compressImageFile } from '../utils/imageCompressor';
import { useRealtimeWIB, formatWIBDateTime, formatWIBShort, formatWIBTimeOnly, evaluateSubjectSchedule, toWIBDateTimeInputValue, parseWIBInputValueToISO, formatDurationCountdown } from '../utils/timeWib';
import { parseDocxExamFile, WordImportResult } from '../utils/wordImporter';
import AnalyticsCharts from './AnalyticsCharts';
import ItemAnalysisTab from './ItemAnalysisTab';

// Helper to calculate actual subject metrics for a student
export function getStudentMetrics(s: Student, questionsList: Question[]) {
  const studentQuestions = questionsList.filter(
    (q) => (!q.subjectId && (!s.subjectId || s.subjectId === 'sub1')) || q.subjectId === s.subjectId
  );
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

export function formatHourMinuteSecond(isoStr?: string) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '-';
    const datePart = d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
    const timePart = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${datePart}, ${timePart}`;
  } catch (e) {
    return '-';
  }
}

interface AdminPanelProps {
  students: Student[];
  questions: Question[];
  config: ExamConfig;
  studentUsers?: StudentUser[];
  onUpdateStudents: (updated: Student[]) => void;
  onUpdateQuestions: (updated: Question[]) => void;
  onUpdateConfig: (updated: ExamConfig) => void;
  onUpdateStudentUsers?: (updated: StudentUser[]) => void;
  onExit: () => void;
}

export default function AdminPanel({
  students,
  questions,
  config,
  studentUsers = [],
  onUpdateStudents,
  onUpdateQuestions,
  onUpdateConfig,
  onUpdateStudentUsers,
  onExit
}: AdminPanelProps) {
  // Tabs for the Admin Control Panel
  const [activeTab, setActiveTab] = useState<'MONITOR' | 'CHARTS' | 'ITEM_ANALYSIS' | 'QUESTIONS' | 'CONFIG' | 'ACCOUNTS'>('MONITOR');

  // Search filter query
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [minScoreFilter, setMinScoreFilter] = useState<string>('');
  const [maxScoreFilter, setMaxScoreFilter] = useState<string>('');
  const [studentSortBy, setStudentSortBy] = useState<'name' | 'recent' | 'score_desc' | 'score_asc' | 'absen' | 'locked'>('recent');

  // Student editor modals state
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState('');
  const [editAbsen, setEditAbsen] = useState('');
  const [editClass, setEditClass] = useState('');

  // Dynamic Subjects state (up to 20 slots)
  const subjects: ExamSubject[] = getExamSubjects(config);
  const [activeSubjectId, setActiveSubjectId] = useState<string>(() => subjects[0]?.id || 'sub1');

  // Ensure activeSubjectId is valid
  const effectiveActiveSubject = subjects.find(s => s.id === activeSubjectId) || subjects[0] || {
    id: 'sub1',
    name: config.subject1Name || 'Mata Pelajaran 1',
    code: 'MAPEL-1',
    isActive: true
  };

  // Modals for Subject Management (Maksimal 20 Slot)
  const [isAddingSubjectModal, setIsAddingSubjectModal] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [newSubjectIsActive, setNewSubjectIsActive] = useState(true);

  const [editingSubjectModal, setEditingSubjectModal] = useState<ExamSubject | null>(null);
  const [editSubjectName, setEditSubjectName] = useState('');
  const [editSubjectCode, setEditSubjectCode] = useState('');
  const [editSubjectIsActive, setEditSubjectIsActive] = useState(true);
  const [editSubjectEnableSampling, setEditSubjectEnableSampling] = useState(false);
  const [editSubjectSampleCount, setEditSubjectSampleCount] = useState(40);
  const [editSubjectScheduleEnabled, setEditSubjectScheduleEnabled] = useState(false);
  const [editSubjectScheduleDisplayStart, setEditSubjectScheduleDisplayStart] = useState('');
  const [editSubjectScheduleDisplayEnd, setEditSubjectScheduleDisplayEnd] = useState('');
  const [editSubjectScheduleExamStart, setEditSubjectScheduleExamStart] = useState('');
  const [editSubjectScheduleExamEnd, setEditSubjectScheduleExamEnd] = useState('');

  // Live WIB clock hook
  const wibClock = useRealtimeWIB();

  // Question editor state
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isCreatingQuestion, setIsCreatingQuestion] = useState(false);
  const [qType, setQType] = useState<'MC' | 'MR'>('MC');
  const [qText, setQText] = useState('');
  const [qOptions, setQOptions] = useState<string[]>(['', '', '', '']);
  const [qCorrect, setQCorrect] = useState<number>(0);
  const [qCorrectIndices, setQCorrectIndices] = useState<number[]>([0]);
  const [qSubjectId, setQSubjectId] = useState<string>('sub1');
  const [qScore, setQScore] = useState<number>(20);
  const [qImageUrl, setQImageUrl] = useState<string>('');
  const [qIsReadingPassage, setQIsReadingPassage] = useState<boolean>(false);
  const [isUploadingQImage, setIsUploadingQImage] = useState<boolean>(false);
  const qTextAreaRef = useRef<HTMLTextAreaElement>(null);

  const insertSymbolIntoQText = (sym: string) => {
    const el = qTextAreaRef.current;
    if (!el) {
      setQText(prev => prev + sym);
      return;
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const current = qText;
    const updated = current.substring(0, start) + sym + current.substring(end);
    setQText(updated);
    setTimeout(() => {
      el.focus();
      const cursorNext = start + sym.length;
      el.setSelectionRange(cursorNext, cursorNext);
    }, 15);
  };

  // States for CSV/Excel Question Import
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [showImportArea, setShowImportArea] = useState(false);
  const [importSubjectTarget, setImportSubjectTarget] = useState<string>('current');

  // Prominent Dedicated Question Import Modal
  const [showQuestionImportModal, setShowQuestionImportModal] = useState(false);
  const [parsedQuestionsPreview, setParsedQuestionsPreview] = useState<Question[] | null>(null);
  const [questionImportMode, setQuestionImportMode] = useState<'APPEND' | 'OVERWRITE'>('APPEND');
  const [isProcessingQuestionFile, setIsProcessingQuestionFile] = useState(false);
  const [questionModalError, setQuestionModalError] = useState('');
  const [questionModalSuccess, setQuestionModalSuccess] = useState('');

  // Prominent Dedicated Microsoft Word (.docx) Question Import Modal
  const [showWordImportModal, setShowWordImportModal] = useState(false);
  const [isProcessingWordFile, setIsProcessingWordFile] = useState(false);
  const [wordModalError, setWordModalError] = useState('');
  const [wordModalSuccess, setWordModalSuccess] = useState('');
  const [parsedWordResult, setParsedWordResult] = useState<WordImportResult | null>(null);
  const [wordImportMode, setWordImportMode] = useState<'APPEND' | 'OVERWRITE'>('APPEND');
  const [wordImportDefaultScore, setWordImportDefaultScore] = useState<number>(10);

  // Modal for adding student manually in Monitor tab
  const [showAddStudentMonitorModal, setShowAddStudentMonitorModal] = useState(false);
  const [newMonitorName, setNewMonitorName] = useState('');
  const [newMonitorAbsen, setNewMonitorAbsen] = useState('');
  const [newMonitorClass, setNewMonitorClass] = useState('8A');
  const [newMonitorSubject, setNewMonitorSubject] = useState<string>('sub1');
  const [addMonitorError, setAddMonitorError] = useState('');

  // States for Student Accounts Management (1,200+ users)
  const [accountSearch, setAccountSearch] = useState('');
  const [selectedAccountClass, setSelectedAccountClass] = useState('all');
  const [accountPage, setAccountPage] = useState(1);
  const [accountPageSize, setAccountPageSize] = useState(50);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccUsername, setNewAccUsername] = useState('');
  const [newAccPassword, setNewAccPassword] = useState('123');
  const [newAccName, setNewAccName] = useState('');
  const [newAccClass, setNewAccClass] = useState('8A');
  const [newAccAbsen, setNewAccAbsen] = useState('');
  const [accError, setAccError] = useState('');
  const [showAccountImportArea, setShowAccountImportArea] = useState(false);
  const [importAccountMode, setImportAccountMode] = useState<'APPEND' | 'OVERWRITE'>('OVERWRITE');
  const [importAccountLoading, setImportAccountLoading] = useState(false);
  const [importAccountMsg, setImportAccountMsg] = useState<{ text: string; success: boolean } | null>(null);

  // --- ACTIONS: SUBJECT SLOT MANAGEMENT (MAX 20 SLOTS) ---
  const handleAddSubjectSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (subjects.length >= 20) {
      alert('Batas maksimal 20 slot mata pelajaran telah tercapai!');
      return;
    }
    if (!newSubjectName.trim()) {
      alert('Nama mata pelajaran wajib diisi!');
      return;
    }

    let nextId = `sub${subjects.length + 1}`;
    let counter = 1;
    while (subjects.some(s => s.id === nextId)) {
      counter++;
      nextId = `sub${counter}`;
    }

    const newSub: ExamSubject = {
      id: nextId,
      name: newSubjectName.trim(),
      code: newSubjectCode.trim() || `MAPEL-${subjects.length + 1}`,
      isActive: newSubjectIsActive
    };

    const updated = [...subjects, newSub];
    onUpdateConfig({
      ...config,
      subjects: updated,
      subject1Name: updated[0]?.name,
      subject2Name: updated[1]?.name
    });

    setActiveSubjectId(newSub.id);
    setIsAddingSubjectModal(false);
    setNewSubjectName('');
    setNewSubjectCode('');
    setNewSubjectIsActive(true);
  };

  const handleUpdateSubjectSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubjectModal) return;
    if (!editSubjectName.trim()) {
      alert('Nama mata pelajaran wajib diisi!');
      return;
    }

    const updated = subjects.map(s => {
      if (s.id === editingSubjectModal.id) {
        return {
          ...s,
          name: editSubjectName.trim(),
          code: editSubjectCode.trim() || s.code,
          isActive: editSubjectIsActive,
          enableRandomSampling: editSubjectEnableSampling,
          sampleQuestionCount: Math.max(1, editSubjectSampleCount || 40),
          scheduleEnabled: editSubjectScheduleEnabled,
          scheduleDisplayStart: editSubjectScheduleDisplayStart ? parseWIBInputValueToISO(editSubjectScheduleDisplayStart) : undefined,
          scheduleDisplayEnd: editSubjectScheduleDisplayEnd ? parseWIBInputValueToISO(editSubjectScheduleDisplayEnd) : undefined,
          scheduleExamStart: editSubjectScheduleExamStart ? parseWIBInputValueToISO(editSubjectScheduleExamStart) : undefined,
          scheduleExamEnd: editSubjectScheduleExamEnd ? parseWIBInputValueToISO(editSubjectScheduleExamEnd) : undefined
        };
      }
      return s;
    });

    onUpdateConfig({
      ...config,
      subjects: updated,
      subject1Name: updated[0]?.name,
      subject2Name: updated[1]?.name
    });

    setEditingSubjectModal(null);
  };

  const handleUpdateSubjectSampling = (subId: string, enabled: boolean, count?: number) => {
    const updated = subjects.map(s => {
      if (s.id === subId) {
        return {
          ...s,
          enableRandomSampling: enabled,
          sampleQuestionCount: count !== undefined ? Math.max(1, count) : (s.sampleQuestionCount || 40)
        };
      }
      return s;
    });

    onUpdateConfig({
      ...config,
      subjects: updated,
      subject1Name: updated[0]?.name,
      subject2Name: updated[1]?.name
    });
  };

  const handleAddMonitorStudent = (e: React.FormEvent) => {
    e.preventDefault();
    setAddMonitorError('');

    if (!newMonitorName.trim()) return setAddMonitorError('Nama siswa wajib diisi.');
    if (!newMonitorClass.trim()) return setAddMonitorError('Kelas wajib diisi.');

    const newStudentObj: Student = {
      id: `siswa_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: newMonitorName.trim(),
      absentNumber: newMonitorAbsen.trim() || '01',
      studentClass: newMonitorClass.trim().toUpperCase(),
      status: 'BELUM_MULAI',
      violationCount: 0,
      answers: {},
      subjectId: newMonitorSubject || 'sub1',
      lastActive: new Date().toISOString()
    };

    saveSingleStudent(newStudentObj);
    onUpdateStudents([...students, newStudentObj]);

    setShowAddStudentMonitorModal(false);
    setNewMonitorName('');
    setNewMonitorAbsen('');
  };

  const handleToggleSubjectActive = (subId: string) => {
    const updated = subjects.map(s => {
      if (s.id === subId) {
        return { ...s, isActive: s.isActive === false ? true : false };
      }
      return s;
    });

    onUpdateConfig({
      ...config,
      subjects: updated,
      subject1Name: updated[0]?.name,
      subject2Name: updated[1]?.name
    });
  };

  const handleSetAllSubjectsActive = (active: boolean) => {
    const updated = subjects.map(s => ({ ...s, isActive: active }));
    onUpdateConfig({
      ...config,
      subjects: updated,
      subject1Name: updated[0]?.name,
      subject2Name: updated[1]?.name
    });
  };

  const handleDeleteSubjectSlot = (subId: string) => {
    if (subjects.length <= 1) {
      alert('Minimal harus ada 1 slot mata pelajaran dalam sistem!');
      return;
    }

    const targetSub = subjects.find(s => s.id === subId);
    const subName = targetSub?.name || subId;
    const subQCount = questions.filter(q => (!q.subjectId && subId === 'sub1') || q.subjectId === subId).length;

    const confirmMsg = subQCount > 0
      ? `Hapus slot mata pelajaran "${subName}"?\n\nPERINGATAN: Terdapat ${subQCount} butir soal pada mata pelajaran ini yang juga akan DIHAPUS dari bank soal!`
      : `Hapus slot mata pelajaran "${subName}"?`;

    if (window.confirm(confirmMsg)) {
      if (subQCount > 0) {
        const remainingQuestions = questions.filter(q => {
          const qSub = q.subjectId || 'sub1';
          return qSub !== subId;
        });
        onUpdateQuestions(remainingQuestions);
      }

      const updated = subjects.filter(s => s.id !== subId);
      onUpdateConfig({
        ...config,
        subjects: updated,
        subject1Name: updated[0]?.name,
        subject2Name: updated[1]?.name
      });

      if (activeSubjectId === subId) {
        setActiveSubjectId(updated[0]?.id || 'sub1');
      }
    }
  };

  const handleDeleteAllQuestionsForSubject = (subId: string) => {
    const targetSub = subjects.find(s => s.id === subId);
    const subName = targetSub?.name || subId;
    const count = questions.filter(q => (!q.subjectId && subId === 'sub1') || q.subjectId === subId).length;

    if (count === 0) {
      alert(`Tidak ada soal pada mata pelajaran "${subName}".`);
      return;
    }

    if (window.confirm(`Yakin ingin MENGHAPUS SEMUA (${count} butir) soal pada mata pelajaran "${subName}"?\n\nSoal pada mata pelajaran lain TIDAK akan terhapus.`)) {
      const remainingQuestions = questions.filter(q => {
        const qSub = q.subjectId || 'sub1';
        return qSub !== subId;
      });
      onUpdateQuestions(remainingQuestions);
    }
  };

  const handleWipeAllQuestionsEntirely = () => {
    if (questions.length === 0) {
      alert('Bank soal saat ini sudah kosong (0 butir soal).');
      return;
    }
    if (window.confirm(`⚠️ PERINGATAN KERAS:\n\nYakin ingin MENGOSONGKAN SELURUH BANK SOAL (${questions.length} butir) di SEMUA mata pelajaran?\n\nSetelah dikosongkan, bank soal akan benar-benar menjadi 0 soal dan tidak akan memunculkan 5 soal bawaan secara otomatis.`)) {
      onUpdateQuestions([]);
      alert('Seluruh bank soal telah berhasil dikosongkan (0 butir soal tersisa).');
    }
  };

  // Student accounts helper methods
  const handleDownloadStudentAccountsTemplateXlsx = () => {
    const sampleData = [
      { username: 'siswa_001', password: '123', nama: 'Ahmad Fauzan', kelas: '8A', no_absen: '01' },
      { username: 'siswa_002', password: '123', nama: 'Bella Safitri', kelas: '8A', no_absen: '02' },
      { username: 'siswa_003', password: '123', nama: 'Cahyo Wibowo', kelas: '8B', no_absen: '01' },
      { username: 'siswa_004', password: '123', nama: 'Dewi Lestari', kelas: '8B', no_absen: '02' },
      { username: 'siswa_005', password: '123', nama: 'Eko Prasetyo', kelas: '8C', no_absen: '01' }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData, {
      header: ['username', 'password', 'nama', 'kelas', 'no_absen']
    });
    ws['!cols'] = [
      { wch: 18 },
      { wch: 14 },
      { wch: 28 },
      { wch: 12 },
      { wch: 12 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data_Akun_Siswa');
    XLSX.writeFile(wb, 'template_data_1200_akun_siswa.xlsx');
  };

  const handleDownloadStudentAccountsTemplateCsv = () => {
    const csvContent =
      "username,password,nama,kelas,no_absen\n" +
      "siswa_001,123,Ahmad Fauzan,8A,01\n" +
      "siswa_002,123,Bella Safitri,8A,02\n" +
      "siswa_003,123,Cahyo Wibowo,8B,01\n" +
      "siswa_004,123,Dewi Lestari,8B,02\n" +
      "siswa_005,123,Eko Prasetyo,8C,01\n";

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'template_data_1200_akun_siswa.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportStudentAccountsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportAccountLoading(true);
    setImportAccountMsg(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rawRows.length === 0) {
        setImportAccountMsg({ text: 'File kosong atau tidak terbaca format barisnya.', success: false });
        setImportAccountLoading(false);
        return;
      }

      const importedUsers: StudentUser[] = [];
      const seenUsernames = new Set<string>();

      rawRows.forEach((row, index) => {
        const getRowVal = (keys: string[]) => {
          for (const k of Object.keys(row)) {
            const cleanKey = k.trim().toLowerCase().replace(/[\s_\-]/g, '');
            if (keys.includes(cleanKey)) return String(row[k]).trim();
          }
          return '';
        };

        const rawName = getRowVal(['nama', 'namasiswa', 'namalengkap', 'siswa', 'name', 'fullname']);
        let username = getRowVal(['username', 'user', 'nis', 'nisn', 'id', 'akun', 'nik']);
        const password = getRowVal(['password', 'pass', 'sandi', 'katasandi', 'pwd']) || '123';
        const studentClass = (getRowVal(['kelas', 'class', 'tingkat', 'rombel']) || 'UMUM').toUpperCase();
        const absentNumber = getRowVal(['noabsen', 'absen', 'nomorabsen', 'no', 'nomor']) || String(index + 1);

        const name = rawName || (username ? `Siswa ${username}` : '');

        if (name) {
          if (!username) {
            // Auto generate safe unique username from name or index
            const cleanNamePart = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
            username = `${cleanNamePart || 'siswa'}${index + 1}`;
          }

          const lowerUser = username.toLowerCase();
          if (!seenUsernames.has(lowerUser)) {
            seenUsernames.add(lowerUser);
            importedUsers.push({
              id: `usr_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 4)}`,
              username,
              password: password || '123',
              name,
              studentClass: studentClass || 'UMUM',
              absentNumber: absentNumber || String(index + 1),
              createdAt: new Date().toISOString()
            });
          }
        }
      });

      if (importedUsers.length === 0) {
        setImportAccountMsg({
          text: 'Tidak ada baris data siswa yang terbaca. Pastikan ada kolom "nama" atau "username" pada file Anda.',
          success: false
        });
        setImportAccountLoading(false);
        return;
      }

      let finalUsers: StudentUser[] = [];
      if (importAccountMode === 'APPEND') {
        const existingMap = new Map((studentUsers || []).map(u => [u.username.toLowerCase(), u]));
        importedUsers.forEach(u => existingMap.set(u.username.toLowerCase(), u));
        finalUsers = Array.from(existingMap.values());
      } else {
        finalUsers = importedUsers;
      }

      if (onUpdateStudentUsers) {
        onUpdateStudentUsers(finalUsers);
      }
      setImportAccountMsg({
        text: `Berhasil mengimpor ${importedUsers.length} akun siswa! Total akun di database sekarang: ${finalUsers.length} pengguna.`,
        success: true
      });
      setShowAccountImportArea(false);
    } catch (err: any) {
      console.error('Import accounts error:', err);
      setImportAccountMsg({ text: `Gagal membaca file: ${err.message || 'Format tidak valid'}`, success: false });
    } finally {
      setImportAccountLoading(false);
      e.target.value = '';
    }
  };

  const handleAddSingleStudentAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setAccError('');

    if (!newAccUsername.trim()) return setAccError('Username wajib diisi');
    if (!newAccPassword.trim()) return setAccError('Password wajib diisi');
    if (!newAccName.trim()) return setAccError('Nama lengkap siswa wajib diisi');
    if (!newAccClass.trim()) return setAccError('Kelas wajib diisi');

    const cleanUsername = newAccUsername.trim();
    if ((studentUsers || []).some(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
      return setAccError(`Username "${cleanUsername}" sudah digunakan oleh siswa lain.`);
    }

    const newAcc: StudentUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      username: cleanUsername,
      password: newAccPassword.trim(),
      name: newAccName.trim(),
      studentClass: newAccClass.trim().toUpperCase(),
      absentNumber: newAccAbsen.trim() || '',
      createdAt: new Date().toISOString()
    };

    const updated = [...(studentUsers || []), newAcc];
    if (onUpdateStudentUsers) {
      onUpdateStudentUsers(updated);
    }
    setImportAccountMsg({
      text: `Akun siswa "${newAcc.name}" (@${newAcc.username}) berhasil ditambahkan dan disimpan ke database!`,
      success: true
    });
    setShowAddAccountModal(false);
    setNewAccUsername('');
    setNewAccPassword('123');
    setNewAccName('');
    setNewAccAbsen('');
  };

  const handleDeleteSingleStudentAccount = (userId: string) => {
    const target = (studentUsers || []).find(u => u.id === userId);
    if (!target) return;
    if (window.confirm(`Hapus akun siswa "${target.name}" (@${target.username})?`)) {
      const updated = (studentUsers || []).filter(u => u.id !== userId);
      if (onUpdateStudentUsers) {
        onUpdateStudentUsers(updated);
      }
    }
  };

  const handleClearAllStudentAccounts = () => {
    if ((studentUsers || []).length === 0) {
      alert('Database akun siswa sudah kosong.');
      return;
    }
    if (window.confirm(`⚠️ PERINGATAN:\nYakin ingin MENGHAPUS SEMUA (${(studentUsers || []).length}) akun siswa dari database?\n\nSiswa tidak akan bisa login lagi sampai akun baru diunggah.`)) {
      if (onUpdateStudentUsers) {
        onUpdateStudentUsers([]);
      }
      alert('Seluruh data akun siswa berhasil dihapus.');
    }
  };

  const filteredStudents = students.filter(s => {
    const q = studentSearch.toLowerCase().trim();
    const matchesSearch = !q || (
      (s.name || '').toLowerCase().includes(q) ||
      (s.studentClass || '').toLowerCase().includes(q) ||
      (s.absentNumber || '').toLowerCase().includes(q)
    );
    const matchesClass = selectedClassFilter === 'all' || (s.studentClass || '') === selectedClassFilter;
    const matchesSubject = selectedSubjectFilter === 'all' || (s.subjectId || 'sub1') === selectedSubjectFilter;
    const matchesStatus = selectedStatusFilter === 'all' || s.status === selectedStatusFilter;

    const metrics = getStudentMetrics(s, questions);
    const displayScore = s.status === 'SELESAI'
      ? (s.score !== undefined ? s.score : metrics.score)
      : (typeof s.score === 'number' ? s.score : (Object.keys(s.answers || {}).length > 0 ? metrics.score : undefined));

    let matchesScore = true;
    const minVal = minScoreFilter.trim() !== '' ? parseFloat(minScoreFilter) : null;
    const maxVal = maxScoreFilter.trim() !== '' ? parseFloat(maxScoreFilter) : null;

    if (minVal !== null || maxVal !== null) {
      if (displayScore === undefined) {
        matchesScore = false;
      } else {
        if (minVal !== null && !isNaN(minVal) && displayScore < minVal) {
          matchesScore = false;
        }
        if (maxVal !== null && !isNaN(maxVal) && displayScore > maxVal) {
          matchesScore = false;
        }
      }
    }

    return matchesSearch && matchesClass && matchesSubject && matchesStatus && matchesScore;
  });

  const sortedStudents = [...filteredStudents].sort((a, b) => {
    if (studentSortBy === 'recent') {
      const timeA = new Date(a.lastActive || a.startTime || 0).getTime();
      const timeB = new Date(b.lastActive || b.startTime || 0).getTime();
      return timeB - timeA;
    }
    if (studentSortBy === 'locked') {
      if (a.status === 'TERKUNCI' && b.status !== 'TERKUNCI') return -1;
      if (b.status === 'TERKUNCI' && a.status !== 'TERKUNCI') return 1;
      return a.name.localeCompare(b.name);
    }
    if (studentSortBy === 'absen') {
      const numA = parseInt(a.absentNumber || '0', 10);
      const numB = parseInt(b.absentNumber || '0', 10);
      if (numA !== numB) return numA - numB;
      return (a.studentClass || '').localeCompare(b.studentClass || '');
    }
    if (studentSortBy === 'score_desc') {
      const sA = typeof a.score === 'number' ? a.score : -1;
      const sB = typeof b.score === 'number' ? b.score : -1;
      return sB - sA;
    }
    if (studentSortBy === 'score_asc') {
      const sA = typeof a.score === 'number' ? a.score : 999;
      const sB = typeof b.score === 'number' ? b.score : 999;
      return sA - sB;
    }
    return a.name.localeCompare(b.name);
  });

  const isFilterActive = studentSearch.trim() !== '' || 
    selectedClassFilter !== 'all' || 
    selectedSubjectFilter !== 'all' ||
    selectedStatusFilter !== 'all' ||
    minScoreFilter.trim() !== '' ||
    maxScoreFilter.trim() !== '';

  // Download Template as Real Excel (.xlsx)
  const handleDownloadTemplateXlsx = (subId?: string) => {
    const targetSub = subId ? (subjects.find(s => s.id === subId) || effectiveActiveSubject) : effectiveActiveSubject;
    const subCode = targetSub.id || 'sub1';
    const subName = targetSub.name || 'Mata Pelajaran';

    const headers = [
      'jenis_soal (MC/MR)',
      'soal',
      'opsi a',
      'opsi b',
      'opsi c',
      'opsi d',
      'skor tiap soal',
      'kode_naskah',
      'link_gambar (opsional)',
      'mode_wacana (1=ya/0=tidak)'
    ];
    
    const sampleRows = [
      ['MC', `Sebuah lingkaran memiliki jari-jari r = 7 cm. Berapakah luas lingkaran tersebut? (Gunakan nilai π = 22/7)`, '144 cm²', '*154 cm²', '164 cm²', '174 cm²', 20, subCode, '', 0],
      ['MC', `Perhatikan diagram bangun ruang pada gambar di samping! Berapakah volume bangun tersebut jika tinggi t = 10 cm?`, '300 cm³', '450 cm³', '*600 cm³', '750 cm³', 20, subCode, 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&auto=format&fit=crop&q=80', 0],
      ['MC', `Bacalah teks wacana berikut dengan saksama!\n\n   Hutan mangrove memiliki peranan yang sangat penting bagi ekosistem pesisir pantai. Akar-akarnya yang kuat mampu menahan abrasi gelombang air laut.\n\n   Selain itu, hutan mangrove juga menjadi habitat alami bagi aneka biota laut seperti kepiting, udang, dan burung bangau untuk berkembang biak secara aman.\n\nBerdasarkan wacana di atas, fungsi utama akar mangrove adalah...`, 'Tempat bertelur aneka burung', '*Mencegah bahaya abrasi pantai', 'Menjernihkan air laut', 'Menahan angin darat', 20, subCode, '', 1],
      ['MR', `Pilihlah 2 (dua) pernyataan yang benar mengenai segitiga siku-siku dengan panjang sisi a, b, dan hipotenusa c:`, '**Berlaku rumus Pythagoras: a² + b² = c²', '**Sudut terbesar adalah sudut siku-siku (90°)', 'Memiliki 2 sisi yang selalu sama panjang', 'Jumlah seluruh sudut dalamnya adalah 360°', 20, subCode, '', 0]
    ];

    const data = [headers, ...sampleRows];
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths for readability in Excel
    ws['!cols'] = [
      { wch: 20 }, // jenis_soal
      { wch: 50 }, // soal
      { wch: 22 }, // opsi a
      { wch: 22 }, // opsi b
      { wch: 22 }, // opsi c
      { wch: 22 }, // opsi d
      { wch: 15 }, // skor
      { wch: 16 }, // kode_naskah
      { wch: 30 }, // link_gambar
      { wch: 25 }  // mode_wacana
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Bank_Soal');

    const safeName = subName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    XLSX.writeFile(wb, `template_soal_${subCode}_${safeName}.xlsx`);
  };

  // Download Template as CSV
  const handleDownloadTemplateCsv = (subId?: string) => {
    const targetSub = subId ? (subjects.find(s => s.id === subId) || effectiveActiveSubject) : effectiveActiveSubject;
    const subCode = targetSub.id || 'sub1';
    const subName = targetSub.name || 'Mata Pelajaran';

    const headers = [
      'jenis_soal (MC/MR)',
      'soal',
      'opsi a',
      'opsi b',
      'opsi c',
      'opsi d',
      'skor tiap soal',
      'kode_naskah'
    ];
    
    const sampleRows = [
      ['MC', `Contoh soal pilihan ganda 1 untuk ${subName}`, 'Opsi A', '*Opsi B Benar', 'Opsi C', 'Opsi D', 20, subCode],
      ['MR', `Contoh soal respon ganda 2 (pilih 2) untuk ${subName}`, '**Opsi A Benar', '**Opsi B Benar', 'Opsi C', 'Opsi D', 20, subCode]
    ];

    const csvLines = [
      'sep=,',
      headers.join(','),
      ...sampleRows.map(row => row.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(','))
    ];

    const csvContent = '\uFEFF' + csvLines.join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `template_soal_${subCode}_${subName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Default download template (XLSX)
  const handleDownloadTemplate = (subId?: string) => {
    handleDownloadTemplateXlsx(subId);
  };

  const parseOptionHelper = (rawOption: string) => {
    const trimmed = (rawOption || '').trim();
    let isCorrect = false;
    let cleanText = trimmed;
    
    if (trimmed.startsWith('**')) {
      isCorrect = true;
      cleanText = trimmed.substring(2).trim();
    } else if (trimmed.startsWith('*')) {
      isCorrect = true;
      cleanText = trimmed.substring(1).trim();
    }
    return { isCorrect, text: cleanText };
  };

  const parseQuestionsFromCSV = (cleanText: string, targetSubjectId: string): Question[] => {
    let text = cleanText.trim();
    if (text.toLowerCase().startsWith('sep=')) {
      const newlineIdx = text.indexOf('\n');
      if (newlineIdx !== -1) {
        text = text.substring(newlineIdx + 1).trim();
      }
    }
    if (!text) return [];

    const firstLineEnd = text.indexOf('\n');
    const firstLine = firstLineEnd !== -1 ? text.substring(0, firstLineEnd) : text;
    const separator = firstLine.includes(';') ? ';' : ',';

    const parseCSV = (csvText: string, sep: string): string[][] => {
      const rows: string[][] = [];
      let currentRow: string[] = [];
      let entry = '';
      let insideQuote = false;
      
      let i = 0;
      while (i < csvText.length) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];
        
        if (char === '"') {
          if (insideQuote && nextChar === '"') {
            entry += '"';
            i += 2;
            continue;
          }
          insideQuote = !insideQuote;
          i++;
        } else if (char === sep && !insideQuote) {
          currentRow.push(entry.trim());
          entry = '';
          i++;
        } else if ((char === '\r' || char === '\n') && !insideQuote) {
          currentRow.push(entry.trim());
          entry = '';
          if (currentRow.length > 0 && !(currentRow.length === 1 && currentRow[0] === '')) {
            rows.push(currentRow);
          }
          currentRow = [];
          if (char === '\r' && nextChar === '\n') {
            i += 2;
          } else {
            i++;
          }
        } else {
          entry += char;
          i++;
        }
      }
      
      if (entry || currentRow.length > 0) {
        currentRow.push(entry.trim());
        if (currentRow.length > 0 && !(currentRow.length === 1 && currentRow[0] === '')) {
          rows.push(currentRow);
        }
      }
      return rows;
    };

    const parsedRows = parseCSV(text, separator);
    if (parsedRows.length <= 1) return [];

    const importedQs: Question[] = [];
    for (let i = 1; i < parsedRows.length; i++) {
      const columns = parsedRows[i];
      if (columns.length < 6) continue;

      const rawType = (columns[0] || '').trim().toUpperCase();
      const soalText = (columns[1] || '').trim();
      const optA = (columns[2] || '').trim();
      const optB = (columns[3] || '').trim();
      const optC = (columns[4] || '').trim();
      const optD = (columns[5] || '').trim();
      const scoreValRaw = (columns[6] || '').trim();
      
      if (!soalText || !optA || !optB || !optC || !optD) continue;

      const parsedA = parseOptionHelper(optA);
      const parsedB = parseOptionHelper(optB);
      const parsedC = parseOptionHelper(optC);
      const parsedD = parseOptionHelper(optD);

      const correctIndices: number[] = [];
      if (parsedA.isCorrect) correctIndices.push(0);
      if (parsedB.isCorrect) correctIndices.push(1);
      if (parsedC.isCorrect) correctIndices.push(2);
      if (parsedD.isCorrect) correctIndices.push(3);

      if (correctIndices.length === 0) {
        correctIndices.push(0);
      }

      const cleanOptions = [parsedA.text, parsedB.text, parsedC.text, parsedD.text];
      const qType: 'MC' | 'MR' = rawType === 'MR' ? 'MR' : 'MC';
      const qScore = scoreValRaw ? (Math.max(0, parseInt(scoreValRaw, 10)) || 10) : 10;

      const rawSubject = columns[7] ? (columns[7] || '').trim().toLowerCase() : '';
      let subId = targetSubjectId;
      if (targetSubjectId === 'auto' && rawSubject) {
        const matched = subjects.find(s => 
          s.id.toLowerCase() === rawSubject || 
          (s.code && s.code.toLowerCase() === rawSubject) ||
          s.name.toLowerCase().includes(rawSubject)
        );
        if (matched) subId = matched.id;
      }

      const rawImage = columns[8] ? (columns[8] || '').trim() : '';
      const rawPassage = columns[9] ? (columns[9] || '').trim().toLowerCase() : '';
      const isPassage = rawPassage === '1' || rawPassage === 'ya' || rawPassage === 'true' || rawPassage === 'wacana';

      importedQs.push({
        id: `q_import_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 4)}`,
        questionText: soalText,
        imageUrl: rawImage || undefined,
        isReadingPassage: isPassage ? true : undefined,
        options: cleanOptions,
        correctAnswerIndex: correctIndices[0],
        correctAnswerIndices: correctIndices,
        type: qType,
        score: qScore,
        subjectId: subId
      });
    }

    return importedQs;
  };

  const handleModalQuestionFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingQuestionFile(true);
    setQuestionModalError('');
    setQuestionModalSuccess('');
    setParsedQuestionsPreview(null);

    try {
      const fileName = file.name.toLowerCase();
      const isExcelBinary = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

      let csvText = '';
      if (isExcelBinary) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error('Berkas Excel tidak memiliki sheet yang dapat dibaca.');
        const worksheet = workbook.Sheets[sheetName];
        csvText = XLSX.utils.sheet_to_csv(worksheet);
      } else {
        csvText = await file.text();
      }

      if (!csvText || !csvText.trim()) {
        throw new Error('Berkas kosong atau tidak ada data.');
      }

      const targetId = importSubjectTarget === 'current' ? effectiveActiveSubject.id : importSubjectTarget;
      const parsed = parseQuestionsFromCSV(csvText, targetId);

      if (parsed.length === 0) {
        throw new Error('Tidak ada butir soal yang berhasil dibaca. Pastikan berkas sesuai dengan kolom template Excel.');
      }

      setParsedQuestionsPreview(parsed);
      setQuestionModalSuccess(`Berhasil membaca ${parsed.length} butir soal dari "${file.name}"! Silakan periksa tinjauan di bawah lalu klik tombol "Simpan Soal".`);
    } catch (err: any) {
      setQuestionModalError(err.message || 'Gagal membaca berkas.');
    } finally {
      setIsProcessingQuestionFile(false);
      e.target.value = '';
    }
  };

  const handleConfirmModalQuestionImport = () => {
    if (!parsedQuestionsPreview || parsedQuestionsPreview.length === 0) return;

    const targetSubId = importSubjectTarget === 'current' ? effectiveActiveSubject.id : importSubjectTarget;
    
    // Assign correct subjectId
    const finalQs = parsedQuestionsPreview.map(q => ({
      ...q,
      subjectId: importSubjectTarget === 'auto' ? q.subjectId : targetSubId
    }));

    let updatedQuestions: Question[] = [];
    if (questionImportMode === 'OVERWRITE') {
      if (importSubjectTarget === 'auto') {
        updatedQuestions = finalQs;
      } else {
        const remaining = questions.filter(q => {
          const qSub = q.subjectId || 'sub1';
          return qSub !== targetSubId;
        });
        updatedQuestions = [...remaining, ...finalQs];
      }
    } else {
      updatedQuestions = [...questions, ...finalQs];
    }

    onUpdateQuestions(updatedQuestions);
    setShowQuestionImportModal(false);
    setParsedQuestionsPreview(null);
    alert(`Sukses mengimpor ${finalQs.length} butir soal ke Bank Soal!`);
  };

  // Helper to open Edit Subject Modal with proper state preparation
  const handleOpenEditSubjectModal = (sub: ExamSubject) => {
    setEditSubjectName(sub.name);
    setEditSubjectCode(sub.code || '');
    setEditSubjectIsActive(sub.isActive !== false);
    setEditSubjectEnableSampling(sub.enableRandomSampling || false);
    setEditSubjectSampleCount(sub.sampleQuestionCount || 40);
    setEditSubjectScheduleEnabled(sub.scheduleEnabled || false);
    setEditSubjectScheduleDisplayStart(toWIBDateTimeInputValue(sub.scheduleDisplayStart));
    setEditSubjectScheduleDisplayEnd(toWIBDateTimeInputValue(sub.scheduleDisplayEnd));
    setEditSubjectScheduleExamStart(toWIBDateTimeInputValue(sub.scheduleExamStart));
    setEditSubjectScheduleExamEnd(toWIBDateTimeInputValue(sub.scheduleExamEnd));
    setEditingSubjectModal(sub);
  };

  // Microsoft Word (.docx) Universal Question Import Handler
  const handleWordFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingWordFile(true);
    setWordModalError('');
    setWordModalSuccess('');
    setParsedWordResult(null);

    try {
      if (!file.name.toLowerCase().endsWith('.docx')) {
        throw new Error('Berkas harus berformat Microsoft Word (.docx). Silakan simpan dokumen naskah soal Anda sebagai file .docx.');
      }

      const buffer = await file.arrayBuffer();
      const targetId = importSubjectTarget === 'current' ? effectiveActiveSubject.id : importSubjectTarget;
      const result = await parseDocxExamFile(buffer, targetId, wordImportDefaultScore);

      setParsedWordResult(result);
      setWordModalSuccess(
        `Berhasil membaca ${result.totalParsed} butir soal (${result.mcCount} Pilihan Ganda Tunggal, ${result.mrCount} Jawaban Ganda, ${result.imageCount} soal bergambar) dari "${file.name}"! Periksa tinjauan di bawah lalu klik tombol "Simpan & Impor".`
      );
    } catch (err: any) {
      setWordModalError(err.message || 'Gagal memproses berkas Microsoft Word.');
    } finally {
      setIsProcessingWordFile(false);
      e.target.value = '';
    }
  };

  const handleConfirmWordImport = () => {
    if (!parsedWordResult || parsedWordResult.questions.length === 0) return;

    const targetSubId = importSubjectTarget === 'current' ? effectiveActiveSubject.id : importSubjectTarget;
    const finalQs = parsedWordResult.questions.map(q => ({
      ...q,
      subjectId: importSubjectTarget === 'auto' ? q.subjectId : targetSubId
    }));

    let updatedQuestions: Question[] = [];
    if (wordImportMode === 'OVERWRITE') {
      if (importSubjectTarget === 'auto') {
        updatedQuestions = finalQs;
      } else {
        const remaining = questions.filter(q => {
          const qSub = q.subjectId || 'sub1';
          return qSub !== targetSubId;
        });
        updatedQuestions = [...remaining, ...finalQs];
      }
    } else {
      updatedQuestions = [...questions, ...finalQs];
    }

    onUpdateQuestions(updatedQuestions);
    setShowWordImportModal(false);
    setParsedWordResult(null);
    setWordModalError('');
    setWordModalSuccess('');
    alert(`Sukses mengimpor ${finalQs.length} butir soal dari dokumen Microsoft Word ke Bank Soal!`);
  };

  // Universal File Upload Handler (.xlsx, .xls, .csv)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError('');
    setImportSuccess('');

    const fileName = file.name.toLowerCase();
    const isExcelBinary = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (isExcelBinary) {
      // Parse real Excel file using SheetJS / XLSX
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const buffer = event.target?.result as ArrayBuffer;
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            setImportError('File Excel tidak memiliki lembar kerja (worksheet).');
            return;
          }
          const worksheet = workbook.Sheets[firstSheetName];
          // Convert sheet directly to CSV text without binary corruption
          const csvContent = XLSX.utils.sheet_to_csv(worksheet);
          if (!csvContent || !csvContent.trim()) {
            setImportError('Lembar kerja Excel kosong atau tidak memiliki data.');
            return;
          }
          setImportText(csvContent.trim());
          setImportSuccess(`File Excel "${file.name}" berhasil dibaca! Data soal telah dimuat ke kolom di bawah. Silakan klik tombol "Tambah ke Soal Mapel Terpilih" untuk menyimpan.`);
        } catch (err: any) {
          setImportError(`Gagal membaca berkas Excel: ${err?.message || 'Format tidak valid'}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // File CSV or Text
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        // Safeguard: Check if user uploaded a .xlsx renamed to .csv (binary zip header PK)
        if (content && content.startsWith('PK\x03\x04')) {
          const innerReader = new FileReader();
          innerReader.onload = (innerEvt) => {
            try {
              const buffer = innerEvt.target?.result as ArrayBuffer;
              const workbook = XLSX.read(buffer, { type: 'array' });
              const firstSheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[firstSheetName];
              const csvContent = XLSX.utils.sheet_to_csv(worksheet);
              setImportText(csvContent.trim());
              setImportSuccess(`File Excel "${file.name}" berhasil diproses! Data soal telah dimuat.`);
            } catch {
              setImportError('Berkas terdeteksi berformat Excel biner (.xlsx). Silakan gunakan tombol "Pilih Berkas" untuk mengunggah ulang.');
            }
          };
          innerReader.readAsArrayBuffer(file);
          return;
        }

        setImportText(content || '');
        setImportSuccess(`File "${file.name}" berhasil dimuat! Silakan periksa teks soal di bawah.`);
      };
      reader.readAsText(file, 'UTF-8');
    }

    // Reset input so user can pick the same file again if desired
    e.target.value = '';
  };

  const parseCSVData = (text: string, mode: 'APPEND' | 'OVERWRITE') => {
    try {
      setImportError('');
      setImportSuccess('');

      let cleanText = text.trim();
      // Remove sep= lines if present
      if (cleanText.toLowerCase().startsWith('sep=')) {
        const newlineIdx = cleanText.indexOf('\n');
        if (newlineIdx !== -1) {
          cleanText = cleanText.substring(newlineIdx + 1).trim();
        }
      }

      if (!cleanText) {
        setImportError('Teks data kosong atau tidak terbaca.');
        return;
      }

      // Determine separator (comma or semicolon) from the first line of cleanText
      const firstLineEnd = cleanText.indexOf('\n');
      const firstLine = firstLineEnd !== -1 ? cleanText.substring(0, firstLineEnd) : cleanText;
      const separator = firstLine.includes(';') ? ';' : ',';

      // Robust CSV parser that handles quotes, nested newlines, and double quotes
      const parseCSV = (csvText: string, sep: string): string[][] => {
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let entry = '';
        let insideQuote = false;
        
        let i = 0;
        while (i < csvText.length) {
          const char = csvText[i];
          const nextChar = csvText[i + 1];
          
          if (char === '"') {
            if (insideQuote && nextChar === '"') {
              entry += '"';
              i += 2;
              continue;
            }
            insideQuote = !insideQuote;
            i++;
          } else if (char === sep && !insideQuote) {
            currentRow.push(entry.trim());
            entry = '';
            i++;
          } else if ((char === '\r' || char === '\n') && !insideQuote) {
            currentRow.push(entry.trim());
            entry = '';
            if (currentRow.length > 0 && !(currentRow.length === 1 && currentRow[0] === '')) {
              rows.push(currentRow);
            }
            currentRow = [];
            if (char === '\r' && nextChar === '\n') {
              i += 2;
            } else {
              i++;
            }
          } else {
            entry += char;
            i++;
          }
        }
        
        if (entry || currentRow.length > 0) {
          currentRow.push(entry.trim());
          if (currentRow.length > 0 && !(currentRow.length === 1 && currentRow[0] === '')) {
            rows.push(currentRow);
          }
        }
        
        return rows;
      };

      const parsedRows = parseCSV(cleanText, separator);

      if (parsedRows.length <= 1) {
        setImportError('Format file tidak lengkap. Harap sertakan baris header dan minimal satu baris soal.');
        return;
      }

      const parseOption = (rawOption: string) => {
        const trimmed = (rawOption || '').trim();
        let isCorrect = false;
        let cleanText = trimmed;
        
        if (trimmed.startsWith('**')) {
          isCorrect = true;
          cleanText = trimmed.substring(2).trim();
        } else if (trimmed.startsWith('*')) {
          isCorrect = true;
          cleanText = trimmed.substring(1).trim();
        }
        return { isCorrect, text: cleanText };
      };

      const importedQs: Question[] = [];
      
      // Parse questions lines, skip heading line [0]
      for (let i = 1; i < parsedRows.length; i++) {
        const columns = parsedRows[i];
        // Score (columns[6]) is optional, meaning columns can have 6 fields
        if (columns.length < 6) {
          continue;
        }

        const rawType = (columns[0] || '').trim().toUpperCase();
        const soalText = columns[1];
        const optA = columns[2];
        const optB = columns[3];
        const optC = columns[4];
        const optD = columns[5];
        const scoreValRaw = columns[6];
        
        if (!soalText || !optA || !optB || !optC || !optD) {
          continue;
        }

        const parsedA = parseOption(optA);
        const parsedB = parseOption(optB);
        const parsedC = parseOption(optC);
        const parsedD = parseOption(optD);

        const correctIndices: number[] = [];
        if (parsedA.isCorrect) correctIndices.push(0);
        if (parsedB.isCorrect) correctIndices.push(1);
        if (parsedC.isCorrect) correctIndices.push(2);
        if (parsedD.isCorrect) correctIndices.push(3);

        const cleanOptions = [parsedA.text, parsedB.text, parsedC.text, parsedD.text];
        
        // Decide type
        let qType: 'MC' | 'MR' = 'MC';
        if (rawType === 'MR') {
          qType = 'MR';
        }

        // If no stars were provided, default first option as correct.
        if (correctIndices.length === 0) {
          correctIndices.push(0);
        }

        const firstCorrectIdx = correctIndices[0];
        const qScore = scoreValRaw ? (Math.max(0, parseInt(scoreValRaw, 10)) || 10) : 10;

        const rawSubject = columns[7] ? (columns[7] || '').trim().toLowerCase() : '';
        let targetSubjectId = effectiveActiveSubject.id;

        if (importSubjectTarget === 'current') {
          targetSubjectId = effectiveActiveSubject.id;
        } else if (importSubjectTarget === 'auto') {
          if (rawSubject) {
            const matched = subjects.find(s => 
              s.id.toLowerCase() === rawSubject || 
              (s.code && s.code.toLowerCase() === rawSubject) ||
              s.name.toLowerCase().includes(rawSubject)
            );
            if (matched) {
              targetSubjectId = matched.id;
            }
          }
        } else if (subjects.some(s => s.id === importSubjectTarget)) {
          targetSubjectId = importSubjectTarget;
        }

        const rawImage = columns[8] ? (columns[8] || '').trim() : '';
        const rawPassage = columns[9] ? (columns[9] || '').trim().toLowerCase() : '';
        const isPassage = rawPassage === '1' || rawPassage === 'ya' || rawPassage === 'true' || rawPassage === 'wacana';

        importedQs.push({
          id: `q_imported_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 4)}`,
          questionText: soalText,
          imageUrl: rawImage || undefined,
          isReadingPassage: isPassage ? true : undefined,
          options: cleanOptions,
          correctAnswerIndex: firstCorrectIdx,
          correctAnswerIndices: correctIndices,
          type: qType,
          score: qScore,
          subjectId: targetSubjectId
        });
      }

      if (importedQs.length === 0) {
        setImportError('Format kolom tidak cocok atau data kosong. Mohon periksa kembali kolom-kolom template.');
        return;
      }

      const targetSubName = subjects.find(s => s.id === (importSubjectTarget === 'current' ? effectiveActiveSubject.id : importSubjectTarget))?.name || 'Mata Pelajaran';

      if (mode === 'OVERWRITE') {
        const targetIdToOverwrite = importSubjectTarget === 'current' ? effectiveActiveSubject.id : (importSubjectTarget === 'auto' ? null : importSubjectTarget);
        
        let updatedList: Question[] = [];
        if (targetIdToOverwrite) {
          // Keep all questions of OTHER subjects
          const otherQs = questions.filter(q => {
            const qSub = q.subjectId || 'sub1';
            return qSub !== targetIdToOverwrite;
          });
          updatedList = [...otherQs, ...importedQs];
          setImportSuccess(`Sukses mengganti bank soal "${targetSubName}" dengan ${importedQs.length} butir soal baru (soal mata pelajaran lain tetap utuh)!`);
        } else {
          updatedList = importedQs;
          setImportSuccess(`Sukses mengganti seluruh bank soal dengan ${importedQs.length} butir soal baru dari Excel!`);
        }
        onUpdateQuestions(updatedList);
      } else {
        onUpdateQuestions([...questions, ...importedQs]);
        setImportSuccess(`Sukses menambahkan ${importedQs.length} butir soal baru ke bank soal!`);
      }

      setImportText('');
    } catch (err: any) {
      setImportError(`Gagal membaca file: ${err.message || err}`);
    }
  };

  // --- ACTIONS: STUDENT MANAGEMENT ---

  // Real-time unlock! Set status back to 'SEDANG_MENGERJAKAN' and reset violations to 0
  const handleUnlockStudent = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (student) {
      const unlockedStudent: Student = {
        ...student,
        status: 'SEDANG_MENGERJAKAN' as const,
        violationCount: 0, // Reset violation count on unlock!
        lockedReason: undefined,
        answers: student.answers || {}, // Preserve existing student answers on unlock
        lastActive: new Date().toISOString()
      };
      // Direct Firestore document update for instant sub-second propagation
      saveSingleStudent(unlockedStudent);
    }

    const updated = students.map((s) => {
      if (s.id === studentId) {
        return {
          ...s,
          status: 'SEDANG_MENGERJAKAN' as const,
          violationCount: 0, // Reset violation count on unlock!
          lockedReason: undefined,
          answers: s.answers || {}, // Preserve existing student answers on unlock
          lastActive: new Date().toISOString()
        };
      }
      return s;
    });
    onUpdateStudents(updated);
  };

  // Reset student entire attempt
  const handleResetStudentAttempt = (studentId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin mereset seluruh pengerjaan siswa ini? Jawaban yang ada akan dihapus dan siswa harus masuk layar penuh lagi.')) {
      return;
    }
    const updated = students.map((s) => {
      if (s.id === studentId) {
        return {
          ...s,
          status: 'BELUM_MULAI' as const,
          answers: {},
          violationCount: 0,
          lockedReason: undefined,
          score: undefined,
          correctAnswersCount: undefined,
          startTime: undefined,
          endTime: undefined
        };
      }
      return s;
    });
    onUpdateStudents(updated);
  };

  // Reset student violation count only (removes locks & keeps existing answers)
  const handleResetStudentViolations = (studentId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin ME-RESET pelanggaran siswa ini menjadi 0? Jika status ujian terkunci, siswa akan bisa mengakses kembali naskah ujian setara tabungan jawaban sebelumnya.')) {
      return;
    }
    const updated = students.map((s) => {
      if (s.id === studentId) {
        return {
          ...s,
          violationCount: 0,
          lockedReason: undefined,
          status: s.status === 'TERKUNCI' ? ('SEDANG_MENGERJAKAN' as const) : s.status
        };
      }
      return s;
    });
    onUpdateStudents(updated);
    alert('Pelanggaran berhasil di-reset menjadi 0 dan status ujian diaktifkan kembali!');
  };

  // Reset student used tokens quota (gives student fresh tokens)
  const handleResetStudentTokens = async (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;

    if (!window.confirm(`Reset riwayat kuota token untuk siswa "${student.name}"?\nSiswa akan memiliki kesempatan penuh kembali untuk menggunakan token mandiri.`)) {
      return;
    }

    const updatedStudent: Student = {
      ...student,
      usedTokens: [],
      tokenUnlockCount: 0,
      lastActive: new Date().toISOString()
    };
    await saveSingleStudent(updatedStudent);

    const updated = students.map((s) => (s.id === studentId ? updatedStudent : s));
    onUpdateStudents(updated);
    alert(`Kuota token untuk "${student.name}" berhasil di-reset ke 0!`);
  };

  // Reset all students' used tokens quota
  const handleResetAllStudentTokens = async () => {
    if (!window.confirm('Reset riwayat pemakaian token untuk SEMUA siswa?\nSeluruh siswa akan mendapatkan kuota token pengulangan baru.')) {
      return;
    }

    const updated = students.map((s) => {
      const resetStd: Student = {
        ...s,
        usedTokens: [],
        tokenUnlockCount: 0,
        lastActive: new Date().toISOString()
      };
      saveSingleStudent(resetStd);
      return resetStd;
    });
    onUpdateStudents(updated);
    alert('Kuota token seluruh siswa berhasil di-reset!');
  };

  // Save edited details
  const handleSaveStudentEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    const updated = students.map((s) => {
      if (s.id === editingStudent.id) {
        return {
          ...s,
          name: editName.trim(),
          absentNumber: editAbsen.trim(),
          studentClass: editClass.trim().toUpperCase()
        };
      }
      return s;
    });
    onUpdateStudents(updated);
    setEditingStudent(null);
  };

  // Delete student completely
  const handleDeleteStudent = (studentId: string) => {
    if (!window.confirm('Hapus siswa dari daftar ujian? Semua riwayat skor akan hilang.')) {
      return;
    }
    const updated = students.filter((s) => s.id !== studentId);
    onUpdateStudents(updated);
  };

  // Unlock all locked students at once and reset their violations
  const handleUnlockAllStudents = () => {
    const targetStudents = isFilterActive ? filteredStudents : students;
    const lockedStudents = targetStudents.filter((s) => s.status === 'TERKUNCI');
    if (lockedStudents.length === 0) {
      alert(isFilterActive ? 'Tidak ada siswa yang berstatus TERKUNCI dalam filter aktif saat ini.' : 'Tidak ada siswa yang berstatus TERKUNCI saat ini.');
      return;
    }
    const confirmMessage = isFilterActive
      ? `Apakah Anda yakin ingin membuka kunci untuk seluruh (${lockedStudents.length}) siswa ter-filter yang terblokir? (Jumlah pelanggaran mereka juga akan kembali ke 0)`
      : `Apakah Anda yakin ingin membuka kunci untuk seluruh (${lockedStudents.length}) siswa yang terblokir? (Jumlah pelanggaran mereka juga akan kembali ke 0)`;
    if (!window.confirm(confirmMessage)) {
      return;
    }
    const targetIds = new Set(lockedStudents.map(s => s.id));
    const updated = students.map((s) => {
      if (targetIds.has(s.id)) {
        const unlocked: Student = {
          ...s,
          status: 'SEDANG_MENGERJAKAN' as const,
          violationCount: 0, // Reset violation count on unlock!
          lockedReason: undefined,
          answers: s.answers || {}, // Preserve answers already typed
          lastActive: new Date().toISOString()
        };
        saveSingleStudent(unlocked);
        return unlocked;
      }
      return s;
    });
    onUpdateStudents(updated);
    alert(`Sukses membuka kunci & me-reset pelanggaran untuk ${lockedStudents.length} siswa!`);
  };

  // Mass reset entire student violations to 0
  const handleResetAllViolations = () => {
    const targetStudents = isFilterActive ? filteredStudents : students;
    if (targetStudents.length === 0) {
      alert('Tidak ada data siswa untuk di-reset pelanggarannya.');
      return;
    }
    const confirmMessage = isFilterActive
      ? `Apakah Anda yakin ingin MELAKUKAN RESET MASAL PELANGGARAN untuk ${targetStudents.length} siswa ter-filter? Semua jumlah pelanggaran siswa ter-filter akan kembali ke 0, dan yang berstatus TERKUNCI akan otomatis berada dalam status SEDANG_MENGERJAKAN kembali.`
      : 'Apakah Anda yakin ingin MELAKUKAN RESET MASAL PELANGGARAN untuk seluruh siswa? Semua jumlah pelanggaran siswa akan kembali ke 0, dan yang berstatus TERKUNCI akan otomatis berada dalam status SEDANG_MENGERJAKAN kembali.';
    if (!window.confirm(confirmMessage)) {
      return;
    }
    const targetIds = new Set(targetStudents.map(s => s.id));
    const updated = students.map((s) => {
      if (targetIds.has(s.id)) {
        return {
          ...s,
          violationCount: 0,
          lockedReason: undefined,
          status: s.status === 'TERKUNCI' ? ('SEDANG_MENGERJAKAN' as const) : s.status
        };
      }
      return s;
    });
    onUpdateStudents(updated);
    alert(isFilterActive ? `Pelanggaran untuk ${targetStudents.length} siswa ter-filter berhasil di-reset bersih menjadi 0!` : 'Seluruh pelanggaran siswa berhasil di-reset bersih menjadi 0!');
  };

  // Force finish a single student's ongoing exam and record their score
  const handleForceSubmitStudent = (studentId: string) => {
    const target = students.find(s => s.id === studentId);
    if (!target) return;
    if (!window.confirm(`Kumpulkan lembar ujian ${target.name} sekarang dan tetapkan nilai akhirnya?`)) {
      return;
    }
    const metrics = getStudentMetrics(target, questions);
    const updatedStudent: Student = {
      ...target,
      status: 'SELESAI' as const,
      score: metrics.score,
      correctAnswersCount: metrics.correctAnswersCount,
      totalQuestions: metrics.totalQuestions,
      endTime: target.endTime || new Date().toISOString(),
      lastActive: new Date().toISOString()
    };
    saveSingleStudent(updatedStudent);

    const updated = students.map((s) => (s.id === studentId ? updatedStudent : s));
    onUpdateStudents(updated);
    alert(`Ujian siswa ${target.name} berhasil dikumpulkan! Nilai akhir: ${metrics.score.toFixed(1)} (${metrics.correctAnswersCount}/${metrics.totalQuestions} Benar).`);
  };

  // Force finish all ongoing/locked students at once and calculate their scores
  const handleForceSubmitAllOngoing = () => {
    const targetStudents = isFilterActive ? filteredStudents : students;
    const ongoingList = targetStudents.filter(s => s.status === 'SEDANG_MENGERJAKAN' || s.status === 'TERKUNCI');
    if (ongoingList.length === 0) {
      alert(isFilterActive ? 'Tidak ada siswa yang sedang mengerjakan atau terkunci dalam filter aktif.' : 'Tidak ada siswa yang sedang mengerjakan atau terkunci saat ini.');
      return;
    }
    if (!window.confirm(`Kumpulkan paksa ujian untuk seluruh (${ongoingList.length}) siswa yang masih berlangsung? Seluruh nilai mereka akan dihitung dan status diubah menjadi SELESAI.`)) {
      return;
    }
    const ongoingIds = new Set(ongoingList.map(s => s.id));
    const updated = students.map((s) => {
      if (ongoingIds.has(s.id)) {
        const metrics = getStudentMetrics(s, questions);
        const finished: Student = {
          ...s,
          status: 'SELESAI' as const,
          score: metrics.score,
          correctAnswersCount: metrics.correctAnswersCount,
          totalQuestions: metrics.totalQuestions,
          endTime: s.endTime || new Date().toISOString(),
          lastActive: new Date().toISOString()
        };
        saveSingleStudent(finished);
        return finished;
      }
      return s;
    });
    onUpdateStudents(updated);
    alert(`Berhasil mengumpulkan dan menetapkan nilai untuk ${ongoingList.length} siswa!`);
  };

  // Admin clear local browser cache and force re-sync
  const handleAdminClearCache = () => {
    if (!window.confirm('Bersihkan cache lokal browser ini dan sinkronkan ulang seluruh bank soal, mata pelajaran, dan siswa langsung dari Cloud Firestore?')) {
      return;
    }
    localStorage.removeItem('proktor_questions');
    localStorage.removeItem('proktor_config');
    localStorage.removeItem('proktor_students');
    localStorage.removeItem('proktor_student_users');
    window.location.reload();
  };

  // Mass reset entire student progress (reset to BELUM_MULAI with clean scores & answers)
  const handleResetAllStudents = () => {
    const targetStudents = isFilterActive ? filteredStudents : students;
    if (targetStudents.length === 0) {
      alert('Tidak ada data siswa untuk diriset.');
      return;
    }
    const confirmMessage = isFilterActive
      ? `Apakah Anda yakin ingin melakukan RESET MASAL pengerjaan untuk ${targetStudents.length} siswa ter-filter? Semua jawaban yang tersimpan akan dikosongkan dan sisa waktu pengerjaan akan diuji ulang dari awal.`
      : 'Apakah Anda yakin ingin melakukan RESET MASAL seluruh pengerjaan siswa? Semua jawaban yang tersimpan akan dikosongkan dan sisa waktu pengerjaan akan diuji ulang dari awal.';
    if (!window.confirm(confirmMessage)) {
      return;
    }
    const targetIds = new Set(targetStudents.map(s => s.id));
    const updated = students.map((s) => {
      if (targetIds.has(s.id)) {
        return {
          ...s,
          status: 'BELUM_MULAI' as const,
          answers: {},
          violationCount: 0,
          lockedReason: undefined,
          score: undefined,
          correctAnswersCount: undefined,
          startTime: undefined,
          endTime: undefined
        };
      }
      return s;
    });
    onUpdateStudents(updated);
    alert(isFilterActive ? `Progress pengerjaan untuk ${targetStudents.length} siswa ter-filter berhasil di-reset masal!` : 'Progress pengerjaan seluruh siswa berhasil di-reset masal!');
  };

  // Delete all student records permanently
  const handleDeleteAllStudents = () => {
    const targetStudents = isFilterActive ? filteredStudents : students;
    if (targetStudents.length === 0) {
      alert('Tidak ada data siswa yang bisa dihapus.');
      return;
    }
    const warn1 = isFilterActive
      ? `PERINGATAN KERAS: Apakah Anda yakin ingin MENGHAPUS (${targetStudents.length}) data siswa ter-filter secara permanen dari database cloud?`
      : 'PERINGATAN KERAS: Apakah Anda yakin ingin MENGHAPUS SELURUH riwayat ujian dan daftar siswa secara permanen dari database cloud?';
    if (!window.confirm(warn1)) {
      return;
    }
    const warn2 = isFilterActive
      ? `Tindakan ini tidak bisa dibatalkan dan semua nilai siswa ter-filter akan musnah. Konfirmasi sekali lagi untuk menghapus siswa ter-filter tersebut?`
      : 'Tindakan ini tidak bisa dibatalkan dan semua nilai siswa akan musnah. Konfirmasi sekali lagi untuk menghapus seluruh siswa?';
    if (!window.confirm(warn2)) {
      return;
    }
    const targetIds = new Set(targetStudents.map(s => s.id));
    const remaining = students.filter(s => !targetIds.has(s.id));
    onUpdateStudents(remaining);
    alert(isFilterActive ? `Sebanyak ${targetStudents.length} data siswa ter-filter berhasil dihapus bersih!` : 'Seluruh data siswa berhasil dihapus bersih!');
  };

  // --- ACTIONS: EXPORT NILAI TO EXCEL (CSV Format with excel compatibility) ---
  const handleExportToExcel = () => {
    if (students.length === 0) {
      alert('Belum ada data siswa untuk diekspor!');
      return;
    }

    // Helper to safely escape CSV cells
    const escapeCsvCell = (val: any): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Replace any double quotes with standard double-double quotes for CSV standard
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    // Header row
    const headers = [
      'No',
      'Nama Siswa',
      'No Absen',
      'Kelas',
      'Naskah Soal',
      'Status Ujian',
      'Pelanggaran Proktor (Lock Count)',
      'Total Benar',
      'Jumlah Soal',
      'Nilai Akhir (%)',
      'Waktu Mulai',
      'Waktu Selesai'
    ];

    const rows = students.map((s, idx) => {
      const metrics = getStudentMetrics(s, questions);
      const correctCount = s.status === 'SELESAI' ? metrics.correctAnswersCount : (s.correctAnswersCount !== undefined ? s.correctAnswersCount : (metrics.correctAnswersCount || '-'));
      const totalCount = metrics.totalQuestions;
      const finalScore = s.status === 'SELESAI' 
        ? metrics.score.toFixed(1) 
        : (s.score !== undefined ? s.score.toFixed(1) : (Object.keys(s.answers || {}).length > 0 ? `${metrics.score.toFixed(1)} (Berjalan)` : '-'));
      
      const formatTimeText = (isoStr?: string) => {
        if (!isoStr) return '-';
        const d = new Date(isoStr);
        return `${d.toLocaleDateString('id-ID')} ${d.toLocaleTimeString('id-ID')}`;
      };

      const foundSub = subjects.find(sub => sub.id === s.subjectId || (!s.subjectId && sub.id === 'sub1'));
      const subjectName = foundSub ? foundSub.name : (s.subjectId || 'Mata Pelajaran 1');

      return [
        idx + 1,
        s.name,
        s.absentNumber,
        s.studentClass,
        subjectName,
        s.status === 'TERKUNCI' ? 'TERKOMPROMISI / TERKUNCI' : s.status,
        s.violationCount,
        correctCount,
        totalCount,
        finalScore,
        formatTimeText(s.startTime),
        formatTimeText(s.endTime)
      ];
    });

    // Generate native Excel workbook (.xlsx)
    const wb = XLSX.utils.book_new();
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Optimize column widths in Excel
    ws['!cols'] = [
      { wch: 6 },  // No
      { wch: 28 }, // Nama
      { wch: 12 }, // No Absen
      { wch: 14 }, // Kelas
      { wch: 24 }, // Naskah Soal
      { wch: 24 }, // Status
      { wch: 16 }, // Pelanggaran
      { wch: 12 }, // Total Benar
      { wch: 12 }, // Jumlah Soal
      { wch: 15 }, // Nilai Akhir
      { wch: 20 }, // Mulai
      { wch: 20 }  // Selesai
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Rekap_Nilai_Ujian');
    const safeTitle = config.examTitle.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    XLSX.writeFile(wb, `rekap_nilai_proktor_${safeTitle}.xlsx`);
  };

  // --- ACTIONS: BANK SOAL CRUD ---
  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qText.trim()) return alert('Teks soal wajib terisi!');
    if (qOptions.some(opt => !opt.trim())) return alert('Semua pilihan jawaban wajib diisi!');

    if (qType === 'MR') {
      if (qCorrectIndices.length < 2) {
        return alert('Untuk tipe Pilihan Ganda Kompleks (Jawaban Ganda), pilih minimal 2 kunci jawaban yang benar!');
      }
    } else {
      if (qCorrectIndices.length === 0) {
        return alert('Pilihlah salah satu opsi sebagai kunci jawaban yang benar!');
      }
    }

    const sortedIndices = [...qCorrectIndices].sort((a, b) => a - b);
    const primaryCorrectIndex = sortedIndices[0] ?? 0;

    if (isCreatingQuestion) {
      const newQ: Question = {
        id: `q_generated_${Date.now()}`,
        questionText: qText.trim(),
        imageUrl: qImageUrl.trim() || undefined,
        isReadingPassage: qIsReadingPassage,
        options: qOptions.map(o => o.trim()),
        correctAnswerIndex: primaryCorrectIndex,
        correctAnswerIndices: qType === 'MR' ? sortedIndices : [primaryCorrectIndex],
        type: qType,
        score: qScore,
        subjectId: qSubjectId
      };
      onUpdateQuestions([...questions, newQ]);
    } else if (editingQuestion) {
      const updated = questions.map((q) => {
        if (q.id === editingQuestion.id) {
          return {
            ...q,
            questionText: qText.trim(),
            imageUrl: qImageUrl.trim() || undefined,
            isReadingPassage: qIsReadingPassage,
            options: qOptions.map(o => o.trim()),
            correctAnswerIndex: primaryCorrectIndex,
            correctAnswerIndices: qType === 'MR' ? sortedIndices : [primaryCorrectIndex],
            type: qType,
            subjectId: qSubjectId,
            score: qScore
          };
        }
        return q;
      });
      onUpdateQuestions(updated);
    }

    // Reset questions form status
    setIsCreatingQuestion(false);
    setEditingQuestion(null);
    setQText('');
    setQImageUrl('');
    setQIsReadingPassage(false);
    setQOptions(['', '', '', '']);
    setQCorrect(0);
    setQCorrectIndices([0]);
    setQType('MC');
    setQScore(20);
  };

  const handleDeleteQuestion = (questionId: string) => {
    if (questions.length <= 1) {
      alert('Sistem membutuhkan minimal 1 soal dalam bank soal ujian!');
      return;
    }
    if (!window.confirm('Apakah Anda yakin ingin menghapus soal ini?')) {
      return;
    }
    const updated = questions.filter(q => q.id !== questionId);
    onUpdateQuestions(updated);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Admin Nav Bar */}
      <header className="bg-slate-950 text-white shadow-xl px-6 py-5 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center p-2.5 bg-indigo-500 rounded-xl text-white">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-indigo-600 px-1.5 py-0.5 rounded font-mono font-bold tracking-widest text-indigo-100">
                  MASTER CONSOLE
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-[11px] text-emerald-400 font-mono font-bold">REAL-TIME SYNC</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight">Kabin Kontrol Pengawas & Proktor</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Live Real-time WIB Clock */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <div className="flex items-center gap-1.5 font-mono text-xs">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase">WIB:</span>
                <span className="text-amber-300 font-bold">{wibClock.formattedDateTime}</span>
              </div>
            </div>

            <button
              id="btn-admin-clear-cache"
              onClick={handleAdminClearCache}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-bold rounded-xl text-xs sm:text-sm transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Bersihkan cache lokal dan sinkronkan ulang langsung dari Cloud Database"
            >
              <RefreshCw className="w-4 h-4 text-indigo-400" />
              Bersihkan Cache & Sinkronkan
            </button>
            <button
              id="btn-admin-export"
              onClick={handleExportToExcel}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl text-xs sm:text-sm transition flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Ekspor Nilai (Excel)
            </button>
            <button
              id="btn-exit-admin"
              onClick={onExit}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-350 font-bold rounded-xl text-xs sm:text-sm transition"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      {/* Primary Sub Tabs */}
      <div className="bg-white border-b border-slate-200 overflow-x-auto">
        <div className="max-w-6xl mx-auto flex min-w-max">
          <button
            onClick={() => setActiveTab('MONITOR')}
            className={`px-5 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'MONITOR'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            Monitoring Siswa ({students.length})
          </button>
          <button
            onClick={() => setActiveTab('CHARTS')}
            className={`px-5 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'CHARTS'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            Grafik Monitoring
          </button>
          <button
            onClick={() => setActiveTab('ITEM_ANALYSIS')}
            className={`px-5 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'ITEM_ANALYSIS'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Analisis Butir Soal & Excel
          </button>
          <button
            onClick={() => setActiveTab('QUESTIONS')}
            className={`px-5 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'QUESTIONS'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Bank Soal Ujian ({questions.length})
          </button>
          <button
            onClick={() => setActiveTab('CONFIG')}
            className={`px-5 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'CONFIG'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            Konfigurasi Ujian
          </button>
          <button
            onClick={() => setActiveTab('ACCOUNTS')}
            className={`px-5 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'ACCOUNTS'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Data Akun Siswa ({(studentUsers || []).length})
          </button>
        </div>
      </div>

      {/* Main Panel Content Area */}
      <main className="max-w-6xl mx-auto w-full flex-1 p-4 sm:p-6 pb-20">
        
        {/* TAB 1: MONITORING TABLE */}
        {activeTab === 'MONITOR' && (
          <div className="space-y-6">
            
            {/* Quick Metrics Banner */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <div className="text-xs text-slate-400 font-bold font-mono">TOTAL SISWA</div>
                <div className="text-2xl font-extrabold text-slate-800 mt-1">{students.length}</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl">
                <div className="text-xs text-emerald-600 font-bold font-mono">SELESAI</div>
                <div className="text-2xl font-extrabold text-emerald-800 mt-1">
                  {students.filter(s => s.status === 'SELESAI').length}
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl">
                <div className="text-xs text-blue-600 font-bold font-mono">SEDANG MENGERJAKAN</div>
                <div className="text-2xl font-extrabold text-blue-800 mt-1">
                  {students.filter(s => s.status === 'SEDANG_MENGERJAKAN').length}
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 p-4 rounded-2xl">
                <div className="text-xs text-red-650 font-bold font-mono flex items-center gap-1">
                  TERKUNCI / BLOCKED
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 inline" />
                </div>
                <div className="text-2xl font-extrabold text-red-700 mt-1">
                  {students.filter(s => s.status === 'TERKUNCI').length}
                </div>
              </div>
            </div>

            {/* URGENT LOCKED STUDENTS ACTION BANNER */}
            {students.filter(s => s.status === 'TERKUNCI').length > 0 && (
              <div className="bg-rose-600 text-white p-5 rounded-2xl shadow-xl border border-rose-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-2xl shrink-0">
                    <AlertTriangle className="w-7 h-7 text-white animate-bounce" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-white text-rose-700 font-black font-mono px-2 py-0.5 rounded-full uppercase tracking-wider">
                        PERINGATAN PROKTOR
                      </span>
                      <span className="text-xs font-mono font-bold text-rose-200">
                        {students.filter(s => s.status === 'TERKUNCI').length} Siswa Terkunci
                      </span>
                    </div>
                    <h4 className="text-base sm:text-lg font-black tracking-tight mt-0.5">
                      Ada {students.filter(s => s.status === 'TERKUNCI').length} siswa yang sedang terblokir / terkunci!
                    </h4>
                    <p className="text-xs text-rose-100 mt-0.5">
                      Tombol unlock kini dapat langsung diklik pada kolom status siswa di bawah atau buka sekaligus seluruh kunci siswa dengan tombol di samping.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  id="btn-alert-unlock-all"
                  onClick={handleUnlockAllStudents}
                  className="px-5 py-3 bg-white hover:bg-rose-50 text-rose-700 font-black text-xs sm:text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 shrink-0"
                >
                  <KeyRound className="w-4 h-4 text-rose-600" />
                  Buka Kunci Semua ({students.filter(s => s.status === 'TERKUNCI').length})
                </button>
              </div>
            )}

             {/* Panel Kontrol Masal Pengawas / Proktor */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-4 bg-indigo-600 rounded-full inline-block"></span>
                  <h4 className="font-extrabold text-xs sm:text-sm text-slate-800 uppercase tracking-wider font-mono">
                    Panel Kontrol Manajemen Masal (Proktor Master)
                  </h4>
                </div>
                <span className="px-2 py-0.5 text-[10px] bg-red-100 text-red-700 font-bold rounded font-mono">ADJUSTMENTS DISPATCHER</span>
              </div>

              {isFilterActive && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3.5 rounded-xl text-xs flex items-center gap-2 font-semibold animate-fade-in">
                  <AlertTriangle className="w-4.5 h-4.5 text-amber-600 shrink-0" />
                  <span>
                    <strong>FILTER AKTIF DETEKSI:</strong> Tindakan masal di bawah (Buka Kunci, Reset Pelanggaran, Reset Sesi, Hapus) hanya akan berdampak khusus pada <strong>{filteredStudents.length} siswa</strong> yang lolos kriteria pencarian/filter aktif.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  type="button"
                  id="btn-bulk-finalize"
                  onClick={handleForceSubmitAllOngoing}
                  className="px-4 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] shadow-xs"
                  title="Kumpulkan dan tetapkan nilai untuk semua siswa yang masih Sedang Mengerjakan atau Terkunci"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                  {isFilterActive
                    ? `Kumpulkan Ter-filter (${filteredStudents.filter(s => s.status === 'SEDANG_MENGERJAKAN' || s.status === 'TERKUNCI').length})`
                    : `Kumpulkan Semua Berjalan (${students.filter(s => s.status === 'SEDANG_MENGERJAKAN' || s.status === 'TERKUNCI').length})`
                  }
                </button>

                <button
                  type="button"
                  id="btn-bulk-unlock"
                  onClick={handleUnlockAllStudents}
                  className="px-4 py-3.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-300 font-extrabold rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] shadow-xs"
                >
                  <KeyRound className="w-4 h-4 text-indigo-650" />
                  {isFilterActive 
                    ? `Unlock Ter-filter (${filteredStudents.filter(s => s.status === 'TERKUNCI').length})`
                    : `Buka Kunci Semua (${students.filter(s => s.status === 'TERKUNCI').length})`
                  }
                </button>

                <button
                  type="button"
                  id="btn-bulk-reset-violations"
                  onClick={handleResetAllViolations}
                  className="px-4 py-3.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 border border-emerald-200 hover:border-emerald-300 font-extrabold rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] shadow-xs"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-650" />
                  {isFilterActive
                    ? `Reset Pelanggaran Ter-filter (${filteredStudents.filter(s => (s.violationCount || 0) > 0).length})`
                    : `Reset Masal Pelanggaran (${students.filter(s => (s.violationCount || 0) > 0).length})`
                  }
                </button>

                <button
                  type="button"
                  id="btn-bulk-reset"
                  onClick={handleResetAllStudents}
                  className="px-4 py-3.5 bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-805 border border-amber-200 hover:border-amber-300 font-extrabold rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] shadow-xs"
                >
                  <RefreshCw className="w-4 h-4 text-amber-650" />
                  {isFilterActive
                    ? `Reset Sesi Ter-filter (${filteredStudents.length})`
                    : 'Reset Masal Sesi'
                  }
                </button>

                <button
                  type="button"
                  id="btn-bulk-reset-tokens"
                  onClick={handleResetAllStudentTokens}
                  className="px-4 py-3.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-800 hover:text-yellow-900 border border-yellow-200 hover:border-yellow-300 font-extrabold rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] shadow-xs"
                  title="Reset seluruh riwayat kuota token siswa"
                >
                  <Ticket className="w-4 h-4 text-amber-600" />
                  Reset Kuota Token
                </button>

                <button
                  type="button"
                  id="btn-bulk-wipe"
                  onClick={handleDeleteAllStudents}
                  className="px-4 py-3.5 bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 border border-red-200 hover:border-red-305 font-extrabold rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] shadow-xs"
                >
                  <Trash2 className="w-4 h-4 text-red-650" />
                  {isFilterActive
                    ? `Hapus Ter-filter (${filteredStudents.length})`
                    : 'Hapus Semua Data'
                  }
                </button>
              </div>
            </div>

            {/* Students Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div>
                    <h3 className="font-bold text-slate-800">Daftar Kehadiran & Nilai Siswa</h3>
                    <span className="text-xs text-slate-400 italic">Nilai otomatis dikalkulasi real-time saat siswa klik kumpul atau waktu habis</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewMonitorName('');
                      setNewMonitorAbsen('');
                      setNewMonitorClass('8A');
                      setNewMonitorSubject(effectiveActiveSubject.id || 'sub1');
                      setAddMonitorError('');
                      setShowAddStudentMonitorModal(true);
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-2xs cursor-pointer self-start sm:self-auto shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Siswa Manual
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('ACCOUNTS');
                      setShowAccountImportArea(true);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-2xs cursor-pointer self-start sm:self-auto shrink-0"
                    title="Unggah berkas Excel/CSV untuk mendaftarkan akun siswa secara masal"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Unggah Siswa Excel
                  </button>
                </div>
                
                {/* Quick Subject Pill Tabs for 1-click filtering */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80 mb-3 w-full">
                  <button
                    type="button"
                    onClick={() => setSelectedSubjectFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      selectedSubjectFilter === 'all'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <span>Semua Naskah</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${selectedSubjectFilter === 'all' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                      {students.length}
                    </span>
                  </button>
                  {subjects.map((sub) => {
                    const count = students.filter(s => (!s.subjectId && sub.id === 'sub1') || s.subjectId === sub.id).length;
                    const isActive = selectedSubjectFilter === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => setSelectedSubjectFilter(sub.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                        }`}
                      >
                        <span>{sub.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isActive ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Search & Filter Controls Grid */}
                <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3">
                  {/* Search Bar Input */}
                  <div className="relative w-full sm:w-60 md:w-64">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <Search className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Cari nama, kelas, atau absen..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 border border-slate-200 bg-white rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors font-sans"
                    />
                    {studentSearch && (
                      <button
                        onClick={() => setStudentSearch('')}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 font-bold text-sm"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Filter Kelas Drops */}
                  <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
                    <span className="text-[11px] font-bold text-slate-400 uppercase font-mono sm:inline hidden">Kelas:</span>
                    <select
                      value={selectedClassFilter}
                      onChange={(e) => setSelectedClassFilter(e.target.value)}
                      className="w-full sm:w-auto px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="all">Semua Kelas ({students.length})</option>
                      {Array.from(new Set(students.map(s => s.studentClass).filter(Boolean))).sort().map(cls => (
                        <option key={cls} value={cls}>{cls} ({students.filter(s => s.studentClass === cls).length})</option>
                      ))}
                    </select>
                  </div>

                  {/* Filter Mapel/Paket Drops */}
                  <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
                    <span className="text-[11px] font-bold text-slate-400 uppercase font-mono sm:inline hidden">Naskah:</span>
                    <select
                      value={selectedSubjectFilter}
                      onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                      className="w-full sm:w-auto px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="all">Semua Naskah ({students.length})</option>
                      {subjects.map((sub) => {
                        const count = students.filter(s => (!s.subjectId && sub.id === 'sub1') || s.subjectId === sub.id).length;
                        return (
                          <option key={sub.id} value={sub.id}>
                            {sub.name} ({count})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Filter Status Drops */}
                  <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
                    <span className="text-[11px] font-bold text-slate-400 uppercase font-mono sm:inline hidden">Status:</span>
                    <select
                      value={selectedStatusFilter}
                      onChange={(e) => setSelectedStatusFilter(e.target.value)}
                      className="w-full sm:w-auto px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="all">Semua Status ({students.length})</option>
                      <option value="SELESAI">Selesai ({students.filter(s => s.status === 'SELESAI').length})</option>
                      <option value="SEDANG_MENGERJAKAN">Sedang Mengerjakan ({students.filter(s => s.status === 'SEDANG_MENGERJAKAN').length})</option>
                      <option value="TERKUNCI">Terblokir/Terkunci ({students.filter(s => s.status === 'TERKUNCI').length})</option>
                      <option value="BELUM_MULAI">Belum Mulai ({students.filter(s => s.status === 'BELUM_MULAI').length})</option>
                    </select>
                  </div>

                  {/* Sort Order Drops */}
                  <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
                    <span className="text-[11px] font-bold text-slate-400 uppercase font-mono sm:inline hidden">Urutkan:</span>
                    <select
                      value={studentSortBy}
                      onChange={(e: any) => setStudentSortBy(e.target.value)}
                      className="w-full sm:w-auto px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="recent">Waktu Terbaru / Terakhir Aktif</option>
                      <option value="locked">Prioritas Terkunci (Perlu Unlock)</option>
                      <option value="name">Nama Siswa (A - Z)</option>
                      <option value="absen">Nomor Absen</option>
                      <option value="score_desc">Nilai Tertinggi</option>
                      <option value="score_asc">Nilai Terendah</option>
                    </select>
                  </div>

                  {/* Filter Rentang Nilai Manual */}
                  <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
                    <span className="text-[11px] font-bold text-slate-400 uppercase font-mono sm:inline hidden">Nilai:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        id="input-min-score"
                        value={minScoreFilter}
                        onChange={(e) => setMinScoreFilter(e.target.value)}
                        placeholder="Min (0)"
                        min="0"
                        max="100"
                        className="w-20 px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-indigo-500 font-mono text-center"
                      />
                      <span className="text-slate-400 font-mono text-xs">-</span>
                      <input
                        type="number"
                        id="input-max-score"
                        value={maxScoreFilter}
                        onChange={(e) => setMaxScoreFilter(e.target.value)}
                        placeholder="Maks (100)"
                        min="0"
                        max="100"
                        className="w-20 px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-indigo-500 font-mono text-center"
                      />
                    </div>
                  </div>

                  {isFilterActive && (
                    <button
                      type="button"
                      id="btn-clear-all-filters"
                      onClick={() => {
                        setStudentSearch('');
                        setSelectedClassFilter('all');
                        setSelectedSubjectFilter('all');
                        setSelectedStatusFilter('all');
                        setMinScoreFilter('');
                        setMaxScoreFilter('');
                      }}
                      className="w-full sm:w-auto px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reset Filter
                    </button>
                  )}
                </div>
              </div>

              {students.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="inline-flex p-3 bg-slate-100 rounded-full text-slate-400 mb-2">
                    <Users className="w-8 h-8" />
                  </div>
                  <h4 className="font-bold text-slate-700">Belum ada siswa yang mendaftar</h4>
                  <p className="text-xs text-slate-400 mt-1">Siswa akan muncul di sini secara real-time setelah mereka menginput nama di lembar depan ujian.</p>
                </div>
              ) : sortedStudents.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="inline-flex p-3 bg-indigo-50 rounded-full text-indigo-500 mb-2 animate-pulse">
                    <Search className="w-8 h-8" />
                  </div>
                  <h4 className="font-bold text-slate-700">Hasil pencarian tidak ditemukan</h4>
                  <p className="text-xs text-slate-400 mt-1">Tidak ada nama, kelas, atau absen siswa yang cocok dengan kata kunci "{studentSearch}".</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs font-mono uppercase tracking-wider border-b border-slate-200">
                        <th className="px-6 py-3">Absen</th>
                        <th className="px-6 py-3">Informasi Siswa</th>
                        <th className="px-6 py-3">Kelas</th>
                        <th className="px-6 py-3">Status Proktor</th>
                        <th className="px-6 py-3">Waktu Ujian</th>
                        <th className="px-6 py-3">Pelanggaran & Token</th>
                        <th className="px-6 py-3">Jawaban</th>
                        <th className="px-6 py-3">Nilai</th>
                        <th className="px-6 py-3 text-right">Tindakan Admin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedStudents.map((s) => {
                        const metrics = getStudentMetrics(s, questions);
                        const displayScore = s.status === 'SELESAI'
                          ? (s.score !== undefined ? s.score : metrics.score)
                          : (typeof s.score === 'number' ? s.score : (Object.keys(s.answers || {}).length > 0 ? metrics.score : undefined));
                        const scoreBg = displayScore !== undefined && displayScore >= 70 ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-800';
                        
                        return (
                          <tr key={s.id} className={`transition duration-150 ${s.status === 'TERKUNCI' ? 'bg-rose-50/90 border-l-4 border-rose-500 hover:bg-rose-100/70' : 'hover:bg-slate-50/50'}`}>
                            <td className="px-6 py-4 font-mono font-bold text-slate-500">
                              {s.absentNumber.padStart(2, '0')}
                            </td>
                            <td className="px-6 py-4 font-semibold text-slate-800">
                              <div>{s.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase flex flex-col gap-0.5">
                                <span>ID: {s.id.slice(0, 8)}</span>
                                {(() => {
                                  const foundSub = subjects.find(sub => sub.id === s.subjectId || (!s.subjectId && sub.id === 'sub1'));
                                  return (
                                    <span className="font-bold mt-1 inline-block text-[9px] px-1.5 py-0.5 rounded-md text-center max-w-fit bg-indigo-100/80 text-indigo-800">
                                      Naskah: {foundSub ? foundSub.name : (s.subjectId || 'Mata Pelajaran 1')}
                                    </span>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="px-6 py-4 font-semibold text-slate-600 font-mono">
                              {s.studentClass}
                            </td>
                            <td className="px-6 py-4">
                              {s.status === 'BELUM_MULAI' && (
                                <span className="px-2.5 py-1 text-xs font-semibold bg-slate-100 text-slate-500 rounded-full font-mono">BELUM MULAI</span>
                              )}
                              {s.status === 'SEDANG_MENGERJAKAN' && (
                                <span className="px-2.5 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full font-mono animate-pulse">SEDANG KERJA</span>
                              )}
                              {s.status === 'SELESAI' && (
                                <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-150 text-emerald-800 rounded-full font-mono font-bold">SELESAI</span>
                              )}
                              {s.status === 'TERKUNCI' && (
                                <div className="space-y-1.5">
                                  <span className="px-2.5 py-1 text-xs font-bold bg-rose-600 text-white rounded-md font-mono inline-flex items-center gap-1 shadow-xs">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    TERKUNCI
                                  </span>
                                  <div className="text-[10px] text-red-650 font-bold max-w-[150px] leading-tight">
                                    {s.lockedReason || 'Ganti screen tab'}
                                  </div>
                                  <button
                                    type="button"
                                    id={`btn-direct-unlock-${s.id}`}
                                    onClick={() => handleUnlockStudent(s.id)}
                                    className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer animate-pulse"
                                    title="Langsung buka kunci untuk siswa ini"
                                  >
                                    <KeyRound className="w-3.5 h-3.5 text-slate-900" />
                                    <span>Buka Kunci (Unlock)</span>
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs whitespace-nowrap">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-slate-400 w-10">Mulai:</span>
                                  <span className="text-slate-700 font-bold">{formatHourMinuteSecond(s.startTime)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-slate-400 w-10">Selesai:</span>
                                  <span className={s.status === 'SELESAI' ? 'text-emerald-600 font-extrabold' : 'text-slate-400 font-medium'}>
                                    {formatHourMinuteSecond(s.endTime)}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center font-mono font-semibold">
                              <div className="flex flex-col items-center gap-1">
                                <span className={s.violationCount > 0 ? 'text-red-600 font-bold' : 'text-slate-400'}>
                                  {s.violationCount}x
                                </span>
                                <span
                                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold border ${
                                    (s.usedTokens || []).length >= (config.unlockTokens || ['TOKEN-1', 'TOKEN-2']).length
                                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                                      : (s.usedTokens || []).length > 0
                                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                                      : 'bg-slate-50 border-slate-200 text-slate-500'
                                  }`}
                                  title={`Token terpakai: ${(s.usedTokens || []).join(', ') || 'Belum ada'}`}
                                >
                                  Token: {(s.usedTokens || []).length}/{(config.unlockTokens || ['TOKEN-1', 'TOKEN-2']).length}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-slate-400">
                              {s.answers ? `${Object.keys(s.answers).length}/${metrics.totalQuestions}` : '0'}
                            </td>
                            <td className="px-6 py-4 font-bold">
                              {displayScore !== undefined ? (
                                <div className="space-y-0.5">
                                  <span className={`px-2.5 py-1 text-xs font-extrabold rounded-md ${scoreBg} font-mono inline-block`}>
                                    {displayScore.toFixed(1)} / 100
                                  </span>
                                  {s.status !== 'SELESAI' && (
                                    <div className="text-[10px] text-amber-600 font-mono font-semibold">
                                      Live: {metrics.correctAnswersCount}/{metrics.totalQuestions} Benar
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-300 font-mono">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right space-x-1.5 whitespace-nowrap">
                              {/* Option to Force Finish / Submit */}
                              {s.status !== 'SELESAI' && (
                                <button
                                  id={`btn-finalize-${s.id}`}
                                  onClick={() => handleForceSubmitStudent(s.id)}
                                  className="px-2.5 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-xs transition"
                                  title="Kumpulkan lembar ujian siswa ini dan tetapkan nilai akhir"
                                >
                                  Kumpulkan
                                </button>
                              )}

                              {/* Option to Unlock (Reset Status to Sedang Mengerjakan) */}
                              {s.status === 'TERKUNCI' && (
                                <button
                                  id={`btn-unlock-${s.id}`}
                                  onClick={() => handleUnlockStudent(s.id)}
                                  className="px-2.5 py-1 text-xs font-bold bg-yellow-400 hover:bg-yellow-300 text-slate-900 rounded-lg shadow-xs transition"
                                  title="Buka blokir dan izinkan lanjut ujian"
                                >
                                  Unlock Ujian
                                </button>
                              )}

                              <button
                                id={`btn-edit-student-${s.id}`}
                                onClick={() => {
                                  setEditingStudent(s);
                                  setEditName(s.name);
                                  setEditAbsen(s.absentNumber);
                                  setEditClass(s.studentClass);
                                }}
                                className="p-1 px-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md transition"
                                title="Edit Data Siswa"
                              >
                                <Edit className="w-3.5 h-3.5 inline" />
                              </button>

                              <button
                                id={`btn-reset-stud-${s.id}`}
                                onClick={() => handleResetStudentAttempt(s.id)}
                                className="p-1 px-2 text-slate-500 hover:text-yellow-600 hover:bg-slate-100 rounded-md transition"
                                title="Reset Sesi Siswa"
                              >
                                <RefreshCw className="w-3.5 h-3.5 inline" />
                              </button>

                              <button
                                id={`btn-reset-violation-${s.id}`}
                                onClick={() => handleResetStudentViolations(s.id)}
                                className="p-1 px-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition"
                                title="Reset Pelanggaran Saja (Bisa Lanjut Ujian)"
                              >
                                <ShieldCheck className="w-3.5 h-3.5 inline text-emerald-600" />
                              </button>

                              <button
                                id={`btn-reset-tokens-${s.id}`}
                                onClick={() => handleResetStudentTokens(s.id)}
                                className="p-1 px-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition"
                                title="Reset Kuota Token Siswa (Beri Kesempatan Token Baru)"
                              >
                                <Ticket className="w-3.5 h-3.5 inline text-amber-600" />
                              </button>

                              <button
                                id={`btn-delete-student-${s.id}`}
                                onClick={() => handleDeleteStudent(s.id)}
                                className="p-1 px-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                                title="Hapus Siswa"
                              >
                                <Trash2 className="w-3.5 h-3.5 inline" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: GRAFIK & STATISTIK MONITORING */}
        {activeTab === 'CHARTS' && (
          <AnalyticsCharts
            students={students}
            questions={questions}
            config={config}
          />
        )}

        {/* TAB: ANALISIS BUTIR SOAL & EXCEL */}
        {activeTab === 'ITEM_ANALYSIS' && (
          <ItemAnalysisTab
            questions={questions}
            students={students}
            config={config}
          />
        )}

        {/* TAB 2: BANK SOAL */}
        {activeTab === 'QUESTIONS' && (
          <div className="space-y-6">
            {/* Header Bank Soal */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] bg-indigo-100 text-indigo-800 font-mono font-bold px-2 py-0.5 rounded-full uppercase">
                    Manajemen Multi-Mapel ({subjects.length}/20 Slot)
                  </span>
                </div>
                <h3 className="font-extrabold text-slate-800 text-lg">Kelola Bank Soal Tiap Mata Pelajaran</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tiap mata pelajaran kini terpisah seutuhnya: jumlah soal terpisah, penambahan & penghapusan soal terpisah, serta dapat diatur tampil/tidaknya di menu siswa.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  id="btn-download-excel-template"
                  onClick={() => handleDownloadTemplateXlsx()}
                  className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  title="Unduh file template asli Microsoft Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Template Excel (.xlsx)
                </button>
                <button
                  id="btn-download-csv-template"
                  onClick={() => handleDownloadTemplateCsv()}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                  title="Unduh file template versi teks CSV (.csv)"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  Versi CSV
                </button>
                <button
                  id="btn-toggle-import-panel"
                  onClick={() => {
                    setImportSubjectTarget(effectiveActiveSubject.id);
                    setParsedQuestionsPreview(null);
                    setQuestionModalError('');
                    setQuestionModalSuccess('');
                    setShowQuestionImportModal(true);
                  }}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  title="Buka panel impor soal dari file Excel (.xlsx / .xls) atau CSV"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import Soal Excel (.xlsx)
                </button>
                <button
                  id="btn-open-word-import-modal"
                  onClick={() => {
                    setImportSubjectTarget(effectiveActiveSubject.id);
                    setParsedWordResult(null);
                    setWordModalError('');
                    setWordModalSuccess('');
                    setShowWordImportModal(true);
                  }}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  title="Buka panel impor soal langsung dari Microsoft Word (.docx) lengkap dengan gambar & kunci di bawah"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Import Soal Word (.docx)
                </button>
                <button
                  id="btn-add-question-trigger"
                  onClick={() => {
                    setIsCreatingQuestion(true);
                    setEditingQuestion(null);
                    setQText('');
                    setQImageUrl('');
                    setQIsReadingPassage(false);
                    setQOptions(['', '', '', '']);
                    setQCorrect(0);
                    setQCorrectIndices([0]);
                    setQType('MC');
                    setQSubjectId(effectiveActiveSubject.id);
                    setShowImportArea(false);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Soal ke {effectiveActiveSubject.name}
                </button>
              </div>
            </div>

            {/* TAB / SLOT MATA PELAJARAN (MAKS 20 SLOT) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider font-mono">
                    PILIH SLOT MATA PELAJARAN (Total {subjects.length}/20 Slot):
                  </span>
                </div>
                {subjects.length < 20 && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewSubjectName('');
                      setNewSubjectCode(`MP-${subjects.length + 1}`);
                      setNewSubjectIsActive(true);
                      setIsAddingSubjectModal(true);
                    }}
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg transition flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah Slot Baru
                  </button>
                )}
              </div>

              {/* Subject Slot Selector Chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {subjects.map((sub, sIdx) => {
                  const isCurrent = sub.id === effectiveActiveSubject.id;
                  const qCount = questions.filter(q => (!q.subjectId && sub.id === 'sub1') || q.subjectId === sub.id).length;
                  const isVisibleToStudents = sub.isActive !== false;

                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        setActiveSubjectId(sub.id);
                        setQSubjectId(sub.id);
                      }}
                      className={`px-3.5 py-2.5 rounded-xl text-left border shrink-0 transition-all flex items-center gap-2.5 ${
                        isCurrent
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center font-mono font-bold text-[10px] ${
                        isCurrent ? 'bg-indigo-700 text-white' : 'bg-white border border-slate-200 text-slate-500'
                      }`}>
                        {sIdx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-extrabold truncate max-w-[150px]">{sub.name}</span>
                          {isVisibleToStudents ? (
                            <span title="Ditampilkan di naskah ujian siswa">
                              <Eye className={`w-3 h-3 ${isCurrent ? 'text-indigo-200' : 'text-emerald-500'}`} />
                            </span>
                          ) : (
                            <span title="Disembunyikan dari naskah ujian siswa">
                              <EyeOff className={`w-3 h-3 ${isCurrent ? 'text-indigo-300' : 'text-slate-400'}`} />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-mono ${isCurrent ? 'text-indigo-100' : 'text-slate-400'}`}>
                            {qCount} Soal
                          </span>
                          {sub.code && (
                            <span className={`text-[9px] font-mono px-1 rounded ${
                              isCurrent ? 'bg-indigo-700/60 text-indigo-100' : 'bg-slate-200/60 text-slate-500'
                            }`}>
                              {sub.code}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* KABIN DETAIL & KONTROL KHUSUS MAPEL TERPILIH */}
            <div className="bg-white rounded-2xl border-2 border-indigo-100 p-5 shadow-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 font-bold font-mono">
                    #{subjects.findIndex(s => s.id === effectiveActiveSubject.id) + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-extrabold text-slate-800">{effectiveActiveSubject.name}</h4>
                      {effectiveActiveSubject.code && (
                        <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                          {effectiveActiveSubject.code}
                        </span>
                      )}
                      <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                        {questions.filter(q => (!q.subjectId && effectiveActiveSubject.id === 'sub1') || q.subjectId === effectiveActiveSubject.id).length} Soal
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-500">Status Siswa:</span>
                      <button
                        type="button"
                        onClick={() => handleToggleSubjectActive(effectiveActiveSubject.id)}
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 transition ${
                          effectiveActiveSubject.isActive !== false
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                        }`}
                        title="Klik untuk mengubah status tampil/tidaknya mapel ini di menu registrasi siswa"
                      >
                        {effectiveActiveSubject.isActive !== false ? (
                          <>
                            <Eye className="w-3 h-3 text-emerald-600" />
                            Tampil di Menu Siswa (Aktif)
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3 text-amber-600" />
                            Disembunyikan dari Siswa (Nonaktif)
                          </>
                        )}
                      </button>
                    </div>

                    {/* Live Schedule Status Indicator */}
                    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                      <span className="text-[11px] font-mono text-slate-500 font-bold flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                        Jadwal WIB:
                      </span>
                      {effectiveActiveSubject.scheduleEnabled ? (
                        (() => {
                          const sched = evaluateSubjectSchedule(effectiveActiveSubject, wibClock.now);
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-full border ${sched.badgeBg}`}>
                                {sched.badgeText}
                              </span>
                              <span className="text-[11px] text-slate-600 font-mono">
                                {effectiveActiveSubject.scheduleExamStart
                                  ? `Mulai: ${formatWIBShort(effectiveActiveSubject.scheduleExamStart)}`
                                  : 'Langsung bisa dikerjakan'}
                                {effectiveActiveSubject.scheduleExamEnd && ` s/d ${formatWIBShort(effectiveActiveSubject.scheduleExamEnd)}`}
                              </span>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md border border-slate-200">
                            Tanpa Jadwal (Terbuka Bebas)
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenEditSubjectModal(effectiveActiveSubject)}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                          >
                            + Jadwalkan Jam Ujian
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Subject Actions Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setImportSubjectTarget(effectiveActiveSubject.id);
                      setParsedWordResult(null);
                      setWordModalError('');
                      setWordModalSuccess('');
                      setShowWordImportModal(true);
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title={`Unggah & import soal langsung dari Microsoft Word (.docx) ke ${effectiveActiveSubject.name}`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Import Word (.docx)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportSubjectTarget(effectiveActiveSubject.id);
                      setParsedQuestionsPreview(null);
                      setQuestionModalError('');
                      setQuestionModalSuccess('');
                      setShowQuestionImportModal(true);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title={`Unggah & import soal Excel (.xlsx) langsung ke mapel ${effectiveActiveSubject.name}`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditSubjectModal(effectiveActiveSubject)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1 cursor-pointer"
                    title="Atur Nama, Kode, Jadwal Jam WIB, dan Pengambilan Soal Acak"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Jadwal & Edit Mapel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteAllQuestionsForSubject(effectiveActiveSubject.id)}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl transition flex items-center gap-1"
                    title="Hapus hanya soal-soal di mata pelajaran ini"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Kosongkan Soal Mapel Ini
                  </button>
                  <button
                    type="button"
                    onClick={handleWipeAllQuestionsEntirely}
                    className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 font-extrabold text-xs rounded-xl transition flex items-center gap-1 shadow-2xs cursor-pointer"
                    title="Hapus bersih seluruh bank soal di SEMUA mata pelajaran (0 soal)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Kosongkan Semua Soal ({questions.length})
                  </button>
                  {subjects.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSubjectSlot(effectiveActiveSubject.id)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 font-bold text-xs rounded-xl transition flex items-center gap-1"
                      title="Hapus slot mata pelajaran ini"
                    >
                      Hapus Slot
                    </button>
                  )}
                </div>
              </div>

              {/* Informative Note */}
              <div className="mt-3 text-xs text-slate-500 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>
                  Soal di bawah ini murni milik <strong>{effectiveActiveSubject.name}</strong> dan tidak tercampur dengan mata pelajaran lain.
                </span>
              </div>

              {/* Per-Mapel Random Question Sampling Settings Card */}
              {(() => {
                const currentSubQuestions = questions.filter(
                  q => (!q.subjectId && effectiveActiveSubject.id === 'sub1') || q.subjectId === effectiveActiveSubject.id
                );
                const isSamplingActive = effectiveActiveSubject.enableRandomSampling === true;
                const sampleCount = effectiveActiveSubject.sampleQuestionCount || Math.min(40, Math.max(1, currentSubQuestions.length));

                return (
                  <div className="mt-4 p-4 bg-gradient-to-r from-indigo-50/90 via-white to-purple-50/50 rounded-2xl border border-indigo-200 shadow-2xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isSamplingActive ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <Shuffle className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-800 uppercase tracking-wide font-mono">
                              Pengambilan Soal Acak: {effectiveActiveSubject.name}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                              isSamplingActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {isSamplingActive ? 'AKTIF (SOAL DIACAK)' : 'NONAKTIF (SEMUA SOAL)'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {isSamplingActive
                              ? `Setiap siswa hanya akan mengerjakan ${sampleCount} butir soal acak dari total ${currentSubQuestions.length} butir yang ada di mapel ini.`
                              : `Seluruh (${currentSubQuestions.length} butir) soal di mapel ini akan diberikan lengkap ke siswa tanpa diacak jumlahnya.`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {isSamplingActive && (
                          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-indigo-200 shadow-2xs">
                            <label className="text-[11px] font-bold text-slate-600 font-mono">Ambil:</label>
                            <input
                              type="number"
                              min="1"
                              max={Math.max(1, currentSubQuestions.length)}
                              value={sampleCount}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                handleUpdateSubjectSampling(effectiveActiveSubject.id, true, val);
                              }}
                              className="w-16 px-1.5 py-0.5 bg-indigo-50/70 border border-indigo-200 rounded text-xs font-mono font-bold text-center text-indigo-900"
                            />
                            <span className="text-[11px] font-bold text-slate-500">Butir</span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleUpdateSubjectSampling(
                            effectiveActiveSubject.id,
                            !isSamplingActive,
                            sampleCount
                          )}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                            isSamplingActive
                              ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          }`}
                        >
                          <Shuffle className="w-3.5 h-3.5" />
                          {isSamplingActive ? 'Matikan Soal Acak' : 'Aktifkan Soal Acak'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Collapsible Excel / CSV Import Zone */}
            {showImportArea && (
              <div className="bg-white rounded-2xl border-2 border-emerald-500 p-6 shadow-md space-y-4 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-base">
                        Panel Import Soal dari Excel (.xlsx / .xls) & CSV
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Unggah file asli Microsoft Excel (.xlsx) atau file teks CSV tanpa khawatir teks rusak atau berkarakter aneh.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowImportArea(false)}
                    className="p-1 hover:bg-slate-100 rounded-full transition text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2.5 text-xs text-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-emerald-950 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      Panduan Format Pengisian Template Excel:
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDownloadTemplateXlsx()}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px] transition flex items-center gap-1 shadow-2xs"
                      >
                        <Download className="w-3 h-3" />
                        Unduh Template (.xlsx)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadTemplateCsv()}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold rounded-lg text-[11px] transition flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        Unduh CSV
                      </button>
                    </div>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
                    <li>Gunakan file template <strong>.xlsx</strong> di atas, buka langsung di Microsoft Excel atau Google Spreadsheet.</li>
                    <li>Satu baris mewakili 1 butir soal (baris pertama adalah baris judul kolom).</li>
                    <li>Kolomnya terdiri atas 8 urutan kolom:
                      <ul className="list-disc list-inside pl-4 my-1 font-mono text-[11px] text-emerald-900 font-semibold space-y-0.5">
                        <li>Kolom 1: Jenis soal (<code className="bg-emerald-100/80 px-1 rounded">MC</code> untuk Pilihan Ganda biasa, <code className="bg-emerald-100/80 px-1 rounded">MR</code> untuk Respon Ganda)</li>
                        <li>Kolom 2: Teks Soal / Pertanyaan</li>
                        <li>Kolom 3 - 6: Opsi Jawaban A, B, C, dan D</li>
                        <li>Kolom 7: Bobot Nilai per soal (contoh: 10 atau 20)</li>
                        <li>Kolom 8 (Opsional): Kode/Nama Mapel sasaran</li>
                      </ul>
                    </li>
                    <li>Berikan tanda bintang <code className="font-mono text-red-600 font-bold">*</code> di depan opsi jawaban yang benar (contoh: <code className="bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-800 font-mono">*Opsi Jawaban Benar</code>).</li>
                  </ol>
                </div>

                {/* PILIHAN SASARAN IMPORT (SLOT / MAPEL) */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <span className="block text-xs font-black text-slate-700 uppercase tracking-wider font-mono">
                    📋 PILIH SASARAN MATA PELAJARAN HASIL IMPORT:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setImportSubjectTarget('current')}
                      className={`py-2 px-3 rounded-lg border text-xs font-extrabold transition flex items-center gap-1.5 ${
                        importSubjectTarget === 'current'
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {importSubjectTarget === 'current' && <Check className="w-3.5 h-3.5 font-bold" />}
                      Mapel Aktif: {effectiveActiveSubject.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportSubjectTarget('auto')}
                      className={`py-2 px-3 rounded-lg border text-xs font-extrabold transition flex items-center gap-1.5 ${
                        importSubjectTarget === 'auto'
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {importSubjectTarget === 'auto' && <Check className="w-3.5 h-3.5 font-bold" />}
                      Otomatis Dari Kolom CSV
                    </button>
                    {subjects.map(sub => (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => setImportSubjectTarget(sub.id)}
                        className={`py-2 px-3 rounded-lg border text-xs font-extrabold transition flex items-center gap-1.5 ${
                          importSubjectTarget === sub.id
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {importSubjectTarget === sub.id && <Check className="w-3.5 h-3.5 font-bold" />}
                        {sub.name}
                      </button>
                    ))}
                  </div>
                </div>

                {importError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{importError}</span>
                  </div>
                )}

                {importSuccess && (
                  <div className="p-4 bg-emerald-100 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0 text-emerald-600 font-bold" />
                    <span>{importSuccess}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* File Upload Zone */}
                  <div className="border-2 border-dashed border-emerald-300 hover:border-emerald-600 rounded-xl p-5 text-center transition flex flex-col justify-center items-center bg-emerald-50/30">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mb-2 shadow-2xs">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-extrabold text-slate-800 block mb-0.5">Unggah Berkas Excel (.xlsx) atau CSV</span>
                    <span className="text-[11px] text-emerald-700 font-medium block mb-3">
                      Otomatis membedah soal tanpa simbol aneh
                    </span>
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="excel-csv-file-picker"
                    />
                    <label
                      htmlFor="excel-csv-file-picker"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl cursor-pointer transition inline-flex items-center gap-1.5 shadow-sm active:scale-95"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Pilih Berkas (.xlsx / .csv)
                    </label>
                  </div>

                  {/* Raw Text Paste Zone */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 font-mono uppercase tracking-wider mb-2">Atau Paste Teks CSV Langsung</label>
                    <textarea
                      placeholder="MC,Siapakah bapak pramuka dunia?,*S Baden Powell,Ir Soekarno,Yuri Gagarin,Liem Swie King,10"
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      rows={5}
                      className="w-full p-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 font-mono text-xs rounded-xl focus:outline-none focus:bg-white transition"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setImportText('');
                      setImportError('');
                      setImportSuccess('');
                    }}
                    className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 border border-slate-200 rounded-lg transition"
                  >
                    Kosongkan
                  </button>
                  <button
                    type="button"
                    onClick={() => parseCSVData(importText, 'APPEND')}
                    disabled={!importText.trim()}
                    className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
                      importText.trim()
                        ? 'bg-slate-900 hover:bg-slate-800 text-white'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Tambah ke Soal Mapel Terpilih (Append)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`PERINGATAN: Opsi Overwrite akan mengganti seluruh soal pada target mata pelajaran yang dipilih. Apakah Anda yakin?`)) {
                        parseCSVData(importText, 'OVERWRITE');
                      }
                    }}
                    disabled={!importText.trim()}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${
                      importText.trim()
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Ganti Soal Target (Overwrite)
                  </button>
                </div>
              </div>
            )}

            {/* Editing / Creating state view */}
            {(isCreatingQuestion || editingQuestion) && (
              <div className="bg-white rounded-2xl border border-indigo-200 p-6 shadow-sm ring-1 ring-indigo-100 animate-fade-in">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-4 mb-5">
                  <h4 className="font-bold text-indigo-900 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-indigo-600" />
                    {isCreatingQuestion ? 'Buat Soal Ujian Baru' : 'Edit Soal Ujian'}
                  </h4>
                  <button
                    onClick={() => {
                      setIsCreatingQuestion(false);
                      setEditingQuestion(null);
                    }}
                    className="p-1 hover:bg-slate-100 rounded-full transition text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveQuestion} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase font-mono tracking-wider mb-2">Pilih Naskah Ujian (Mata Pelajaran)</label>
                    <select
                      value={qSubjectId}
                      onChange={(e) => setQSubjectId(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-semibold"
                    >
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.code ? `(${s.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <label className="text-xs font-semibold text-slate-700 uppercase font-mono tracking-wider">
                        Teks Soal / Pertanyaan
                      </label>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Pintasan Simbol Matematika SMP:</span>
                      </div>
                    </div>

                    {/* SMP Math Symbols Toolbar */}
                    <div className="mb-2 p-2 bg-slate-100 rounded-xl border border-slate-200 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-[10px] font-mono font-bold text-slate-500 uppercase px-1">Sisipkan:</span>
                      <button type="button" onClick={() => insertSymbolIntoQText('π')} className="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200 font-bold transition shadow-2xs cursor-pointer" title="Simbol Pi (π)">π</button>
                      <button type="button" onClick={() => insertSymbolIntoQText('²')} className="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200 font-bold transition shadow-2xs cursor-pointer" title="Pangkat Dua / Kuadrat (²)">x²</button>
                      <button type="button" onClick={() => insertSymbolIntoQText('³')} className="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200 font-bold transition shadow-2xs cursor-pointer" title="Pangkat Tiga / Kubik (³)">x³</button>
                      <button type="button" onClick={() => insertSymbolIntoQText('½')} className="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200 font-bold transition shadow-2xs cursor-pointer" title="Pecahan Setengah (½)">½</button>
                      <button type="button" onClick={() => insertSymbolIntoQText('\\frac{a}{b}')} className="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200 font-bold transition shadow-2xs cursor-pointer font-mono" title="Pecahan TeX (\frac{a}{b})">\frac&#123;a&#125;&#123;b&#125;</button>
                      <button type="button" onClick={() => insertSymbolIntoQText('√')} className="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200 font-bold transition shadow-2xs cursor-pointer" title="Akar Kuadrat (√)">√</button>
                      <button type="button" onClick={() => insertSymbolIntoQText('°')} className="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200 font-bold transition shadow-2xs cursor-pointer" title="Derajat Sudut (°)">30°</button>
                      <button type="button" onClick={() => insertSymbolIntoQText('×')} className="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200 font-bold transition shadow-2xs cursor-pointer" title="Simbol Kali (×)">×</button>
                      <button type="button" onClick={() => insertSymbolIntoQText('÷')} className="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200 font-bold transition shadow-2xs cursor-pointer" title="Simbol Bagi (÷)">÷</button>
                      <button type="button" onClick={() => insertSymbolIntoQText('±')} className="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200 font-bold transition shadow-2xs cursor-pointer" title="Plus Minus (±)">±</button>
                      <button type="button" onClick={() => insertSymbolIntoQText('≤')} className="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200 font-bold transition shadow-2xs cursor-pointer" title="Kurang dari sama dengan (≤)">≤</button>
                      <button type="button" onClick={() => insertSymbolIntoQText('≥')} className="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200 font-bold transition shadow-2xs cursor-pointer" title="Lebih dari sama dengan (≥)">≥</button>
                      <button type="button" onClick={() => insertSymbolIntoQText('≠')} className="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200 font-bold transition shadow-2xs cursor-pointer" title="Tidak sama dengan (≠)">≠</button>
                      <button type="button" onClick={() => insertSymbolIntoQText('∠')} className="px-2 py-1 bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded-lg border border-slate-200 font-bold transition shadow-2xs cursor-pointer" title="Simbol Sudut (∠)">∠</button>
                      <button type="button" onClick={() => insertSymbolIntoQText('$x^2 + 5x + 6 = 0$')} className="px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg border border-indigo-200 font-mono font-bold transition shadow-2xs cursor-pointer" title="Contoh Rumus KaTeX ($...$)">$rumus$</button>
                    </div>

                    <textarea
                      ref={qTextAreaRef}
                      required
                      placeholder="Tuliskan pertanyaan ujian di sini... (Untuk soal matematika, gunakan simbol di atas atau format $...$. Untuk teks bacaan/paragraf, tekan Enter 2x untuk paragraf baru yang menjorok)"
                      value={qText}
                      onChange={(e) => setQText(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition leading-relaxed"
                    />
                  </div>

                  {/* Indonesian Reading Passage Toggle */}
                  <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="checkbox-is-passage"
                      checked={qIsReadingPassage}
                      onChange={(e) => setQIsReadingPassage(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-amber-300 cursor-pointer"
                    />
                    <label htmlFor="checkbox-is-passage" className="text-xs text-slate-700 cursor-pointer select-none">
                      <span className="font-bold text-amber-950 flex items-center gap-1.5">
                        <AlignLeft className="w-3.5 h-3.5 text-amber-700" />
                        Format Teks Wacana / Bacaan Panjang (Bahasa Indonesia)
                      </span>
                      <span className="text-slate-500 block mt-0.5">
                        Mengaktifkan gaya paragraf menjorok ke dalam (*indent* awal kalimat) dan jarak antar baris (*line-height*) yang renggang dan nyaman dibaca siswa. Pisahkan antar paragraf dengan menekan <strong>Enter 2 kali</strong>.
                      </span>
                    </label>
                  </div>

                  {/* Question Image / Diagram (Math & Geometry) */}
                  <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-indigo-950 flex items-center gap-1.5 font-mono uppercase tracking-wider">
                        <ImageIcon className="w-4 h-4 text-indigo-600" />
                        Gambar / Diagram / Ilustrasi Soal (Opsional)
                      </label>
                      {qImageUrl && (
                        <button
                          type="button"
                          onClick={() => setQImageUrl('')}
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          Hapus Gambar
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                      {/* File upload from device */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          1. Pilih Berkas Gambar (Otomatis Dioptimasi):
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          disabled={isUploadingQImage}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setIsUploadingQImage(true);
                            try {
                              const base64 = await compressImageFile(file, 1000, 0.82);
                              setQImageUrl(base64);
                            } catch (err: any) {
                              alert(`Gagal memproses gambar: ${err.message || err}`);
                            } finally {
                              setIsUploadingQImage(false);
                              e.target.value = '';
                            }
                          }}
                          className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                        />
                      </div>

                      {/* Direct URL input */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          2. Atau Tempelkan Tautan / URL Gambar Web:
                        </label>
                        <input
                          type="url"
                          placeholder="https://.../diagram-geometri.png"
                          value={qImageUrl.startsWith('data:') ? '' : qImageUrl}
                          onChange={(e) => setQImageUrl(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Image Thumbnail Preview */}
                    {qImageUrl && (
                      <div className="mt-2 p-2 bg-white rounded-xl border border-indigo-200 flex items-center gap-3">
                        <img
                          src={qImageUrl}
                          alt="Preview Gambar Soal"
                          className="h-20 w-auto max-w-[140px] object-contain rounded-lg border border-slate-200 bg-slate-50"
                        />
                        <div className="text-xs text-slate-600 flex-1">
                          <span className="font-bold text-emerald-600 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Gambar siap ditampilkan
                          </span>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Siswa dapat mengklik gambar ini untuk memperbesar (zoom modal) saat mengerjakan ujian.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Live Student View Preview Box */}
                  {(qText || qImageUrl) && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 font-mono uppercase">
                        <Eye className="w-3.5 h-3.5 text-indigo-600" />
                        Pratinjau Tampilan Siswa (Live Preview)
                      </div>
                      <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
                        <RichExamContent
                          text={qText}
                          imageUrl={qImageUrl}
                          isReadingPassage={qIsReadingPassage}
                          className="text-sm font-medium text-slate-800"
                        />
                      </div>
                    </div>
                  )}

                  {/* Question Type Selector (Single Choice vs Multiple Choice / MR) */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <label className="block text-xs font-bold text-slate-700 uppercase font-mono tracking-wider">
                      Model / Tipe Jawaban Soal Ujian:
                    </label>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Option 1: Pilihan Ganda Tunggal */}
                      <button
                        type="button"
                        onClick={() => {
                          setQType('MC');
                          const first = qCorrectIndices[0] ?? 0;
                          setQCorrect(first);
                          setQCorrectIndices([first]);
                        }}
                        className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 cursor-pointer ${
                          qType === 'MC'
                            ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 text-blue-950'
                            : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${qType === 'MC' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          <Radio className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-extrabold text-xs flex items-center gap-1.5">
                            Pilihan Ganda Tunggal
                            {qType === 'MC' && <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.2 rounded font-mono font-bold">AKTIF</span>}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                            Hanya ada <strong>1 jawaban benar</strong>. Siswa hanya dapat memilih 1 opsi radio.
                          </p>
                        </div>
                      </button>

                      {/* Option 2: Pilihan Ganda Kompleks */}
                      <button
                        type="button"
                        onClick={() => {
                          setQType('MR');
                          if (qCorrectIndices.length < 2) {
                            // Automatically select second option if only 1 is currently chosen
                            const next = qCorrectIndices.length === 0 ? [0, 1] : [qCorrectIndices[0], (qCorrectIndices[0] + 1) % 4];
                            setQCorrectIndices(next.sort((a, b) => a - b));
                          }
                        }}
                        className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 cursor-pointer ${
                          qType === 'MR'
                            ? 'bg-amber-50/80 border-amber-500 ring-2 ring-amber-500/20 text-amber-950'
                            : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${qType === 'MR' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          <CheckSquare className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-extrabold text-xs flex items-center gap-1.5">
                            Pilihan Ganda Kompleks (Ganda)
                            {qType === 'MR' && <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.2 rounded font-mono font-bold">AKTIF</span>}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                            Ada <strong>2 atau lebih jawaban benar</strong>. Siswa dapat mencentang beberapa opsi sekaligus.
                          </p>
                        </div>
                      </button>
                    </div>

                    <div className="text-[11px] text-slate-500 px-1 flex items-center gap-1.5 font-medium">
                      <span>💡</span>
                      <span>
                        {qType === 'MC' 
                          ? 'Klik huruf A/B/C/D di bawah untuk memilih 1 kunci jawaban yang benar.'
                          : 'Klik huruf A/B/C/D di bawah untuk mencentang 2 atau lebih kunci jawaban benar (Pilihan Ganda Kompleks).'
                        }
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-500 uppercase font-mono tracking-wider">
                        {qType === 'MC' ? 'Pilih Opsi Jawaban & 1 Kunci' : 'Pilih Opsi Jawaban & Kunci Ganda (Minimal 2 Kunci)'}
                      </label>
                      <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                        Kunci Terpilih: {qCorrectIndices.map(i => String.fromCharCode(65 + i)).join(', ') || '-'}
                      </span>
                    </div>
                    
                    {qOptions.map((opt, oIdx) => {
                      const letter = String.fromCharCode(65 + oIdx);
                      const isCorrect = qCorrectIndices.includes(oIdx);

                      const handleToggleOptionKey = () => {
                        if (qType === 'MC') {
                          setQCorrect(oIdx);
                          setQCorrectIndices([oIdx]);
                        } else {
                          // Toggle in MR
                          if (qCorrectIndices.includes(oIdx)) {
                            if (qCorrectIndices.length <= 1) {
                              alert('Minimal 1 kunci jawaban harus tetap dipilih!');
                              return;
                            }
                            const updated = qCorrectIndices.filter(i => i !== oIdx);
                            setQCorrectIndices(updated);
                            setQCorrect(updated[0] ?? 0);
                          } else {
                            const updated = [...qCorrectIndices, oIdx].sort((a, b) => a - b);
                            setQCorrectIndices(updated);
                            setQCorrect(updated[0] ?? 0);
                          }
                        }
                      };

                      return (
                        <div key={oIdx} className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={handleToggleOptionKey}
                            className={`min-w-14 h-10 px-2 rounded-xl flex items-center justify-center gap-1.5 font-bold font-mono text-sm border shrink-0 transition-all cursor-pointer ${
                              isCorrect
                                ? 'bg-emerald-500 border-emerald-600 text-white shadow-sm'
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-800'
                            }`}
                            title={isCorrect ? 'Opsi ini aktif sebagai kunci jawaban (Klik untuk ubah)' : 'Jadikan ini sebagai kunci jawaban'}
                          >
                            {isCorrect ? <Check className="w-4 h-4 shrink-0" /> : null}
                            <span>{letter}</span>
                            {isCorrect && <span className="text-[10px] uppercase font-bold tracking-tight">Kunci</span>}
                          </button>
                          <input
                            type="text"
                            required
                            placeholder={`Tulis pilihan jawaban untuk opsi ${letter}...`}
                            value={opt}
                            onChange={(e) => {
                              const updated = [...qOptions];
                              updated[oIdx] = e.target.value;
                              setQOptions(updated);
                            }}
                            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition"
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase font-mono tracking-wider mb-2">Skor / Bobot Nilai Soal (Angka)</label>
                    <input
                      type="number"
                      required
                      min={0}
                      step="any"
                      placeholder="Masukkan bobot skor soal (contoh: 20)..."
                      value={qScore}
                      onChange={(e) => setQScore(Number(e.target.value) || 0)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-semibold"
                    />
                  </div>

                  <div className="border-t border-slate-100 pt-5 flex justify-end gap-2 text-sm pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingQuestion(false);
                        setEditingQuestion(null);
                      }}
                      className="px-4 py-2.5 font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition border border-slate-200"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      id="btn-save-questions-db"
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl transition duration-150 flex items-center gap-1 shadow-sm"
                    >
                      <Save className="w-4 h-4" />
                      Simpan Soal
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* List of existing questions for the selected active subject */}
            <div className="space-y-4">
              {(() => {
                const currentSubjectQuestions = questions.filter(q => 
                  (!q.subjectId && effectiveActiveSubject.id === 'sub1') || q.subjectId === effectiveActiveSubject.id
                );

                if (currentSubjectQuestions.length === 0) {
                  return (
                    <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                      <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <h4 className="text-base font-bold text-slate-700">Belum Ada Soal di Mapel "{effectiveActiveSubject.name}"</h4>
                      <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                        Klik tombol "Tambah Soal ke {effectiveActiveSubject.name}" di atas atau lakukan import file Excel untuk mengisi naskah soal mata pelajaran ini.
                      </p>
                    </div>
                  );
                }

                return currentSubjectQuestions.map((q, idx) => {
                  return (
                    <div key={q.id} className="bg-white border border-slate-200 rounded-2xl p-6 relative hover:shadow-xs transition">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono font-bold">
                              SOAL #{idx + 1}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded font-bold font-mono uppercase bg-slate-100 text-slate-700">
                              {effectiveActiveSubject.name}
                            </span>
                            {/* Question Type Badge */}
                            {q.type === 'MR' || (q.correctAnswerIndices && q.correctAnswerIndices.length > 1) ? (
                              <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                                <CheckSquare className="w-3 h-3 text-amber-600" />
                                PG KOMPLEKS ({(q.correctAnswerIndices?.length || 2)} JAWABAN)
                              </span>
                            ) : (
                              <span className="text-[10px] bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                                <Radio className="w-3 h-3 text-blue-600" />
                                PG TUNGGAL
                              </span>
                            )}
                            <span className="text-[10px] bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded">
                              Bobot: {q.score ?? 10} Poin
                            </span>
                          </div>
                          <div className="mt-2">
                            <RichExamContent
                              text={q.questionText}
                              imageUrl={q.imageUrl}
                              isReadingPassage={q.isReadingPassage}
                              className="text-base font-semibold text-slate-800 leading-relaxed"
                            />
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            id={`btn-edit-q-${q.id}`}
                            onClick={() => {
                              const isMulti = q.type === 'MR' || (q.correctAnswerIndices && q.correctAnswerIndices.length > 1);
                              const initialType: 'MC' | 'MR' = isMulti ? 'MR' : 'MC';
                              const initialIndices = q.correctAnswerIndices && q.correctAnswerIndices.length > 0
                                ? q.correctAnswerIndices
                                : [typeof q.correctAnswerIndex === 'number' ? q.correctAnswerIndex : 0];

                              setEditingQuestion(q);
                              setIsCreatingQuestion(false);
                              setQType(initialType);
                              setQCorrectIndices(initialIndices);
                              setQCorrect(initialIndices[0] ?? 0);
                              setQText(q.questionText);
                              setQOptions([...q.options]);
                              setQSubjectId(q.subjectId || effectiveActiveSubject.id);
                              setQScore(q.score !== undefined ? q.score : 20);
                              setQImageUrl(q.imageUrl || '');
                              setQIsReadingPassage(q.isReadingPassage || false);
                            }}
                            className="p-1 px-2 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-md transition"
                            title="Edit Soal"
                          >
                            <Edit className="w-3.5 h-3.5 inline" />
                          </button>
                          <button
                            id={`btn-delete-q-${q.id}`}
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="p-1 px-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-md transition"
                            title="Hapus Soal"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-50 text-xs">
                        {q.options.map((opt, oIdx) => {
                          const optLetter = String.fromCharCode(65 + oIdx);
                          const isMulti = q.type === 'MR' || (q.correctAnswerIndices && q.correctAnswerIndices.length > 1);
                          const correctIndices = isMulti
                            ? (q.correctAnswerIndices && q.correctAnswerIndices.length > 0 ? q.correctAnswerIndices : [q.correctAnswerIndex ?? 0])
                            : [typeof q.correctAnswerIndex === 'number' ? q.correctAnswerIndex : 0];
                          const isCorrect = correctIndices.includes(oIdx);

                          return (
                            <div
                              key={oIdx}
                              className={`p-2.5 rounded-lg flex items-center gap-2 border ${
                                isCorrect
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                                  : 'bg-slate-50 border-transparent text-slate-500'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded font-bold font-mono text-[11px] flex items-center justify-center shrink-0 border ${
                                isCorrect
                                  ? 'bg-emerald-500 border-emerald-600 text-white'
                                  : 'bg-white border-slate-200 text-slate-400'
                              }`}>
                                {optLetter}
                              </span>
                              <span className="truncate flex-1">{opt}</span>
                              {isCorrect && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded ml-auto flex items-center gap-0.5 shrink-0">
                                  <Check className="w-2.5 h-2.5" /> Kunci
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* TAB 3: CONFIGURATION SETTINGS */}
        {activeTab === 'CONFIG' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">Konfigurasi Lembar Kerja Ujian</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">PENGATURAN UMUM & NASKAH UJIAN</p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  alert('Konfigurasi ujian sukses diperbarui secara instan!');
                }}
                className="space-y-5"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-500 font-mono tracking-wider uppercase mb-2">Judul Dokumen Ujian</label>
                  <input
                    type="text"
                    required
                    value={config.examTitle}
                    onChange={(e) => onUpdateConfig({ ...config, examTitle: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 font-mono tracking-wider uppercase mb-2">Durasi Ujian (Menit)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      required
                      min="1"
                      max="300"
                      value={config.durationMinutes}
                      onChange={(e) => onUpdateConfig({ ...config, durationMinutes: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-32 px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm text-center font-mono focus:outline-none transition font-bold"
                    />
                    <span className="text-sm font-semibold text-slate-500">Menit Hitung Mundur</span>
                  </div>
                </div>

                {/* MANAJEMEN SLOT MATA PELAJARAN & PILIHAN NASKAH SISWA */}
                <div className="border-t border-slate-200 pt-6 mt-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider font-mono flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-indigo-600" />
                        Pengaturan Pilihan Naskah Ujian ({subjects.length}/20 Slot)
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Centang "Tampilkan" untuk mengatur naskah apa saja yang muncul di menu "Pilih Naskah Ujian" ketika siswa masuk link ini.
                      </p>
                    </div>
                    {subjects.length < 20 && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewSubjectName('');
                          setNewSubjectCode(`MP-${subjects.length + 1}`);
                          setNewSubjectIsActive(true);
                          setIsAddingSubjectModal(true);
                        }}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 self-start sm:self-auto shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Tambah Slot ({subjects.length}/20)
                      </button>
                    )}
                  </div>

                  {/* List of Subjects with Visibility Toggles */}
                  <div className="space-y-2.5">
                    {subjects.map((sub, sIdx) => {
                      const qCount = questions.filter(q => (!q.subjectId && sub.id === 'sub1') || q.subjectId === sub.id).length;
                      const isVisible = sub.isActive !== false;

                      return (
                        <div
                          key={sub.id}
                          className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            isVisible ? 'bg-slate-50 border-slate-200' : 'bg-slate-100/60 border-slate-200 opacity-70'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-mono font-bold text-xs text-slate-600">
                              #{sIdx + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm text-slate-800">{sub.name}</span>
                                {sub.code && (
                                  <span className="text-[10px] font-mono bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded">
                                    {sub.code}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-slate-500 font-mono">
                                Total: {qCount} Butir Soal Terpisah
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-auto">
                            {/* Toggle Switch */}
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isVisible}
                                onChange={() => handleToggleSubjectActive(sub.id)}
                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                              />
                              <span className={`text-xs font-bold ${isVisible ? 'text-emerald-700' : 'text-slate-400'}`}>
                                {isVisible ? 'Tampil ke Siswa' : 'Disembunyikan'}
                              </span>
                            </label>

                            <button
                              type="button"
                              onClick={() => {
                                setEditSubjectName(sub.name);
                                setEditSubjectCode(sub.code || '');
                                setEditSubjectIsActive(sub.isActive !== false);
                                setEditingSubjectModal(sub);
                              }}
                              className="p-1.5 hover:bg-white text-slate-500 hover:text-indigo-600 rounded-lg border border-transparent hover:border-slate-200 transition"
                              title="Edit Info Slot"
                            >
                              <Edit className="w-4 h-4" />
                            </button>

                            {subjects.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteSubjectSlot(sub.id)}
                                className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition"
                                title="Hapus Slot"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Live Student Preview Card */}
                  <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
                    <span className="text-xs font-black text-indigo-900 uppercase font-mono tracking-wider flex items-center gap-1.5">
                      <Eye className="w-4 h-4 text-indigo-600" />
                      Pratinjau Dropdown "Pilih Naskah Ujian" di Layar Registrasi Siswa:
                    </span>
                    <div className="p-3 bg-white rounded-lg border border-indigo-200 space-y-1.5">
                      <span className="text-[11px] text-slate-500 font-bold block">
                        Daftar yang akan dilihat siswa saat masuk link ujian:
                      </span>
                      {subjects.filter(s => s.isActive !== false).length === 0 ? (
                        <span className="text-xs font-bold text-red-500 block">
                          ⚠️ Tidak ada naskah yang aktif! Minimal aktifkan 1 naskah agar siswa dapat memilih.
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {subjects.filter(s => s.isActive !== false).map((s, idx) => (
                            <span key={s.id} className="text-xs bg-indigo-100 text-indigo-800 font-bold px-2.5 py-1 rounded-md">
                              {idx + 1}. {s.name} {s.code ? `[${s.code}]` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              {/* SISTEM KEAMANAN & PENGONTROLAN PROKTOR MASTER */}
              <div className="border-t border-slate-200 pt-6 mt-6 space-y-6">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider font-mono flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-3.5 bg-red-600 rounded-full inline-block animate-pulse"></span>
                    Pengaturan Tingkat Keamanan (Proctor Core)
                  </h4>
                  <p className="text-xs text-slate-500 leading-normal">
                    Konfigurasi tingkat tinggi kontrol keamanan dan mode naskah anti-curang proktor secara langsung.
                  </p>
                </div>

                {/* 1. Toggle Sistem Keamanan Ketat */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="space-y-1 pr-4">
                    <span className="text-xs font-bold text-slate-800 font-sans block">Sistem Keamanan Ketat (Anti-Cheat Fullscreen)</span>
                    <span className="text-[11px] text-slate-500 leading-tight block">
                      Memantau dan membekukan lembar ujian secara otomatis jika siswa meminimalkan window, berpindah tab, atau keluar dari fullscreen.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUpdateConfig({
                      ...config,
                      strictSecurityEnabled: config.strictSecurityEnabled !== false ? false : true
                    })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.strictSecurityEnabled !== false ? 'bg-indigo-600' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        config.strictSecurityEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 2. Jumlah Pelanggaran Maksimal & Reset Jawaban */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <label className="block text-xs font-bold text-slate-800 font-sans uppercase">Batas Maksimal Pelanggaran Toleransi</label>
                    <p className="text-[11px] text-slate-500 leading-tight mb-2">
                      Jumlah keluar-masuk layar penuh yang diperbolehkan sebelum status ujian siswa terkunci secara permanen.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={config.maxAllowedViolations !== undefined ? config.maxAllowedViolations : 3}
                        onChange={(e) => onUpdateConfig({
                          ...config,
                          maxAllowedViolations: Math.max(1, parseInt(e.target.value) || 1)
                        })}
                        className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm font-mono text-center font-bold"
                      />
                      <span className="text-xs font-semibold text-slate-500">Kali Pelanggaran</span>
                    </div>
                  </div>

                  {/* 3. Empty Answers on Lock/Violation Toggle */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between">
                    <div className="space-y-1 mb-3">
                      <span className="text-xs font-bold text-slate-800 font-sans block">Kosongkan Jawaban Siswa Jika Terkunci</span>
                      <span className="text-[11px] text-slate-500 leading-tight block">
                        Apabila diaktifkan, seluruh instrumen jawaban ujian siswa akan dihapus bersih saat denda melampaui batas toleransi.
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase font-mono">STATUS: {config.clearAnswersOnViolation ? 'AKTIF (KOSONGKAN)' : 'LINDUNGI DATA JAWABAN'}</span>
                      <button
                        type="button"
                        onClick={() => onUpdateConfig({
                          ...config,
                          clearAnswersOnViolation: !config.clearAnswersOnViolation
                        })}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          config.clearAnswersOnViolation ? 'bg-indigo-600' : 'bg-slate-200'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            config.clearAnswersOnViolation ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4. Siren sound on Violation */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="space-y-1 pr-4">
                    <span className="text-xs font-bold text-slate-800 font-sans block">Bunyi Sirine Peringatan Kencang (Siren 5 Detik)</span>
                    <span className="text-[11px] text-slate-500 leading-tight block">
                      Setiap kali siswa melanggar (misalnya keluar fullscreen), laksanakan sirine peringatan yang nyaring dari speaker siswa selama 5 detik penuh.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUpdateConfig({
                      ...config,
                      sirenAlarmEnabled: config.sirenAlarmEnabled !== false ? false : true
                    })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.sirenAlarmEnabled !== false ? 'bg-indigo-600' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        config.sirenAlarmEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 5. Custom Token Unlock Management (Channel 2) */}
                <div className="p-5 bg-gradient-to-br from-amber-50/70 via-slate-50 to-indigo-50/40 rounded-2xl border border-amber-200/80 space-y-5 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-amber-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                          <Ticket className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-slate-800 tracking-wide font-sans">
                            Atur Jumlah & Kode Token Buka Kunci (Channel 2: Mandiri)
                          </h4>
                          <span className="text-[10px] font-mono text-amber-700 font-bold uppercase tracking-wider">
                            Multi-Tier Quota & Anti-Reuse per Username
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-650 mt-2 leading-relaxed max-w-xl">
                        Jumlah token yang Anda atur di sini menentukan berapa kali siswa berhak meng-unlock ujian secara mandiri.
                        <strong> Setiap token hanya berlaku 1 kali per akun. Jika siswa sudah memakai Token 1, sistem otomatis menolaknya dan mewajibkan siswa memakai Token 2</strong>.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                      <span className="px-3 py-1.5 rounded-xl bg-amber-100/90 border border-amber-300 text-amber-900 font-mono font-bold text-xs shadow-xs">
                        Kuota Siswa: {(config.unlockTokens || ['TOKEN-1', 'TOKEN-2']).length}x Unlock
                      </span>
                    </div>
                  </div>

                  {/* QUICK TOKEN QUANTITY STEPPER & PRESETS */}
                  <div className="p-4 bg-white rounded-2xl border border-amber-200/90 space-y-3 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-black text-slate-800 uppercase font-mono tracking-wider block">
                          Atur Jumlah Kesempatan / Token:
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Pilih berapa kali siswa diperbolehkan membuka ujian sendiri
                        </span>
                      </div>

                      {/* Stepper Control */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={(config.unlockTokens || ['TOKEN-1', 'TOKEN-2']).length <= 1}
                          onClick={() => {
                            const current = config.unlockTokens && config.unlockTokens.length > 0 ? [...config.unlockTokens] : ['TOKEN-1', 'TOKEN-2'];
                            if (current.length > 1) {
                              onUpdateConfig({
                                ...config,
                                unlockTokens: current.slice(0, current.length - 1)
                              });
                            }
                          }}
                          className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          title="Kurangi 1 token"
                        >
                          -
                        </button>

                        <div className="px-3 py-1 bg-amber-50 border border-amber-300 text-amber-950 rounded-xl font-mono font-black text-sm min-w-[90px] text-center">
                          {(config.unlockTokens || ['TOKEN-1', 'TOKEN-2']).length} Token
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const current = config.unlockTokens && config.unlockTokens.length > 0 ? [...config.unlockTokens] : ['TOKEN-1', 'TOKEN-2'];
                            const nextIndex = current.length + 1;
                            onUpdateConfig({
                              ...config,
                              unlockTokens: [...current, `TOKEN-${nextIndex}`]
                            });
                          }}
                          className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center transition cursor-pointer shadow-xs"
                          title="Tambah 1 token"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] font-mono font-bold text-slate-400 uppercase mr-1">Preset Cepat:</span>
                      {[1, 2, 3, 4, 5].map((count) => {
                        const activeCount = (config.unlockTokens || ['TOKEN-1', 'TOKEN-2']).length;
                        const isSelected = activeCount === count;
                        return (
                          <button
                            key={count}
                            type="button"
                            onClick={() => {
                              const current = config.unlockTokens && config.unlockTokens.length > 0 ? [...config.unlockTokens] : ['TOKEN-1', 'TOKEN-2'];
                              let newTokens: string[] = [];
                              if (count <= current.length) {
                                newTokens = current.slice(0, count);
                              } else {
                                newTokens = [...current];
                                for (let i = current.length + 1; i <= count; i++) {
                                  newTokens.push(`TOKEN-${i}`);
                                }
                              }
                              onUpdateConfig({
                                ...config,
                                unlockTokens: newTokens
                              });
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                              isSelected
                                ? 'bg-amber-500 text-white shadow-xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                            }`}
                          >
                            {count} Kali Unlock ({count} Token)
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Token Inputs List */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-slate-600 uppercase font-mono tracking-wider">
                        Daftar Kode Token (Urutan Pemakaian Siswa):
                      </label>
                      <span className="text-[10px] font-mono text-slate-400">
                        *Klik teks untuk ubah nama token
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(config.unlockTokens && config.unlockTokens.length > 0 ? config.unlockTokens : ['TOKEN-1', 'TOKEN-2']).map((tok, tIdx) => (
                        <div
                          key={tIdx}
                          className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-slate-200 hover:border-amber-400 transition shadow-xs"
                        >
                          <div className="flex flex-col items-center justify-center w-9 h-9 rounded-lg bg-amber-100 text-amber-900 shrink-0 font-mono">
                            <span className="font-black text-xs">#{tIdx + 1}</span>
                            <span className="text-[8px] font-bold opacity-75">Ke-{tIdx + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[9px] font-mono text-slate-400 font-bold block uppercase">
                              {tIdx === 0 ? 'Token Pertama' : tIdx === 1 ? 'Token Kedua (Wajib jika Token 1 terpakai)' : `Token Ke-${tIdx + 1}`}
                            </span>
                            <input
                              type="text"
                              value={tok}
                              onChange={(e) => {
                                const existing = config.unlockTokens && config.unlockTokens.length > 0 ? [...config.unlockTokens] : ['TOKEN-1', 'TOKEN-2'];
                                existing[tIdx] = e.target.value.toUpperCase();
                                onUpdateConfig({
                                  ...config,
                                  unlockTokens: existing
                                });
                              }}
                              placeholder={`TOKEN-${tIdx + 1}`}
                              className="w-full px-1 py-0.5 text-xs font-mono font-extrabold text-slate-800 uppercase tracking-widest bg-transparent border-none focus:outline-none focus:ring-0"
                            />
                          </div>
                          {(config.unlockTokens || ['TOKEN-1', 'TOKEN-2']).length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const existing = config.unlockTokens && config.unlockTokens.length > 0 ? [...config.unlockTokens] : ['TOKEN-1', 'TOKEN-2'];
                                const updatedTokens = existing.filter((_, i) => i !== tIdx);
                                onUpdateConfig({
                                  ...config,
                                  unlockTokens: updatedTokens
                                });
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition shrink-0"
                              title="Hapus token ini (kurangi 1x kuota)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions for Tokens */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const existing = config.unlockTokens && config.unlockTokens.length > 0 ? [...config.unlockTokens] : ['TOKEN-1', 'TOKEN-2'];
                        const nextNum = existing.length + 1;
                        onUpdateConfig({
                          ...config,
                          unlockTokens: [...existing, `TOKEN-${nextNum}`]
                        });
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Tambah Token (+1 Kesempatan)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const existing = config.unlockTokens && config.unlockTokens.length > 0 ? [...config.unlockTokens] : ['TOKEN-1', 'TOKEN-2'];
                        const randomized = existing.map((_, idx) => `TOKEN-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
                        onUpdateConfig({
                          ...config,
                          unlockTokens: randomized
                        });
                      }}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                      title="Acak string token baru"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                      Acak Kode Token
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onUpdateConfig({
                          ...config,
                          unlockTokens: ['TOKEN-1', 'TOKEN-2']
                        });
                      }}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                      title="Kembalikan ke 2 token standar"
                    >
                      Standar (2 Token)
                    </button>
                  </div>

                  {/* Anti-Reuse Rules Explanation */}
                  <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-xl text-[11px] text-amber-950 leading-relaxed space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900 font-mono uppercase">
                      <ShieldCheck className="w-4 h-4 text-amber-700" />
                      Aturan Validasi Token (Anti-Reuse & Username Lock):
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1">
                      <li><strong>Pengaturan Fleksibel:</strong> Anda dapat mengatur berapa pun jumlah token (1x, 2x, 3x, dst). Jumlah token di atas langsung menjadi batas kesempatan buka kunci siswa.</li>
                      <li><strong>Anti-Reuse per Siswa:</strong> Saat siswa memasukkan Token 1, token tersebut ditandai <em>Terpakai</em> di akun siswa tersebut.</li>
                      <li><strong>Wajib Token Berikutnya:</strong> Jika siswa yang sama terkunci lagi, memasukkan Token 1 akan <strong>ditolak</strong> oleh sistem dengan pesan instruksi agar memasukkan Token 2.</li>
                      <li><strong>Kuota Habis:</strong> Setelah semua token terpakai, formulir token terkunci total dan siswa harus meminta unlock remote (Channel 1) kepada Proktor.</li>
                    </ul>
                  </div>
                </div>
                {/* 6. PENGAMBILAN BUTIR SOAL SECARA ACAK PINDAH KE TIAP MAPEL */}
                <div className="p-5 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/40 rounded-2xl border border-indigo-200/80 space-y-3 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                        <Shuffle className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-sm text-slate-800 tracking-wide font-sans">
                            Pengambilan Butir Soal Acak (Per-Mata Pelajaran)
                          </h4>
                          <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded font-mono uppercase">
                            Dikelola di Bank Soal
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed max-w-xl">
                          Pengaturan pengambilan butir soal acak kini dikonfigurasi mandiri pada <strong>tiap mata pelajaran di Tab Bank Soal</strong>. Guru bebas menentukan mata pelajaran mana yang ingin diacak jumlah soalnya dan mata pelajaran mana yang ingin menyajikan seluruh butir soal lengkap tanpa diacak.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab('QUESTIONS')}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold rounded-xl transition flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0 self-start sm:self-auto"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      Buka Tab Bank Soal
                    </button>
                  </div>
                </div>

                {/* 7. WAJIBKAN SISWA LOGIN MENGGUNAKAN AKUN (1200+ DATABASE) */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="space-y-1 pr-4">
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-800 font-sans block">
                        Wajibkan Siswa Login dengan Username & Password Terdaftar
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 leading-tight block">
                      Siswa harus memasukkan username & password yang sudah diimpor ke tab "Data Akun Siswa" ({(studentUsers || []).length} akun). Data nama, kelas, dan absen siswa otomatis terisi.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUpdateConfig({
                      ...config,
                      requireStudentLogin: config.requireStudentLogin !== false ? false : true
                    })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.requireStudentLogin !== false ? 'bg-indigo-600' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        config.requireStudentLogin !== false ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="p-4 bg-teal-55 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-800 space-y-2">
                <div className="font-bold uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-teal-600" />
                  Kombinasi Pengawasan Aktif
                </div>
                <p className="leading-relaxed text-slate-650">
                  Semua form konfigurasi ini langsung tersambung ke layar komputer siswa peserta ujian secara aman. Ketika durasi diubah, nilai hitung mundur sisa ujian siswa akan mendaftar ulang secara otomatis.
                </p>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: DATA AKUN SISWA (1,200+ DATABASE) */}
      {activeTab === 'ACCOUNTS' && (() => {
        const classList = Array.from(new Set((studentUsers || []).map(u => u.studentClass).filter(Boolean))).sort();
        const filteredAccounts = (studentUsers || []).filter(u => {
          const q = accountSearch.toLowerCase().trim();
          const matchesSearch = !q || (
            (u.username || '').toLowerCase().includes(q) ||
            (u.name || '').toLowerCase().includes(q) ||
            (u.studentClass || '').toLowerCase().includes(q) ||
            (u.absentNumber || '').toLowerCase().includes(q)
          );
          const matchesClass = selectedAccountClass === 'all' || u.studentClass === selectedAccountClass;
          return matchesSearch && matchesClass;
        });

        const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / accountPageSize));
        const currentPage = Math.min(accountPage, totalPages);
        const startIndex = (currentPage - 1) * accountPageSize;
        const pageAccounts = filteredAccounts.slice(startIndex, startIndex + accountPageSize);

        return (
          <div className="space-y-6">
            {/* Header Akun Siswa */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">
                    Database Akun Login Siswa ({ (studentUsers || []).length } Akun)
                  </h3>
                </div>
                <p className="text-xs text-slate-500">
                  Kelola username dan password siswa untuk login ujian (Mendukung hingga 1.200+ pengguna).
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadStudentAccountsTemplateXlsx}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh Template (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadStudentAccountsTemplateCsv}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh Template (.csv)
                </button>
                <button
                  type="button"
                  onClick={() => setShowAccountImportArea(!showAccountImportArea)}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Unggah File Siswa (Excel/CSV)
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(true)}
                  className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Akun Manual
                </button>
                {(studentUsers || []).length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllStudentAccounts}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                    title="Kosongkan seluruh database akun siswa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Kosongkan Akun
                  </button>
                )}
              </div>
            </div>

            {/* Notification alert */}
            {importAccountMsg && (
              <div className={`p-4 rounded-xl text-xs flex items-center justify-between gap-2 border ${
                importAccountMsg.success
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}>
                <span>{importAccountMsg.text}</span>
                <button onClick={() => setImportAccountMsg(null)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Upload Zone */}
            {showAccountImportArea && (
              <div className="bg-white rounded-2xl border-2 border-indigo-500 p-6 shadow-md space-y-4 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-base">
                        Unggah Database 1.200+ Akun Siswa (Excel .xlsx / CSV)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Format kolom template: <strong>username, password, nama, kelas, no_absen</strong>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAccountImportArea(false)}
                    className="p-1 hover:bg-slate-100 rounded-full transition text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span className="font-bold text-slate-700">Metode Impor:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importAccountMode"
                      checked={importAccountMode === 'OVERWRITE'}
                      onChange={() => setImportAccountMode('OVERWRITE')}
                    />
                    <span className="font-semibold text-slate-800">Gantikan Seluruh Data (Overwrite)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importAccountMode"
                      checked={importAccountMode === 'APPEND'}
                      onChange={() => setImportAccountMode('APPEND')}
                    />
                    <span className="font-semibold text-slate-800">Tambahkan ke Data yang Ada (Append)</span>
                  </label>
                </div>

                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-slate-50/50 hover:bg-indigo-50/30 transition">
                  <input
                    type="file"
                    id="input-file-student-accounts"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleImportStudentAccountsFile}
                    className="hidden"
                  />
                  <label
                    htmlFor="input-file-student-accounts"
                    className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-xs">
                      <Upload className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-extrabold text-slate-800">
                      {importAccountLoading ? 'Sedang memproses & menyinkronkan data...' : 'Klik untuk Memilih File Excel (.xlsx / .xls) atau CSV'}
                    </span>
                    <span className="text-xs text-slate-500">
                      Bisa langsung mengunggah 1.200 baris akun sekaligus
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* Filter and Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Cari username, nama, atau kelas..."
                  value={accountSearch}
                  onChange={(e) => {
                    setAccountSearch(e.target.value);
                    setAccountPage(1);
                  }}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500 transition font-medium"
                />
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                {/* Filter Kelas */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-500">Kelas:</span>
                  <select
                    value={selectedAccountClass}
                    onChange={(e) => {
                      setSelectedAccountClass(e.target.value);
                      setAccountPage(1);
                    }}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 transition"
                  >
                    <option value="all">Semua Kelas ({classList.length})</option>
                    {classList.map(cls => (
                      <option key={cls} value={cls}>Kelas {cls}</option>
                    ))}
                  </select>
                </div>

                {/* Per Page */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-500">Tampil:</span>
                  <select
                    value={accountPageSize}
                    onChange={(e) => {
                      setAccountPageSize(Number(e.target.value));
                      setAccountPage(1);
                    }}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 transition"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Table of Accounts */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-mono uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 w-12 text-center">#</th>
                      <th className="py-3 px-4">Username</th>
                      <th className="py-3 px-4">Password</th>
                      <th className="py-3 px-4">Nama Lengkap Siswa</th>
                      <th className="py-3 px-4">Kelas</th>
                      <th className="py-3 px-4 text-center">No. Absen</th>
                      <th className="py-3 px-4 text-center w-24">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageAccounts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          Tidak ada data akun siswa yang cocok dengan filter.
                        </td>
                      </tr>
                    ) : (
                      pageAccounts.map((user, idx) => (
                        <tr key={user.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4 text-center text-slate-400 font-mono">
                            {startIndex + idx + 1}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                            @{user.username}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700 font-semibold">
                            {user.password}
                          </td>
                          <td className="py-3 px-4 font-extrabold text-slate-900">
                            {user.name}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold rounded-md font-mono text-[11px]">
                              {user.studentClass}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-600">
                            {user.absentNumber || '-'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteSingleStudentAccount(user.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Hapus akun"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
                <div>
                  Menampilkan <strong>{pageAccounts.length > 0 ? startIndex + 1 : 0}</strong> - <strong>{startIndex + pageAccounts.length}</strong> dari <strong>{filteredAccounts.length}</strong> akun terdaftar
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setAccountPage(p => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 py-1 font-mono font-bold text-slate-700">
                    Halaman {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setAccountPage(p => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </main>

    {/* Add Single Student Account Modal */}
    {showAddAccountModal && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-indigo-600" />
              Tambah Akun Siswa Baru
            </h3>
            <button
              onClick={() => setShowAddAccountModal(false)}
              className="p-1 text-slate-400 hover:bg-slate-100 rounded-full"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {accError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
              {accError}
            </div>
          )}

          <form onSubmit={handleAddSingleStudentAccount} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Username Siswa (Harus Unik)</label>
              <input
                type="text"
                required
                placeholder="Contoh: siswa_001"
                value={newAccUsername}
                onChange={(e) => setNewAccUsername(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Password / Sandi</label>
              <input
                type="text"
                required
                placeholder="Default: 123"
                value={newAccPassword}
                onChange={(e) => setNewAccPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Nama Lengkap Siswa</label>
              <input
                type="text"
                required
                placeholder="Contoh: Ahmad Fauzan"
                value={newAccName}
                onChange={(e) => setNewAccName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Kelas</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 8A"
                  value={newAccClass}
                  onChange={(e) => setNewAccClass(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 uppercase font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">No. Absen (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: 01"
                  value={newAccAbsen}
                  onChange={(e) => setNewAccAbsen(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddAccountModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl transition shadow-xs"
              >
                Simpan Akun
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

      {/* Editing Student Detail Modal */}
      {editingStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-6 animate-fade-in">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Edit className="w-5 h-5 text-indigo-5000 text-indigo-500" />
              Edit Data Siswa
            </h3>

            <form onSubmit={handleSaveStudentEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase font-mono tracking-wider mb-2">Nama Siswa</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg text-slate-800 text-sm focus:outline-none transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase font-mono tracking-wider mb-2">No Absen</label>
                  <input
                    type="number"
                    required
                    value={editAbsen}
                    onChange={(e) => setEditAbsen(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg text-slate-800 text-sm focus:outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase font-mono tracking-wider mb-2">Kelas</label>
                  <input
                    type="text"
                    required
                    value={editClass}
                    onChange={(e) => setEditClass(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg text-slate-800 text-sm focus:outline-none transition"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  id="btn-edit-stud-cancel"
                  onClick={() => setEditingStudent(null)}
                  className="flex-1 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 border border-slate-200 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  id="btn-edit-stud-save"
                  className="flex-1 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah Slot Mata Pelajaran Baru */}
      {isAddingSubjectModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                Tambah Slot Mata Pelajaran Baru
              </h3>
              <button
                onClick={() => setIsAddingSubjectModal(false)}
                className="p-1 hover:bg-slate-100 rounded-full transition text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubjectSlot} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase font-mono tracking-wider mb-1.5">
                  Nama Mata Pelajaran / Naskah Ujian
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Seni Budaya, Informatika, dll."
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase font-mono tracking-wider mb-1.5">
                  Kode Singkat Naskah
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: SNB-8, INF-8, MAT-9"
                  value={newSubjectCode}
                  onChange={(e) => setNewSubjectCode(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-mono uppercase"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Kode ini juga dipakai untuk pencocokan otomatis kolom Excel.
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Tampilkan di Pilihan Siswa</span>
                  <span className="text-[11px] text-slate-500 block">
                    Muncul di menu "Pilih Naskah Ujian" saat siswa registrasi masuk.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={newSubjectIsActive}
                  onChange={(e) => setNewSubjectIsActive(e.target.checked)}
                  className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddingSubjectModal(false)}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 border border-slate-200 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition shadow-sm"
                >
                  Simpan Slot ({subjects.length + 1}/20)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Informasi Mata Pelajaran & Penjadwalan Waktu Real-Time WIB */}
      {editingSubjectModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 sm:p-7 max-h-[92vh] overflow-y-auto animate-fade-in space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Edit className="w-5 h-5 text-indigo-600" />
                Edit Mata Pelajaran & Jadwal Ujian (WIB)
              </h3>
              <button
                onClick={() => setEditingSubjectModal(null)}
                className="p-1 hover:bg-slate-100 rounded-full transition text-slate-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSubjectSlot} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase font-mono tracking-wider mb-1.5">
                  Nama Mata Pelajaran
                </label>
                <input
                  type="text"
                  required
                  value={editSubjectName}
                  onChange={(e) => setEditSubjectName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase font-mono tracking-wider mb-1.5">
                  Kode Singkat Naskah
                </label>
                <input
                  type="text"
                  required
                  value={editSubjectCode}
                  onChange={(e) => setEditSubjectCode(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-mono uppercase"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Tampilkan di Pilihan Siswa</span>
                  <span className="text-[11px] text-slate-500 block">
                    Muncul di menu "Pilih Naskah Ujian" saat siswa registrasi masuk.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={editSubjectIsActive}
                  onChange={(e) => setEditSubjectIsActive(e.target.checked)}
                  className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              {/* Pengaturan Soal Acak per-Mapel */}
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-indigo-950 block">Pengambilan Soal Acak (Random Sampling)</span>
                    <span className="text-[11px] text-indigo-700 block">
                      Hanya berikan sebagian butir soal secara acak ke tiap siswa
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={editSubjectEnableSampling}
                    onChange={(e) => setEditSubjectEnableSampling(e.target.checked)}
                    className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>

                {editSubjectEnableSampling && (
                  <div className="flex items-center justify-between pt-1 border-t border-indigo-100">
                    <label className="text-[11px] font-bold text-indigo-900 font-mono">
                      Jumlah Butir Soal yang Diambil:
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        value={editSubjectSampleCount}
                        onChange={(e) => setEditSubjectSampleCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 px-2 py-1 bg-white border border-indigo-300 rounded-lg text-xs font-mono font-bold text-center text-indigo-900"
                      />
                      <span className="text-xs font-bold text-indigo-800">Butir</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Pengaturan Penjadwalan Waktu Real-Time WIB */}
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-amber-700" />
                    <div>
                      <span className="text-xs font-bold text-amber-950 block">Penjadwalan Waktu Ujian (WIB Real-Time)</span>
                      <span className="text-[11px] text-amber-800 block">
                        Atur jam tayang di portal siswa dan jam mulai/selesai pengerjaan
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={editSubjectScheduleEnabled}
                    onChange={(e) => setEditSubjectScheduleEnabled(e.target.checked)}
                    className="w-5 h-5 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                  />
                </div>

                {editSubjectScheduleEnabled && (
                  <div className="space-y-3 pt-2.5 border-t border-amber-200/80 text-xs">
                    {/* Quick Presets */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">Pintasan Waktu Cepat:</span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const nowStr = toWIBDateTimeInputValue(new Date());
                            setEditSubjectScheduleDisplayStart(nowStr);
                            setEditSubjectScheduleExamStart(nowStr);
                            setEditSubjectScheduleDisplayEnd('');
                            setEditSubjectScheduleExamEnd('');
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-amber-300 rounded-lg text-[11px] font-bold text-slate-700 cursor-pointer shadow-2xs"
                        >
                          ⚡ Buka Sekarang Bebas
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const now = new Date();
                            const nowStr = toWIBDateTimeInputValue(now);
                            const end = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 hours
                            const endStr = toWIBDateTimeInputValue(end);
                            setEditSubjectScheduleDisplayStart(nowStr);
                            setEditSubjectScheduleExamStart(nowStr);
                            setEditSubjectScheduleDisplayEnd(endStr);
                            setEditSubjectScheduleExamEnd(endStr);
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-amber-300 rounded-lg text-[11px] font-bold text-slate-700 cursor-pointer shadow-2xs"
                        >
                          ⏱️ Mulai Sekarang (Durasi 2 Jam)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            tomorrow.setHours(7, 0, 0, 0);
                            const dispStr = toWIBDateTimeInputValue(tomorrow);
                            tomorrow.setHours(7, 30, 0, 0);
                            const startStr = toWIBDateTimeInputValue(tomorrow);
                            tomorrow.setHours(9, 30, 0, 0);
                            const endStr = toWIBDateTimeInputValue(tomorrow);
                            setEditSubjectScheduleDisplayStart(dispStr);
                            setEditSubjectScheduleExamStart(startStr);
                            setEditSubjectScheduleDisplayEnd(endStr);
                            setEditSubjectScheduleExamEnd(endStr);
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-amber-300 rounded-lg text-[11px] font-bold text-slate-700 cursor-pointer shadow-2xs"
                        >
                          🌅 Besok Pagi (07:30 - 09:30 WIB)
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="bg-white p-2.5 rounded-xl border border-amber-200">
                        <label className="block text-[11px] font-bold text-slate-800 mb-1">
                          1. Waktu Tampil di Menu Siswa:
                        </label>
                        <input
                          type="datetime-local"
                          value={editSubjectScheduleDisplayStart}
                          onChange={(e) => setEditSubjectScheduleDisplayStart(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-800"
                        />
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Kapan mapel mulai terlihat di layar siswa.
                        </span>
                      </div>

                      <div className="bg-white p-2.5 rounded-xl border border-amber-200">
                        <label className="block text-[11px] font-bold text-slate-800 mb-1">
                          2. Batas Akhir Tampil (Opsional):
                        </label>
                        <input
                          type="datetime-local"
                          value={editSubjectScheduleDisplayEnd}
                          onChange={(e) => setEditSubjectScheduleDisplayEnd(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-800"
                        />
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Kosongkan jika ingin tampil terus.
                        </span>
                      </div>

                      <div className="bg-white p-2.5 rounded-xl border border-indigo-200">
                        <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                          3. Waktu Mulai Dikerjakan (WIB):
                        </label>
                        <input
                          type="datetime-local"
                          value={editSubjectScheduleExamStart}
                          onChange={(e) => setEditSubjectScheduleExamStart(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-indigo-50/50 border border-indigo-300 rounded-lg text-xs font-mono text-slate-800 font-bold"
                        />
                        <span className="text-[10px] text-indigo-600 block mt-0.5">
                          Sebelum jam ini, tombol ujian dikunci hitung mundur.
                        </span>
                      </div>

                      <div className="bg-white p-2.5 rounded-xl border border-rose-200">
                        <label className="block text-[11px] font-bold text-rose-900 mb-1">
                          4. Batas Akhir Mulai Ujian (WIB):
                        </label>
                        <input
                          type="datetime-local"
                          value={editSubjectScheduleExamEnd}
                          onChange={(e) => setEditSubjectScheduleExamEnd(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-rose-50/50 border border-rose-300 rounded-lg text-xs font-mono text-slate-800 font-bold"
                        />
                        <span className="text-[10px] text-rose-600 block mt-0.5">
                          Setelah jam ini, siswa dilarang mulai ujian.
                        </span>
                      </div>
                    </div>

                    {/* Preview Live Status Badge */}
                    <div className="p-3 bg-white rounded-xl border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-bold text-slate-700 block">Status di Jam WIB Sekarang:</span>
                        <span className="text-[10px] text-slate-400 font-mono">WIB Saat Ini: {wibClock.formattedTimeOnly}</span>
                      </div>
                      {(() => {
                        const tempSub: ExamSubject = {
                          id: editingSubjectModal.id,
                          name: editSubjectName,
                          isActive: editSubjectIsActive,
                          scheduleEnabled: editSubjectScheduleEnabled,
                          scheduleDisplayStart: editSubjectScheduleDisplayStart ? parseWIBInputValueToISO(editSubjectScheduleDisplayStart) : undefined,
                          scheduleDisplayEnd: editSubjectScheduleDisplayEnd ? parseWIBInputValueToISO(editSubjectScheduleDisplayEnd) : undefined,
                          scheduleExamStart: editSubjectScheduleExamStart ? parseWIBInputValueToISO(editSubjectScheduleExamStart) : undefined,
                          scheduleExamEnd: editSubjectScheduleExamEnd ? parseWIBInputValueToISO(editSubjectScheduleExamEnd) : undefined
                        };
                        const status = evaluateSubjectSchedule(tempSub, wibClock.now);
                        return (
                          <span className={`px-3 py-1 rounded-full font-mono font-black text-xs border ${status.badgeBg}`}>
                            {status.badgeText} ({status.statusLabel})
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingSubjectModal(null)}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 border border-slate-200 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition shadow-sm cursor-pointer"
                >
                  Simpan Perubahan & Jadwal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Dedikasi: Import Soal Excel (.xlsx / .xls) & CSV */}
      {showQuestionImportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full p-6 sm:p-8 space-y-5 my-8 max-h-[92vh] flex flex-col">
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">
                    Import Soal dari Excel (.xlsx / .xls) & CSV
                  </h3>
                  <p className="text-xs text-slate-500">
                    Unggah berkas soal lengkap beserta kunci jawaban dan bobot nilai secara otomatis.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowQuestionImportModal(false);
                  setParsedQuestionsPreview(null);
                  setQuestionModalError('');
                  setQuestionModalSuccess('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto space-y-4 pr-1 flex-1">
              {/* Target Mapel Selector */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase font-mono tracking-wider">
                  Target Mata Pelajaran Sasaran:
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setImportSubjectTarget(effectiveActiveSubject.id)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      importSubjectTarget === effectiveActiveSubject.id || importSubjectTarget === 'current'
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Mapel Aktif ({effectiveActiveSubject.name})
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportSubjectTarget('auto')}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      importSubjectTarget === 'auto'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    Otomatis dari Kolom Kode Naskah
                  </button>
                  {subjects.filter(s => s.id !== effectiveActiveSubject.id).map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setImportSubjectTarget(s.id)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        importSubjectTarget === s.id
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Download Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs">
                <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  Format Template Soal Microsoft Excel:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadTemplateXlsx(importSubjectTarget === 'auto' ? undefined : importSubjectTarget)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg transition flex items-center gap-1.5 shadow-2xs cursor-pointer text-[11px]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Unduh Template Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadTemplateCsv(importSubjectTarget === 'auto' ? undefined : importSubjectTarget)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold rounded-lg transition flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Unduh Versi CSV
                  </button>
                </div>
              </div>

              {/* Kolom / Area Upload Berkas Excel */}
              <div className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-2xl p-7 text-center bg-emerald-50/30 transition">
                <input
                  type="file"
                  id="modal-question-file-input"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleModalQuestionFileUpload}
                  className="hidden"
                />
                <label
                  htmlFor="modal-question-file-input"
                  className="cursor-pointer flex flex-col items-center justify-center space-y-2.5"
                >
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                    <Upload className="w-7 h-7" />
                  </div>
                  <span className="text-sm font-black text-slate-800">
                    {isProcessingQuestionFile ? 'Sedang membaca & membedah berkas...' : 'Klik di Sini untuk Memilih Berkas Excel (.xlsx / .xls) atau CSV'}
                  </span>
                  <span className="text-xs text-slate-500 max-w-md">
                    Satu baris = 1 butir soal. Berikan tanda bintang (<code className="font-mono text-emerald-800 bg-emerald-100 px-1 rounded font-bold">*</code>) di depan pilihan jawaban yang benar.
                  </span>
                </label>
              </div>

              {/* Feedback Notifikasi */}
              {questionModalError && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{questionModalError}</span>
                </div>
              )}
              {questionModalSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{questionModalSuccess}</span>
                </div>
              )}

              {/* Tinjauan Soal yang Dibaca */}
              {parsedQuestionsPreview && parsedQuestionsPreview.length > 0 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden space-y-3 p-4 bg-slate-50">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <span className="text-xs font-black text-slate-800 uppercase font-mono">
                      Tinjauan Soal ({parsedQuestionsPreview.length} Butir Soal Terbaca):
                    </span>
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-700">
                      <span>Metode Impor:</span>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="qImportMode"
                          checked={questionImportMode === 'APPEND'}
                          onChange={() => setQuestionImportMode('APPEND')}
                        />
                        <span>Tambah (Append)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="qImportMode"
                          checked={questionImportMode === 'OVERWRITE'}
                          onChange={() => setQuestionImportMode('OVERWRITE')}
                        />
                        <span>Gantikan Lama (Overwrite)</span>
                      </label>
                    </div>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {parsedQuestionsPreview.slice(0, 10).map((q, idx) => (
                      <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-indigo-700">Soal #{idx + 1} ({q.type || 'MC'})</span>
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">Skor: {q.score || 10}</span>
                        </div>
                        <p className="font-semibold text-slate-800 line-clamp-2">{q.questionText}</p>
                        <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600 pt-0.5">
                          {q.options.map((opt, oIdx) => {
                            const isCorrect = q.type === 'MR'
                              ? (q.correctAnswerIndices || []).includes(oIdx)
                              : q.correctAnswerIndex === oIdx;
                            return (
                              <div key={oIdx} className={`px-2 py-1 rounded truncate ${isCorrect ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-200' : 'bg-slate-50'}`}>
                                {String.fromCharCode(65 + oIdx)}. {opt} {isCorrect && '✓'}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {parsedQuestionsPreview.length > 10 && (
                      <p className="text-center text-xs text-slate-400 font-mono italic">
                        ... dan {parsedQuestionsPreview.length - 10} butir soal lainnya siap diimpor.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Tombol Aksi Bawah */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowQuestionImportModal(false);
                  setParsedQuestionsPreview(null);
                  setQuestionModalError('');
                  setQuestionModalSuccess('');
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!parsedQuestionsPreview || parsedQuestionsPreview.length === 0}
                onClick={handleConfirmModalQuestionImport}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Simpan & Impor {parsedQuestionsPreview ? `${parsedQuestionsPreview.length} Soal` : 'Soal'} ke Bank Soal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dedikasi: Import Soal Microsoft Word (.docx) Lengkap dengan Gambar & Kunci di Bawah */}
      {showWordImportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full p-6 sm:p-8 space-y-5 my-8 max-h-[92vh] flex flex-col">
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-xs">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">
                      Import Soal Microsoft Word (.docx)
                    </h3>
                    <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                      DOCX PARSER
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Format: Soal PG di atas, kunci jawaban di bawah, dan gambar otomatis disisipkan ke soal.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowWordImportModal(false);
                  setParsedWordResult(null);
                  setWordModalError('');
                  setWordModalSuccess('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto space-y-4 pr-1 flex-1">
              {/* Target Mapel Selector */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase font-mono tracking-wider">
                  Target Mata Pelajaran Sasaran:
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setImportSubjectTarget(effectiveActiveSubject.id)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      importSubjectTarget === effectiveActiveSubject.id || importSubjectTarget === 'current'
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Mapel Aktif ({effectiveActiveSubject.name})
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportSubjectTarget('auto')}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      importSubjectTarget === 'auto'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    Otomatis dari Kode
                  </button>
                  {subjects.filter(s => s.id !== effectiveActiveSubject.id).map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setImportSubjectTarget(s.id)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        importSubjectTarget === s.id
                          ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Panduan Format Word */}
              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2.5 text-xs text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-blue-950 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    Panduan Cerdas Format Dokumen Microsoft Word (.docx):
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    PG Tunggal, Ganda & Matematika
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] leading-relaxed">
                  <div className="bg-white p-3 rounded-xl border border-blue-100 space-y-1">
                    <strong className="text-blue-900 block font-bold">1. Format Soal & Nomor Presisi</strong>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                      <li>Nomor soal: <code className="font-mono font-bold">1. </code>, <code className="font-mono font-bold">2. </code>, dst.</li>
                      <li>Pilihan jawaban: <code className="font-mono font-bold">A. </code>, <code className="font-mono font-bold">B. </code>, <code className="font-mono font-bold">C. </code>, <code className="font-mono font-bold">D. </code></li>
                      <li><strong>Anti-Acak / Anti-Tertelan:</strong> Dilengkapi deteksi urutan nomor pintar & pemulihan otomatis (Auto-Heal) jika ada soal yang menempel.</li>
                      <li><strong>Gambar / Diagram:</strong> Sisipkan gambar langsung ke Word! Otomatis diekstrak dan masuk ke soal.</li>
                    </ul>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-indigo-100 space-y-1">
                    <strong className="text-indigo-900 block font-bold">2. Matematika, Pecahan & Rumus Rumit</strong>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                      <li><strong>Word Equation:</strong> Rumus dari menu <em>Insert &gt; Equation</em> otomatis diubah ke KaTeX beresolusi tinggi.</li>
                      <li><strong>Pecahan:</strong> Bentuk pecahan bertingkat maupun teks (<code className="font-mono font-bold">1/2</code>, <code className="font-mono font-bold">3/4</code>) terbaca rapi.</li>
                      <li><strong>Pangkat &amp; Akar:</strong> Mendukung <code className="font-mono font-bold">x²</code>, <code className="font-mono font-bold">cm³</code>, <code className="font-mono font-bold">√25</code>, serta simbol <code className="font-mono font-bold">±, ×, ÷, ≤, ≥, π</code>.</li>
                    </ul>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-blue-100 space-y-1">
                    <strong className="text-blue-900 block font-bold">3. Bagian Bawah: Kunci Jawaban</strong>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                      <li>Tulis judul: <code className="font-mono font-bold text-indigo-700">KUNCI JAWABAN</code> di bagian paling bawah.</li>
                      <li><strong>PG Tunggal:</strong> contoh <code className="font-mono font-bold">1. A</code>, <code className="font-mono font-bold">3. D</code></li>
                      <li><strong>Jawaban Ganda:</strong> contoh <code className="font-mono font-bold">2. B, C</code> atau <code className="font-mono font-bold">4. A, D</code></li>
                    </ul>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-700">Skor Default per Soal:</span>
                    <input
                      type="number"
                      min="1"
                      value={wordImportDefaultScore}
                      onChange={(e) => setWordImportDefaultScore(Math.max(1, parseInt(e.target.value) || 10))}
                      className="w-16 px-2 py-0.5 bg-white border border-slate-300 rounded text-center font-mono font-bold text-xs"
                    />
                    <span className="text-[11px] text-slate-500">Poin</span>
                  </div>
                </div>
              </div>

              {/* Kolom / Dropzone Upload Berkas Word (.docx) */}
              <div className="border-2 border-dashed border-blue-300 hover:border-blue-500 rounded-2xl p-7 text-center bg-blue-50/20 transition">
                <input
                  type="file"
                  id="modal-word-file-input"
                  accept=".docx"
                  onChange={handleWordFileUpload}
                  className="hidden"
                />
                <label
                  htmlFor="modal-word-file-input"
                  className="cursor-pointer flex flex-col items-center justify-center space-y-2.5"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-xs">
                    <FileText className="w-7 h-7" />
                  </div>
                  <span className="text-sm font-black text-slate-800">
                    {isProcessingWordFile
                      ? 'Sedang membaca dokumen Word, membedah rumus matematika & gambar...'
                      : 'Klik di Sini untuk Memilih Berkas Microsoft Word (.docx)'}
                  </span>
                  <span className="text-xs text-slate-500 max-w-md">
                    Format berkas didukung: <code className="font-mono text-blue-800 bg-blue-100 px-1 rounded font-bold">.docx</code>. Seluruh diagram, rumus matematika, pecahan & kunci jawaban di bawah akan diproses otomatis.
                  </span>
                </label>
              </div>

              {/* Feedback Notifikasi */}
              {wordModalError && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{wordModalError}</span>
                </div>
              )}
              {wordModalSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{wordModalSuccess}</span>
                </div>
              )}

              {/* Tinjauan Soal yang Dibaca dari Word */}
              {parsedWordResult && parsedWordResult.questions.length > 0 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden space-y-3 p-4 bg-slate-50">
                  {/* Statistik Hasil Parse */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                      <span className="text-[10px] text-slate-400 font-bold uppercase font-mono block">Total Soal</span>
                      <span className="text-base font-black text-slate-900 font-mono">{parsedWordResult.totalParsed}</span>
                      <span className="text-[9px] text-slate-500 block truncate font-mono">{parsedWordResult.detectedSequence}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                      <span className="text-[10px] text-indigo-500 font-bold uppercase font-mono block">PG Tunggal</span>
                      <span className="text-base font-black text-indigo-700 font-mono">{parsedWordResult.mcCount}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                      <span className="text-[10px] text-purple-500 font-bold uppercase font-mono block">Jawaban Ganda</span>
                      <span className="text-base font-black text-purple-700 font-mono">{parsedWordResult.mrCount}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                      <span className="text-[10px] text-emerald-500 font-bold uppercase font-mono block">Ada Gambar</span>
                      <span className="text-base font-black text-emerald-700 font-mono">{parsedWordResult.imageCount}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                      <span className="text-[10px] text-amber-600 font-bold uppercase font-mono block">Rumus / Math</span>
                      <span className="text-base font-black text-amber-700 font-mono">{parsedWordResult.mathFormulaCount}</span>
                      <span className="text-[9px] text-amber-600 font-bold block">KaTeX Render</span>
                    </div>
                  </div>

                  {/* Diagnostic Banner if Recovered Questions or Warnings */}
                  {parsedWordResult.recoveredQuestionCount > 0 && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-semibold flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Sistem cerdas berhasil memulihkan <strong>{parsedWordResult.recoveredQuestionCount} butir soal</strong> yang sebelumnya sempat menyatu dengan teks nomor lain. Jumlah nomor soal sekarang utuh dan genap!
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3 pt-1">
                    <span className="text-xs font-black text-slate-800 uppercase font-mono">
                      Tinjauan Butir Soal Terbaca ({parsedWordResult.questions.length} Butir):
                    </span>
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-700">
                      <span>Metode:</span>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="wordImportMode"
                          checked={wordImportMode === 'APPEND'}
                          onChange={() => setWordImportMode('APPEND')}
                        />
                        <span>Tambah (Append)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="wordImportMode"
                          checked={wordImportMode === 'OVERWRITE'}
                          onChange={() => setWordImportMode('OVERWRITE')}
                        />
                        <span>Gantikan Lama (Overwrite)</span>
                      </label>
                    </div>
                  </div>

                  {/* List Question Cards Preview with Rich KaTeX Math Rendering */}
                  <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
                    {parsedWordResult.questions.slice(0, 15).map((q, idx) => {
                      const isMulti = q.type === 'MR';
                      const keyIndices = isMulti ? (q.correctAnswerIndices || []) : [q.correctAnswerIndex];
                      const keyLetters = keyIndices.map(k => String.fromCharCode(65 + k)).join(', ');
                      const hasMath = q.questionText.includes('$') || q.questionText.includes('\\frac') || q.options.some(o => o.includes('$') || o.includes('\\frac'));

                      return (
                        <div key={idx} className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-indigo-700">Soal #{idx + 1}</span>
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-bold ${
                                isMulti ? 'bg-purple-100 text-purple-800' : 'bg-indigo-100 text-indigo-800'
                              }`}>
                                {isMulti ? 'Jawaban Ganda (Multi Response)' : 'Pilihan Ganda Tunggal'}
                              </span>
                              {q.imageUrl && (
                                <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                                  <ImageIcon className="w-3 h-3" />
                                  Gambar Terlampir
                                </span>
                              )}
                              {hasMath && (
                                <span className="text-[10px] font-mono bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md font-bold">
                                  📐 Rumus KaTeX
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded">
                              Kunci: {keyLetters || 'A'}
                            </span>
                          </div>

                          {/* Soal Text with Rich KaTeX Math Rendering */}
                          <div className="font-semibold text-slate-800 text-sm leading-relaxed">
                            <RichExamContent text={q.questionText} />
                          </div>

                          {/* Gambar Preview */}
                          {q.imageUrl && (
                            <div className="my-1.5 max-w-sm rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-1">
                              <img
                                src={q.imageUrl}
                                alt={`Ilustrasi Soal ${idx + 1}`}
                                className="max-h-40 w-auto rounded object-contain mx-auto"
                              />
                            </div>
                          )}

                          {/* Options with Rich KaTeX Math Rendering */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                            {q.options.map((opt, oIdx) => {
                              const isCorrect = keyIndices.includes(oIdx);
                              return (
                                <div
                                  key={oIdx}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between ${
                                    isCorrect
                                      ? 'bg-emerald-50 text-emerald-900 font-bold border border-emerald-300'
                                      : 'bg-slate-50 text-slate-700 border border-slate-100'
                                  }`}
                                >
                                  <div className="flex items-baseline gap-1.5 overflow-hidden">
                                    <span className="font-mono font-bold text-slate-500 shrink-0">{String.fromCharCode(65 + oIdx)}.</span>
                                    <div className="truncate">
                                      <RichExamContent text={opt} />
                                    </div>
                                  </div>
                                  {isCorrect && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1" />}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {parsedWordResult.questions.length > 15 && (
                      <p className="text-center text-xs text-slate-400 font-mono italic">
                        ... dan {parsedWordResult.questions.length - 15} butir soal lainnya siap diimpor ke bank soal.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Tombol Aksi Bawah */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowWordImportModal(false);
                  setParsedWordResult(null);
                  setWordModalError('');
                  setWordModalSuccess('');
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!parsedWordResult || parsedWordResult.questions.length === 0}
                onClick={handleConfirmWordImport}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Simpan & Impor {parsedWordResult ? `${parsedWordResult.questions.length} Soal` : 'Soal Word'} ke Bank Soal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Siswa Manual di Monitoring Tab */}
      {showAddStudentMonitorModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                Tambah Siswa ke Presensi Ujian
              </h3>
              <button
                type="button"
                onClick={() => setShowAddStudentMonitorModal(false)}
                className="p-1 text-slate-400 hover:bg-slate-100 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addMonitorError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
                {addMonitorError}
              </div>
            )}

            <form onSubmit={handleAddMonitorStudent} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Lengkap Siswa</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={newMonitorName}
                  onChange={(e) => setNewMonitorName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kelas</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 8A"
                    value={newMonitorClass}
                    onChange={(e) => setNewMonitorClass(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 uppercase font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">No. Absen</label>
                  <input
                    type="text"
                    placeholder="Contoh: 05"
                    value={newMonitorAbsen}
                    onChange={(e) => setNewMonitorAbsen(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Pilih Mata Pelajaran</label>
                <select
                  value={newMonitorSubject}
                  onChange={(e) => setNewMonitorSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold focus:outline-none focus:border-indigo-500"
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddStudentMonitorModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl transition shadow-xs cursor-pointer"
                >
                  Simpan Siswa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

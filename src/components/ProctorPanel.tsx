import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { getStudentMetrics } from './AdminPanel';
import { 
  KeyRound, 
  ShieldCheck, 
  AlertTriangle, 
  Search, 
  Users, 
  CheckCircle2, 
  Clock, 
  BarChart3, 
  FileSpreadsheet, 
  Copy, 
  Check, 
  LogOut, 
  RefreshCw,
  Eye,
  SlidersHorizontal,
  Info,
  Layers,
  Download,
  X,
  RotateCcw,
  Send,
  Shuffle,
  Megaphone,
  Volume2
} from 'lucide-react';
import { Student, Question, ExamConfig, ExamSubject, ProctorPermissions, BroadcastAnnouncement } from '../types';
import { DEFAULT_PROCTOR_PERMISSIONS } from '../data';
import { getExamSubjects } from '../utils/sync';
import { playAnnouncementSound } from '../utils/alarmAudio';
import AnalyticsCharts from './AnalyticsCharts';
import ItemAnalysisTab from './ItemAnalysisTab';

interface ProctorPanelProps {
  students: Student[];
  questions: Question[];
  config: ExamConfig;
  onUnlockStudent: (studentId: string) => void;
  onUnlockAllStudents: () => void;
  onResetStudentAttempt?: (studentId: string) => void;
  onResetStudentViolations?: (studentId: string) => void;
  onForceSubmitStudent?: (studentId: string) => void;
  onChangeStudentSubject?: (studentId: string, newSubjectId: string) => void;
  onBroadcastAnnouncement?: (message: string, senderTitle?: string, targetSubjectId?: string, targetStudentId?: string, targetStudentName?: string) => void;
  onClearAnnouncement?: () => void;
  onExit: () => void;
}

export default function ProctorPanel({
  students,
  questions,
  config,
  onUnlockStudent,
  onUnlockAllStudents,
  onResetStudentAttempt,
  onResetStudentViolations,
  onForceSubmitStudent,
  onChangeStudentSubject,
  onBroadcastAnnouncement,
  onClearAnnouncement,
  onExit
}: ProctorPanelProps) {
  const permissions: ProctorPermissions = config.proctorPermissions || DEFAULT_PROCTOR_PERMISSIONS;
  const [changeSubjectStudent, setChangeSubjectStudent] = useState<Student | null>(null);
  const [targetNewSubjectId, setTargetNewSubjectId] = useState<string>('');
  // Navigation tabs for proctor: MONITOR (default), CHARTS, ITEM_ANALYSIS
  const [activeTab, setActiveTab] = useState<'MONITOR' | 'CHARTS' | 'ITEM_ANALYSIS'>('MONITOR');

  // Broadcast modal state (Supports Mass Broadcast & 1-on-1 Targeted Student Message)
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastSender, setBroadcastSender] = useState('Pengawas Ruangan');
  const [broadcastTargetType, setBroadcastTargetType] = useState<'ALL' | 'SPECIFIC_STUDENT' | 'SUBJECT'>('ALL');
  const [broadcastTargetStudentId, setBroadcastTargetStudentId] = useState<string>('');
  const [broadcastTargetSubject, setBroadcastTargetSubject] = useState<string>('all');
  const [isPlayingTestSound, setIsPlayingTestSound] = useState(false);

  const handleTestSound = () => {
    if (isPlayingTestSound) {
      setIsPlayingTestSound(false);
      return;
    }
    setIsPlayingTestSound(true);
    playAnnouncementSound(config);
    setTimeout(() => setIsPlayingTestSound(false), 3500);
  };

  const handleSendProctorBroadcast = () => {
    if (!broadcastMessage.trim()) {
      alert('Tuliskan isi pesan pengumuman terlebih dahulu!');
      return;
    }

    let targetStdId: string | undefined = undefined;
    let targetStdName: string | undefined = undefined;

    if (broadcastTargetType === 'SPECIFIC_STUDENT') {
      if (!broadcastTargetStudentId) {
        alert('Pilih siswa penerima pesan terlebih dahulu!');
        return;
      }
      const targetStudent = students.find(s => s.id === broadcastTargetStudentId);
      if (!targetStudent) {
        alert('Data siswa yang dipilih tidak ditemukan.');
        return;
      }
      targetStdId = targetStudent.id;
      targetStdName = targetStudent.name;
    }

    if (onBroadcastAnnouncement) {
      onBroadcastAnnouncement(
        broadcastMessage.trim(),
        broadcastSender.trim() || 'Pengawas Ruangan',
        broadcastTargetType === 'SUBJECT' ? broadcastTargetSubject : 'all',
        targetStdId,
        targetStdName
      );
      if (broadcastTargetType === 'SPECIFIC_STUDENT') {
        alert(`✅ Pesan khusus berhasil dikirimkan ke layar siswa: ${targetStdName}!`);
      } else {
        alert('✅ Pengumuman massal berhasil disiarkan ke seluruh siswa yang sedang mengerjakan!');
      }
      setShowBroadcastModal(false);
    }
  };

  // Filters for monitoring table
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [showExportGradesModal, setShowExportGradesModal] = useState(false);
  const [exportClassFilter, setExportClassFilter] = useState('all');

  // Multi-Sheet & Per-Subject Excel Export for Proctor
  const generateStudentGradeRows = (studentList: Student[]) => {
    const headers = [
      'No',
      'Nama Siswa',
      'No Absen',
      'Kelas',
      'Naskah / Mata Pelajaran',
      'Status Ujian',
      'Pelanggaran (Lock Count)',
      'Total Benar',
      'Jumlah Soal',
      'Nilai Akhir (%)',
      'Waktu Mulai (WIB)',
      'Waktu Selesai (WIB)'
    ];

    const rows = studentList.map((s, idx) => {
      const metrics = getStudentMetrics(s, questions);
      const correctCount = s.status === 'SELESAI' 
        ? metrics.correctAnswersCount 
        : (s.correctAnswersCount !== undefined ? s.correctAnswersCount : (metrics.correctAnswersCount || 0));
      const totalCount = metrics.totalQuestions;
      const finalScore = s.status === 'SELESAI' 
        ? Number(metrics.score.toFixed(1)) 
        : (s.score !== undefined ? Number(s.score.toFixed(1)) : (Object.keys(s.answers || {}).length > 0 ? Number(metrics.score.toFixed(1)) : 0));
      
      const formatTimeText = (isoStr?: string) => {
        if (!isoStr) return '-';
        const d = new Date(isoStr);
        return `${d.toLocaleDateString('id-ID')} ${d.toLocaleTimeString('id-ID')}`;
      };

      const foundSub = subjects.find(sub => sub.id === s.subjectId || (!s.subjectId && sub.id === 'sub1'));
      const subjectName = foundSub ? foundSub.name : (s.subjectId || 'Mata Pelajaran');

      return [
        idx + 1,
        s.name,
        s.absentNumber,
        s.studentClass,
        subjectName,
        s.status === 'TERKUNCI' ? 'TERKOMPROMISI / TERKUNCI' : s.status,
        s.violationCount || 0,
        correctCount,
        totalCount,
        finalScore,
        formatTimeText(s.startTime),
        formatTimeText(s.endTime)
      ];
    });

    return { headers, rows };
  };

  const applyExcelSheetStyles = (ws: XLSX.WorkSheet) => {
    ws['!cols'] = [
      { wch: 6 },  // No
      { wch: 28 }, // Nama Siswa
      { wch: 12 }, // No Absen
      { wch: 12 }, // Kelas
      { wch: 26 }, // Naskah Soal
      { wch: 24 }, // Status Ujian
      { wch: 16 }, // Pelanggaran
      { wch: 12 }, // Total Benar
      { wch: 12 }, // Jumlah Soal
      { wch: 15 }, // Nilai Akhir
      { wch: 20 }, // Mulai
      { wch: 20 }  // Selesai
    ];
  };

  const handleExportGradesToExcel = (targetSubjectId: string = 'all', targetClass: string = 'all') => {
    let sourceStudents = students;
    if (targetClass !== 'all') {
      sourceStudents = sourceStudents.filter(s => s.studentClass === targetClass);
    }

    if (sourceStudents.length === 0) {
      alert('Tidak ada data siswa untuk diekspor pada filter yang dipilih!');
      return;
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const safeTitle = (config.examTitle || 'Ujian').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const wb = XLSX.utils.book_new();

    if (targetSubjectId === 'all') {
      const masterData = generateStudentGradeRows(sourceStudents);
      const wsMaster = XLSX.utils.aoa_to_sheet([masterData.headers, ...masterData.rows]);
      applyExcelSheetStyles(wsMaster);
      XLSX.utils.book_append_sheet(wb, wsMaster, 'Semua_Naskah');

      const usedSheetNames = new Set<string>(['Semua_Naskah']);
      subjects.forEach((sub, sIdx) => {
        const subStudents = sourceStudents.filter(s => (!s.subjectId && sub.id === 'sub1') || s.subjectId === sub.id);
        if (subStudents.length > 0) {
          const subData = generateStudentGradeRows(subStudents);
          const wsSub = XLSX.utils.aoa_to_sheet([subData.headers, ...subData.rows]);
          applyExcelSheetStyles(wsSub);

          let sheetName = sub.name.replace(/[:\\/?*\[\]]/g, '_').slice(0, 28);
          if (usedSheetNames.has(sheetName)) {
            sheetName = `${sheetName.slice(0, 24)}_${sIdx + 1}`;
          }
          usedSheetNames.add(sheetName);

          XLSX.utils.book_append_sheet(wb, wsSub, sheetName);
        }
      });

      const fileName = `rekap_nilai_pengawas_multi_mapel_${safeTitle}_${dateStr}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } else {
      const foundSub = subjects.find(s => s.id === targetSubjectId);
      const subName = foundSub ? foundSub.name : 'Mapel';
      const subStudents = sourceStudents.filter(s => (!s.subjectId && targetSubjectId === 'sub1') || s.subjectId === targetSubjectId);

      if (subStudents.length === 0) {
        alert(`Belum ada data siswa untuk mata pelajaran "${subName}"!`);
        return;
      }

      const subData = generateStudentGradeRows(subStudents);
      const ws = XLSX.utils.aoa_to_sheet([subData.headers, ...subData.rows]);
      applyExcelSheetStyles(ws);

      const sheetName = subName.replace(/[:\\/?*\[\]]/g, '_').slice(0, 28);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const cleanSubName = subName.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `rekap_nilai_${cleanSubName}_${safeTitle}_${dateStr}.xlsx`;
      XLSX.writeFile(wb, fileName);
    }

    setShowExportGradesModal(false);
  };

  // Token copy state
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Available subjects and classes
  const subjects: ExamSubject[] = useMemo(() => getExamSubjects(config), [config]);

  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => {
      if (s.studentClass && s.studentClass.trim()) {
        set.add(s.studentClass.trim());
      }
    });
    return Array.from(set).sort();
  }, [students]);

  // Registered Tokens from ExamConfig
  const registeredTokens = useMemo(() => {
    return config.unlockTokens && config.unlockTokens.length > 0
      ? config.unlockTokens
      : ['TOKEN-1', 'TOKEN-2'];
  }, [config.unlockTokens]);

  // Locked students
  const lockedStudents = useMemo(() => {
    return students.filter(s => s.status === 'TERKUNCI');
  }, [students]);

  // Filtered students
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      // Subject filter
      if (selectedSubjectFilter !== 'all') {
        const studentSub = s.subjectId || 'sub1';
        if (studentSub !== selectedSubjectFilter) return false;
      }
      // Class filter
      if (selectedClassFilter !== 'all') {
        if (s.studentClass !== selectedClassFilter) return false;
      }
      // Status filter
      if (selectedStatusFilter !== 'all') {
        if (s.status !== selectedStatusFilter) return false;
      }
      // Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = (s.name || '').toLowerCase().includes(query);
        const absentMatch = (s.absentNumber || '').toLowerCase().includes(query);
        const usernameMatch = (s.username || '').toLowerCase().includes(query);
        if (!nameMatch && !absentMatch && !usernameMatch) return false;
      }
      return true;
    }).sort((a, b) => {
      // Bring locked students to the very top so proctor immediately sees them
      if (a.status === 'TERKUNCI' && b.status !== 'TERKUNCI') return -1;
      if (b.status === 'TERKUNCI' && a.status !== 'TERKUNCI') return 1;
      // Then sort by class and absent number
      if (a.studentClass !== b.studentClass) {
        return a.studentClass.localeCompare(b.studentClass);
      }
      const numA = parseInt(a.absentNumber, 10);
      const numB = parseInt(b.absentNumber, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.name.localeCompare(b.name);
    });
  }, [students, selectedSubjectFilter, selectedClassFilter, selectedStatusFilter, searchQuery]);

  // Copy token to clipboard
  const handleCopyToken = (tok: string) => {
    navigator.clipboard.writeText(tok);
    setCopiedToken(tok);
    setTimeout(() => {
      setCopiedToken(null);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16 font-sans">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Title & Badge */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-sm">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    Portal Pengawas Ruang
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono bg-amber-100 text-amber-900 border border-amber-200 uppercase">
                    AKUN PENGAWAS
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-mono hidden sm:block">
                  MONITORING UJIAN • BUKA KUNCI SISWA • INFORMASI TOKEN TERDAFTAR
                </p>
              </div>
            </div>

            {/* Tabs & Logout */}
            <div className="flex items-center gap-2">
              <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  id="tab-proctor-monitor"
                  onClick={() => setActiveTab('MONITOR')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'MONITOR'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Monitoring Siswa ({students.length})</span>
                  {lockedStudents.length > 0 && (
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                  )}
                </button>

                {permissions.showAnalyticsCharts !== false && (
                  <button
                    type="button"
                    id="tab-proctor-charts"
                    onClick={() => setActiveTab('CHARTS')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'CHARTS'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Grafik Monitoring</span>
                  </button>
                )}

                {permissions.showItemAnalysis !== false && (
                  <button
                    type="button"
                    id="tab-proctor-item-analysis"
                    onClick={() => setActiveTab('ITEM_ANALYSIS')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      activeTab === 'ITEM_ANALYSIS'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Analisis Butir Soal</span>
                  </button>
                )}
              </nav>

              {permissions.allowExportExcel !== false && (
                <button
                  type="button"
                  onClick={() => setShowExportGradesModal(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  title="Ekspor rekap nilai siswa terpisah per naskah mata pelajaran ke Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ekspor Nilai (Excel)</span>
                </button>
              )}
              {onBroadcastAnnouncement && (
                <button
                  type="button"
                  id="btn-proctor-broadcast"
                  onClick={() => setShowBroadcastModal(true)}
                  className={`px-3 py-1.5 font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer ${
                    config.activeAnnouncement?.active
                      ? 'bg-amber-400 text-slate-950 font-black animate-pulse'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                  title="Kirim pengumuman custom massal ke seluruh siswa"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Pengumuman Massal</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black ${
                    config.activeAnnouncement?.active ? 'bg-black/20 text-slate-950' : 'bg-white/20 text-white'
                  }`}>
                    {students.filter(s => s.status === 'SEDANG_MENGERJAKAN').length}
                  </span>
                </button>
              )}
              <button
                type="button"
                id="btn-proctor-logout"
                onClick={onExit}
                className="p-2 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                title="Keluar dari akun pengawas"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        
        {/* VIEW 1: MONITORING & UNLOCK TAB */}
        {activeTab === 'MONITOR' && (
          <div className="space-y-6">
            
            {/* 1. DEDICATED TOKEN DISPLAY WIDGET (Permintaan Pengguna: Pengawas bisa lihat token yang terdaftar) */}
            <div className="bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-lg border border-indigo-900/50 relative overflow-hidden">
              <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-indigo-500/10 to-transparent pointer-events-none"></div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-1.5 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-amber-400 text-slate-950">
                      <KeyRound className="w-4 h-4" />
                    </span>
                    <span className="text-[11px] font-black font-mono tracking-wider text-amber-300 uppercase">
                      TOKEN RESMI BUKA KUNCI TERDAFTAR
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                    Token Validasi Siswa Terkunci
                  </h3>
                  <p className="text-xs text-indigo-200/80 leading-relaxed font-sans">
                    Pengawas dapat memberikan token di bawah ini kepada siswa yang terkunci untuk dimasukkan di layar siswa, atau pengawas dapat langsung menekan tombol <strong>"Buka Kunci (Unlock)"</strong> di tabel bawah.
                  </p>
                </div>

                {/* Token Cards list */}
                <div className="flex flex-wrap items-center gap-3">
                  {registeredTokens.map((tok, idx) => {
                    const isCopied = copiedToken === tok;
                    return (
                      <div
                        key={idx}
                        className="bg-white/10 backdrop-blur-md border border-white/20 p-3.5 rounded-2xl flex items-center gap-3 shadow-md hover:bg-white/15 transition"
                      >
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-amber-300 font-mono font-bold block uppercase">
                            Token #{idx + 1}
                          </span>
                          <span className="text-xl font-black font-mono tracking-wider text-white select-all">
                            {tok}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopyToken(tok)}
                          className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition cursor-pointer active:scale-95"
                          title="Salin token ke papan klip"
                        >
                          {isCopied ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 2. URGENT LOCKED STUDENTS ALERT BANNER */}
            {lockedStudents.length > 0 && (
              <div className="bg-rose-600 text-white p-5 rounded-2xl shadow-xl border border-rose-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-2xl shrink-0">
                    <AlertTriangle className="w-7 h-7 text-white animate-bounce" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-white text-rose-700 font-black font-mono px-2 py-0.5 rounded-full uppercase tracking-wider">
                        PERINGATAN PENGAWAS
                      </span>
                      <span className="text-xs font-mono font-bold text-rose-200">
                        {lockedStudents.length} Siswa Terkunci
                      </span>
                    </div>
                    <h4 className="text-base sm:text-lg font-black tracking-tight mt-0.5">
                      Ada {lockedStudents.length} siswa dalam kondisi TERKUNCI!
                    </h4>
                    <p className="text-xs text-rose-100 mt-0.5">
                      Klik tombol Buka Kunci pada baris siswa di bawah atau buka kunci seluruh siswa sekaligus dengan tombol di samping.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  id="btn-proctor-unlock-all"
                  onClick={onUnlockAllStudents}
                  className="px-5 py-3 bg-white hover:bg-rose-50 text-rose-700 font-black text-xs sm:text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 shrink-0"
                >
                  <KeyRound className="w-4 h-4 text-rose-600" />
                  <span>Buka Kunci Semua ({lockedStudents.length})</span>
                </button>
              </div>
            )}

            {/* 3. FILTER & SEARCH TOOLBAR */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Filter Mapel */}
                <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs">
                  <span className="font-bold text-slate-500 font-mono">Naskah:</span>
                  <select
                    value={selectedSubjectFilter}
                    onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                    className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                  >
                    <option value="all">Semua Naskah ({students.length})</option>
                    {subjects.map(sub => {
                      const count = students.filter(s => (s.subjectId || 'sub1') === sub.id).length;
                      const gradeLabel = sub.targetGrade && sub.targetGrade !== 'ALL' ? ` [Kelas ${sub.targetGrade}]` : '';
                      return (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}{gradeLabel} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Filter Kelas */}
                <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs">
                  <span className="font-bold text-slate-500 font-mono">Kelas:</span>
                  <select
                    value={selectedClassFilter}
                    onChange={(e) => setSelectedClassFilter(e.target.value)}
                    className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                  >
                    <option value="all">Semua Kelas ({availableClasses.length})</option>
                    {availableClasses.map(cls => {
                      const count = students.filter(s => s.studentClass === cls).length;
                      return (
                        <option key={cls} value={cls}>
                          Kelas {cls} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Filter Status */}
                <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs">
                  <span className="font-bold text-slate-500 font-mono">Status:</span>
                  <select
                    value={selectedStatusFilter}
                    onChange={(e) => setSelectedStatusFilter(e.target.value)}
                    className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                  >
                    <option value="all">Semua Status</option>
                    <option value="TERKUNCI">Hanya Terkunci ({lockedStudents.length})</option>
                    <option value="SEDANG_MENGERJAKAN">Sedang Mengerjakan</option>
                    <option value="SELESAI">Selesai</option>
                    <option value="BELUM_MULAI">Belum Mulai</option>
                  </select>
                </div>
              </div>

              {/* Search box */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari nama / absen siswa..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* 4. STUDENTS MONITORING TABLE */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black font-mono text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4 w-16 text-center">Absen</th>
                      <th className="py-3.5 px-4 min-w-[200px]">Nama Siswa & Naskah</th>
                      <th className="py-3.5 px-3 text-center w-20">Kelas</th>
                      <th className="py-3.5 px-4 min-w-[170px]">Status Ujian</th>
                      <th className="py-3.5 px-3 text-center w-24">Pelanggaran</th>
                      <th className="py-3.5 px-3 text-center w-20">Jawaban</th>
                      <th className="py-3.5 px-3 text-center w-24">Nilai</th>
                      <th className="py-3.5 px-4 text-right min-w-[200px]">Tindakan Pengawas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-slate-400 font-mono text-xs">
                          Tidak ada siswa yang sesuai kriteria filter saat ini.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((s) => {
                        const isLocked = s.status === 'TERKUNCI';
                        const foundSub = subjects.find(sub => sub.id === (s.subjectId || 'sub1'));
                        const subName = foundSub ? foundSub.name : (s.subjectId || 'Mata Pelajaran 1');
                        const isSubInactive = foundSub && foundSub.isActive === false;
                        const totalAnswers = s.answers ? Object.keys(s.answers).length : 0;
                        const metrics = getStudentMetrics(s, questions);

                        return (
                          <tr
                            key={s.id}
                            className={`transition ${
                              isLocked
                                ? 'bg-rose-50/90 border-l-4 border-rose-500 hover:bg-rose-100/70'
                                : 'hover:bg-slate-50/60'
                            }`}
                          >
                            {/* Absen */}
                            <td className="py-4 px-4 text-center font-mono font-black text-slate-600">
                              {s.absentNumber ? s.absentNumber.padStart(2, '0') : '-'}
                            </td>

                            {/* Name & Subject */}
                            <td className="py-4 px-4">
                              <div className="font-extrabold text-slate-800 text-sm">
                                {s.name}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-slate-400 flex-wrap">
                                <span className={`px-1.5 py-0.5 rounded font-bold border ${
                                  isSubInactive
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                }`}>
                                  {subName} {isSubInactive ? '(NONAKTIF)' : ''}
                                </span>
                                {s.username && <span>@{s.username}</span>}
                              </div>
                            </td>

                            {/* Class */}
                            <td className="py-4 px-3 text-center font-mono font-bold text-slate-600">
                              {s.studentClass}
                            </td>

                            {/* Status */}
                            <td className="py-4 px-4">
                              {s.status === 'BELUM_MULAI' && (
                                <span className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-full font-mono">
                                  BELUM MULAI
                                </span>
                              )}
                              {s.status === 'SEDANG_MENGERJAKAN' && (
                                <span className="px-2.5 py-1 text-[11px] font-bold bg-blue-100 text-blue-800 rounded-full font-mono inline-flex items-center gap-1 animate-pulse">
                                  <Clock className="w-3 h-3" />
                                  SEDANG KERJA
                                </span>
                              )}
                              {s.status === 'SELESAI' && (
                                <span className="px-2.5 py-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 rounded-full font-mono inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  SELESAI
                                </span>
                              )}
                              {isLocked && (
                                <div className="space-y-1">
                                  <span className="px-2.5 py-1 text-[11px] font-black bg-rose-600 text-white rounded-md font-mono inline-flex items-center gap-1 shadow-xs">
                                    <AlertTriangle className="w-3 h-3" />
                                    TERKUNCI
                                  </span>
                                  <div className="text-[10px] text-rose-700 font-bold leading-tight max-w-[150px] truncate">
                                    {s.lockedReason || 'Keluar layar penuh'}
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Violations */}
                            <td className="py-4 px-3 text-center font-mono">
                              <span
                                className={`font-black ${
                                  (s.violationCount || 0) > 0 ? 'text-rose-600' : 'text-slate-400'
                                }`}
                              >
                                {s.violationCount || 0}x
                              </span>
                            </td>

                            {/* Answers Filled */}
                            <td className="py-4 px-3 text-center font-mono text-slate-600 font-bold">
                              {totalAnswers}
                            </td>

                            {/* Nilai */}
                            <td className="py-4 px-3 text-center font-mono">
                              {permissions.showStudentScores !== false ? (
                                s.status === 'SELESAI' ? (
                                  <span className="font-extrabold text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                                    {typeof s.score === 'number' ? s.score.toFixed(1) : metrics.score.toFixed(1)}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    {totalAnswers > 0 ? `${metrics.score.toFixed(1)} (Proses)` : '-'}
                                  </span>
                                )
                              ) : (
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-mono" title="Nilai disembunyikan oleh Administrator Master">
                                  Tertutup
                                </span>
                              )}
                            </td>

                            {/* Proctor Action Buttons */}
                            <td className="py-4 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {/* 1. Buka Kunci (Unlock) */}
                                {isLocked && permissions.allowUnlock !== false && (
                                  <button
                                    type="button"
                                    id={`btn-proctor-unlock-${s.id}`}
                                    onClick={() => onUnlockStudent(s.id)}
                                    className="px-2.5 py-1.5 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-black text-xs rounded-xl shadow-xs transition flex items-center gap-1 cursor-pointer"
                                    title="Buka kunci siswa ini sekarang agar dapat lanjut ujian"
                                  >
                                    <KeyRound className="w-3.5 h-3.5 text-slate-900" />
                                    <span>Buka Kunci</span>
                                  </button>
                                )}

                                {/* 2. Reset Pelanggaran ke 0 */}
                                {permissions.allowResetViolations !== false && (s.violationCount || 0) > 0 && (
                                  <button
                                    type="button"
                                    id={`btn-proctor-reset-viol-${s.id}`}
                                    onClick={() => {
                                      if (window.confirm(`Reset hitungan pelanggaran siswa "${s.name}" menjadi 0? Jawaban yang tersimpan tidak akan dihapus.`)) {
                                        onResetStudentViolations?.(s.id);
                                      }
                                    }}
                                    className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 transition cursor-pointer"
                                    title="Reset pelanggaran siswa menjadi 0 (buka kunci tanpa hapus jawaban)"
                                  >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* 3. Reset Seluruh Pengerjaan / Jawaban (Ulang Ujian) */}
                                {permissions.allowResetAttempt !== false && (
                                  <button
                                    type="button"
                                    id={`btn-proctor-reset-attempt-${s.id}`}
                                    onClick={() => {
                                      if (window.confirm(`⚠️ PERINGATAN RESET UJIAN:\nApakah Anda yakin ingin MERESET seluruh pengerjaan siswa "${s.name}"?\n\n• Seluruh lembar jawaban akan DIKOSONGKAN.\n• Status kembali ke BELUM MULAI.\n• Siswa dapat mendaftar ulang dan mengerjakan dari awal.`)) {
                                        onResetStudentAttempt?.(s.id);
                                      }
                                    }}
                                    className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg border border-amber-200 transition cursor-pointer"
                                    title="Reset seluruh pengerjaan & jawaban siswa dari awal (Ulang Ujian)"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* 4. Paksa Kumpulkan (Force Submit) */}
                                {permissions.allowForceSubmit !== false && s.status !== 'SELESAI' && s.status !== 'BELUM_MULAI' && (
                                  <button
                                    type="button"
                                    id={`btn-proctor-force-submit-${s.id}`}
                                    onClick={() => {
                                      if (window.confirm(`Kumpulkan paksa lembar ujian untuk siswa "${s.name}"?\nStatus akan langsung menjadi SELESAI dan nilai dihitung secara final.`)) {
                                        onForceSubmitStudent?.(s.id);
                                      }
                                    }}
                                    className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200 transition cursor-pointer"
                                    title="Paksa kumpulkan ujian siswa ini sekarang (Finalisasi Nilai)"
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* 5. Koreksi / Pindahkan Naskah */}
                                {permissions.allowChangeSubject !== false && (
                                  <button
                                    type="button"
                                    id={`btn-proctor-change-sub-${s.id}`}
                                    onClick={() => {
                                      setChangeSubjectStudent(s);
                                      setTargetNewSubjectId(s.subjectId || subjects[0]?.id || 'sub1');
                                    }}
                                    className="p-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg border border-purple-200 transition cursor-pointer"
                                    title="Koreksi / Pindahkan Naskah Ujian Siswa (Jika Siswa Salah Memilih Mapel)"
                                  >
                                    <Shuffle className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {/* 6. Kirim Pesan / Pengumuman 1-on-1 Privat ke Siswa Ini */}
                                {onBroadcastAnnouncement && (
                                  <button
                                    type="button"
                                    id={`btn-proctor-msg-${s.id}`}
                                    onClick={() => {
                                      setBroadcastTargetType('SPECIFIC_STUDENT');
                                      setBroadcastTargetStudentId(s.id);
                                      setBroadcastMessage('');
                                      setShowBroadcastModal(true);
                                    }}
                                    className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200 transition cursor-pointer flex items-center gap-1 font-bold text-xs"
                                    title={`Kirim pengumuman / pesan khusus langsung ke layar HP ${s.name}`}
                                  >
                                    <Megaphone className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Pesan</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* VIEW 2: CHARTS TAB */}
        {activeTab === 'CHARTS' && (
          <AnalyticsCharts
            students={students}
            questions={questions}
            config={config}
          />
        )}

        {/* VIEW 3: ITEM ANALYSIS TAB & EXCEL EXPORT */}
        {activeTab === 'ITEM_ANALYSIS' && (
          <ItemAnalysisTab
            questions={questions}
            students={students}
            config={config}
          />
        )}

      </main>

            {/* Modal Ekspor Nilai Siswa (Multi-Sheet & Terpisah per Mapel) */}
      {showExportGradesModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shadow-2xs">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">
                    Ekspor Nilai Siswa ke Excel (.xlsx)
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Pilih format ekspor nilai: unduh seluruh naskah dalam satu berkas multi-sheet, atau unduh per naskah mata pelajaran
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportGradesModal(false)}
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Kelas Options */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-700 font-mono uppercase tracking-wider">
                Filter Kelas yang Diekspor:
              </div>
              <select
                value={exportClassFilter}
                onChange={(e) => setExportClassFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 shadow-2xs"
              >
                <option value="all">Semua Kelas ({students.length} Siswa)</option>
                {Array.from(new Set(students.map(s => s.studentClass).filter(Boolean))).sort().map(cls => (
                  <option key={cls} value={cls}>
                    Kelas {cls} ({students.filter(s => s.studentClass === cls).length} Siswa)
                  </option>
                ))}
              </select>
            </div>

            {/* OPTION 1: FULL MULTI-SHEET EXCEL */}
            <div className="p-5 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/50 rounded-2xl border-2 border-emerald-300 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-emerald-950">
                      Ekspor Semua Naskah (Multi-Sheet per Mapel)
                    </h4>
                    <span className="text-[10px] bg-emerald-200 text-emerald-900 font-mono font-bold px-2 py-0.5 rounded-full uppercase">
                      Paling Praktis • 1 File Excel Lengkap
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-650 leading-relaxed">
                Menghasilkan <strong>1 file Excel (.xlsx)</strong> yang otomatis membagi dan memisahkan nilai siswa ke dalam <strong>lembar kerja (*sheet*) terpisah untuk tiap mata pelajaran</strong>, ditambah 1 lembar rekapitulasi utama (*Semua_Naskah*).
              </p>
              <button
                type="button"
                onClick={() => handleExportGradesToExcel('all', exportClassFilter)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Unduh Berkas Excel Multi-Sheet ({exportClassFilter === 'all' ? students.length : students.filter(s => s.studentClass === exportClassFilter).length} Siswa)</span>
              </button>
            </div>

            {/* OPTION 2: EXPORT SPECIFIC SINGLE SUBJECT */}
            <div className="space-y-3">
              <h4 className="font-black text-xs text-slate-800 uppercase font-mono tracking-wider">
                Atau Unduh Khusus Naskah Mata Pelajaran Tertentu:
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[220px] overflow-y-auto p-1 scrollbar-thin">
                {subjects.map((sub) => {
                  let subStudents = students.filter(s => (!s.subjectId && sub.id === 'sub1') || s.subjectId === sub.id);
                  if (exportClassFilter !== 'all') {
                    subStudents = subStudents.filter(s => s.studentClass === exportClassFilter);
                  }
                  const hasData = subStudents.length > 0;

                  return (
                    <div
                      key={sub.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition ${
                        hasData ? 'bg-white border-slate-200 hover:border-emerald-300 shadow-2xs' : 'bg-slate-50 border-slate-100 opacity-60'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-extrabold text-slate-800 truncate">
                          {sub.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {subStudents.length} Siswa Mengerjakan
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!hasData}
                        onClick={() => handleExportGradesToExcel(sub.id, exportClassFilter)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 ${
                          hasData
                            ? 'bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-200 cursor-pointer'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-transparent'
                        }`}
                        title={hasData ? `Unduh Excel Nilai ${sub.name}` : 'Belum ada siswa di mapel ini'}
                      >
                        <Download className="w-3 h-3" />
                        <span>Unduh</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowExportGradesModal(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pindahkan / Koreksi Naskah Siswa */}
      {changeSubjectStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Shuffle className="w-5 h-5 text-indigo-600" />
                Koreksi / Pindahkan Naskah Ujian
              </h3>
              <button
                type="button"
                onClick={() => setChangeSubjectStudent(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                <div className="text-slate-500 font-mono">Siswa:</div>
                <div className="font-extrabold text-slate-800 text-sm">
                  {changeSubjectStudent.name} (Kelas {changeSubjectStudent.studentClass} • Absen {changeSubjectStudent.absentNumber})
                </div>
                <div className="text-slate-500 font-mono pt-1">
                  Naskah Saat Ini:{' '}
                  <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    {subjects.find(s => s.id === (changeSubjectStudent.subjectId || 'sub1'))?.name || changeSubjectStudent.subjectId || 'Naskah 1'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase font-mono tracking-wider mb-2">
                  Pindahkan ke Naskah Baru:
                </label>
                <select
                  value={targetNewSubjectId}
                  onChange={(e) => setTargetNewSubjectId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-xs font-bold focus:outline-none transition cursor-pointer"
                >
                  {subjects.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name} ({sub.code || sub.id}) {sub.isActive === false ? ' [NONAKTIF]' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  Fitur ini digunakan jika siswa keliru membuka atau mengerjakan naskah lain. Sistem akan memindahkan sesi siswa ke naskah yang dipilih dan otomatis menghitung ulang nilai siswa sesuai kunci jawaban naskah baru.
                </p>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setChangeSubjectStudent(null)}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!targetNewSubjectId) return;
                    if (onChangeStudentSubject) {
                      onChangeStudentSubject(changeSubjectStudent.id, targetNewSubjectId);
                    }
                    setChangeSubjectStudent(null);
                  }}
                  className="flex-1 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition shadow-xs cursor-pointer"
                >
                  Simpan & Pindahkan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PROCTOR BROADCAST ANNOUNCEMENT MODAL */}
      {showBroadcastModal && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 md:p-8 max-w-xl w-full my-8 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Pengumuman Massal Pengawas ke Siswa
                  </h3>
                  <p className="text-xs text-slate-500">
                    Disiarkan ke seluruh siswa yang sedang mengerjakan di ruang ujian
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBroadcastModal(false)}
                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-indigo-50/70 rounded-2xl border border-indigo-200 flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-indigo-950 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Target: {students.filter(s => s.status === 'SEDANG_MENGERJAKAN').length} Siswa Sedang Mengerjakan
              </span>
              <button
                type="button"
                onClick={handleTestSound}
                className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Volume2 className="w-3 h-3" />
                {isPlayingTestSound ? 'Berbunyi...' : 'Tes Suara Bel'}
              </button>
            </div>

            {config.activeAnnouncement && config.activeAnnouncement.active && (
              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-300 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900 font-mono text-[10px] uppercase">
                    Pengumuman Sedang Aktif:
                  </span>
                  {onClearAnnouncement && (
                    <button
                      type="button"
                      onClick={() => {
                        onClearAnnouncement();
                        alert('Pengumuman telah ditarik.');
                      }}
                      className="px-2 py-0.5 bg-rose-600 text-white rounded font-bold text-[10px] cursor-pointer"
                    >
                      Tarik Pengumuman
                    </button>
                  )}
                </div>
                <p className="text-slate-800 font-medium whitespace-pre-wrap">
                  "{config.activeAnnouncement.message}"
                </p>
              </div>
            )}

            {/* Quick chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase font-mono">Pesan Cepat:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: '⏱️ Sisa 15 Menit', text: 'Waktu ujian tersisa 15 menit lagi. Mohon periksa kembali nomor yang masih ragu-ragu.' },
                  { label: '⏱️ Sisa 5 Menit', text: 'Waktu ujian tersisa 5 menit lagi. Segera selesaikan dan siap kumpulkan jawaban.' },
                  { label: '⚠️ Harap Tenang', text: 'Perhatian: Harap tenang dan fokus mengerjakan di lembar masing-masing.' }
                ].map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setBroadcastMessage(tmpl.text)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition cursor-pointer"
                  >
                    {tmpl.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Isi Pengumuman:
              </label>
              <textarea
                rows={3}
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Tuliskan pengumuman yang ingin disiarkan..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:border-indigo-600 transition"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Pengirim:
              </label>
              <input
                type="text"
                value={broadcastSender}
                onChange={(e) => setBroadcastSender(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowBroadcastModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!broadcastMessage.trim()}
                onClick={handleSendProctorBroadcast}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Megaphone className="w-3.5 h-3.5" />
                <span>Kirim Pengumuman</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Credit */}
      <footer className="mt-12 py-6 text-center text-xs text-slate-400 font-medium select-none border-t border-slate-200 bg-white">
        <div>Panel Pengawas Ruang Ujian</div>
        <div className="mt-0.5 text-slate-500">Created &amp; Developed by <span className="font-bold text-slate-700">@ryhnn.hannn</span></div>
      </footer>
    </div>
  );
}
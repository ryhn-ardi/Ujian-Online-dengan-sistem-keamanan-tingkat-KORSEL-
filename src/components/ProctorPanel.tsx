import React, { useState, useMemo } from 'react';
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
  Info
} from 'lucide-react';
import { Student, Question, ExamConfig, ExamSubject } from '../types';
import { getExamSubjects } from '../utils/sync';
import AnalyticsCharts from './AnalyticsCharts';
import ItemAnalysisTab from './ItemAnalysisTab';

interface ProctorPanelProps {
  students: Student[];
  questions: Question[];
  config: ExamConfig;
  onUnlockStudent: (studentId: string) => void;
  onUnlockAllStudents: () => void;
  onExit: () => void;
}

export default function ProctorPanel({
  students,
  questions,
  config,
  onUnlockStudent,
  onUnlockAllStudents,
  onExit
}: ProctorPanelProps) {
  // Navigation tabs for proctor: MONITOR (default), CHARTS, ITEM_ANALYSIS
  const [activeTab, setActiveTab] = useState<'MONITOR' | 'CHARTS' | 'ITEM_ANALYSIS'>('MONITOR');

  // Filters for monitoring table
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

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
              </nav>

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
                      return (
                        <option key={sub.id} value={sub.id}>
                          {sub.name} ({count})
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
                      <th className="py-3.5 px-4 min-w-[220px]">Nama Siswa & Naskah</th>
                      <th className="py-3.5 px-3 text-center w-20">Kelas</th>
                      <th className="py-3.5 px-4 min-w-[180px]">Status Ujian</th>
                      <th className="py-3.5 px-3 text-center w-28">Pelanggaran</th>
                      <th className="py-3.5 px-3 text-center w-24">Jawaban</th>
                      <th className="py-3.5 px-4 text-right min-w-[160px]">Tindakan Pengawas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-slate-400 font-mono text-xs">
                          Tidak ada siswa yang sesuai kriteria filter saat ini.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((s) => {
                        const isLocked = s.status === 'TERKUNCI';
                        const foundSub = subjects.find(sub => sub.id === (s.subjectId || 'sub1'));
                        const subName = foundSub ? foundSub.name : (s.subjectId || 'Mata Pelajaran 1');
                        const totalAnswers = s.answers ? Object.keys(s.answers).length : 0;

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
                              <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-slate-400">
                                <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded font-bold">
                                  {subName}
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
                                  SEDANG MENGERJAKAN
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
                                  <div className="text-[10px] text-rose-700 font-bold leading-tight">
                                    {s.lockedReason || 'Keluar dari aplikasi ujian'}
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
                              {totalAnswers} terisi
                            </td>

                            {/* Proctor Action */}
                            <td className="py-4 px-4 text-right">
                              {isLocked ? (
                                <button
                                  type="button"
                                  id={`btn-proctor-unlock-${s.id}`}
                                  onClick={() => onUnlockStudent(s.id)}
                                  className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 font-black text-xs rounded-xl shadow-md transition flex items-center gap-1.5 ml-auto cursor-pointer animate-pulse"
                                  title="Buka kunci siswa ini sekarang agar dapat lanjut ujian"
                                >
                                  <KeyRound className="w-4 h-4 text-slate-900" />
                                  <span>Buka Kunci (Unlock)</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-mono">
                                  Sesi Normal
                                </span>
                              )}
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
    </div>
  );
}

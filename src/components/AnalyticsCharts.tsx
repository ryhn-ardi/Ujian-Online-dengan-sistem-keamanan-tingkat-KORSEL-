import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Award, 
  Target, 
  ShieldCheck, 
  ChevronDown, 
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { Student, Question, ExamConfig, ExamSubject } from '../types';
import { getExamSubjects } from '../utils/sync';

interface AnalyticsChartsProps {
  students: Student[];
  questions: Question[];
  config: ExamConfig;
}

export default function AnalyticsCharts({ students, questions, config }: AnalyticsChartsProps) {
  const subjects: ExamSubject[] = useMemo(() => getExamSubjects(config), [config]);
  
  // Filters
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');

  // Extract all unique classes
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => {
      if (s.studentClass && s.studentClass.trim()) {
        set.add(s.studentClass.trim());
      }
    });
    return Array.from(set).sort();
  }, [students]);

  // Filter students based on selection
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
      return true;
    });
  }, [students, selectedSubjectFilter, selectedClassFilter]);

  // Status breakdown
  const statusStats = useMemo(() => {
    const total = filteredStudents.length;
    const selesai = filteredStudents.filter(s => s.status === 'SELESAI').length;
    const sedang = filteredStudents.filter(s => s.status === 'SEDANG_MENGERJAKAN').length;
    const terkunci = filteredStudents.filter(s => s.status === 'TERKUNCI').length;
    const belum = filteredStudents.filter(s => s.status === 'BELUM_MULAI').length;

    return {
      total,
      selesai,
      selesaiPct: total > 0 ? Math.round((selesai / total) * 100) : 0,
      sedang,
      sedangPct: total > 0 ? Math.round((sedang / total) * 100) : 0,
      terkunci,
      terkunciPct: total > 0 ? Math.round((terkunci / total) * 100) : 0,
      belum,
      belumPct: total > 0 ? Math.round((belum / total) * 100) : 0,
    };
  }, [filteredStudents]);

  // Scores stats (only for students who have a score or finished)
  const scoreStats = useMemo(() => {
    const studentsWithScore = filteredStudents.filter(s => typeof s.score === 'number' && !isNaN(s.score));
    if (studentsWithScore.length === 0) {
      return {
        count: 0,
        average: 0,
        highest: 0,
        lowest: 0,
        passingCount: 0,
        passingPct: 0,
        brackets: [
          { label: '0 - 20', desc: 'Sangat Kurang', count: 0, pct: 0, color: '#f43f5e' },
          { label: '21 - 40', desc: 'Kurang', count: 0, pct: 0, color: '#fb923c' },
          { label: '41 - 60', desc: 'Cukup', count: 0, pct: 0, color: '#facc15' },
          { label: '61 - 80', desc: 'Baik', count: 0, pct: 0, color: '#60a5fa' },
          { label: '81 - 100', desc: 'Sangat Baik / Tuntas', count: 0, pct: 0, color: '#10b981' },
        ]
      };
    }

    const scores = studentsWithScore.map(s => s.score as number);
    const sum = scores.reduce((acc, curr) => acc + curr, 0);
    const average = sum / scores.length;
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);
    const KKM = 75; // Standard Indonesian KKM
    const passingCount = scores.filter(sc => sc >= KKM).length;
    const passingPct = Math.round((passingCount / scores.length) * 100);

    const b0_20 = scores.filter(sc => sc <= 20).length;
    const b21_40 = scores.filter(sc => sc > 20 && sc <= 40).length;
    const b41_60 = scores.filter(sc => sc > 40 && sc <= 60).length;
    const b61_80 = scores.filter(sc => sc > 60 && sc <= 80).length;
    const b81_100 = scores.filter(sc => sc > 80).length;

    const brackets = [
      { label: '0 - 20', desc: 'Sangat Kurang', count: b0_20, pct: Math.round((b0_20 / scores.length) * 100), color: '#f43f5e' },
      { label: '21 - 40', desc: 'Kurang', count: b21_40, pct: Math.round((b21_40 / scores.length) * 100), color: '#fb923c' },
      { label: '41 - 60', desc: 'Cukup', count: b41_60, pct: Math.round((b41_60 / scores.length) * 100), color: '#facc15' },
      { label: '61 - 80', desc: 'Baik', count: b61_80, pct: Math.round((b61_80 / scores.length) * 100), color: '#60a5fa' },
      { label: '81 - 100', desc: 'Sangat Baik / Tuntas', count: b81_100, pct: Math.round((b81_100 / scores.length) * 100), color: '#10b981' },
    ];

    return {
      count: studentsWithScore.length,
      average: Number(average.toFixed(1)),
      highest: Number(highest.toFixed(1)),
      lowest: Number(lowest.toFixed(1)),
      passingCount,
      passingPct,
      brackets
    };
  }, [filteredStudents]);

  // Class comparison stats
  const classStats = useMemo(() => {
    const map = new Map<string, { total: number; scores: number[]; finished: number }>();
    
    filteredStudents.forEach(s => {
      const cls = s.studentClass || 'Tanpa Kelas';
      if (!map.has(cls)) {
        map.set(cls, { total: 0, scores: [], finished: 0 });
      }
      const entry = map.get(cls)!;
      entry.total++;
      if (s.status === 'SELESAI') entry.finished++;
      if (typeof s.score === 'number' && !isNaN(s.score)) {
        entry.scores.push(s.score);
      }
    });

    const result = Array.from(map.entries()).map(([cls, data]) => {
      const avg = data.scores.length > 0
        ? Number((data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(1))
        : 0;
      return {
        className: cls,
        totalStudents: data.total,
        finishedCount: data.finished,
        averageScore: avg,
        highestScore: data.scores.length > 0 ? Math.max(...data.scores) : 0,
      };
    });

    return result.sort((a, b) => a.className.localeCompare(b.className));
  }, [filteredStudents]);

  // Security & Integrity stats
  const integrityStats = useMemo(() => {
    const total = filteredStudents.length;
    const zeroViolation = filteredStudents.filter(s => (s.violationCount || 0) === 0).length;
    const minorViolation = filteredStudents.filter(s => (s.violationCount || 0) === 1).length;
    const severeViolation = filteredStudents.filter(s => (s.violationCount || 0) >= 2 || s.status === 'TERKUNCI').length;

    return {
      zeroViolation,
      zeroPct: total > 0 ? Math.round((zeroViolation / total) * 100) : 0,
      minorViolation,
      minorPct: total > 0 ? Math.round((minorViolation / total) * 100) : 0,
      severeViolation,
      severePct: total > 0 ? Math.round((severeViolation / total) * 100) : 0,
    };
  }, [filteredStudents]);

  // Maximum value for bar scaling in histogram
  const maxBracketCount = Math.max(...scoreStats.brackets.map(b => b.count), 1);

  // SVG Donut calculation for Status
  const donutRadius = 65;
  const donutCircumference = 2 * Math.PI * donutRadius;
  
  // Calculate segments for Status Donut
  const donutSegments = useMemo(() => {
    const total = statusStats.total;
    if (total === 0) return [];
    
    const items = [
      { name: 'Selesai', count: statusStats.selesai, color: '#10b981' },
      { name: 'Sedang Mengerjakan', count: statusStats.sedang, color: '#3b82f6' },
      { name: 'Terkunci', count: statusStats.terkunci, color: '#f43f5e' },
      { name: 'Belum Mulai', count: statusStats.belum, color: '#94a3b8' },
    ];

    let accumulatedPct = 0;
    return items.map(item => {
      const pct = (item.count / total) * 100;
      const strokeDasharray = `${(pct / 100) * donutCircumference} ${donutCircumference}`;
      const strokeDashoffset = -((accumulatedPct / 100) * donutCircumference);
      accumulatedPct += pct;
      return {
        ...item,
        pct: Math.round(pct),
        strokeDasharray,
        strokeDashoffset
      };
    });
  }, [statusStats, donutCircumference]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header & Filter Toolbar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-800 tracking-tight">
                Monitoring Visual & Grafik Ujian
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                STATISTIK DISTRIBUSI STATUS, PERFORMA NILAI & INTEGRITAS KELAS REAL-TIME
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Filter Mapel */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-500 font-mono">Naskah:</span>
            <select
              value={selectedSubjectFilter}
              onChange={(e) => setSelectedSubjectFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="all">Semua Naskah ({students.length} siswa)</option>
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
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-500 font-mono">Kelas:</span>
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="all">Semua Kelas ({availableClasses.length})</option>
              {availableClasses.map(cls => {
                const count = students.filter(s => s.studentClass === cls).length;
                return (
                  <option key={cls} value={cls}>
                    Kelas {cls} ({count} siswa)
                  </option>
                );
              })}
            </select>
          </div>

          {(selectedSubjectFilter !== 'all' || selectedClassFilter !== 'all') && (
            <button
              onClick={() => {
                setSelectedSubjectFilter('all');
                setSelectedClassFilter('all');
              }}
              className="px-2.5 py-1.5 text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl font-bold font-mono transition"
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>

      {/* 4 Key Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Partisipasi */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 font-mono uppercase">Total Peserta Terpantau</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">
              {statusStats.total}
            </span>
            <span className="text-xs text-slate-500 font-medium">siswa</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] font-mono">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="text-emerald-700 font-bold">{statusStats.selesai} Selesai</span>
            <span className="text-slate-300">•</span>
            <span className="text-blue-600 font-bold">{statusStats.sedang} Berjalan</span>
            {statusStats.terkunci > 0 && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-rose-600 font-bold">{statusStats.terkunci} Terkunci</span>
              </>
            )}
          </div>
        </div>

        {/* Card 2: Rata-Rata Nilai */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 font-mono uppercase">Rata-Rata Nilai</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-blue-600 tracking-tight font-mono">
              {scoreStats.average > 0 ? scoreStats.average.toFixed(1) : '-'}
            </span>
            <span className="text-xs text-slate-400 font-mono">/ 100</span>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 font-mono flex items-center justify-between">
            <span>Tertinggi: <strong className="text-emerald-600">{scoreStats.highest}</strong></span>
            <span>Terendah: <strong className="text-rose-500">{scoreStats.lowest}</strong></span>
          </div>
        </div>

        {/* Card 3: Ketuntasan Belajar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 font-mono uppercase">Ketuntasan (≥ 75)</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-600 tracking-tight font-mono">
              {scoreStats.passingPct}%
            </span>
            <span className="text-xs text-slate-500 font-medium">({scoreStats.passingCount} siswa)</span>
          </div>
          <div className="mt-3">
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                style={{ width: `${scoreStats.passingPct}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Card 4: Indeks Kedisiplinan / Kejujuran */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 font-mono uppercase">Indeks Kedisiplinan</span>
            <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-teal-600 tracking-tight font-mono">
              {integrityStats.zeroPct}%
            </span>
            <span className="text-xs text-slate-500 font-medium">Bebas Pelanggaran</span>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 font-mono flex items-center justify-between">
            <span>1x Pelanggaran: <strong className="text-amber-600">{integrityStats.minorViolation}</strong></span>
            <span>Terkunci: <strong className="text-rose-600">{statusStats.terkunci}</strong></span>
          </div>
        </div>
      </div>

      {/* Row 2: Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* CHART 1: Distribusi Status Siswa (Donut & Breakdown) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-indigo-600" />
                <h3 className="font-extrabold text-sm text-slate-800 tracking-tight font-mono uppercase">
                  Distribusi Status Siswa
                </h3>
              </div>
              <span className="text-xs font-bold font-mono text-slate-400">
                {statusStats.total} Total
              </span>
            </div>

            {statusStats.total === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs font-mono">
                Belum ada data siswa dalam filter ini.
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-4">
                {/* SVG Donut */}
                <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 160 160">
                    <circle
                      cx="80"
                      cy="80"
                      r={donutRadius}
                      fill="transparent"
                      stroke="#f1f5f9"
                      strokeWidth="20"
                    />
                    {donutSegments.map((seg, idx) => (
                      <circle
                        key={idx}
                        cx="80"
                        cy="80"
                        r={donutRadius}
                        fill="transparent"
                        stroke={seg.color}
                        strokeWidth="20"
                        strokeDasharray={seg.strokeDasharray}
                        strokeDashoffset={seg.strokeDashoffset}
                        className="transition-all duration-700 ease-out"
                      />
                    ))}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-black text-slate-800 font-mono">
                      {statusStats.selesaiPct}%
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-mono font-bold">
                      Selesai
                    </span>
                  </div>
                </div>

                {/* Legend & Details */}
                <div className="space-y-3 w-full max-w-xs">
                  <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-50/60 border border-emerald-100">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-md bg-emerald-500 shrink-0"></span>
                      <span className="text-xs font-bold text-slate-700">Selesai Ujian</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-emerald-700 font-mono">{statusStats.selesai}</span>
                      <span className="text-[10px] text-emerald-600 font-mono ml-1">({statusStats.selesaiPct}%)</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-blue-50/60 border border-blue-100">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-md bg-blue-500 shrink-0"></span>
                      <span className="text-xs font-bold text-slate-700">Sedang Mengerjakan</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-blue-700 font-mono">{statusStats.sedang}</span>
                      <span className="text-[10px] text-blue-600 font-mono ml-1">({statusStats.sedangPct}%)</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-rose-50/60 border border-rose-100">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-md bg-rose-500 shrink-0"></span>
                      <span className="text-xs font-bold text-slate-700">Terkunci / Pelanggaran</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-rose-700 font-mono">{statusStats.terkunci}</span>
                      <span className="text-[10px] text-rose-600 font-mono ml-1">({statusStats.terkunciPct}%)</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-md bg-slate-400 shrink-0"></span>
                      <span className="text-xs font-bold text-slate-600">Belum Mulai</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-slate-700 font-mono">{statusStats.belum}</span>
                      <span className="text-[10px] text-slate-500 font-mono ml-1">({statusStats.belumPct}%)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CHART 2: Histogram Sebaran Nilai Siswa */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
                <h3 className="font-extrabold text-sm text-slate-800 tracking-tight font-mono uppercase">
                  Histogram Sebaran Nilai
                </h3>
              </div>
              <span className="text-xs font-bold font-mono text-slate-400">
                {scoreStats.count} Siswa Bernilai
              </span>
            </div>

            {scoreStats.count === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs font-mono">
                Belum ada siswa yang memiliki nilai ujian.
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {scoreStats.brackets.map((bracket, idx) => {
                  const barWidth = Math.max((bracket.count / maxBracketCount) * 100, bracket.count > 0 ? 6 : 0);
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-black font-mono w-14 text-slate-700">{bracket.label}</span>
                          <span className="text-slate-400 text-[11px]">({bracket.desc})</span>
                        </div>
                        <div className="font-mono font-bold text-slate-700">
                          {bracket.count} siswa <span className="text-slate-400 font-normal">({bracket.pct}%)</span>
                        </div>
                      </div>
                      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${barWidth}%`,
                            backgroundColor: bracket.color
                          }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Standar KKM Sekolah: <strong>75.0</strong></span>
            <span>Ketuntasan Klasikal: <strong className="text-emerald-600">{scoreStats.passingPct}%</strong></span>
          </div>
        </div>

      </div>

      {/* Row 3: Performa Rata-Rata Nilai per Kelas (Bar Chart Horizontal) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            <h3 className="font-extrabold text-sm text-slate-800 tracking-tight font-mono uppercase">
              Perbandingan Rata-Rata Nilai Antar Kelas
            </h3>
          </div>
          <span className="text-xs font-bold font-mono text-slate-400">
            {classStats.length} Kelas
          </span>
        </div>

        {classStats.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-xs font-mono">
            Belum ada data kelas yang terdaftar.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {classStats.map(c => {
              const isPassing = c.averageScore >= 75;
              const barPct = Math.min(Math.max((c.averageScore / 100) * 100, 4), 100);
              return (
                <div key={c.className} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-black text-slate-900 font-mono text-sm">
                        Kelas {c.className}
                      </span>
                      <span className="text-slate-400 text-xs font-mono ml-2">
                        ({c.finishedCount}/{c.totalStudents} Selesai)
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={`font-black font-mono text-base ${isPassing ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {c.averageScore > 0 ? c.averageScore.toFixed(1) : '-'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono block">Rata-rata</span>
                    </div>
                  </div>

                  <div className="w-full h-2.5 bg-slate-200/70 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${isPassing ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${barPct}%` }}
                    ></div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>Nilai Tertinggi: <strong>{c.highestScore}</strong></span>
                    <span>Status: <strong className={isPassing ? 'text-emerald-600' : 'text-amber-600'}>{isPassing ? 'TUNTAS' : 'REMEDIAL'}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

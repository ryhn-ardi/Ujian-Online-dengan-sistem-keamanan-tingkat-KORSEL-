import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Search, 
  Download, 
  Filter, 
  ArrowUpDown, 
  BarChart2, 
  Layers, 
  ChevronRight,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Question, Student, ExamConfig, ExamSubject } from '../types';
import { getExamSubjects } from '../utils/sync';
import { RichExamContent } from './RichExamContent';

interface ItemAnalysisTabProps {
  questions: Question[];
  students: Student[];
  config: ExamConfig;
}

interface QuestionStat {
  questionNumber: number;
  question: Question;
  subjectName: string;
  totalAttempts: number;
  correctCount: number;
  correctPct: number;
  incorrectCount: number;
  incorrectPct: number;
  optionCounts: number[]; // Count for options 0, 1, 2, 3...
  optionPcts: number[];
  difficulty: 'MUDAH' | 'SEDANG' | 'SUKAR';
  difficultyColor: string;
  correctKeyDisplay: string;
}

export default function ItemAnalysisTab({ questions, students, config }: ItemAnalysisTabProps) {
  const subjects: ExamSubject[] = useMemo(() => getExamSubjects(config), [config]);

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | 'MUDAH' | 'SEDANG' | 'SUKAR'>('all');
  const [sortBy, setSortBy] = useState<'number' | 'correct_asc' | 'correct_desc' | 'incorrect_desc'>('number');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Available classes
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => {
      if (s.studentClass && s.studentClass.trim()) {
        set.add(s.studentClass.trim());
      }
    });
    return Array.from(set).sort();
  }, [students]);

  // Filter students based on class selection
  const relevantStudents = useMemo(() => {
    if (selectedClassFilter === 'all') return students;
    return students.filter(s => s.studentClass === selectedClassFilter);
  }, [students, selectedClassFilter]);

  // Compute item statistics for each question
  const itemStats: QuestionStat[] = useMemo(() => {
    // Group questions by subject
    const subjectMap = new Map<string, string>();
    subjects.forEach(sub => subjectMap.set(sub.id, sub.name));

    return questions.map((q, index) => {
      const qSubId = q.subjectId || 'sub1';
      const subjectName = subjectMap.get(qSubId) || (qSubId === 'sub1' ? config.subject1Name || 'Mata Pelajaran 1' : qSubId);

      // Find all students who answered this question
      let totalAttempts = 0;
      let correctCount = 0;
      const numOptions = Math.max(q.options?.length || 4, 4);
      const optionCounts = new Array(numOptions).fill(0);

      // Format correct key string
      let correctKeyDisplay = '';
      if (q.type === 'MR') {
        const indices = q.correctAnswerIndices || [];
        correctKeyDisplay = indices.map(idx => String.fromCharCode(65 + idx)).join(', ') || '-';
      } else {
        const correctIdx = typeof q.correctAnswerIndex === 'number' ? q.correctAnswerIndex : (q.correctAnswerIndices?.[0] ?? 0);
        correctKeyDisplay = String.fromCharCode(65 + correctIdx);
      }

      relevantStudents.forEach(s => {
        // Only evaluate if student was assigned this question or took this subject
        const studentSub = s.subjectId || 'sub1';
        if (studentSub !== qSubId && qSubId !== 'all') {
          // If question is specifically assigned to student via assignedQuestionIds, count it
          if (!s.assignedQuestionIds || !s.assignedQuestionIds.includes(q.id)) {
            return;
          }
        }

        const studentAns = s.answers?.[q.id];
        if (studentAns !== undefined && studentAns !== null) {
          totalAttempts++;

          // Track option choices
          if (Array.isArray(studentAns)) {
            studentAns.forEach(idx => {
              if (typeof idx === 'number' && idx >= 0 && idx < numOptions) {
                optionCounts[idx]++;
              }
            });
          } else if (typeof studentAns === 'number' && studentAns >= 0 && studentAns < numOptions) {
            optionCounts[studentAns]++;
          }

          // Evaluate correctness
          if (q.type === 'MR') {
            const correctSet = q.correctAnswerIndices || [];
            const studentSet = Array.isArray(studentAns) ? studentAns : [studentAns];
            const isCorrect = studentSet.length === correctSet.length &&
              studentSet.every(idx => correctSet.includes(idx));
            if (isCorrect) correctCount++;
          } else {
            const correctIdx = typeof q.correctAnswerIndex === 'number' ? q.correctAnswerIndex : (q.correctAnswerIndices?.[0] ?? 0);
            const isCorrect = Array.isArray(studentAns) ? studentAns.includes(correctIdx) : studentAns === correctIdx;
            if (isCorrect) correctCount++;
          }
        }
      });

      const incorrectCount = totalAttempts - correctCount;
      const correctPct = totalAttempts > 0 ? Number(((correctCount / totalAttempts) * 100).toFixed(1)) : 0;
      const incorrectPct = totalAttempts > 0 ? Number(((incorrectCount / totalAttempts) * 100).toFixed(1)) : 0;

      const optionPcts = optionCounts.map(cnt => totalAttempts > 0 ? Number(((cnt / totalAttempts) * 100).toFixed(1)) : 0);

      // Determine difficulty category
      let difficulty: 'MUDAH' | 'SEDANG' | 'SUKAR' = 'SEDANG';
      let difficultyColor = 'text-blue-700 bg-blue-50 border-blue-200';
      if (totalAttempts === 0) {
        difficulty = 'SEDANG';
        difficultyColor = 'text-slate-500 bg-slate-50 border-slate-200';
      } else if (correctPct >= 70) {
        difficulty = 'MUDAH';
        difficultyColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
      } else if (correctPct < 30) {
        difficulty = 'SUKAR';
        difficultyColor = 'text-rose-700 bg-rose-50 border-rose-200';
      }

      return {
        questionNumber: index + 1,
        question: q,
        subjectName,
        totalAttempts,
        correctCount,
        correctPct,
        incorrectCount,
        incorrectPct,
        optionCounts,
        optionPcts,
        difficulty,
        difficultyColor,
        correctKeyDisplay
      };
    });
  }, [questions, relevantStudents, subjects, config]);

  // Filtered and sorted item statistics
  const filteredItemStats = useMemo(() => {
    return itemStats.filter(item => {
      // Subject filter
      if (selectedSubjectId !== 'all') {
        const qSub = item.question.subjectId || 'sub1';
        if (qSub !== selectedSubjectId) return false;
      }

      // Difficulty filter
      if (difficultyFilter !== 'all' && item.difficulty !== difficultyFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const textMatch = (item.question.questionText || '').toLowerCase().includes(query);
        const numMatch = String(item.questionNumber) === query || `no ${item.questionNumber}` === query;
        const keyMatch = item.correctKeyDisplay.toLowerCase().includes(query);
        if (!textMatch && !numMatch && !keyMatch) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'number') return a.questionNumber - b.questionNumber;
      if (sortBy === 'correct_asc') return a.correctPct - b.correctPct;
      if (sortBy === 'correct_desc') return b.correctPct - a.correctPct;
      if (sortBy === 'incorrect_desc') return b.incorrectPct - a.incorrectPct;
      return 0;
    });
  }, [itemStats, selectedSubjectId, difficultyFilter, searchQuery, sortBy]);

  // Global summary of analysis
  const summary = useMemo(() => {
    const totalQ = filteredItemStats.length;
    const totalAttempts = filteredItemStats.reduce((acc, q) => acc + q.totalAttempts, 0);
    const avgCorrectPct = totalQ > 0
      ? Number((filteredItemStats.reduce((acc, q) => acc + q.correctPct, 0) / totalQ).toFixed(1))
      : 0;

    const mudahCount = filteredItemStats.filter(q => q.difficulty === 'MUDAH').length;
    const sedangCount = filteredItemStats.filter(q => q.difficulty === 'SEDANG').length;
    const sukarCount = filteredItemStats.filter(q => q.difficulty === 'SUKAR').length;

    return {
      totalQ,
      totalAttempts,
      avgCorrectPct,
      mudahCount,
      sedangCount,
      sukarCount
    };
  }, [filteredItemStats]);

  // Handle Export to Excel via XLSX
  const handleExportExcel = () => {
    try {
      setIsExporting(true);

      // Sheet 1: Detail Analisis Butir Soal
      const detailRows = filteredItemStats.map((item, idx) => {
        // Plain text version of question text without HTML tags for Excel
        const cleanQuestionText = item.question.questionText
          ? item.question.questionText.replace(/<[^>]*>?/gm, '').replace(/\$\$/g, '').replace(/\$/g, '').trim()
          : '-';

        return {
          'No Soal': item.questionNumber,
          'Mata Pelajaran': item.subjectName,
          'ID Soal': item.question.id,
          'Teks Pertanyaan': cleanQuestionText,
          'Tipe Soal': item.question.type === 'MR' ? 'Pilihan Jamak (MR)' : 'Pilihan Ganda (PG)',
          'Kunci Jawaban': item.correctKeyDisplay,
          'Jumlah Siswa Mengerjakan': item.totalAttempts,
          'Jumlah Benar': item.correctCount,
          '% Siswa Benar': `${item.correctPct}%`,
          'Jumlah Salah': item.incorrectCount,
          '% Siswa Salah': `${item.incorrectPct}%`,
          'Pilih A (Jumlah)': item.optionCounts[0] || 0,
          'Pilih A (%)': `${item.optionPcts[0] || 0}%`,
          'Pilih B (Jumlah)': item.optionCounts[1] || 0,
          'Pilih B (%)': `${item.optionPcts[1] || 0}%`,
          'Pilih C (Jumlah)': item.optionCounts[2] || 0,
          'Pilih C (%)': `${item.optionPcts[2] || 0}%`,
          'Pilih D (Jumlah)': item.optionCounts[3] || 0,
          'Pilih D (%)': `${item.optionPcts[3] || 0}%`,
          'Tingkat Kesukaran': item.difficulty,
        };
      });

      // Sheet 2: Ringkasan Mata Pelajaran
      const subjectSummaryRows = subjects.map(sub => {
        const subItems = itemStats.filter(i => (i.question.subjectId || 'sub1') === sub.id);
        const subTotalQ = subItems.length;
        const subAvgCorrect = subTotalQ > 0
          ? Number((subItems.reduce((acc, q) => acc + q.correctPct, 0) / subTotalQ).toFixed(1))
          : 0;
        const subMudah = subItems.filter(q => q.difficulty === 'MUDAH').length;
        const subSedang = subItems.filter(q => q.difficulty === 'SEDANG').length;
        const subSukar = subItems.filter(q => q.difficulty === 'SUKAR').length;

        return {
          'ID Mata Pelajaran': sub.id,
          'Nama Mata Pelajaran': sub.name,
          'Kode Mapel': sub.code || '-',
          'Total Soal': subTotalQ,
          'Rata-rata % Siswa Benar': `${subAvgCorrect}%`,
          'Jumlah Soal Mudah (P ≥ 70%)': subMudah,
          'Jumlah Soal Sedang (30% ≤ P < 70%)': subSedang,
          'Jumlah Soal Sukar (P < 30%)': subSukar,
        };
      });

      // Create new Excel Workbook
      const wb = XLSX.utils.book_new();

      // Create Worksheet 1
      const wsDetail = XLSX.utils.json_to_sheet(detailRows);
      // Auto-fit column widths
      wsDetail['!cols'] = [
        { wch: 8 },  // No Soal
        { wch: 22 }, // Mata Pelajaran
        { wch: 15 }, // ID Soal
        { wch: 45 }, // Teks Pertanyaan
        { wch: 18 }, // Tipe Soal
        { wch: 14 }, // Kunci Jawaban
        { wch: 22 }, // Jumlah Siswa Mengerjakan
        { wch: 14 }, // Jumlah Benar
        { wch: 14 }, // % Benar
        { wch: 14 }, // Jumlah Salah
        { wch: 14 }, // % Salah
        { wch: 14 }, // Pilih A
        { wch: 12 }, // Pilih A %
        { wch: 14 }, // Pilih B
        { wch: 12 }, // Pilih B %
        { wch: 14 }, // Pilih C
        { wch: 12 }, // Pilih C %
        { wch: 14 }, // Pilih D
        { wch: 12 }, // Pilih D %
        { wch: 18 }, // Tingkat Kesukaran
      ];
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Analisis Butir Soal');

      // Create Worksheet 2
      const wsSummary = XLSX.utils.json_to_sheet(subjectSummaryRows);
      wsSummary['!cols'] = [
        { wch: 18 },
        { wch: 28 },
        { wch: 14 },
        { wch: 12 },
        { wch: 24 },
        { wch: 26 },
        { wch: 30 },
        { wch: 26 },
      ];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan Mapel');

      // Generate filename with timestamp
      const dateStr = new Date().toISOString().slice(0, 10);
      const subNameClean = selectedSubjectId !== 'all'
        ? (subjects.find(s => s.id === selectedSubjectId)?.name || 'Mapel').replace(/[^a-zA-Z0-9]/g, '_')
        : 'Semua_Mapel';
      const fileName = `Analisis_Butir_Soal_${subNameClean}_${dateStr}.xlsx`;

      // Trigger download
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Failed to export item analysis to Excel:', err);
      alert('Gagal mengekspor data ke Excel: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header and Action Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 tracking-tight">
                Analisis Butir Soal & Daya Pembeda
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                PERSENTASE SISWA BENAR/SALAH TIAP SOAL, DISTRIBUSI OPSI & EKSPOR EXCEL
              </p>
            </div>
          </div>
        </div>

        {/* Export Button */}
        <div>
          <button
            type="button"
            id="btn-export-item-analysis"
            onClick={handleExportExcel}
            disabled={isExporting || filteredItemStats.length === 0}
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4 text-emerald-100" />
            <span>{isExporting ? 'Mengekspor Excel...' : 'Ekspor ke Excel (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Total Soal Terpilih</span>
          <span className="text-2xl font-black text-slate-800 font-mono">{summary.totalQ}</span>
          <span className="text-[10px] text-slate-400 block font-mono mt-0.5">butir soal</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Rata-rata % Benar</span>
          <span className="text-2xl font-black text-blue-600 font-mono">{summary.avgCorrectPct}%</span>
          <span className="text-[10px] text-blue-500 block font-mono mt-0.5">daya serap siswa</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Total Jawaban Masuk</span>
          <span className="text-2xl font-black text-slate-800 font-mono">{summary.totalAttempts}</span>
          <span className="text-[10px] text-slate-400 block font-mono mt-0.5">respon terdata</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-100 bg-emerald-50/30 shadow-xs">
          <span className="text-[10px] font-bold text-emerald-700 font-mono uppercase block">Kategori Mudah (≥70%)</span>
          <span className="text-2xl font-black text-emerald-600 font-mono">{summary.mudahCount}</span>
          <span className="text-[10px] text-emerald-600 block font-mono mt-0.5">soal</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-100 bg-blue-50/30 shadow-xs">
          <span className="text-[10px] font-bold text-blue-700 font-mono uppercase block">Kategori Sedang (30-70%)</span>
          <span className="text-2xl font-black text-blue-600 font-mono">{summary.sedangCount}</span>
          <span className="text-[10px] text-blue-600 block font-mono mt-0.5">soal</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-100 bg-rose-50/30 shadow-xs">
          <span className="text-[10px] font-bold text-rose-700 font-mono uppercase block">Kategori Sukar (&lt;30%)</span>
          <span className="text-2xl font-black text-rose-600 font-mono">{summary.sukarCount}</span>
          <span className="text-[10px] text-rose-600 block font-mono mt-0.5">soal</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Filter Mata Pelajaran */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs">
            <span className="font-bold text-slate-500 font-mono">Mapel:</span>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="all">Semua Mata Pelajaran ({questions.length} Soal)</option>
              {subjects.map(sub => {
                const count = questions.filter(q => (q.subjectId || 'sub1') === sub.id).length;
                return (
                  <option key={sub.id} value={sub.id}>
                    {sub.name} ({count} Soal)
                  </option>
                );
              })}
            </select>
          </div>

          {/* Filter Kelas Siswa */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs">
            <span className="font-bold text-slate-500 font-mono">Filter Siswa:</span>
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="all">Semua Siswa Terdata ({students.length})</option>
              {availableClasses.map(cls => (
                <option key={cls} value={cls}>
                  Siswa Kelas {cls}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Kesukaran */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs">
            <span className="font-bold text-slate-500 font-mono">Tingkat Kesukaran:</span>
            <select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value as any)}
              className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="all">Semua Tingkat</option>
              <option value="MUDAH">Mudah (≥ 70% Benar)</option>
              <option value="SEDANG">Sedang (30% - 69% Benar)</option>
              <option value="SUKAR">Sukar (&lt; 30% Benar)</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs">
            <span className="font-bold text-slate-500 font-mono">Urutan:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="number">Nomor Soal (1 - {questions.length})</option>
              <option value="correct_desc">% Benar Tertinggi (Paling Dikuasai)</option>
              <option value="correct_asc">% Benar Terendah (Paling Sulit)</option>
              <option value="incorrect_desc">% Salah Tertinggi (Evaluasi Materi)</option>
            </select>
          </div>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari teks soal / nomor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Item Analysis Detailed Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black font-mono text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4 w-14 text-center">No</th>
                <th className="py-3.5 px-4 min-w-[280px]">Naskah Soal & Teks Pertanyaan</th>
                <th className="py-3.5 px-3 text-center w-20">Kunci</th>
                <th className="py-3.5 px-3 text-center w-24">Dijawab</th>
                <th className="py-3.5 px-4 min-w-[200px]">Persentase Benar / Salah</th>
                <th className="py-3.5 px-4 min-w-[220px]">Distribusi Pilihan Jawaban (A, B, C, D)</th>
                <th className="py-3.5 px-3 text-center w-28">Kesukaran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItemStats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 font-mono text-xs">
                    Tidak ada soal yang cocok dengan filter atau kata kunci pencarian.
                  </td>
                </tr>
              ) : (
                filteredItemStats.map((item) => {
                  return (
                    <tr key={item.question.id} className="hover:bg-slate-50/70 transition">
                      {/* No Soal */}
                      <td className="py-4 px-4 text-center font-mono font-black text-slate-600">
                        #{item.questionNumber}
                      </td>

                      {/* Question Preview & Subject */}
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 font-mono">
                            {item.subjectName}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono">
                            {item.question.type === 'MR' ? 'Pilihan Jamak (MR)' : 'Pilihan Ganda'}
                          </span>
                        </div>
                        <div className="text-slate-800 text-xs line-clamp-3 leading-relaxed font-sans">
                          <RichExamContent text={item.question.questionText || '(Tidak ada teks)'} />
                        </div>
                      </td>

                      {/* Kunci Jawaban */}
                      <td className="py-4 px-3 text-center">
                        <span className="inline-block px-2.5 py-1 bg-emerald-100 text-emerald-800 font-mono font-black rounded-lg text-xs border border-emerald-200">
                          {item.correctKeyDisplay}
                        </span>
                      </td>

                      {/* Total Attempts */}
                      <td className="py-4 px-3 text-center font-mono font-bold text-slate-600">
                        <div>{item.totalAttempts}</div>
                        <span className="text-[10px] text-slate-400 font-normal">siswa</span>
                      </td>

                      {/* Correct vs Incorrect Bar */}
                      <td className="py-4 px-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between font-mono text-[11px]">
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              Benar: {item.correctPct}% ({item.correctCount})
                            </span>
                            <span className="text-rose-600 font-bold flex items-center gap-1">
                              <XCircle className="w-3 h-3 text-rose-500" />
                              Salah: {item.incorrectPct}% ({item.incorrectCount})
                            </span>
                          </div>

                          <div className="w-full h-2.5 bg-rose-100 rounded-full overflow-hidden flex">
                            <div
                              className="h-full bg-emerald-500 transition-all duration-500"
                              style={{ width: `${item.correctPct}%` }}
                              title={`Benar: ${item.correctPct}%`}
                            ></div>
                            <div
                              className="h-full bg-rose-500 transition-all duration-500"
                              style={{ width: `${item.incorrectPct}%` }}
                              title={`Salah: ${item.incorrectPct}%`}
                            ></div>
                          </div>
                        </div>
                      </td>

                      {/* Distractor Breakdown (A, B, C, D) */}
                      <td className="py-4 px-4 font-mono">
                        <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                          {['A', 'B', 'C', 'D'].map((letter, optIdx) => {
                            const isKey = item.correctKeyDisplay.includes(letter);
                            const count = item.optionCounts[optIdx] || 0;
                            const pct = item.optionPcts[optIdx] || 0;
                            return (
                              <div
                                key={letter}
                                className={`p-1 rounded-md border ${
                                  isKey
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-black'
                                    : count > 0
                                    ? 'bg-slate-50 border-slate-200 text-slate-700'
                                    : 'bg-white border-slate-100 text-slate-300'
                                }`}
                                title={`Opsi ${letter}: ${count} siswa (${pct}%)`}
                              >
                                <div className="text-[9px] text-slate-400 font-semibold">{letter}</div>
                                <div className="font-bold">{pct}%</div>
                                <div className="text-[8px] text-slate-400 font-normal">{count}</div>
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      {/* Tingkat Kesukaran Badge */}
                      <td className="py-4 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black font-mono border ${item.difficultyColor}`}
                        >
                          {item.difficulty}
                        </span>
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
  );
}

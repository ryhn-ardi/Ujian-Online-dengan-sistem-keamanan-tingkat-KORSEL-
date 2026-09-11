import React, { useState } from 'react';
import { Users, FileSpreadsheet, RefreshCw, KeyRound, Edit, Trash2, Plus, Save, BookOpen, Clock, X, ChevronRight, Check, AlertTriangle, ShieldCheck, Search, Eye, EyeOff, Layers, Settings2, Sparkles, Ticket } from 'lucide-react';
import { Student, Question, ExamConfig, ExamSubject } from '../types';
import { getExamSubjects, saveSingleStudent } from '../utils/sync';

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
  onUpdateStudents: (updated: Student[]) => void;
  onUpdateQuestions: (updated: Question[]) => void;
  onUpdateConfig: (updated: ExamConfig) => void;
  onExit: () => void;
}

export default function AdminPanel({
  students,
  questions,
  config,
  onUpdateStudents,
  onUpdateQuestions,
  onUpdateConfig,
  onExit
}: AdminPanelProps) {
  // Tabs for the Admin Control Panel
  const [activeTab, setActiveTab] = useState<'MONITOR' | 'QUESTIONS' | 'CONFIG'>('MONITOR');

  // Search filter query
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [minScoreFilter, setMinScoreFilter] = useState<string>('');
  const [maxScoreFilter, setMaxScoreFilter] = useState<string>('');

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

  // Question editor state
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isCreatingQuestion, setIsCreatingQuestion] = useState(false);
  const [qText, setQText] = useState('');
  const [qOptions, setQOptions] = useState<string[]>(['', '', '', '']);
  const [qCorrect, setQCorrect] = useState<number>(0);
  const [qSubjectId, setQSubjectId] = useState<string>('sub1');
  const [qScore, setQScore] = useState<number>(20);

  // States for CSV/Excel Question Import
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [showImportArea, setShowImportArea] = useState(false);
  const [importSubjectTarget, setImportSubjectTarget] = useState<string>('current');

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
          isActive: editSubjectIsActive
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
    const displayScore = s.status === 'SELESAI' ? metrics.score : s.score;

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

  const isFilterActive = studentSearch.trim() !== '' || 
    selectedClassFilter !== 'all' || 
    selectedSubjectFilter !== 'all' ||
    selectedStatusFilter !== 'all' ||
    minScoreFilter.trim() !== '' ||
    maxScoreFilter.trim() !== '';

  const handleDownloadTemplate = (subId?: string) => {
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportText(content || '');
    };
    reader.readAsText(file, 'UTF-8');
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

        importedQs.push({
          id: `q_imported_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 4)}`,
          questionText: soalText,
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
        return {
          ...s,
          status: 'SEDANG_MENGERJAKAN' as const,
          violationCount: 0, // Reset violation count on unlock!
          lockedReason: undefined,
          answers: s.answers || {} // Preserve answers already typed
        };
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
      const correctCount = s.status === 'SELESAI' ? metrics.correctAnswersCount : (s.correctAnswersCount !== undefined ? s.correctAnswersCount : '-');
      const totalCount = metrics.totalQuestions;
      const finalScore = s.status === 'SELESAI' ? metrics.score.toFixed(1) : (s.score !== undefined ? s.score.toFixed(1) : '-');
      
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

    // We use a semicolon ';' as separator because it is highly compatible with Indonesian localized computers.
    // By adding the 'sep=;' line, Microsoft Excel is hard-forced to recognize the semicolon layout automatically!
    const separator = ';';
    const csvContent = '\uFEFF' + `sep=${separator}\n` + [
      headers.map(escapeCsvCell).join(separator), 
      ...rows.map(row => row.map(escapeCsvCell).join(separator))
    ].join('\n');
    
    // Download chemical reaction
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `rekap_nilai_proktor_${config.examTitle.replace(/\s+/g, '_').toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- ACTIONS: BANK SOAL CRUD ---
  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qText.trim()) return alert('Teks soal wajib terisi!');
    if (qOptions.some(opt => !opt.trim())) return alert('Semua pilihan jawaban wajib diisi!');

    if (isCreatingQuestion) {
      const newQ: Question = {
        id: `q_generated_${Date.now()}`,
        questionText: qText.trim(),
        options: qOptions.map(o => o.trim()),
        correctAnswerIndex: qCorrect,
        correctAnswerIndices: [qCorrect],
        type: 'MC',
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
            options: qOptions.map(o => o.trim()),
            correctAnswerIndex: qCorrect,
            correctAnswerIndices: q.correctAnswerIndices || [qCorrect],
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
    setQOptions(['', '', '', '']);
    setQCorrect(0);
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

          <div className="flex items-center gap-2">
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
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto flex">
          <button
            onClick={() => setActiveTab('MONITOR')}
            className={`px-6 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition ${
              activeTab === 'MONITOR'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            Monitoring Siswa ({students.length})
          </button>
          <button
            onClick={() => setActiveTab('QUESTIONS')}
            className={`px-6 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition ${
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
            className={`px-6 py-4 font-bold text-sm border-b-2 flex items-center gap-2 transition ${
              activeTab === 'CONFIG'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            Konfigurasi Ujian
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
                <div>
                  <h3 className="font-bold text-slate-800">Daftar Kehadiran & Nilai Siswa</h3>
                  <span className="text-xs text-slate-400 italic">Nilai otomatis dikalkulasi real-time saat siswa klik kumpul atau waktu habis</span>
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
                        className="w-24 px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-indigo-500 font-mono text-center"
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
                        className="w-24 px-2 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-indigo-500 font-mono text-center"
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
              ) : filteredStudents.length === 0 ? (
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
                      {filteredStudents.map((s) => {
                        const metrics = getStudentMetrics(s, questions);
                        const displayScore = s.status === 'SELESAI' ? metrics.score : s.score;
                        const scoreBg = displayScore !== undefined && displayScore >= 70 ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-800';
                        
                        return (
                          <tr key={s.id} className="hover:bg-slate-50/50 transition duration-150">
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
                                <div className="space-y-1">
                                  <span className="px-2.5 py-1 text-xs font-bold bg-rose-600 text-white rounded-md font-mono inline-flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    TERKUNCI
                                  </span>
                                  <div className="text-[10px] text-red-650 font-bold max-w-[150px] leading-tight">
                                    {s.lockedReason || 'Ganti screen tab'}
                                  </div>
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
                                <span className={`px-2.5 py-1 text-xs font-extrabold rounded-md ${scoreBg} font-mono`}>
                                  {displayScore.toFixed(1)} / 100
                                </span>
                              ) : (
                                <span className="text-slate-300 font-mono">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right space-x-1.5 whitespace-nowrap">
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
                  onClick={handleDownloadTemplate}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
                  title="Unduh file template Excel CSV untuk diisi"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Template Excel
                </button>
                <button
                  id="btn-toggle-import-panel"
                  onClick={() => {
                    setShowImportArea(!showImportArea);
                    setImportError('');
                    setImportSuccess('');
                  }}
                  className={`px-3.5 py-2 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 ${
                    showImportArea
                      ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-850 border border-emerald-200'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {showImportArea ? 'Tutup Import' : 'Import Excel / CSV'}
                </button>
                <button
                  id="btn-add-question-trigger"
                  onClick={() => {
                    setIsCreatingQuestion(true);
                    setEditingQuestion(null);
                    setQText('');
                    setQOptions(['', '', '', '']);
                    setQCorrect(0);
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
                  </div>
                </div>

                {/* Subject Actions Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditSubjectName(effectiveActiveSubject.name);
                      setEditSubjectCode(effectiveActiveSubject.code || '');
                      setEditSubjectIsActive(effectiveActiveSubject.isActive !== false);
                      setEditingSubjectModal(effectiveActiveSubject);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Edit Mapel
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
            </div>

            {/* Collapsible Excel / CSV Import Zone */}
            {showImportArea && (
              <div className="bg-white rounded-2xl border-2 border-emerald-500 p-6 shadow-md space-y-4 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-extrabold text-slate-800 flex items-center gap-2 text-base">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                    Panel Import Soal dari Excel (.csv)
                  </h4>
                  <button
                    onClick={() => setShowImportArea(false)}
                    className="p-1 hover:bg-slate-100 rounded-full transition text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-2.5 text-xs text-slate-600">
                  <p className="font-bold text-emerald-950">Aturan Penulisan Template Excel / CSV:</p>
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>Gunakan file template Excel berformat CSV yang didownload di atas agar urutan & pemisah kolom otomatis rapi di Excel.</li>
                    <li>Satu baris setelah baris header mewakili 1 butir soal.</li>
                    <li>Kolomnya terdiri atas 8 kolom:
                      <ul className="list-disc list-inside pl-4 my-1 font-mono text-[11px] text-emerald-900 font-semibold space-y-0.5">
                        <li>Kolom 1: Jenis soal (<code className="bg-emerald-100/80 px-1 rounded">MC</code> atau <code className="bg-emerald-100/80 px-1 rounded">MR</code>)</li>
                        <li>Kolom 2: Teks Pertanyaan</li>
                        <li>Kolom 3-6: Opsi A, B, C, dan D</li>
                        <li>Kolom 7: Bobot Nilai (misal: 10 atau 20)</li>
                        <li>Kolom 8 (Opsional): Kode/Nama Mapel sasaran</li>
                      </ul>
                    </li>
                    <li>Tanda bintang <code className="font-mono text-red-600 font-bold">*</code> di depan opsi menandai kunci jawaban benar (cth: <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-mono">*Opsi Benar</code>).</li>
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
                  <div className="border-2 border-dashed border-slate-200 hover:border-emerald-500 rounded-xl p-5 text-center transition flex flex-col justify-center items-center bg-slate-50/50">
                    <FileSpreadsheet className="w-10 h-10 text-slate-400 mb-2" />
                    <span className="text-xs font-semibold text-slate-700 block mb-1">Pilih File CSV Hasil Ekspor Excel</span>
                    <span className="text-[10px] text-slate-400 block mb-4">Pastikan encoding UTF-8</span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="csv-file-picker"
                    />
                    <label
                      htmlFor="csv-file-picker"
                      className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-800 text-slate-700 font-bold text-xs rounded-lg cursor-pointer transition inline-block"
                    >
                      Pilih Berkas (.csv)
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
                    <label className="block text-xs font-semibold text-slate-500 uppercase font-mono tracking-wider mb-2">Teks Soal / Pertanyaan</label>
                    <textarea
                      required
                      placeholder="Tuliskan pertanyaan ujian di sini..."
                      value={qText}
                      onChange={(e) => setQText(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 focus:outline-none transition"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-500 uppercase font-mono tracking-wider">Pilihlah Opsi Jawaban Ganda beserta Kunci</label>
                    
                    {qOptions.map((opt, oIdx) => {
                      const letter = String.fromCharCode(65 + oIdx);
                      const isCorrect = qCorrect === oIdx;

                      return (
                        <div key={oIdx} className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setQCorrect(oIdx)}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold font-mono text-sm border shrink-0 transition-all ${
                              isCorrect
                                ? 'bg-emerald-500 border-emerald-600 text-white'
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-400 hover:text-slate-600'
                            }`}
                            title={isCorrect ? 'Ini adalah kunci jawaban' : 'Jadikan kunci jawaban'}
                          >
                            {isCorrect ? <Check className="w-4 h-4" /> : letter}
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
                            <span className="text-[10px] bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded">
                              Bobot: {q.score ?? 10} Poin
                            </span>
                          </div>
                          <h4 className="font-bold text-slate-800 text-base mt-2 leading-relaxed">{q.questionText}</h4>
                        </div>
                        <div className="flex gap-1">
                          <button
                            id={`btn-edit-q-${q.id}`}
                            onClick={() => {
                              setEditingQuestion(q);
                              setIsCreatingQuestion(false);
                              setQText(q.questionText);
                              setQOptions(q.options);
                              setQCorrect(q.correctAnswerIndex);
                              setQSubjectId(q.subjectId || effectiveActiveSubject.id);
                              setQScore(q.score !== undefined ? q.score : 20);
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
                          const isCorrect = q.correctAnswerIndex === oIdx;

                          return (
                            <div
                              key={oIdx}
                              className={`p-2.5 rounded-lg flex items-center gap-2 border ${
                                isCorrect
                                  ? 'bg-emerald-50 border-emerald-250 text-emerald-800 font-semibold'
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
                              <span className="truncate">{opt}</span>
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
    </main>

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

      {/* Modal Edit Informasi Mata Pelajaran */}
      {editingSubjectModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Edit className="w-5 h-5 text-indigo-600" />
                Edit Informasi Mata Pelajaran
              </h3>
              <button
                onClick={() => setEditingSubjectModal(null)}
                className="p-1 hover:bg-slate-100 rounded-full transition text-slate-400"
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

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingSubjectModal(null)}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 border border-slate-200 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition shadow-sm"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

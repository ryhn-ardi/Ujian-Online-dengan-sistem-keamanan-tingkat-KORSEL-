import React, { useState, useMemo } from 'react';
import { Users, FileSpreadsheet, Download, Upload, Plus, Trash2, Edit, Search, KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, X, ArrowLeft, ArrowRight, ShieldCheck, Check, RefreshCw, Copy } from 'lucide-react';
import * as XLSX from 'xlsx';
import { StudentUser, Student } from '../types';

interface StudentAccountsTabProps {
  studentUsers: StudentUser[];
  students: Student[];
  onUpdateStudentUsers: (updated: StudentUser[]) => void;
}

export default function StudentAccountsTab({
  studentUsers,
  students,
  onUpdateStudentUsers
}: StudentAccountsTabProps) {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('123');
  const [newName, setNewName] = useState('');
  const [newClass, setNewClass] = useState('8A');
  const [newAbsen, setNewAbsen] = useState('');
  const [addError, setAddError] = useState('');

  const [editingUser, setEditingUser] = useState<StudentUser | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editName, setEditName] = useState('');
  const [editClass, setEditClass] = useState('');
  const [editAbsen, setEditAbsen] = useState('');

  // Import Modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'REPLACE' | 'APPEND'>('REPLACE');
  const [importPreview, setImportPreview] = useState<StudentUser[] | null>(null);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  // Extract distinct classes for dropdown
  const classList = useMemo(() => {
    const set = new Set<string>();
    studentUsers.forEach(u => {
      if (u.studentClass) set.add(u.studentClass.toUpperCase());
    });
    return Array.from(set).sort();
  }, [studentUsers]);

  // Match live exam status from students collection
  const studentSessionMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach(s => {
      if (s.username) {
        map.set(s.username.toLowerCase(), s);
      }
      map.set(s.name.trim().toLowerCase(), s);
    });
    return map;
  }, [students]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    return studentUsers.filter(u => {
      const matchSearch =
        !searchQuery ||
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.studentClass && u.studentClass.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (u.absentNumber && u.absentNumber.includes(searchQuery));

      const matchClass = classFilter === 'ALL' || (u.studentClass && u.studentClass.toUpperCase() === classFilter);

      return matchSearch && matchClass;
    });
  }, [studentUsers, searchQuery, classFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / itemsPerPage));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage, itemsPerPage]);

  // 1. Download Template Excel (.xlsx)
  const handleDownloadTemplateXlsx = () => {
    const sampleRows = [
      { username: 'siswa001', password: '123', nama: 'Ahmad Fauzan', kelas: '8A', no_absen: '01' },
      { username: 'siswa002', password: '123', nama: 'Bella Safitri', kelas: '8A', no_absen: '02' },
      { username: 'siswa003', password: '123', nama: 'Dimas Pratama', kelas: '8B', no_absen: '01' },
      { username: 'siswa004', password: '123', nama: 'Eka Rahmawati', kelas: '8B', no_absen: '02' },
      { username: 'siswa005', password: '123', nama: 'Fikri Ramadhan', kelas: '8C', no_absen: '01' },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 28 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Database_Siswa');
    XLSX.writeFile(wb, 'template_database_siswa_1200_pengguna.xlsx');
  };

  // 2. Download Template CSV (.csv)
  const handleDownloadTemplateCsv = () => {
    const csvContent =
      "username,password,nama,kelas,no_absen\n" +
      "siswa001,123,Ahmad Fauzan,8A,01\n" +
      "siswa002,123,Bella Safitri,8A,02\n" +
      "siswa003,123,Dimas Pratama,8B,01\n" +
      "siswa004,123,Eka Rahmawati,8B,02\n" +
      "siswa005,123,Fikri Ramadhan,8C,01\n";

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_database_siswa.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // 3. Export all registered student users to Excel (.xlsx)
  const handleExportAllToExcel = () => {
    if (studentUsers.length === 0) {
      alert('Belum ada data siswa untuk diekspor!');
      return;
    }

    const rows = studentUsers.map((u, idx) => {
      const liveSession = studentSessionMap.get(u.username.toLowerCase()) || studentSessionMap.get(u.name.trim().toLowerCase());
      const statusText = liveSession
        ? liveSession.status === 'SELESAI'
          ? 'SELESAI'
          : liveSession.status === 'TERKUNCI'
          ? 'TERKUNCI'
          : liveSession.status === 'SEDANG_MENGERJAKAN'
          ? 'SEDANG MENGERJAKAN'
          : 'BELUM MULAI'
        : 'BELUM MULAI';

      const scoreText = liveSession?.score !== undefined ? liveSession.score.toFixed(1) : '-';

      return {
        No: idx + 1,
        Username: u.username,
        Password: u.password,
        Nama_Lengkap: u.name,
        Kelas: u.studentClass,
        No_Absen: u.absentNumber || '-',
        Status_Ujian: statusText,
        Nilai: scoreText
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data_Siswa');
    XLSX.writeFile(wb, `database_siswa_${studentUsers.length}_pengguna.xlsx`);
  };

  // 4. Parse uploaded Excel or CSV file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setImportError('');
    setImportSuccess('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rawJson.length === 0) {
          setImportError('Berkas kosong atau tidak ada data baris.');
          setIsProcessingFile(false);
          return;
        }

        const parsed: StudentUser[] = [];
        const seenUsernames = new Set<string>();

        rawJson.forEach((row, idx) => {
          const getVal = (possibleKeys: string[]) => {
            for (const key of Object.keys(row)) {
              const clean = key.trim().toLowerCase().replace(/[\s_\-]/g, '');
              if (possibleKeys.includes(clean)) return String(row[key]).trim();
            }
            return '';
          };

          const username = getVal(['username', 'user', 'nisn', 'nis', 'id', 'akun']);
          const password = getVal(['password', 'pass', 'sandi', 'katasandi', 'pwd']);
          const nama = getVal(['nama', 'namasiswa', 'namalengkap', 'fullname', 'name']);
          const kelas = getVal(['kelas', 'class', 'tingkat', 'rombel']);
          const noAbsen = getVal(['noabsen', 'absen', 'nomorabsen', 'no']);

          if (username && nama) {
            const normalizedUname = username.trim().toLowerCase();
            if (!seenUsernames.has(normalizedUname)) {
              seenUsernames.add(normalizedUname);
              parsed.push({
                id: `usr_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 4)}`,
                username: username.trim(),
                password: password.trim() || '123',
                name: nama.trim(),
                studentClass: kelas ? kelas.trim().toUpperCase() : 'UMUM',
                absentNumber: noAbsen.trim() || String(idx + 1),
                createdAt: new Date().toISOString()
              });
            }
          }
        });

        if (parsed.length === 0) {
          setImportError('Gagal mengenali data! Pastikan berkas memiliki judul kolom: "username", "password", "nama", "kelas", "no_absen".');
          setIsProcessingFile(false);
          return;
        }

        setImportPreview(parsed);
        setImportSuccess(`Berhasil membaca ${parsed.length} akun siswa dari file!`);
      } catch (err: any) {
        setImportError('Gagal memproses berkas: ' + (err?.message || 'Format tidak didukung.'));
      } finally {
        setIsProcessingFile(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // 5. Confirm Save Import
  const handleConfirmImport = () => {
    if (!importPreview || importPreview.length === 0) return;

    if (importMode === 'REPLACE') {
      onUpdateStudentUsers(importPreview);
    } else {
      // Append / Merge by username
      const map = new Map<string, StudentUser>();
      studentUsers.forEach(u => map.set(u.username.toLowerCase(), u));
      importPreview.forEach(u => map.set(u.username.toLowerCase(), u));
      onUpdateStudentUsers(Array.from(map.values()));
    }

    setShowImportModal(false);
    setImportPreview(null);
    alert(`Sukses mengimpor database siswa! Total saat ini: ${importMode === 'REPLACE' ? importPreview.length : studentUsers.length + importPreview.length} akun.`);
  };

  // 6. Add Single Student
  const handleAddSingleStudent = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    if (!newUsername.trim()) return setAddError('Username wajib diisi.');
    if (!newPassword.trim()) return setAddError('Password wajib diisi.');
    if (!newName.trim()) return setAddError('Nama siswa wajib diisi.');
    if (!newClass.trim()) return setAddError('Kelas wajib diisi.');

    const cleanUsername = newUsername.trim().toLowerCase();
    if (studentUsers.some(u => u.username.toLowerCase() === cleanUsername)) {
      return setAddError(`Username "${newUsername.trim()}" sudah terdaftar.`);
    }

    const newUser: StudentUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      username: newUsername.trim(),
      password: newPassword.trim(),
      name: newName.trim(),
      studentClass: newClass.trim().toUpperCase(),
      absentNumber: newAbsen.trim() || '01',
      createdAt: new Date().toISOString()
    };

    onUpdateStudentUsers([...studentUsers, newUser]);
    setShowAddModal(false);
    setNewUsername('');
    setNewPassword('123');
    setNewName('');
    setNewAbsen('');
  };

  // 7. Save Edit Student
  const handleSaveEditUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const updated = studentUsers.map(u => {
      if (u.id === editingUser.id) {
        return {
          ...u,
          username: editUsername.trim() || u.username,
          password: editPassword.trim() || u.password,
          name: editName.trim() || u.name,
          studentClass: editClass.trim().toUpperCase() || u.studentClass,
          absentNumber: editAbsen.trim() || u.absentNumber
        };
      }
      return u;
    });

    onUpdateStudentUsers(updated);
    setEditingUser(null);
  };

  // 8. Delete Single Student
  const handleDeleteUser = (userId: string, name: string) => {
    if (window.confirm(`Hapus akun siswa "${name}"? Siswa ini tidak akan bisa login lagi.`)) {
      onUpdateStudentUsers(studentUsers.filter(u => u.id !== userId));
    }
  };

  // 9. Clear All Users
  const handleClearAllUsers = () => {
    const confirmClear = window.confirm(
      `PERINGATAN: Apakah Anda yakin ingin MENGOSONGKAN SELURUH DATABASE SISWA (${studentUsers.length} Akun)?\n\nSeluruh akun siswa akan dihapus.`
    );
    if (confirmClear) {
      onUpdateStudentUsers([]);
      alert('Seluruh database akun siswa berhasil dikosongkan!');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <KeyRound className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-slate-800 text-lg">
                Database Akun Login Siswa (Kapasitas 1200+ Peserta)
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                MANAJEMEN KREDENSIAL PESERTA • UPLOAD EXCEL / CSV • AUTENTIKASI SISWA
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            id="btn-download-users-template-xlsx"
            onClick={handleDownloadTemplateXlsx}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="Download Template Excel untuk mengisi data 1200 siswa"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Template Excel (.xlsx)
          </button>

          <button
            type="button"
            id="btn-download-users-template-csv"
            onClick={handleDownloadTemplateCsv}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
            title="Download Template CSV"
          >
            <Download className="w-3.5 h-3.5" />
            Versi CSV
          </button>

          <button
            type="button"
            id="btn-open-import-users-modal"
            onClick={() => {
              setShowImportModal(true);
              setImportPreview(null);
              setImportError('');
              setImportSuccess('');
            }}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Import File Excel / CSV
          </button>

          <button
            type="button"
            id="btn-add-single-user-modal"
            onClick={() => {
              setShowAddModal(true);
              setAddError('');
            }}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl transition flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Manual
          </button>

          <button
            type="button"
            id="btn-export-all-users-xlsx"
            onClick={handleExportAllToExcel}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1 cursor-pointer"
            title="Ekspor seluruh database ke Excel"
          >
            <Download className="w-3.5 h-3.5" />
            Ekspor ke Excel
          </button>

          {studentUsers.length > 0 && (
            <button
              type="button"
              id="btn-clear-all-users"
              onClick={handleClearAllUsers}
              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition flex items-center gap-1 cursor-pointer"
              title="Kosongkan seluruh database akun"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              Kosongkan Database
            </button>
          )}
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Total Akun Terdaftar</span>
          <div className="text-2xl font-black text-indigo-700 font-mono mt-1">
            {studentUsers.length.toLocaleString('id-ID')} Siswa
          </div>
          <span className="text-[10px] text-slate-400">Siap login menggunakan username & password</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Total Rombel / Kelas</span>
          <div className="text-2xl font-black text-slate-800 font-mono mt-1">
            {classList.length} Kelas
          </div>
          <span className="text-[10px] text-slate-400 truncate block">
            {classList.slice(0, 4).join(', ')}{classList.length > 4 ? ` +${classList.length - 4}` : ''}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Siswa Selesai Ujian</span>
          <div className="text-2xl font-black text-emerald-600 font-mono mt-1">
            {students.filter(s => s.status === 'SELESAI').length} Siswa
          </div>
          <span className="text-[10px] text-slate-400">Jawaban tersimpan aman di database</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Sedang Mengerjakan</span>
          <div className="text-2xl font-black text-amber-600 font-mono mt-1">
            {students.filter(s => s.status === 'SEDANG_MENGERJAKAN').length} Siswa
          </div>
          <span className="text-[10px] text-slate-400">Dimonitor pengawas kelas real-time</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, username, atau kelas..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
            />
          </div>

          <select
            value={classFilter}
            onChange={(e) => {
              setClassFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Semua Kelas ({classList.length})</option>
            {classList.map(cls => (
              <option key={cls} value={cls}>Kelas {cls}</option>
            ))}
          </select>
        </div>

        {/* Pagination Counter & Per Page */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <span className="text-xs text-slate-500 font-mono">
            Menampilkan <strong>{Math.min(filteredUsers.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(filteredUsers.length, currentPage * itemsPerPage)}</strong> dari <strong>{filteredUsers.length}</strong> siswa
          </span>

          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-600"
          >
            <option value="25">25 / hal</option>
            <option value="50">50 / hal</option>
            <option value="100">100 / hal</option>
            <option value="250">250 / hal</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4">Username Login</th>
                <th className="py-3 px-4">Password</th>
                <th className="py-3 px-4">Nama Lengkap Siswa</th>
                <th className="py-3 px-4">Kelas</th>
                <th className="py-3 px-4 text-center">No. Absen</th>
                <th className="py-3 px-4 text-center">Status Ujian</th>
                <th className="py-3 px-4 text-center">Nilai</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="max-w-sm mx-auto space-y-2">
                      <KeyRound className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="font-bold text-slate-600 text-sm">Tidak ada data siswa ditemukan</p>
                      <p className="text-xs text-slate-400">
                        {searchQuery ? 'Coba ubah kata kunci pencarian.' : 'Silakan unduh template Excel dan klik "Import File Excel / CSV" untuk mendaftarkan akun siswa.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user, idx) => {
                  const globalIdx = (currentPage - 1) * itemsPerPage + idx + 1;
                  const liveSession = studentSessionMap.get(user.username.toLowerCase()) || studentSessionMap.get(user.name.trim().toLowerCase());
                  const isPassRevealed = revealedPasswords[user.id];

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 text-center font-mono text-slate-400">
                        {globalIdx}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                        <div className="flex items-center gap-1.5">
                          <span>{user.username}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(user.username, `u_${user.id}`)}
                            className="p-1 hover:bg-slate-200/60 rounded text-slate-400 hover:text-slate-600 transition"
                            title="Salin username"
                          >
                            {copiedId === `u_${user.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800">
                            {isPassRevealed ? user.password : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setRevealedPasswords(prev => ({ ...prev, [user.id]: !prev[user.id] }))}
                            className="p-1 hover:bg-slate-200/60 rounded text-slate-400 hover:text-slate-600 transition"
                            title={isPassRevealed ? 'Sembunyikan' : 'Lihat password'}
                          >
                            {isPassRevealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-bold text-slate-800">
                        {user.name}
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-800 font-mono font-bold text-[11px]">
                          {user.studentClass}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-semibold text-slate-600">
                        {user.absentNumber || '-'}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {liveSession ? (
                          liveSession.status === 'SELESAI' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] font-mono">
                              SELESAI
                            </span>
                          ) : liveSession.status === 'TERKUNCI' ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] font-mono animate-pulse">
                              TERKUNCI
                            </span>
                          ) : liveSession.status === 'SEDANG_MENGERJAKAN' ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] font-mono">
                              SEDANG DIKERJAKAN
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px]">
                              BELUM MULAI
                            </span>
                          )
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-mono text-[10px]">
                            BELUM LOGIN
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-black text-slate-800">
                        {liveSession?.score !== undefined ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            {liveSession.score.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUser(user);
                              setEditUsername(user.username);
                              setEditPassword(user.password);
                              setEditName(user.name);
                              setEditClass(user.studentClass);
                              setEditAbsen(user.absentNumber || '');
                            }}
                            className="p-1.5 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition"
                            title="Edit Akun"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(user.id, user.name)}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition"
                            title="Hapus Akun"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Navigation */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Sebelumnya
            </button>

            <div className="flex items-center gap-1 font-mono text-xs">
              <span className="text-slate-500">Halaman</span>
              <strong className="text-indigo-600 font-black">{currentPage}</strong>
              <span className="text-slate-500">dari {totalPages}</span>
            </div>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Selanjutnya
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* MODAL: TAMBAH SISWA MANUAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                Tambah Akun Siswa Baru
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-slate-100 rounded-full transition text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {addError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleAddSingleStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase font-mono tracking-wider mb-1.5">
                  Username Siswa (Harus Unik)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: siswa123 atau 0081234567"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase font-mono tracking-wider mb-1.5">
                  Password Siswa
                </label>
                <input
                  type="text"
                  required
                  placeholder="123"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase font-mono tracking-wider mb-1.5">
                  Nama Lengkap Siswa
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ketik nama lengkap siswa"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase font-mono tracking-wider mb-1.5">
                    Kelas
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 8A, 7B"
                    value={newClass}
                    onChange={(e) => setNewClass(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition uppercase font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase font-mono tracking-wider mb-1.5">
                    No. Absen
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 01"
                    value={newAbsen}
                    onChange={(e) => setNewAbsen(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 border border-slate-200 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition shadow-sm"
                >
                  Simpan Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT SISWA */}
      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Edit className="w-5 h-5 text-indigo-600" />
                Edit Akun Siswa
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 hover:bg-slate-100 rounded-full transition text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase font-mono tracking-wider mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase font-mono tracking-wider mb-1.5">
                  Password
                </label>
                <input
                  type="text"
                  required
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase font-mono tracking-wider mb-1.5">
                  Nama Lengkap Siswa
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase font-mono tracking-wider mb-1.5">
                    Kelas
                  </label>
                  <input
                    type="text"
                    required
                    value={editClass}
                    onChange={(e) => setEditClass(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition uppercase font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase font-mono tracking-wider mb-1.5">
                    No. Absen
                  </label>
                  <input
                    type="text"
                    value={editAbsen}
                    onChange={(e) => setEditAbsen(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
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

      {/* MODAL: IMPORT EXCEL / CSV UNTUK 1200+ SISWA */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 sm:p-8 animate-fade-in space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    Import Database Siswa (Excel .xlsx / CSV)
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    MENDUKUNG HINGGA 1200+ AKUN SISWA SEKALIGUS
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1 hover:bg-slate-100 rounded-full transition text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Instruction Callout */}
            <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-2 text-xs">
              <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                Format Kolom Excel yang Didukung:
              </span>
              <p className="text-slate-600 leading-relaxed">
                Pastikan baris pertama Excel Anda memiliki nama kolom:
                <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold font-mono text-indigo-800 ml-1">username</code>,
                <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold font-mono text-indigo-800 ml-1">password</code>,
                <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold font-mono text-indigo-800 ml-1">nama</code>,
                <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold font-mono text-indigo-800 ml-1">kelas</code>,
                <code className="bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold font-mono text-indigo-800 ml-1">no_absen</code>.
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleDownloadTemplateXlsx}
                  className="text-indigo-700 font-extrabold underline hover:text-indigo-900 cursor-pointer"
                >
                  Download Contoh Template Excel di Sini
                </button>
              </div>
            </div>

            {/* File Dropzone */}
            <div className="border-2 border-dashed border-indigo-300 hover:border-indigo-600 rounded-2xl p-6 text-center transition bg-indigo-50/30 flex flex-col items-center justify-center">
              <FileSpreadsheet className="w-10 h-10 text-indigo-600 mb-2" />
              <label htmlFor="input-file-users" className="cursor-pointer">
                <span className="text-xs font-bold text-indigo-700 hover:text-indigo-800 block mb-1">
                  Pilih Berkas Excel (.xlsx, .xls) atau CSV (.csv)
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Klik untuk mencari file dari laptop / komputer Anda
                </span>
              </label>
              <input
                id="input-file-users"
                type="file"
                accept=".xlsx, .xls, .csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {isProcessingFile && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
                <span>Membaca dan memverifikasi data Excel...</span>
              </div>
            )}

            {importError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {importSuccess && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{importSuccess}</span>
              </div>
            )}

            {/* Preview of Parsed Users */}
            {importPreview && importPreview.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 font-mono uppercase">
                    Pratinjau {Math.min(5, importPreview.length)} Data Pertama dari Total {importPreview.length} Siswa:
                  </span>
                </div>

                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 text-slate-500 font-mono border-b border-slate-200">
                      <tr>
                        <th className="p-2">Username</th>
                        <th className="p-2">Password</th>
                        <th className="p-2">Nama</th>
                        <th className="p-2">Kelas</th>
                        <th className="p-2">No. Absen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importPreview.slice(0, 5).map((u, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2 font-mono font-bold text-indigo-700">{u.username}</td>
                          <td className="p-2 font-mono">{u.password}</td>
                          <td className="p-2 font-bold text-slate-800">{u.name}</td>
                          <td className="p-2 font-mono">{u.studentClass}</td>
                          <td className="p-2 font-mono">{u.absentNumber}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Import Mode Radio */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <span className="font-bold text-slate-700 block">Pilihan Metode Impor:</span>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'REPLACE'}
                        onChange={() => setImportMode('REPLACE')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-semibold text-slate-700">
                        Ganti Semua Database (Overwrite {importPreview.length} Akun)
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="importMode"
                        checked={importMode === 'APPEND'}
                        onChange={() => setImportMode('APPEND')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-semibold text-slate-700">
                        Tambahkan ke Database yang Ada (Append)
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="flex-1 py-3 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Batal
              </button>

              <button
                type="button"
                id="btn-confirm-import-users"
                disabled={!importPreview || importPreview.length === 0}
                onClick={handleConfirmImport}
                className="flex-1 py-3 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Simpan & Pasang {importPreview?.length || 0} Akun ke Database
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

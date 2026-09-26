import React, { useState } from 'react';
import { ShieldCheck, UserCheck, Settings, AlertTriangle, AlertCircle, Info, RefreshCw, BookOpen, Check, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Student, Question, ExamConfig, ExamSubject, StudentUser } from '../types';
import { getExamSubjects } from '../utils/sync';

interface StudentRegistrationProps {
  students: Student[];
  questions?: Question[];
  config?: ExamConfig;
  studentUsers?: StudentUser[];
  onRegister: (data: { name: string; absentNumber: string; studentClass: string; subjectId: string; username?: string }) => void;
  onAdminLogin: () => void;
  examTitle?: string;
  durationMinutes?: number;
  totalQuestions?: number;
  subject1Name?: string;
  subject2Name?: string;
}

export default function StudentRegistration({
  students,
  questions = [],
  config,
  studentUsers = [],
  onRegister,
  onAdminLogin,
  examTitle = 'Ujian Digital',
  durationMinutes = 15,
  totalQuestions = 0,
  subject1Name,
  subject2Name
}: StudentRegistrationProps) {
  // Student Login with Username & Password states
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<StudentUser | null>(null);
  const [loginError, setLoginError] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [absentNumber, setAbsentNumber] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [manualEntryMode, setManualEntryMode] = useState(false);

  // Extract subjects and active subjects
  const allSubjects: ExamSubject[] = getExamSubjects(config);
  const activeSubjects = allSubjects.filter(s => s.isActive !== false);

  const [subjectId, setSubjectId] = useState<string>(() => {
    return activeSubjects[0]?.id || 'sub1';
  });

  // Calculate question count for a specific subject
  const getSubjectQuestionCount = (subId: string) => {
    return questions.filter(q => (!q.subjectId && subId === 'sub1') || q.subjectId === subId).length;
  };

  // Determine effective subject ID (fallback if current is not in active list)
  const effectiveSubjectId = activeSubjects.some(s => s.id === subjectId)
    ? subjectId
    : (activeSubjects[0]?.id || 'sub1');

  // Admin access state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');

  // Handle student login verification
  const handleVerifyStudentAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!usernameInput.trim()) {
      return setLoginError('Silakan masukkan Username siswa.');
    }
    if (!passwordInput.trim()) {
      return setLoginError('Silakan masukkan Password / Kata Sandi.');
    }

    const cleanUsername = usernameInput.trim().toLowerCase();
    const cleanPassword = passwordInput.trim();

    const matchedUser = studentUsers.find(
      (u) => u.username.trim().toLowerCase() === cleanUsername && u.password.trim() === cleanPassword
    );

    if (matchedUser) {
      setAuthenticatedUser(matchedUser);
      setName(matchedUser.name);
      setStudentClass(matchedUser.studentClass);
      setAbsentNumber(matchedUser.absentNumber || '');
      setLoginError('');
    } else {
      setLoginError('Username atau Password siswa salah! Silakan tanyakan ke Proktor atau periksa kembali kartu ujian Anda.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = authenticatedUser ? authenticatedUser.name : name.trim();
    const finalClass = authenticatedUser ? authenticatedUser.studentClass : studentClass.trim().toUpperCase();
    const finalAbsent = authenticatedUser ? (authenticatedUser.absentNumber || '-') : absentNumber.trim();
    const finalUsername = authenticatedUser ? authenticatedUser.username : undefined;

    if (!finalName) return setError('Nama lengkap siswa belum terisi');
    if (!finalAbsent) return setError('Nomor absen belum terisi');
    if (!finalClass) return setError('Kelas belum terisi');
    if (activeSubjects.length === 0) return setError('Belum ada naskah ujian yang diaktifkan oleh proktor.');
    if (!agreed) return setError('Anda harus menyetujui seluruh pakta integritas ujian');

    // Duplicate string validation and re-connection logic
    const normalizedNewName = finalName.trim().toLowerCase().replace(/\s+/g, '');
    const existingStudentObj = students.find((s) => {
      if (finalUsername && s.username && s.username.toLowerCase() === finalUsername.toLowerCase()) {
        return true;
      }
      const normalizedExisting = s.name.trim().toLowerCase().replace(/\s+/g, '');
      return normalizedExisting === normalizedNewName;
    });

    if (existingStudentObj) {
      if (existingStudentObj.status === 'SELESAI') {
        return setError(
          `Nama siswa "${finalName}" sudah menyelesaikan ujian ini dan hasil pengerjaan telah dikonfirmasi. Anda tidak dapat melakukan ujian kembali.`
        );
      }
      if (existingStudentObj.status === 'TERKUNCI') {
        return setError(
          `Sesi ujian untuk siswa "${finalName}" saat ini dibekukan (TERKUNCI) oleh pengawas kelas karena terdeteksi keluar dari layar penuh / split screen. Silakan lapor ke proktor di depan kelas untuk membuka kunci ujian Anda!`
        );
      }
    }

    setError('');
    onRegister({
      name: finalName,
      absentNumber: finalAbsent,
      studentClass: finalClass,
      subjectId: effectiveSubjectId,
      username: finalUsername
    });
  };

  const handleAdminVerify = (e: React.FormEvent) => {
    e.preventDefault();
    // Specific secure username "admin" and password "monyetlupa"
    if (adminUsername.trim() === 'admin' && adminPassword === 'monyetlupa') {
      onAdminLogin();
    } else {
      setAdminError('Username atau kata sandi admin salah!');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-2xl mx-auto w-full">
        {/* Banner Lembaga / Ujian */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-red-100 rounded-full text-red-600 mb-4 animate-pulse">
            <ShieldCheck className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{examTitle}</h1>
          <p className="mt-2 text-sm text-slate-500 font-mono">
            SISTEM PENGAWASAN DIGITAL KETAT (PROKTOR ANTI-CONTEK)
          </p>
        </div>

        {/* Info & Regulasi */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
          <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-amber-400 w-5 h-5" />
              <span className="text-white font-semibold text-sm tracking-wide font-mono">PAKTA INTEGRITAS & ATURAN PROKTOR</span>
            </div>
            <span className="px-2 py-1 text-xs bg-red-600 text-white rounded font-bold font-mono">STRICT MODE ACTIVATED</span>
          </div>
          <div className="p-6 space-y-4 text-slate-600 text-sm">
            <p className="font-semibold text-slate-800">
              Aplikasi ini memonitor ketat aktivitas pengerjaan Anda. Harap baca dan patuhi aturan berikut:
            </p>
            <ul className="space-y-3">
              <li className="flex items-start gap-2.5">
                <span className="text-red-500 font-bold font-mono mt-0.5 mt-0.5 shrink-0 bg-red-50 w-5 h-5 flex items-center justify-center rounded-full text-xs">1</span>
                <div>
                  <strong className="text-slate-900">Dilarang Meninggalkan Layar Penuh (Fullscreen):</strong> Ujian akan langsung dikunci otomatis jika Anda menekan tombol Esc, memperkecil jendela browser, atau melepaskan mode fullscreen.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-red-500 font-bold font-mono mt-0.5 shrink-0 bg-red-50 w-5 h-5 flex items-center justify-center rounded-full text-xs">2</span>
                <div>
                  <strong className="text-slate-900">Dilarang Mengalihkan Fokus (Ganti Tab / Buka App Lain):</strong> Sistem akan mendeteksi perpindahan tab, pembukaan aplikasi background, atau penekanan tombol home. Sekali saja Anda beralih layar, sistem ujian Anda langsung <span className="text-red-600 font-semibold underline">TERBLOKIR</span>.
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-red-500 font-bold font-mono mt-0.5 shrink-0 bg-red-50 w-5 h-5 flex items-center justify-center rounded-full text-xs">3</span>
                <div>
                  <strong className="text-slate-900">Dilarang Split Screen & Floating Apps:</strong> Sistem akan memantau ukuran area layar aktif Anda. Pembagian layar (split-screen) atau penempatan aplikasi melayang (floating apps) di atas browser akan terbaca sebagai anomali ilegal dan memicu kunci sistem.
                </div>
              </li>
              <li className="flex items-start gap-2.5 bg-yellow-50/50 p-2.5 border border-yellow-200 rounded-lg">
                <span className="text-amber-600 font-bold font-mono mt-0.5 shrink-0 bg-yellow-100 w-5 h-5 flex items-center justify-center rounded-full text-xs">!</span>
                <div>
                  <strong className="text-amber-800">Konsekuensi Terkunci:</strong> Jika akun Anda terkunci, Anda <span className="text-red-600 font-semibold">TIDAK BISA</span> melanjutkan ujian secara mandiri. Anda harus menghadap ke <strong className="text-slate-900">ADMIN / PROKTOR UTAMA</strong> di depan kelas untuk melakukan reset manual dari panel proktor.
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Form Pendaftaran Siswa */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between text-white">
            <h2 className="text-base font-bold flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-indigo-200" />
              {authenticatedUser ? 'Identitas Peserta Ujian Terverifikasi' : 'Login Akun Peserta Ujian'}
            </h2>
            <span className="text-xs font-mono bg-indigo-700/80 px-2.5 py-1 rounded font-semibold">
              {authenticatedUser ? 'TERVERIFIKASI' : `${studentUsers.length} Akun Terdaftar`}
            </span>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* 1. Account Login Form (If not verified) */}
            {!authenticatedUser && (
              <form onSubmit={handleVerifyStudentAccount} className="space-y-4">
                <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-1">
                  <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs font-mono uppercase">
                    <UserCheck className="w-4 h-4 text-indigo-600" />
                    Silakan Masuk Menggunakan Username & Password Anda
                  </div>
                  <p className="text-xs text-indigo-800/80 leading-relaxed">
                    Setiap siswa telah didaftarkan dalam database ujian oleh Proktor. Masukkan kredensial yang tercantum pada kartu peserta ujian Anda.
                  </p>
                </div>

                {loginError && (
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase font-mono tracking-wider mb-1.5">
                      Username / NISN
                    </label>
                    <input
                      type="text"
                      required
                      id="input-student-username"
                      placeholder="Contoh: siswa1"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase font-mono tracking-wider mb-1.5">
                      Password / Sandi
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        id="input-student-password"
                        placeholder="Ketik password Anda"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="w-full px-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-xl text-slate-800 text-sm focus:outline-none transition font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  id="btn-verify-student-login"
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 px-6 rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" />
                  Verifikasi Akun Saya
                </button>

                {studentUsers.length > 0 && studentUsers.length <= 10 && (
                  <p className="text-[11px] text-center text-slate-400 font-mono pt-1">
                    Demo Akun: <span className="text-indigo-600 font-bold">{studentUsers[0]?.username}</span> (pass: <span className="text-indigo-600 font-bold">{studentUsers[0]?.password}</span>)
                  </p>
                )}
              </form>
            )}

            {/* 2. Verified Student Identity Card & Exam Form */}
            {authenticatedUser && (
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="p-4 bg-gradient-to-br from-indigo-50/90 via-white to-emerald-50/60 border border-indigo-200 rounded-2xl shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-indigo-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                        <Check className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-mono font-bold text-emerald-700 uppercase tracking-wider block">
                          Akun Terverifikasi
                        </span>
                        <span className="text-xs font-mono text-slate-500 font-bold">
                          @{authenticatedUser.username}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAuthenticatedUser(null);
                        setUsernameInput('');
                        setPasswordInput('');
                      }}
                      className="text-xs font-bold text-slate-500 hover:text-indigo-600 cursor-pointer"
                    >
                      Ganti Akun
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-mono uppercase block">Nama Lengkap</span>
                      <strong className="text-sm font-extrabold text-slate-900 block truncate">{authenticatedUser.name}</strong>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-mono uppercase block">Kelas</span>
                      <strong className="text-sm font-extrabold text-indigo-700 block">{authenticatedUser.studentClass}</strong>
                    </div>
                    <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-mono uppercase block">No. Absen</span>
                      <strong className="text-sm font-extrabold text-slate-900 block">{authenticatedUser.absentNumber || '-'}</strong>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase font-mono tracking-wider">
                    Pilih Naskah Ujian (Mata Pelajaran)
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {activeSubjects.length} Naskah Aktif
                  </span>
                </div>

                {activeSubjects.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <span>Belum ada naskah ujian yang diaktifkan oleh proktor. Silakan hubungi pengawas / proktor di depan kelas.</span>
                  </div>
                ) : activeSubjects.length === 1 ? (
                  <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                        <Check className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase font-mono tracking-wider text-indigo-600 block">
                          Naskah Ujian Terjadwal Aktif
                        </span>
                        <h4 className="font-bold text-sm text-slate-900">{activeSubjects[0].name}</h4>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <span className="px-3 py-1 bg-white border border-indigo-100 rounded-lg text-xs font-mono font-bold text-indigo-700 shadow-xs">
                        {getSubjectQuestionCount(activeSubjects[0].id)} Butir Soal
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeSubjects.map((sub, idx) => {
                      const isSelected = effectiveSubjectId === sub.id;
                      const qCount = getSubjectQuestionCount(sub.id);

                      return (
                        <button
                          key={sub.id}
                          type="button"
                          id={`btn-select-subject-${sub.id}`}
                          onClick={() => setSubjectId(sub.id)}
                          className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer relative ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20 shadow-xs'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-1.5">
                            <span className={`text-[10px] font-bold uppercase font-mono tracking-wider ${
                              isSelected ? 'text-indigo-600' : 'text-slate-400'
                            }`}>
                              Naskah {sub.code || `Paket ${String.fromCharCode(65 + idx)}`}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-bold ${
                              isSelected ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {qCount} Soal
                            </span>
                          </div>
                          <span className="font-bold text-sm text-slate-800 leading-snug">{sub.name}</span>
                          {isSelected && (
                            <span className="mt-2 text-[11px] font-bold text-indigo-600 flex items-center gap-1 font-mono">
                              <Check className="w-3.5 h-3.5" /> Terpilih
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

            {/* Checkbox Persetujuan */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start gap-3">
              <input
                id="integrity-box"
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded mt-0.5 cursor-pointer"
              />
              <label htmlFor="integrity-box" className="text-xs text-slate-600 leading-relaxed cursor-pointer select-none">
                Saya memahami konsekuensi berat ini. Saya siap melakukan ujian dengan layar penuh tanpa menutup jendela browser. Jika saya terbukti melanggar, saya rela status saya dibekukan dan harus menghadap pengawas untuk mereset ujian saya.
              </label>
            </div>

            {/* Submit Button */}
            <button
              id="btn-register-sudent"
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-xl border-b-4 border-slate-950 focus:outline-none active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-5 h-5 text-green-400" />
              Mulai Ujian & Masuk Layar Penuh
            </button>
          </form>
        )}
      </div>
    </div>

        {/* Status Sinkronisasi Real-time Database Cloud */}
        <div 
          id="realtime-sync-status-container" 
          className="mt-6 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs text-xs font-mono flex flex-col md:flex-row items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3 w-full md:w-auto">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-405 bg-emerald-450 bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <div className="text-left">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <span>TERHUBUNG KE CLOUD</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider font-mono">LIVE</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 tracking-tight font-sans">
                Sinkronisasi: <strong className="text-indigo-600 font-mono font-semibold">{totalQuestions} Butir Soal Aktif</strong> • {students.length} Siswa Terdaftar
              </div>
            </div>
          </div>
          <button
            type="button"
            id="btn-force-reload-sync"
            onClick={() => {
              // Clear cache keys to guarantee absolute clean fetch
              localStorage.removeItem('proktor_questions');
              localStorage.removeItem('proktor_config');
              localStorage.removeItem('proktor_students');
              // Soft feedback then reload
              const btn = document.getElementById('btn-force-reload-sync');
              if (btn) btn.innerText = "MEMBERSIHKAN CACHE...";
              setTimeout(() => {
                window.location.reload();
              }, 500);
            }}
            className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 px-3.5 py-2 rounded-xl border border-indigo-100 transition-all cursor-pointer font-bold shrink-0 uppercase active:scale-[0.98]"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
            Bersihkan Cache & Sinkron Ulang
          </button>
        </div>

      </div>

      {/* Footer & Mode Admin */}
      <div className="max-w-2xl mx-auto w-full text-center mt-12 border-t border-slate-200 pt-6">
        <button
          id="btn-login-admin-modal"
          onClick={() => {
            setShowAdminModal(true);
            setAdminError('');
            setAdminUsername('');
            setAdminPassword('');
          }}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-indigo-600 hover:bg-white hover:shadow-xs px-4 py-2 rounded-lg border border-slate-200 transition-all font-mono"
        >
          <Settings className="w-4 h-4" />
          MASUK MODE PROKTOR / ADMIN
        </button>
      </div>

      {/* Admin Passcode Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-6 relative">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-2">
              <Settings className="w-5 h-5 text-slate-700" />
              Verifikasi Admin / Proktor
            </h3>
            <p className="text-xs text-slate-500 mb-4 font-mono">
              MASUKKAN USERNAME & SANDI UNTUK AKSES KONTROL
            </p>

            {adminError && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs text-center font-semibold">
                {adminError}
              </div>
            )}

            <form onSubmit={handleAdminVerify} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 font-mono tracking-wider uppercase mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="admin"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-slate-800 rounded-lg text-slate-800 focus:outline-none focus:bg-white font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 font-mono tracking-wider uppercase mb-1">
                  Kata Sandi
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 focus:border-slate-800 rounded-lg text-slate-800 focus:outline-none focus:bg-white text-center text-lg tracking-widest font-serif"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  id="btn-admin-cancel"
                  onClick={() => setShowAdminModal(false)}
                  className="flex-1 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 border border-slate-200 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  id="btn-admin-submit-verify"
                  className="flex-1 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition"
                >
                  Verifikasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

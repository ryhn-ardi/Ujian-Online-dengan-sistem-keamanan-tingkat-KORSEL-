export interface Question {
  id: string;
  questionText: string;
  imageUrl?: string; // Optional image URL or compressed Base64 data URL for mathematics diagrams, geometry, illustrations
  options: string[];
  optionImages?: string[]; // Optional images for options A, B, C, D
  correctAnswerIndex: number; // Index of correct option (0-3)
  correctAnswerIndices?: number[]; // List of correct indices, used for MR (multiple response)
  type?: 'MC' | 'MR'; // 'MC' = Multiple Choice (single), 'MR' = Multiple Response (2 correct answers)
  score?: number; // Custom score for each question
  subjectId?: string; // ID of the subject this question belongs to (e.g. 'sub1' or 'sub2')
  isReadingPassage?: boolean; // For Indonesian language / long text: enables paragraph indentation & generous line-spacing
}

export interface StudentUser {
  id: string;
  username: string;
  password: string;
  name: string;
  studentClass: string;
  absentNumber?: string;
  createdAt?: string;
}

export type StudentStatus = 'BELUM_MULAI' | 'SEDANG_MENGERJAKAN' | 'TERKUNCI' | 'SELESAI';

export interface Student {
  id: string; // Generated id
  username?: string; // Predefined login username
  name: string;
  absentNumber: string;
  studentClass: string;
  status: StudentStatus;
  violationCount: number;
  lockedReason?: string;
  score?: number;
  correctAnswersCount?: number;
  totalQuestions?: number;
  answers: Record<string, number | number[]>; // key: questionId, value: selectedOptionIndex or array of indices
  startTime?: string;
  endTime?: string;
  lastActive?: string;
  subjectId?: string; // Selected subject ID ('sub1' or 'sub2')
  usedTokens?: string[]; // Array of token strings already used by this student
  tokenUnlockCount?: number; // Total token unlocks used by this student
  assignedQuestionIds?: string[]; // Preserved list of randomized question IDs for this student
}

export interface ExamSubject {
  id: string; // ID of the subject (e.g. 'sub1', 'sub2', 'sub3')
  name: string; // Subject display name (e.g. 'Seni Budaya dan P kelas 8')
  code?: string; // Optional code/abbreviation (e.g. 'SB-8')
  isActive?: boolean; // Whether this subject is visible/available for students to choose on the exam link
  targetGrade?: string; // Target grade level: 'ALL' (Semua Kelas), '7', '8', '9', '10', '11', '12', or custom class
  enableRandomSampling?: boolean; // Per-subject random sampling toggle
  sampleQuestionCount?: number; // Number of questions to randomly pick for this specific subject
  // Penjadwalan Otomatis Real-time WIB
  scheduleEnabled?: boolean; // Apakah penjadwalan otomatis waktu aktif
  scheduleDisplayStart?: string; // Waktu mulai ditampilkan di portal siswa (WIB)
  scheduleDisplayEnd?: string; // Waktu selesai ditampilkan di portal siswa (WIB)
  scheduleExamStart?: string; // Waktu mulai siswa diizinkan mengerjakan ujian (WIB)
  scheduleExamEnd?: string; // Batas akhir siswa diizinkan mulai mengerjakan (WIB)
}

export interface ProctorPermissions {
  allowUnlock: boolean; // Otoritas buka kunci siswa yang terkunci (remote unlock)
  allowUnlockAll: boolean; // Otoritas buka kunci massal seluruh siswa sekaligus
  allowResetAttempt: boolean; // Otoritas reset pengerjaan & jawaban siswa dari awal (ulang ujian)
  allowResetViolations: boolean; // Otoritas reset hitungan pelanggaran siswa menjadi 0
  allowForceSubmit: boolean; // Otoritas kumpulkan paksa lembar ujian siswa
  allowExportExcel: boolean; // Otoritas unduh file spreadsheet rekap nilai ujian ke Excel
  showStudentScores: boolean; // Tampilkan nilai hasil ujian siswa di tabel pengawas
  showItemAnalysis: boolean; // Tampilkan tab Analisis Butir Soal ke pengawas
  showAnalyticsCharts: boolean; // Tampilkan tab Grafik & Statistik ke pengawas
  allowChangeSubject?: boolean; // Otoritas koreksi / pindah naskah mapel siswa yang salah naskah
}

export interface BroadcastAnnouncement {
  id: string; // Unique identifier for each broadcast
  message: string; // Custom message text from admin/proctor
  sender: string; // Display sender title (e.g. 'Administrator Master' or 'Pengawas Ruang')
  timestamp: string; // ISO date timestamp
  soundType?: 'CHIME_AIRPORT' | 'CHIME_HARMONY' | 'CHIME_DIGITAL' | 'CHIME_ELEGANT' | 'CUSTOM_AUDIO';
  customAudioUrl?: string; // Optional audio data URL
  targetSubjectId?: string; // 'all' or specific subjectId
  active: boolean; // True while the announcement is actively broadcast
}

export interface ExamConfig {
  durationMinutes: number;
  examTitle: string;
  subject1Name?: string; // Display name for Subject 1 (legacy compatibility)
  subject2Name?: string; // Display name for Subject 2 (legacy compatibility)
  subjects?: ExamSubject[]; // Dynamic list of up to 20 subject slots
  strictSecurityEnabled?: boolean; // Whether the strict full-screen validation is active
  maxAllowedViolations?: number; // How many violations are allowed before locking
  clearAnswersOnViolation?: boolean; // Whether to completely clear student answers on violation
  sirenAlarmEnabled?: boolean; // Whether to play a loud siren alarm on violation
  unlockTokens?: string[]; // Customizable unlock tokens configured by Admin (determines student token attempts)
  usedGlobalTokens?: string[]; // List of tokens that have been consumed/burned
  enableRandomSampling?: boolean; // Randomly sample questions from bank
  sampleQuestionCount?: number; // Number of questions to randomly pick (e.g. 50 out of 100)
  requireStudentLogin?: boolean; // Require username & password from database
  proctorPassword?: string; // Kata sandi khusus login akun Pengawas Ruang (default: awasadasule)
  adminPassword?: string; // Kata sandi khusus login akun Administrator Master (default: monyetlupa)
  alarmType?: 'SIREN' | 'BUZZER' | 'NUCLEAR' | 'BELL' | 'CUSTOM_AUDIO'; // Tipe alarm pelanggaran
  customAlarmAudioUrl?: string; // Audio file Base64 data URL atau external URL untuk alarm kustom
  customAlarmName?: string; // Nama deskripsi audio kustom yang diunggah
  proctorPermissions?: ProctorPermissions; // Konfigurasi wewenang dan tampilan akun pengawas
  announcementSoundType?: 'CHIME_AIRPORT' | 'CHIME_HARMONY' | 'CHIME_DIGITAL' | 'CHIME_ELEGANT' | 'CUSTOM_AUDIO'; // Suara pengumuman massal
  customAnnouncementAudioUrl?: string; // URL audio kustom untuk pengumuman
  customAnnouncementName?: string; // Nama file audio kustom pengumuman
  activeAnnouncement?: BroadcastAnnouncement | null; // Pengumuman massal aktif saat ini
  ecoSyncMode?: boolean; // Mode Hemat Kuota Ekstrem: Hanya kirim pelanggaran, unlock, dan kumpul nilai ke server (hemat 99% kuota)
}

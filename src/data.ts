import { Question, ExamConfig, ExamSubject } from './types';

export const INITIAL_QUESTIONS: Question[] = [
  // SUBJECT 1: Matematika & Sains (sub1)
  {
    id: 'q1_sub1',
    questionText: 'Apakah lambang unsur kimia untuk zat Oksigen?',
    options: ['H', 'N', 'O', 'C'],
    correctAnswerIndex: 2,
    correctAnswerIndices: [2],
    type: 'MC',
    score: 20,
    subjectId: 'sub1'
  },
  {
    id: 'q2_sub1',
    questionText: 'Manakah dari berikut ini yang merupakan planet dalam tata surya kita? (PILIH 2 JAWABAN BENAR)',
    options: ['Merkurius', 'Andromeda', 'Venus', 'Alpha Centauri'],
    correctAnswerIndex: 0,
    correctAnswerIndices: [0, 2],
    type: 'MR',
    score: 20,
    subjectId: 'sub1'
  },
  {
    id: 'q3_sub1',
    questionText: 'Berapakah hasil matematika dari operasi hitung: 15 + 25 x 2?',
    options: ['80', '65', '55', '95'],
    correctAnswerIndex: 1,
    correctAnswerIndices: [1],
    type: 'MC',
    score: 20,
    subjectId: 'sub1'
  },
  {
    id: 'q4_sub1',
    questionText: 'Suhu air mendidih pada tekanan udara standar (1 atm) adalah...',
    options: ['80°C', '90°C', '100°C', '120°C'],
    correctAnswerIndex: 2,
    correctAnswerIndices: [2],
    type: 'MC',
    score: 20,
    subjectId: 'sub1'
  },
  {
    id: 'q5_sub1',
    questionText: 'Manakah kelompok hewan mamalia berikut yang memiliki kemampuan untuk terbang aktif?',
    options: ['Tupai', 'Burung Hantu', 'Kelelawar', 'Elang'],
    correctAnswerIndex: 2,
    correctAnswerIndices: [2],
    type: 'MC',
    score: 20,
    subjectId: 'sub1'
  },

  // SUBJECT 2: IPS & Pengetahuan Umum (sub2)
  {
    id: 'q1_sub2',
    questionText: 'Siapakah pencipta lagu kebangsaan negara "Indonesia Raya"?',
    options: ['Ir. Soekarno', 'W.R. Supratman', 'Moh. Hatta', 'Ibu Sud'],
    correctAnswerIndex: 1,
    correctAnswerIndices: [1],
    type: 'MC',
    score: 20,
    subjectId: 'sub2'
  },
  {
    id: 'q2_sub2',
    questionText: 'Lambang dari Sila Kelima Pancasila (Keadilan Sosial bagi Seluruh Rakyat Indonesia) adalah...',
    options: ['Bintang', 'Rantai Emas', 'Padi dan Kapas', 'Kepala Banteng'],
    correctAnswerIndex: 2,
    correctAnswerIndices: [2],
    type: 'MC',
    score: 20,
    subjectId: 'sub2'
  },
  {
    id: 'q3_sub2',
    questionText: 'Benua manakah yang menyandang predikat sebagai benua terkecil di dunia?',
    options: ['Eropa', 'Australia', 'Afrika', 'Antartika'],
    correctAnswerIndex: 1,
    correctAnswerIndices: [1],
    type: 'MC',
    score: 20,
    subjectId: 'sub2'
  },
  {
    id: 'q4_sub2',
    questionText: 'Apakah nama Samudra yang dinobatkan sebagai samudra terluas di dunia?',
    options: ['Samudra Hindia', 'Samudra Atlantik', 'Samudra Pasifik', 'Samudra Arktik'],
    correctAnswerIndex: 2,
    correctAnswerIndices: [2],
    type: 'MC',
    score: 20,
    subjectId: 'sub2'
  },
  {
    id: 'q5_sub2',
    questionText: 'Berdasarkan sejarah, Candi Borobudur yang megah dibangun pada masa kejayaan Kerajaan...',
    options: ['Majapahit', 'Syailendra / Mataram Kuno', 'Tarumanegara', 'Sriwijaya'],
    correctAnswerIndex: 1,
    correctAnswerIndices: [1],
    type: 'MC',
    score: 20,
    subjectId: 'sub2'
  }
];

export const DEFAULT_SUBJECTS: ExamSubject[] = [
  {
    id: 'sub1',
    name: 'Seni Budaya dan P kelas 8',
    code: 'SB-8',
    isActive: true
  },
  {
    id: 'sub2',
    name: 'Informatika kelas 7',
    code: 'INF-7',
    isActive: true
  }
];

export const INITIAL_CONFIG: ExamConfig = {
  durationMinutes: 15,
  examTitle: 'ujian berbasis keamanan tingkat korea utara + NASA',
  subject1Name: 'Seni Budaya dan P kelas 8',
  subject2Name: 'Informatika kelas 7',
  subjects: DEFAULT_SUBJECTS,
  strictSecurityEnabled: true,
  maxAllowedViolations: 3,
  clearAnswersOnViolation: false,
  sirenAlarmEnabled: true,
  unlockTokens: ['TOKEN-1', 'TOKEN-2']
};

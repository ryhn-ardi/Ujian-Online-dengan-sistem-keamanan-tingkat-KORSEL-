/**
 * KODE OTORISASI ABSOLUT SISTEM (ULTIMATE AUTHORIZATION KEY)
 * 
 * CATATAN PENTING KEAMANAN:
 * Kode absolut di bawah ini adalah otoritas tertinggi untuk mengubah kata sandi
 * akun Administrator Master maupun Pengawas Ruang dari antarmuka web.
 * 
 * Berdasarkan instruksi absolut pemilik sistem:
 * "disitu ada kode absolut dariku yaitu 'reyhanstecu', untuk mengubah kode ultimate
 * itu tersebut hanya bisa dari sini saja."
 * 
 * Nilai kode ini bersifat HARDCODED di dalam berkas ini dan TIDAK DAPAT diubah
 * melalui antarmuka web, form, ataupun database Firestore. Perubahan nilai hanya
 * dapat dilakukan langsung melalui repository source code ini.
 */
export const ULTIMATE_AUTHORIZATION_CODE = 'reyhanstecu';

/**
 * Validasi apakah input kode otorisasi cocok dengan kode absolut.
 */
export function verifyUltimateCode(inputCode: string): boolean {
  if (!inputCode) return false;
  return inputCode.trim() === ULTIMATE_AUTHORIZATION_CODE;
}

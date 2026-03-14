# Changelog

Semua perubahan yang signifikan pada proyek **AquaLearn LMS** akan didokumentasikan di file ini. 

## [Unreleased] - 2026-03-15

### ✨ Added (Fitur Baru)
* **Sistem Caching Tingkat Lanjut (`CacheService`)**: Mengimplementasikan `cacheGet`, `cachePut`, dan `cacheRemove` untuk menyimpan data kelas dan personal di memori Apps Script selama 5 menit. Mengurangi beban API Google Sheets secara drastis.
* **Smart Import Konten (`importKontenKelas`)**: Fitur untuk dosen mengimpor Materi, Kuis, dan Tugas Lesson dari satu kelas ke kelas lainnya (mendukung migrasi konten lintas semester). 
* **Filter Anti-Duplikasi pada Import**: Mencegah konten disalin berulang kali berdasarkan pengecekan judul materi/kuis dan topik lesson.
* **Import Nilai Batch (`importNilaiBatch`)**: Memungkinkan input nilai ganda ke dalam database `NILAI` berdasarkan pencocokan NIM secara massal.
* **Fungsi `getPaketDataAnalitikKelas`**: Bundling seluruh pengambilan data untuk *dashboard* analitik Dosen ke dalam satu panggilan yang ter- *cache*.

### 🛠 Changed / Optimized (Pembaruan & Optimasi)
* **Single Batch Data Fetching (Mahasiswa)**: Memodifikasi `getPaketDataRuangKelas` untuk mengecek ketersediaan `CacheService` sebelum melakukan *query* ke Google Sheets.
* **Log Tracker Otomatis Menghapus Cache**: Modifikasi pada fungsi interaksi mahasiswa seperti `logMaterialAccess`, `submitLesson`, dan `logQuizAccess` agar langsung menjalankan fungsi `cacheRemove` dan `invalidateCourseCache`. Ini menjamin tampilan *dashboard* dosen dan *progress bar* mahasiswa di layar tetap mutakhir (*real-time*) saat terjadi perubahan.
* **CRUD Kelas & Konten Dosen Menghapus Cache**: Setiap tindakan Dosen yang memodifikasi data (Tambah/Hapus Kelas, Materi, Kuis, Lesson, Jadwal, Nilai) kini terhubung dengan pemicu `invalidateCourseCache`.

### 🐞 Fixed (Perbaikan Bug)
* Modifikasi fungsi `hapusMataKuliah` untuk memastikan seluruh *cache* analitik kelas yang dihapus dibersihkan sepenuhnya dari sistem.
* Modifikasi fungsi penghapusan data baris tunggal (seperti `hapusMateri` dan `hapusNilaiMahasiswa`) untuk mengambil nilai `courseId` sebelum *row* dihapus, sehingga eksekusi penghapusan *cache* menunjuk ke ID kelas yang tepat.

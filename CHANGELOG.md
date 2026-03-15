# Changelog

Semua perubahan yang signifikan pada proyek **AquaLearn LMS** akan didokumentasikan di file ini. 

## [Unreleased] - 2026-03-16

### ✨ Added (Fitur Baru)
* **Smart Import Mahasiswa (Integrasi SIMAK)**: Menambahkan antarmuka pengunggahan file `.xlsx` untuk mendaftarkan mahasiswa ke dalam kelas secara massal.
* **Live Preview Data Mahasiswa**: Menambahkan sistem *preview UI* yang memvalidasi *array* NIM hasil bacaan Excel. Dilengkapi fitur *Smart Filter* yang otomatis mencoret (melewati) NIM yang sudah ada di dalam tabel `ENROLLMENTS` kelas tersebut.
* **Sistem Caching Tingkat Lanjut (`CacheService`)**: Mengimplementasikan penyimpanan memori di server Apps Script selama 5 menit.
* **Auto-Hide Lesson Learn**: Tugas presensi yang sudah dikerjakan kini akan otomatis disembunyikan dari *dashboard* belajar mahasiswa.
* **Smart Import Konten (`importKontenKelas`)**: Fitur impor Materi, Kuis, dan Presensi lintas kelas.
* **Import Nilai Batch (`importNilaiBatch`)**: Input nilai ganda otomatis berdasarkan pencocokan NIM.

### 🛠 Changed / Optimized (Pembaruan & Optimasi)
* **Client-Side Data Processing**: Memindahkan beban komputasi pembacaan *file* Excel (untuk Import Mahasiswa dan Import Nilai) sepenuhnya ke sisi *browser* (Client-Side) menggunakan library `SheetJS`. Menghemat durasi eksekusi Google Apps Script dan mencegah batas waktu habis (*timeout*).
* **Split Cache Architecture (Pemisahan Cache)**: Merestrukturisasi pengambilan data menjadi *Shared Cache* dan *Personal Cache* untuk mencegah *Cross-User Data Leak*.

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

# Changelog

Semua perubahan yang signifikan pada proyek **AquaLearn LMS** akan didokumentasikan di file ini.

---
## [Unreleased] - 2026-03-30

### ✨ Added (Fitur Baru)
* **Computer Assisted Assessment (CBT) Terintegrasi dengan 6 Lapis Anti-Cheat**:
  * **L1**: Pemblokiran klik kanan, *shortcut* keyboard berbahaya (Copy, Paste, Print Screen, Inspect Element), dan deteksi jika mahasiswa berpindah *tab* atau jendela browser.
  * **L2**: Pemblokiran fitur *drag-and-drop* dan penyeleksian teks di seluruh area halaman ujian (kecuali di dalam area pengetikan *essay*).
  * **L3 (Fullscreen Gate)**: Mahasiswa diwajibkan untuk masuk ke mode layar penuh (*fullscreen*) sebelum ujian ditampilkan. Keluar dari *fullscreen* dihitung sebagai pelanggaran.
  * **L4 (Smart Blur / Cursor Tracking)**: Memunculkan layar peringatan otomatis jika kursor *mouse* mahasiswa terdeteksi keluar dari area dokumen ujian.
  * **L5**: Deteksi dan pemblokiran ekstensi browser mencurigakan menggunakan `MutationObserver` untuk mencegah injeksi elemen eksternal.
  * **L6**: Deteksi koneksi *offline*. Ujian akan otomatis dijeda dengan layar merah jika internet terputus, dan dilanjutkan saat terhubung kembali.
* **Sistem Auto-Submit Pelanggaran**: Sistem menghitung jumlah pelanggaran (*cheat violations*). Jika mencapai batas maksimal (5 pelanggaran), ujian akan otomatis dikumpulkan paksa.
* **Floating Exam Timer**: Indikator hitung mundur waktu ujian yang otomatis melayang di sudut layar saat pengguna menggulir halaman ke bawah, lengkap dengan transisi warna dinamis (Hijau > Oranye > Merah).
* **Sistem Poin Gamifikasi Baru (Keadilan Skor & Anti-Spam)**:
  * Pembaruan logika pada fungsi analitik (`getStudentRankings`). 
  * Akses materi unik/baru mendapatkan 5 poin, akses ulang materi yang sama mendapat 3 poin.
  * Pengerjaan kuis dan *Lesson Learn* mendapat 10 poin (hanya dihitung 1 kali agar tidak bisa di-*spam*).

### 🛠 Changed / Optimized (Pembaruan & Optimasi)
* **Integrasi Data CBT**: Memodifikasi pengiriman paket `dataPersonal` pada ruang kelas untuk memuat status pengerjaan kuis terbaru serta injeksi info CBT (`getCourseQuizzesWithCbtInfo`).

## [Unreleased] - 2026-03-20

### ✨ Added (Fitur Baru)

* **Sistem Keamanan 1 Perangkat 1 Akun (Device Binding)**:
  * Implementasi fungsi `verifikasiDeviceBinding` di backend untuk menyimpan dan mencocokkan token perangkat mahasiswa pada tabel `DEVICE_BINDING`.
  * Sistem menghasilkan *Deskriptif Device Token* di sisi *client* (`dapatkanDeviceToken`) yang mendeteksi **Sistem Operasi** (Android, iPhone, Windows, Mac, Linux) dan **nama Browser** (Chrome, Edge, Firefox, Safari, Opera) dari `navigator.userAgent`. Token berbentuk `os_browser_kodeunik` (contoh: `android_chrome_x7y9z`) sehingga pesan penolakan login dapat menampilkan info perangkat yang digunakan sebelumnya secara *human-readable*.
  * Jika mahasiswa login dari perangkat/browser yang berbeda, sistem menampilkan pesan blokir spesifik yang menyebut OS dan Browser perangkat lama.
  * Login dosen **dikecualikan** dari pengecekan perangkat (bebas multi-device).

* **Reset Perangkat Mahasiswa Secara Batch (Oleh Dosen)**:
  * Menambahkan tombol **🔓 Reset Perangkat Mahasiswa** di panel *Daftar Mahasiswa* kelas.
  * Dosen cukup mencentang satu atau lebih mahasiswa dari *checklist*, lalu menekan tombol reset.
  * Fungsi backend `resetDeviceBindingBatch` menghapus baris binding perangkat untuk seluruh NIM yang dipilih sekaligus, menggunakan iterasi *reverse-loop* yang aman terhadap pergeseran indeks baris.
  * Laporan ringkasan berisi jumlah berhasil direset ditampilkan kembali ke dosen.

* **Manajemen Kalender Pertemuan**:
  * Menambahkan accordion baru **📅 Manajemen Kalender Pertemuan** di panel dosen dengan input: Topik, Tanggal, Waktu, Mode (Luring/Daring), dan Lokasi/Link Zoom.
  * Placeholder kolom **Lokasi/Link** berubah secara dinamis sesuai pilihan mode (`ubahPlaceholderLokasi`).
  * Fungsi backend `tambahJadwal`, `getJadwalKelas`, dan `hapusJadwal` mengelola tabel `JADWAL`.
  * **Auto-Hide 1×24 Jam**: `getJadwalKelas` memfilter dan menyembunyikan jadwal yang telah melewati 24 jam dari waktu mulai kelas, menjaga *dashboard* mahasiswa tetap bersih dari jadwal usang.
  * Di sisi mahasiswa, jadwal kelas daring menampilkan tombol **▶️ Gabung Kelas (Zoom Meeting)** yang langsung mengarah ke *link* yang didaftarkan dosen; kelas luring menampilkan blok lokasi fisik.

* **Sistem Pengaturan & Rilis Nilai Akhir**:
  * Dosen dapat membuka modal **⚙️ Pengaturan Nilai Akhir** untuk mendefinisikan komponen penilaian (misal: UTS, UAS, Tugas) beserta bobot persentasenya secara dinamis—baris bisa ditambah dan dihapus. Total bobot wajib 100% (divalidasi *client-side*).
  * Konfigurasi disimpan ke tabel `GRADE_CONFIG` melalui fungsi `saveGradeConfig`.
  * Toggle **Rilis ke Mahasiswa** menggunakan animasi *toggle switch* CSS murni (`animasiToggleRilis`); saat aktif, mahasiswa dapat melihat rincian nilai akhirnya.
  * Fungsi `getAdminGradeConfig` membaca konfigurasi ini dari backend.

* **Kalkulasi Nilai Akhir Sisi Klien (Zero-Server-Call)**:
  * Fungsi `lihatNilaiAkhirMahasiswa` memproses seluruh kalkulasi (perkalian bobot × nilai, penjumlahan, konversi ke huruf) **sepenuhnya di browser mahasiswa** menggunakan data `window.lokalGradeConfig` dan `window.lokalNilaiMhs` yang sudah diambil saat masuk kelas.
  * Hasil ditampilkan instan dalam modal **📊 Rincian Nilai Akhir** yang menampilkan tabel breakdown per komponen dan skor akhir disertai nilai huruf.
  * Tombol **Lihat Rincian Nilai Akhir** akan muncul otomatis di halaman ruang kelas mahasiswa.

* **Export Excel dengan Auto-Grading Berbasis Bobot**:
  * Fungsi `generateExcelNilai` membaca konfigurasi bobot (`getAdminGradeConfig`) sebelum membangun *file* Excel.
  * Jika bobot dikonfigurasi, nilai akhir dihitung sesuai formula `(Nilai × Bobot) / 100`; jika belum dikonfigurasi, sistem *fallback* ke rata-rata sederhana agar tidak *crash*.
  * Output Excel menyertakan header informatif (Kode, Nama MK, Tahun Ajaran, Semester, Kelas, Ketua Pengampu), kolom nilai per jenis penilaian, kolom **Nilai Akhir**, dan kolom **Nilai Huruf** (Skala Universitas Udayana: A/B+/B/C+/C/D+/D/E).
  * Kode mata kuliah dan nama kelas di-*parse* otomatis dari `activeCourseId` (format `KODE-KELAS`) sehingga header Excel terpisah rapi.

* **Format Deadline WITA Konsisten (`formatDeadlineWITA`)**:
  * Fungsi terpusat yang mem-*parse* dua format tanggal berbeda (string `DD-MM-YYYY` dari input manual dosen, dan objek `Date` bawaan Google Sheets) menjadi tampilan ramah: `Senin, 31 Maret 2026 jam 24.00 WITA`.
  * Digunakan secara konsisten di tampilan kartu Lesson Learn mahasiswa maupun tabel manajemen dosen.

### 🛠 Changed / Optimized (Pembaruan & Optimasi)

* **Struktur Cache Dipisah antara Data Kelas & Data Personal**: `getPaketDataRuangKelas` kini memisahkan *shared cache* (`paket_kelas_{courseId}`) yang berisi materi, jadwal, dan daftar lesson, dari *personal cache* (`paket_personal_{courseId}_{userId}`) yang berisi data kuis (beserta status `dikerjakan`), nilai, dan ID lesson yang sudah dikerjakan. Pemisahan ini mencegah kebocoran data antar mahasiswa (*cross-user data leak*) sekaligus meningkatkan efisiensi *cache hit*.
* **Grade Config disertakan dalam `getPaketDataRuangKelas`**: Konfigurasi bobot dan status rilis nilai kini dikembalikan sebagai bagian dari paket data ruang kelas agar tersedia segera tanpa panggilan terpisah.

---

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

---

## [Unreleased] - 2026-03-15

### ✨ Added (Fitur Baru)
* **Sistem Caching Tingkat Lanjut (`CacheService`)**: Mengimplementasikan `cacheGet`, `cachePut`, dan `cacheRemove` untuk menyimpan data kelas dan personal di memori Apps Script selama 5 menit. Mengurangi beban API Google Sheets secara drastis.
* **Smart Import Konten (`importKontenKelas`)**: Fitur untuk dosen mengimpor Materi, Kuis, dan Tugas Lesson dari satu kelas ke kelas lainnya (mendukung migrasi konten lintas semester).
* **Filter Anti-Duplikasi pada Import**: Mencegah konten disalin berulang kali berdasarkan pengecekan judul materi/kuis dan topik lesson.
* **Import Nilai Batch (`importNilaiBatch`)**: Memungkinkan input nilai ganda ke dalam database `NILAI` berdasarkan pencocokan NIM secara massal.
* **Fungsi `getPaketDataAnalitikKelas`**: Bundling seluruh pengambilan data untuk *dashboard* analitik Dosen ke dalam satu panggilan yang ter-*cache*.

### 🛠 Changed / Optimized (Pembaruan & Optimasi)
* **Single Batch Data Fetching (Mahasiswa)**: Memodifikasi `getPaketDataRuangKelas` untuk mengecek ketersediaan `CacheService` sebelum melakukan *query* ke Google Sheets.
* **Log Tracker Otomatis Menghapus Cache**: Modifikasi pada fungsi interaksi mahasiswa seperti `logMaterialAccess`, `submitLesson`, dan `logQuizAccess` agar langsung menjalankan fungsi `cacheRemove` dan `invalidateCourseCache`. Ini menjamin tampilan *dashboard* dosen dan *progress bar* mahasiswa di layar tetap mutakhir (*real-time*) saat terjadi perubahan.
* **CRUD Kelas & Konten Dosen Menghapus Cache**: Setiap tindakan Dosen yang memodifikasi data (Tambah/Hapus Kelas, Materi, Kuis, Lesson, Jadwal, Nilai) kini terhubung dengan pemicu `invalidateCourseCache`.

### 🐞 Fixed (Perbaikan Bug)
* Modifikasi fungsi `hapusMataKuliah` untuk memastikan seluruh *cache* analitik kelas yang dihapus dibersihkan sepenuhnya dari sistem.
* Modifikasi fungsi penghapusan data baris tunggal (seperti `hapusMateri` dan `hapusNilaiMahasiswa`) untuk mengambil nilai `courseId` sebelum *row* dihapus, sehingga eksekusi penghapusan *cache* menunjuk ke ID kelas yang tepat.

# 🌊 AquaLearn LMS - Serverless Learning Engagement System

![LMS Banner](https://via.placeholder.com/800x200.png?text=AquaLearn+LMS+-+Serverless+Learning+Management+System)

**AquaLearn LMS** adalah sebuah Sistem Manajemen Pembelajaran (LMS) inovatif yang dirancang khusus untuk ekosistem pendidikan tinggi. Dibangun sepenuhnya menggunakan teknologi **Google Apps Script (GAS)** dan **Google Sheets** sebagai *database*, sistem ini bersifat 100% *serverless*—bebas biaya *hosting*, pemeliharaan server, maupun instalasi basis data yang rumit.

Mengusung antarmuka modern dengan gaya visual **Ocean Glassmorphism**, LMS ini tidak hanya berfokus pada penyampaian materi, tetapi juga pada analitik keterlibatan mahasiswa (*Learning Engagement*) secara *real-time*.

---

## ✨ Fitur Utama & Logika Sistem

### 👨‍🎓 Panel Mahasiswa (Student Portal)
Fokus pada antarmuka yang intuitif dan *gamification* untuk meningkatkan motivasi belajar.
* **Smart Dashboard & Progress Bar**: Menampilkan persentase penyelesaian kelas secara otomatis dengan bobot dinamis:
  * Membaca Materi (40%)
  * Presensi & Refleksi *Lesson Learn* (40%)
  * Pengerjaan Kuis/Tugas (20%)
* **Kalender Pertemuan Cerdas (Smart Schedule)**:
  * Menampilkan jadwal perkuliahan lengkap dengan mode pelaksanaan (Daring/Luring).
  * Dilengkapi tombol akses instan ke *link* Zoom/Google Meet untuk kelas daring.
* **Sistem Presensi Reflektif (Auto-Lock)**: Mahasiswa diwajibkan menulis *insight* pembelajaran sebagai bukti kehadiran. Sistem menggunakan logika **Auto-Lock 1x24 jam** di mana tombol *submit* akan terkunci secara otomatis tepat di penghujung hari batas tenggat (*deadline*).
* **Real-time UX Feedback**: Tombol kuis dan materi akan langsung berubah warna dan status (✅ *Sudah Dikerjakan*) seketika setelah diklik, memberikan respons instan tanpa perlu memuat ulang halaman.
* **Transparansi Nilai**: Menampilkan rekapitulasi nilai akhir dari dosen secara transparan langsung di ruang kelas mahasiswa.

### 👨‍🏫 Panel Dosen (Lecturer Super-Admin)
Dilengkapi dengan fitur *Centralized Command* untuk mengelola kelas dari satu panel.
* **Manajemen Kelas Terpusat (CRUD)**: Pembuatan mata kuliah, penambahan materi via Google Drive, serta penugasan berbasis Google Forms.
* **Smart Import Konten Kelas [BARU]**: Memungkinkan dosen untuk menyalin (mengimpor) Materi, Kuis, dan Tugas Presensi dari kelas lain (misal: kelas dari semester sebelumnya). Sistem dilengkapi pendeteksi anti-duplikasi sehingga materi yang sama tidak akan dimasukkan dua kali.
* **Sistem *Cascade Delete* Otomatis**: Jika sebuah mata kuliah, materi, atau kuis dihapus oleh dosen, algoritma backend akan melakukan *reverse-looping* untuk menyapu bersih seluruh riwayat (*log*) aktivitas dan pelacakan mahasiswa yang terkait, sehingga *database* Google Sheets tidak menumpuk/bocor.
* **Batch Student Enrollment**: Memasukkan daftar mahasiswa ke dalam kelas dalam satu kali proses (*batching*) menggunakan sistem *checkbox* cerdas yang otomatis menyembunyikan mahasiswa yang sudah terdaftar.
* **Manajemen Kalender dengan Auto-Hide**: Dosen dapat mengatur jadwal pertemuan. Sistem akan menyembunyikan jadwal dari *dashboard* mahasiswa secara otomatis jika waktu telah terlewat 1x24 jam (mencegah penumpukan jadwal kadaluarsa).
* **Learning Analytics & Early Warning System**:
  * 🏆 **Leaderboard**: Meranking mahasiswa secara otomatis berdasarkan poin aktivitas (Materi = 5 Poin, Kuis & Lesson = 10 Poin).
  * ⚠️ **Deteksi Mahasiswa Tidak Aktif**: Mengidentifikasi mahasiswa dengan skor "0" sebagai *Early Warning System* bagi dosen untuk melakukan intervensi akademik.
* **Manajemen Nilai & Export Auto-Grading**: 
  * Dosen dapat melakukan input nilai secara spesifik (UTS, UAS, Tugas, dll).
  * **Import Nilai Batch [BARU]**: Kemampuan mengimpor nilai banyak mahasiswa sekaligus dari data array.
  * Fitur **📥 Download Excel** terintegrasi menggunakan *SheetJS* di sisi *client*.
  * **Auto-Grading Rule**: Sistem otomatis menghitung rata-rata nilai per mahasiswa dan mengonversinya menjadi **Nilai Huruf** sesuai standar akademik.

---

## ⚡ Arsitektur Optimasi Performa (Diperbarui)

Sistem ini telah dikalibrasi untuk meminimalisir masalah *limitasi kuota* pada Google Apps Script:
1. **Advanced Caching System (CacheService) [BARU]**: Menyimpan respons data ke dalam memori sementara (*cache*) hingga 100KB selama 5 menit. Meminimalisir pembacaan berulang ke Google Sheets sehingga *load time* menjadi sangat cepat dan mencegah *error* "Quota Exceeded". Cache akan dihapus otomatis (di- *invalidate*) jika ada perubahan data seperti penambahan materi atau pengiriman tugas.
2. **Concurrency Handling (LockService)**: Mencegah tabrakan data (*data collision*) ketika puluhan mahasiswa melakukan klik absen atau buka materi di detik yang sama. Sistem menggunakan `LockService.getScriptLock().waitLock()` untuk mengatur antrean *request* hingga 10 detik.
3. **Single Batch Data Fetching**: Memuat seluruh data (Materi, Kuis, Lesson, Jadwal, dan Nilai) dalam **satu kali panggilan server** `getPaketDataRuangKelas` atau `getPaketDataAnalitikKelas`.
4. **Anti All-or-Nothing Paradigm**: Pemanggilan paket kelas dibungkus dengan metode *Try-Catch* parsial. Jika tabel *Jadwal* mengalami *error*, modul materi dan kuis akan tetap berhasil dimuat tanpa menyebabkan *crash* pada keseluruhan ruang kelas.

---

## 🛠️ Tech Stack & Infrastruktur
* **Backend Platform**: Google Apps Script (GAS) dengan V8 Engine.
* **Database Relasional**: Google Sheets (Didesain meniru tabel SQL).
* **Frontend UI/UX**:
  * HTML5 & Vanilla JavaScript.
  * [Tailwind CSS](https://tailwindcss.com/) (Diinjeksi via CDN untuk *styling* cepat).
  * *Ocean Glassmorphism UI* (Custom CSS *backdrop-filter* dan animasi).
* **Library Eksternal**: [SheetJS (xlsx)](https://sheetjs.com/) untuk pemrosesan dan ekspor data ke Excel murni di sisi browser.

---

## 📂 Struktur Skema Database (Google Sheets)
Saat sistem dijalankan pertama kali, fungsi `setupDatabase()` akan secara otomatis membuat 11 (*sebelas*) tabel yang saling berelasi:

| Nama Sheet / Tabel | Deskripsi & Fungsi |
| :--- | :--- |
| **`USERS`** | Master data pengguna (NIM/ID, Password, Nama, Role: Mahasiswa/Dosen). |
| **`COURSES`** | Master data mata kuliah (ID, Nama Kelas, ID Dosen Pengampu). |
| **`ENROLLMENTS`** | Tabel *Bridge* / Relasi Many-to-Many antara Mahasiswa dan Kelas. |
| **`MATERIALS`** | Daftar referensi materi pelajaran & *link* penyimpanan Drive. |
| **`MATERIAL_TRACK`** | Log pelacakan waktu nyata (*timestamp*) saat mahasiswa klik materi. |
| **`QUIZ`** | Daftar tugas atau kuis yang diarahkan ke eksternal (Google Forms, dll). |
| **`QUIZ_TRACK`** | Log pelacakan saat mahasiswa mulai mengerjakan kuis. |
| **`LESSON_ASSIGN`** | Data tugas presensi reflektif beserta pengaturan tanggal tenggat (*deadline*). |
| **`LESSON_SUBMIT`** | Penyimpanan *insight*/jawaban mahasiswa sebagai bukti rekap presensi. |
| **`JADWAL`** | Data pertemuan luring/daring, jam pelaksanaan, dan lokasi/link. |
| **`NILAI`** | Rekapitulasi jenis penilaian spesifik beserta angka perolehan mahasiswa. |

---

## 🚀 Panduan Setup & Instalasi (Zero-Cost Deployment)

1. **Persiapan Workspace**:
   * Buat file **Google Sheets** kosong di akun Google Drive Anda.
   * Pilih menu **Extensions (Ekstensi)** > **Apps Script**.
2. **Injeksi Kode**:
   * Buat file **`Kode.gs`** (Tempel fungsi `doGet` dan logika *Login*).
   * Buat file **`database.gs`** (Tempel seluruh logika *backend*, CRUD, kalkulasi *analytics*, integrasi *Cache*, dan integrasi jadwal/nilai).
   * Buat file **`Index.html`** (Tempel seluruh kode UI/UX, Tailwind, dan Script *client-side*).
3. **Build Database Otomatis**:
   * Di file `database.gs`, pilih fungsi `setupDatabase` pada *dropdown* atas.
   * Klik tombol **Run / Jalankan** dan berikan izin (*Authorization*). Google Sheets Anda kini sudah terformat dengan relasi tabel yang benar.
4. **Deploy Aplikasi (Go Live)**:
   * Klik **Deploy** di sudut kanan atas > **New deployment**.
   * Pilih tipe **Web app**.
   * Setting eksekusi: **Me** (Email Anda).
   * Hak Akses: **Anyone** (Siapa saja).
   * Klik **Deploy** dan aplikasi siap digunakan melalui URL yang dibagikan!

*(Gunakan akun mahasiswa NIM: `101`, pass: `101` atau dosen ID: `D01`, pass: `123` untuk melakukan pengujian awal).*

---

## ⚖️ Lisensi & Hak Cipta
Hak cipta © 2026 Andy Rasyadi, S.Pi., M.Si.
Dosen Fakultas Kelautan dan Perikanan, Universitas Udayana.

*Proyek ini dirancang secara khusus untuk mendukung ekosistem pendidikan tinggi jarak jauh dan model pembelajaran campuran (Blended Learning). Silakan pelajari, kembangkan, dan modifikasi kode ini untuk kebutuhan institusi Anda.*

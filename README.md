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
  * Jadwal kelas luring menampilkan blok lokasi fisik secara otomatis.
* **Sistem Presensi Reflektif (Auto-Lock)**: Mahasiswa diwajibkan menulis *insight* pembelajaran sebagai bukti kehadiran. Sistem menggunakan logika **Auto-Lock 1×24 jam** di mana tombol *submit* akan terkunci secara otomatis tepat di penghujung hari batas tenggat (*deadline*). Deadline ditampilkan dalam format **WITA** yang konsisten dan mudah dibaca (misal: *Senin, 31 Maret 2026 jam 24.00 WITA*).
* **Real-time UX Feedback**: Tombol kuis dan materi akan langsung berubah warna dan status (✅ *Sudah Dikerjakan*) seketika setelah diklik, memberikan respons instan tanpa perlu memuat ulang halaman.
* **Transparansi Nilai & Rincian Nilai Akhir**:
  * Menampilkan rekapitulasi nilai per komponen penilaian yang diinput oleh dosen.
  * Tombol **📊 Lihat Rincian Nilai Akhir** muncul otomatis saat dosen merilis nilai.
  * Modal rincian menampilkan tabel *breakdown* (Komponen | Nilai | Bobot | Hasil) dan **kalkulasi dilakukan sepenuhnya di sisi *browser* mahasiswa** (*zero server call*) untuk respons instan.
Fokus pada antarmuka yang intuitif dan *gamification* untuk meningkatkan motivasi belajar.
* **Computer Based Test (CBT) dengan Anti-Cheat 6 Lapis**: Sistem ujian daring terintegrasi yang dikawal ketat oleh *Fullscreen Gate*, pemblokiran *Copy-Paste* & klik kanan, deteksi perpindahan *tab*, pelacakan kursor keluar halaman, perlindungan dari ekstensi browser pihak ketiga, serta penghentian otomatis saat *offline*. Dilengkapi fitur kumpul paksa (*auto-submit*) jika pelanggaran mencapai batas maksimal.
* **Smart Dashboard & Progress Bar**: Menampilkan persentase penyelesaian kelas secara otomatis dengan bobot dinamis:
  * Membaca Materi (40%)
  * Presensi & Refleksi *Lesson Learn* (40%)
  * Pengerjaan Kuis/Tugas (20%)
* **Kalender Pertemuan Cerdas (Smart Schedule)**:
  * Menampilkan jadwal perkuliahan lengkap dengan mode pelaksanaan (Daring/Luring).
  * Dilengkapi tombol akses instan ke *link* Zoom/Google Meet untuk kelas daring.
  * Jadwal kelas luring menampilkan blok lokasi fisik secara otomatis.
* **Sistem Presensi Reflektif (Auto-Lock)**: Mahasiswa diwajibkan menulis *insight* pembelajaran sebagai bukti kehadiran. Sistem menggunakan logika **Auto-Lock 1×24 jam** di mana tombol *submit* akan terkunci secara otomatis tepat di penghujung hari batas tenggat (*deadline*). Deadline ditampilkan dalam format **WITA** yang konsisten dan mudah dibaca (misal: *Senin, 31 Maret 2026 jam 24.00 WITA*).
* **Real-time UX Feedback**: Tombol kuis dan materi akan langsung berubah warna dan status (✅ *Sudah Dikerjakan*) seketika setelah diklik, memberikan respons instan tanpa perlu memuat ulang halaman.
* **Transparansi Nilai & Rincian Nilai Akhir**:
  * Menampilkan rekapitulasi nilai per komponen penilaian yang diinput oleh dosen.
  * Tombol **📊 Lihat Rincian Nilai Akhir** muncul otomatis saat dosen merilis nilai.
  * Modal rincian menampilkan tabel *breakdown* (Komponen | Nilai | Bobot | Hasil) dan **kalkulasi dilakukan sepenuhnya di sisi *browser* mahasiswa** (*zero server call*) untuk respons instan.

### 👨‍🏫 Panel Dosen (Lecturer Super-Admin)
Dilengkapi dengan fitur *Centralized Command* untuk mengelola kelas dari satu panel dengan tampilan *accordion* yang rapi.
* **Manajemen Kelas Terpusat (CRUD)**: Pembuatan mata kuliah (dengan pemisahan Kode + Kelas otomatis), penambahan materi via Google Drive, serta penugasan berbasis Google Forms.
* **Manajemen Kalender Pertemuan**:
  * Input jadwal lengkap: Topik, Tanggal, Jam, Mode (Luring/Daring), dan Lokasi/Link Zoom.
  * Placeholder kolom lokasi berubah secara dinamis sesuai pilihan mode.
  * Jadwal yang telah melewati **1×24 jam** dari waktu mulai akan otomatis disembunyikan dari *dashboard* mahasiswa.
* **Manajemen & Rilis Nilai Akhir**:
  * **Input Manual Nilai**: Input nilai per mahasiswa per komponen penilaian.
  * **Import Nilai Batch**: Unggah *file* Excel/CSV (hasil ekspor Google Forms) dengan *Smart Detector* nama kolom NIM dan Skor secara otomatis.
  * **⚙️ Pengaturan Bobot Nilai**: Dosen mendefinisikan komponen penilaian (UTS, UAS, Tugas, dll.) beserta bobot persentase secara dinamis. Total wajib 100%.
  * **Toggle Rilis Nilai**: Dosen dapat mengaktifkan/menonaktifkan akses mahasiswa terhadap nilai akhir mereka menggunakan *toggle switch* yang responsif.
  * **📥 Download Rekapitulasi Nilai (Excel)**: Ekspor nilai seluruh kelas ke Excel dengan kolom nilai per jenis penilaian, Nilai Akhir berbobot, dan Nilai Huruf (Skala Universitas Udayana) secara otomatis.
* **Smart Import Konten Kelas**: Memungkinkan dosen untuk menyalin (mengimpor) Materi, Kuis, dan Tugas Presensi dari kelas lain dengan proteksi anti-duplikasi berdasarkan judul/topik.
* **Integrasi Excel SIMAK (Smart Student Enrollment)**:
  * Dosen mendaftarkan puluhan mahasiswa sekaligus hanya dengan mengunggah *file* Excel bawaan sistem kampus (SIMAK).
  * Sistem membaca NIM dari kolom B mulai baris 9, memunculkan *Live Preview*, dan memfilter/mencoret mahasiswa yang sudah terdaftar agar terhindar dari duplikasi data.
* **Sistem Keamanan: 1 Perangkat 1 Akun (Device Binding)**:
  * Setiap mahasiswa hanya dapat login dari satu perangkat/browser yang sudah terdaftar.
  * Token perangkat bersifat *deskriptif* (mendeteksi OS + Browser dari `userAgent`) sehingga pesan penolakan login menampilkan info perangkat lama secara *human-readable* (misal: *"Terakhir login dari: Android - Chrome"*).
  * **Reset Perangkat Batch**: Dosen dapat mencentang satu atau lebih mahasiswa dari daftar kelas dan mereset *binding* perangkat mereka sekaligus (untuk kasus mahasiswa ganti HP/laptop).
  * Login dosen dikecualikan dari pembatasan perangkat.
* **Sistem *Cascade Delete* Otomatis**: Algoritma backend *reverse-looping* untuk menyapu bersih seluruh riwayat aktivitas, nilai, jadwal, dan konfigurasi jika kelas dihapus agar *database* tidak bocor.
* **Learning Analytics & Early Warning System**: Ranking mahasiswa otomatis (dengan medali 🥇🥈🥉) dan deteksi mahasiswa tidak aktif (Skor = 0).

---

## ⚡ Arsitektur Optimasi Performa

Sistem ini telah dikalibrasi untuk meminimalisir masalah *limitasi kuota* pada Google Apps Script:
1. **Advanced Caching System (CacheService)**: Menyimpan respons data ke dalam memori sementara (*cache*) hingga 100KB selama 5 menit. Meminimalisir pembacaan berulang ke Google Sheets sehingga *load time* menjadi sangat cepat dan mencegah *error* "Quota Exceeded". Cache di-*invalidate* otomatis jika ada perubahan data seperti penambahan materi atau pengiriman tugas.
2. **Split Cache Architecture (Shared + Personal)**: Data umum kelas (materi, jadwal, daftar lesson) disimpan di *shared cache*, sementara data sensitif per mahasiswa (kuis + status `dikerjakan`, nilai, lesson yang sudah dijawab) disimpan di *personal cache*. Pemisahan ini mencegah *cross-user data leak*.
3. **Single Batch Data Fetching**: Seluruh data dimuat dalam **satu kali panggilan server** (`getPaketDataRuangKelas` atau `getPaketDataAnalitikKelas`) menggantikan 6–8 panggilan terpisah sebelumnya.
4. **Client-Side Grade Calculation**: Kalkulasi nilai akhir mahasiswa dilakukan di *browser* menggunakan data yang sudah ada di memori lokal—tidak ada panggilan server tambahan.
5. **Client-Side Excel Processing**: Pembacaan dan pemrosesan *file* Excel (Import Mahasiswa SIMAK & Import Nilai) dilakukan sepenuhnya oleh `SheetJS` di *browser*, menghemat kuota eksekusi GAS.
6. **Concurrency Handling (LockService)**: Mencegah tabrakan data (*data collision*) ketika puluhan mahasiswa melakukan klik absen atau buka materi di detik yang sama menggunakan `LockService.getScriptLock().waitLock()`.
7. **Anti All-or-Nothing Paradigm**: Pemanggilan paket kelas dibungkus dengan *try-catch* parsial sehingga jika satu modul (misal Jadwal) *error*, modul lain (Materi, Kuis, dll.) tetap dimuat.

---

## 🛠️ Tech Stack & Infrastruktur
* **Backend Platform**: Google Apps Script (GAS) dengan V8 Engine.
* **Database Relasional**: Google Sheets (Didesain meniru tabel SQL).
* **Frontend UI/UX**:
  * HTML5 & Vanilla JavaScript.
  * [Tailwind CSS](https://tailwindcss.com/) (Diinjeksi via CDN untuk *styling* cepat).
  * *Ocean Glassmorphism UI* (Custom CSS `backdrop-filter` dan animasi gelembung).
  * Komponen Accordion, Tab Panel, Toggle Switch, dan Modal sepenuhnya dengan CSS & JS Vanilla.
* **Library Eksternal**: [SheetJS (xlsx)](https://sheetjs.com/) untuk pemrosesan dan ekspor data ke Excel murni di sisi *browser*.

---

## 📂 Struktur Skema Database (Google Sheets)
Saat sistem dijalankan pertama kali, fungsi `setupDatabase()` akan secara otomatis membuat tabel-tabel yang saling berelasi. Berikut skema lengkap termasuk tabel yang dibuat otomatis oleh fitur:

| Nama Sheet / Tabel | Dibuat Oleh | Deskripsi & Fungsi |
| :--- | :--- | :--- |
| **`USERS`** | `setupDatabase()` | Master data pengguna (NIM/ID, Password, Nama, Role: Mahasiswa/Dosen). |
| **`COURSES`** | `setupDatabase()` | Master data mata kuliah (ID, Nama Kelas, ID Dosen Pengampu). |
| **`ENROLLMENTS`** | `setupDatabase()` | Tabel *Bridge* / Relasi Many-to-Many antara Mahasiswa dan Kelas. |
| **`MATERIALS`** | `setupDatabase()` | Daftar referensi materi pelajaran & *link* penyimpanan Drive. |
| **`MATERIAL_TRACK`** | `setupDatabase()` | Log pelacakan *timestamp* saat mahasiswa mengakses materi. |
| **`QUIZ`** | `setupDatabase()` | Daftar tugas atau kuis yang diarahkan ke eksternal (Google Forms, dll). |
| **`QUIZ_TRACK`** | `setupDatabase()` | Log pelacakan saat mahasiswa mulai mengerjakan kuis. |
| **`LESSON_ASSIGN`** | `setupDatabase()` | Data tugas presensi reflektif beserta tanggal tenggat (*deadline*). |
| **`LESSON_SUBMIT`** | `setupDatabase()` | Penyimpanan *insight*/jawaban mahasiswa sebagai bukti rekap presensi. |
| **`JADWAL`** | Auto (`tambahJadwal`) | Data pertemuan luring/daring, jam pelaksanaan, dan lokasi/link. |
| **`NILAI`** | Auto (`tambahNilaiMahasiswa`) | Rekapitulasi jenis penilaian spesifik beserta angka perolehan mahasiswa. |
| **`GRADE_CONFIG`** | Auto (`saveGradeConfig`) | Konfigurasi bobot persentase komponen nilai dan status rilis per kelas. |
| **`DEVICE_BINDING`** | Auto (`verifikasiDeviceBinding`) | Tabel *binding* token perangkat mahasiswa untuk keamanan 1 akun 1 perangkat. |

---

## 🔐 Skala Nilai Huruf (Universitas Udayana)

| Rentang Angka | Nilai Huruf |
| :---: | :---: |
| ≥ 80 | A |
| 71 – 79 | B+ |
| 65 – 70 | B |
| 60 – 64 | C+ |
| 55 – 59 | C |
| 50 – 54 | D+ |
| 40 – 49 | D |
| < 40 | E |

---

## 🚀 Panduan Setup & Instalasi (Zero-Cost Deployment)

1. **Persiapan Workspace**:
   * Buat file **Google Sheets** kosong di akun Google Drive Anda.
   * Pilih menu **Extensions (Ekstensi)** > **Apps Script**.
2. **Injeksi Kode**:
   * Buat file **`Kode.gs`** (Tempel fungsi `doGet` dan logika *Login*).
   * Buat file **`database.gs`** (Tempel seluruh logika *backend*, CRUD, kalkulasi *analytics*, integrasi *Cache*, device binding, dan integrasi jadwal/nilai/grade config).
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

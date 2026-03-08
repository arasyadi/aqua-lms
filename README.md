# 🎓 Blueprint LMS - Learning Engagement System

![LMS Banner](https://via.placeholder.com/800x200.png?text=Blueprint+LMS+-+Serverless+Learning+Management+System)

Blueprint LMS adalah sebuah Sistem Manajemen Pembelajaran (LMS) ringan dan tanpa server (*serverless*) yang dibangun sepenuhnya di atas ekosistem Google Workspace. 

Berbeda dengan LMS tradisional, sistem ini berfokus pada **Learning Engagement & Analytics**, dilengkapi dengan fitur pelacakan aktivitas (*tracker*), presensi reflektif (*Lesson Learn*), papan peringkat (*Ranking*), hingga pendeteksi mahasiswa tidak aktif. Semuanya disimpan dengan aman di dalam Google Sheets Anda.

---

## ✨ Fitur Utama

Sistem ini memiliki dua peran (*role*) utama dengan antarmuka dan hak akses yang berbeda:

### 👨‍🎓 Panel Mahasiswa
* **Dashboard Interaktif**: Menampilkan daftar mata kuliah yang diambil.
* **Progress Bar Belajar (Real-time)**: Kalkulasi otomatis dari aktivitas membaca materi (40%), presensi *lesson learn* (40%), dan kuis (20%).
* **Presensi Reflektif (Lesson Learn)**: Mengisi *insight* pembelajaran harian. Dilengkapi sistem **Auto-Lock Deadline 1x24 Jam** (tombol terkunci otomatis setelah tenggat waktu habis).
* **Smart UI/UX**: Tombol materi dan kuis akan berubah menjadi hijau (✅ Sudah Dikerjakan) secara *real-time* setelah diklik.

### 👨‍🏫 Panel Dosen (Super Admin)
* **Manajemen Kelas (CRUD)**: Membuat dan menghapus mata kuliah.
* **Manajemen Mahasiswa (Batch Select)**: Memasukkan banyak mahasiswa sekaligus menggunakan sistem *checkbox* atau mengeluarkan mereka dari kelas.
* **Manajemen Konten Pembelajaran**: Tambah/Hapus Materi (G-Drive), Kuis (G-Forms), dan tugas *Lesson Learn*.
* **Learning Analytics**: 
  * 🏆 **Tabel Ranking Aktivitas**: Mengurutkan mahasiswa berdasarkan poin (Materi = 5 Pts, Lesson/Kuis = 10 Pts).
  * ⚠️ **Deteksi Mahasiswa Tidak Aktif**: Otomatis mendata mahasiswa yang skor aktivitasnya masih 0.
* **Cascade Delete System**: Jika Kelas/Materi/Kuis dihapus, seluruh riwayat (*log*) pengerjaan mahasiswa akan ikut terhapus bersih agar *database* tidak menumpuk.

---

## 🛠️ Tech Stack (Teknologi yang Digunakan)
* **Backend**: [Google Apps Script (GAS)](https://developers.google.com/apps-script)
* **Database**: Google Sheets
* **Frontend**: HTML5, CSS3, Vanilla JavaScript (Berjalan di dalam `HtmlService` GAS)

---

## 🚀 Panduan Instalasi & Deploy (Setup Guide)

Karena aplikasi ini berbasis Google Apps Script, Anda tidak perlu melakukan `npm install` atau menyewa *hosting*. Ikuti langkah berikut:

### 1. Persiapan Database (Google Sheets)
1. Buat file **Google Sheets** baru di Google Drive Anda.
2. Klik menu **Extensions (Ekstensi)** > **Apps Script**.

### 2. Memasukkan Kode
1. Di editor Apps Script, buat tiga file berikut:
   * `Code.gs` (Fungsi routing utama)
   * `database.gs` (Logika backend, CRUD, dan Analytics)
   * `Index.html` (Antarmuka frontend)
2. *Copy-paste* kode dari *repository* ini ke masing-masing file tersebut.
3. Simpan proyek (`Ctrl + S`).

### 3. Setup Tabel Database Otomatis
1. Buka file `database.gs` di editor.
2. Pada *dropdown* fungsi di bagian atas (sebelah tombol *Run/Jalankan*), pilih fungsi **`setupDatabase`**.
3. Klik **Run (Jalankan)**.
4. Berikan izin akses (*Authorization*) ke akun Google Anda.
5. Cek Google Sheets Anda, seluruh tabel (USERS, COURSES, MATERIALS, dll) beserta data *dummy* awal sudah terbuat secara otomatis!

### 4. Deploy Aplikasi ke Web
1. Di pojok kanan atas editor Apps Script, klik tombol biru **Deploy** > **New deployment**.
2. Pilih tipe: **Web app**.
3. Konfigurasi:
   * Execute as: **Me** (Akun Anda)
   * Who has access: **Anyone** (Siapa saja)
4. Klik **Deploy**.
5. Salin **Web app URL** yang diberikan. Aplikasi Anda sudah *live* dan siap dibagikan ke mahasiswa!

---

## 🔐 Akun Default untuk Testing

Setelah melakukan *deploy*, gunakan akun berikut untuk masuk ke dalam sistem:

| Role | Username (NIM/ID) | Password | Keterangan |
| :--- | :--- | :--- | :--- |
| **Mahasiswa** | `101` | `101` | Akun Andi |
| **Mahasiswa** | `102` | `102` | Akun Budi |
| **Dosen** | `D01` | `123` | Akun Pak Dosen |

*(Anda bisa menambah, menghapus, atau mengubah data akun ini langsung melalui sheet `USERS` di Google Sheets).*

---

## 📂 Struktur Database (Google Sheets)
Aplikasi ini menggunakan simulasi *Relational Database* melaui *spreadsheet* dengan tabel berikut:
* `USERS`: Data mahasiswa dan dosen.
* `COURSES`: Master data mata kuliah.
* `ENROLLMENTS`: Tabel relasi (Bridge) antara Mahasiswa dan Mata Kuliah.
* `MATERIALS`, `QUIZ`, `LESSON_ASSIGN`: Master data konten pembelajaran.
* `MATERIAL_TRACK`, `QUIZ_TRACK`, `LESSON_SUBMIT`: Log/Riwayat aktivitas (*tracker*) untuk menghitung analitik.

---

## 📝 Lisensi
Proyek ini bersifat *Open-Source* dan dirancang untuk tujuan edukasi serta mempermudah ekosistem pendidikan jarak jauh. Silakan modifikasi sesuai kebutuhan institusi Anda!

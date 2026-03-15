// File: database.gs

// Fungsi untuk mendapatkan data dari sheet tertentu menjadi bentuk Object/JSON
function getSheetData(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var result = [];
  
  // Looping mulai dari baris kedua (index 1) karena baris pertama adalah header
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    result.push(obj);
  }
  
  return result;
}

// Mencari kelas mahasiswa sekaligus menghitung progress-nya
function getStudentCourses(userId) {
  var enrollments = getSheetData("ENROLLMENTS");
  var courses = getSheetData("COURSES");
  var myCourses = [];
  
  for (var i = 0; i < enrollments.length; i++) {
    if (enrollments[i].user_id == userId) {
      for (var j = 0; j < courses.length; j++) {
        if (courses[j].course_id == enrollments[i].course_id) {
          
          var courseData = courses[j];
          // PANGGIL FUNGSI PERHITUNGAN PROGRESS DI SINI
          courseData.progress = calculateCourseProgress(userId, courseData.course_id);
          
          myCourses.push(courseData);
        }
      }
    }
  }
  return myCourses;
}

// Fungsi untuk setup database otomatis (Sekali jalan)
function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Definisi semua sheet, header, dan data awal
  var sheetsData = [
    {
      name: "USERS",
      headers: ["user_id", "password", "nama_lengkap", "role"],
      data: [
        ["101", "101", "Andi", "Mahasiswa"],
        ["102", "102", "Budi", "Mahasiswa"],
        ["D01", "123", "Pak Dosen", "Dosen"]
      ]
    },
    {
      name: "COURSES",
      headers: ["course_id", "course_name", "dosen_id"],
      data: [
        ["C-001", "Pemrograman Web", "D01"],
        ["C-002", "Basis Data", "D01"]
      ]
    },
    {
      name: "ENROLLMENTS",
      headers: ["enrollment_id", "course_id", "user_id"],
      data: [
        ["E-001", "C-001", "101"],
        ["E-002", "C-002", "101"],
        ["E-003", "C-001", "102"]
      ]
    },
    {
      name: "MATERIALS",
      headers: ["material_id", "course_id", "title", "url_drive"],
      data: [
        ["M-001", "C-001", "Pengenalan HTML", "https://drive.google.com/"],
        ["M-002", "C-001", "CSS Dasar", "https://drive.google.com/"]
      ]
    },
    // Tabel untuk tracking dan fitur lainnya yang dibiarkan kosong
    { name: "MATERIAL_TRACK", headers: ["track_id", "user_id", "material_id", "timestamp"], data: [] },
    { name: "QUIZ", headers: ["quiz_id", "course_id", "title", "url_form"], data: [] },
    { name: "LESSON_ASSIGN", headers: ["assign_id", "course_id", "topic", "deadline"], data: [] },
    { name: "LESSON_SUBMIT", headers: ["submit_id", "assign_id", "user_id", "insight", "status", "timestamp"], data: [] },
    { name: "ACTIVITY_SCORE", headers: ["user_id", "total_score"], data: [] }
  ];

  // Looping untuk membuat setiap sheet
  for (var i = 0; i < sheetsData.length; i++) {
    var info = sheetsData[i];
    var sheet = ss.getSheetByName(info.name);
    
    // Buat sheet jika belum ada
    if (!sheet) {
      sheet = ss.insertSheet(info.name);
    } else {
      sheet.clear(); // Bersihkan isi jika sheet sudah ada agar tidak tumpang tindih
    }
    
    // Set Header dan cetak tebal (Bold)
    sheet.getRange(1, 1, 1, info.headers.length).setValues([info.headers]).setFontWeight("bold");
    
    // Set data awal jika ada
    if (info.data.length > 0) {
      sheet.getRange(2, 1, info.data.length, info.headers.length).setValues(info.data);
    }
  }
  
  // Hapus "Sheet1" bawaan jika masih ada
  var sheet1 = ss.getSheetByName("Sheet1");
  if (sheet1 && ss.getSheets().length > 1) {
    ss.deleteSheet(sheet1);
  }
}

// Mengambil daftar materi berdasarkan ID Mata Kuliah
function getCourseMaterials(courseId) {
  var materials = getSheetData("MATERIALS");
  var courseMaterials = [];
  
  for (var i = 0; i < materials.length; i++) {
    if (materials[i].course_id == courseId) {
      courseMaterials.push(materials[i]);
    }
  }
  return courseMaterials;
}

// Fungsi Tracker: Mencatat saat mahasiswa membuka materi (DIPERBAIKI DENGAN LOCKSERVICE)
function logMaterialAccess(userId, materialId) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) { return false; }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("MATERIAL_TRACK");
    sheet.appendRow(["T-" + new Date().getTime(), userId, materialId, new Date()]);
    SpreadsheetApp.flush();

    // Cache: ranking & progress mahasiswa ini berubah
    // Cari courseId dari materialId agar bisa invalidate cache yang tepat
    var materials = getSheetData("MATERIALS");
    var mat = materials.find(function(m) { return String(m.material_id).trim() === String(materialId).trim(); });
    if (mat) {
      var courseId = mat.course_id;
      // Invalidate cache analitik (ranking dosen) dan cache personal mahasiswa
      cacheRemove('paket_analitik_' + courseId);
      cacheRemove('paket_kelas_'    + courseId);
      cacheRemove('paket_personal_' + courseId + '_' + userId);
    }

    return true;
  } catch (err) {
    return false;
  } finally {
    lock.releaseLock();
  }
}

// Mengambil daftar Lesson Learn (Dengan fitur Auto-Lock Deadline 1x24 Jam)
function getCourseLessons(courseId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("LESSON_ASSIGN");
  if (!sheet) return []; 

  var data = sheet.getDataRange().getValues();
  var courseLessons = [];

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === String(courseId).trim()) {
      var rawDeadline = String(data[i][3]).trim();
      var deadlineMs = 0;
      
      // Menerjemahkan format tanggal DD-MM-YYYY (misal 15-03-2026)
      var parts = rawDeadline.split("-");
      if (parts.length === 3) {
        var day = parseInt(parts[0], 10);
        var month = parseInt(parts[1], 10) - 1; // Bulan di JavaScript dimulai dari 0
        var year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        
        // Set batas akhir ke jam 23:59:59 pada hari tersebut
        deadlineMs = new Date(year, month, day, 23, 59, 59).getTime();
      } else {
        // Jika format tanggal bawaan langsung dari kalender Spreadsheet
        var parsedDate = new Date(rawDeadline);
        if (!isNaN(parsedDate.getTime())) {
          parsedDate.setHours(23, 59, 59); // Kunci di penghujung hari
          deadlineMs = parsedDate.getTime();
        }
      }

      courseLessons.push({
        assign_id: String(data[i][0]),
        course_id: String(data[i][1]),
        topic: String(data[i][2]),
        deadline: rawDeadline,
        deadline_ms: deadlineMs // Data waktu absolut untuk mengunci frontend
      });
    }
  }
  return courseLessons;
}

// Menyimpan jawaban Lesson Learn mahasiswa (DIPERBAIKI DENGAN LOCKSERVICE)
function submitLesson(assignId, userId, insight) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) {
    return { success: false, message: "Sistem sedang sibuk. Silakan coba klik tombol kirim lagi dalam beberapa detik." };
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("LESSON_SUBMIT");
    sheet.appendRow(["SUB-" + new Date().getTime(), assignId, userId, insight, "Hadir", new Date()]);
    SpreadsheetApp.flush();

    // Cache: presensi & ranking mahasiswa ini berubah
    // Cari courseId dari assignId
    var lessons = getSheetData("LESSON_ASSIGN");
    var lesson = lessons.find(function(l) { return String(l.assign_id).trim() === String(assignId).trim(); });
    if (lesson) {
      var courseId = lesson.course_id;
      cacheRemove('paket_analitik_' + courseId);
      cacheRemove('paket_personal_' + courseId + '_' + userId);
    }

    return true;
  } catch (err) {
    return { success: false, message: "Terjadi kesalahan saat menyimpan data." };
  } finally {
    lock.releaseLock();
  }
}

// Fungsi untuk memastikan data Lesson Learn terisi dengan format yang 100% benar
function perbaikiDataLesson() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("LESSON_ASSIGN");
  
  // Bersihkan baris ke-2 ke bawah untuk menghapus data manual yang mungkin salah ketik
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).clearContent();
  }
  
  // Masukkan data baru yang dipastikan tidak ada spasi tersembunyi
  sheet.appendRow(["L-001", "C-001", "Apa insight utama yang Anda dapatkan dari pertemuan hari ini?", "31-12-2026"]);
}

// Jalankan ini SATU KALI SAJA untuk mereset tabel LESSON_ASSIGN
function resetTabelLesson() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("LESSON_ASSIGN");
  sheet.clear(); // Hapus seluruh sheet (header dan isi yang mungkin error)
  
  // Buat ulang header dan isi dengan data yang 100% valid
  sheet.appendRow(["assign_id", "course_id", "topic", "deadline"]);
  sheet.appendRow(["L-001", "C-001", "Apa insight utama yang Anda dapatkan dari pertemuan hari ini?", "31-12-2026"]);
}

// Mendapatkan daftar mahasiswa tidak aktif (Skor = 0)
function getInactiveStudents() {
  // Kita manfaatkan fungsi ranking yang sudah ada
  var rankings = getStudentRankings(); 
  var inactive = [];
  
  for (var i = 0; i < rankings.length; i++) {
    if (rankings[i].skor === 0) {
      inactive.push(rankings[i].nama);
    }
  }
  
  return inactive;
}

// ==========================================
// FITUR KUIS & UPDATE ANALITIK (BARU)
// ==========================================

// Mengambil daftar Kuis berdasarkan ID Mata Kuliah (Dilengkapi Cek Status Pengerjaan)
function getCourseQuizzes(courseId, userId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("QUIZ");
  if (!sheet) return []; 
  
  var data = sheet.getDataRange().getValues();
  var courseQuizzes = [];
  
  // Memeriksa riwayat klik mahasiswa di tabel QUIZ_TRACK
  var trackSheet = ss.getSheetByName("QUIZ_TRACK");
  var completedQuizIds = [];
  
  // Jika sheet track ada dan userId dikirimkan dari frontend
  if (trackSheet && userId) {
    var trackData = trackSheet.getDataRange().getValues();
    for (var j = 1; j < trackData.length; j++) {
      if (String(trackData[j][1]).trim() === String(userId).trim()) {
        completedQuizIds.push(String(trackData[j][2]).trim());
      }
    }
  }

  // Menyusun data kuis untuk dikirim ke layar
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === String(courseId).trim()) {
      var qId = String(data[i][0]).trim();
      courseQuizzes.push({
        quiz_id: qId,
        course_id: String(data[i][1]),
        title: String(data[i][2]),
        url_form: String(data[i][3]),
        dikerjakan: completedQuizIds.includes(qId) // FLAG BARU: true jika sudah diklik
      });
    }
  }
  return courseQuizzes;
}

// Mencatat saat mahasiswa mengklik Kuis (DIPERBAIKI DENGAN LOCKSERVICE)
function logQuizAccess(userId, quizId) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) { return false; }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("QUIZ_TRACK");
    if (!sheet) {
      sheet = ss.insertSheet("QUIZ_TRACK");
      sheet.appendRow(["track_id", "user_id", "quiz_id", "timestamp"]);
    }
    sheet.appendRow(["QT-" + new Date().getTime(), userId, quizId, new Date()]);
    SpreadsheetApp.flush();

    // Cache: ranking & status kuis mahasiswa berubah
    var quizzes = getSheetData("QUIZ");
    var quiz = quizzes.find(function(q) { return String(q.quiz_id).trim() === String(quizId).trim(); });
    if (quiz) {
      var courseId = quiz.course_id;
      cacheRemove('paket_analitik_' + courseId);
      cacheRemove('paket_kelas_'    + courseId);
      cacheRemove('paket_personal_' + courseId + '_' + userId);
    }

    return true;
  } catch (err) {
    return false;
  } finally {
    lock.releaseLock();
  }
}

// UPDATE: Menghitung progress belajar (Materi 40%, Lesson 40%, Kuis 20%)
function calculateCourseProgress(userId, courseId) {
  var materials = getSheetData("MATERIALS").filter(m => m.course_id == courseId);
  var materialTracks = getSheetData("MATERIAL_TRACK").filter(t => t.user_id == userId);
  var lessons = getSheetData("LESSON_ASSIGN").filter(l => l.course_id == courseId);
  var lessonSubmits = getSheetData("LESSON_SUBMIT").filter(s => s.user_id == userId);
  var quizzes = getSheetData("QUIZ").filter(q => q.course_id == courseId);
  var quizTracks = getSheetData("QUIZ_TRACK").filter(t => t.user_id == userId);
  
  // 1. Progress Materi (40%)
  var readMaterialIds = [...new Set(materialTracks.map(t => t.material_id))];
  var materi_dibaca = readMaterialIds.filter(id => materials.some(m => m.material_id == id)).length;
  var progressMateri = materials.length > 0 ? (materi_dibaca / materials.length) * 40 : 0;

  // 2. Progress Lesson Learn (40%)
  var submittedLessonIds = [...new Set(lessonSubmits.map(s => s.assign_id))];
  var lesson_submit = submittedLessonIds.filter(id => lessons.some(l => l.assign_id == id)).length;
  var progressLesson = lessons.length > 0 ? (lesson_submit / lessons.length) * 40 : 0;

  // 3. Progress Kuis (20%)
  var readQuizIds = [...new Set(quizTracks.map(t => t.quiz_id))];
  var quiz_dikerjakan = readQuizIds.filter(id => quizzes.some(q => q.quiz_id == id)).length;
  var progressQuiz = quizzes.length > 0 ? (quiz_dikerjakan / quizzes.length) * 20 : 0;

  return Math.round(progressMateri + progressLesson + progressQuiz);
}

// UPDATE: Meranking Aktivitas Spesifik Per Mata Kuliah (Keadilan Skor)
function getStudentRankings(courseId) {
  var enrollments = getSheetData("ENROLLMENTS").filter(e => String(e.course_id).trim() === String(courseId).trim());
  var users = getSheetData("USERS").filter(u => u.role === "Mahasiswa");
  
  // Ambil data aktivitas dan filter HANYA untuk materi/lesson/kuis di course ini
  var materials = getSheetData("MATERIALS").filter(m => String(m.course_id).trim() === String(courseId).trim());
  var materialIds = materials.map(m => m.material_id);
  var tracks = getSheetData("MATERIAL_TRACK").filter(t => materialIds.includes(t.material_id));
  
  var lessons = getSheetData("LESSON_ASSIGN").filter(l => String(l.course_id).trim() === String(courseId).trim());
  var assignIds = lessons.map(l => l.assign_id);
  var lessonSubmits = getSheetData("LESSON_SUBMIT").filter(s => assignIds.includes(s.assign_id));
  
  var quizzes = getSheetData("QUIZ").filter(q => String(q.course_id).trim() === String(courseId).trim());
  var quizIds = quizzes.map(q => q.quiz_id);
  var quizTracks = getSheetData("QUIZ_TRACK").filter(t => quizIds.includes(t.quiz_id));
  
  var rankings = [];
  
  // Hanya proses mahasiswa yang terdaftar di kelas (courseId) ini
  for (var i = 0; i < enrollments.length; i++) {
    var userId = String(enrollments[i].user_id).trim();
    
    // Cari nama mahasiswa
    var studentName = "Unknown";
    for(var u = 0; u < users.length; u++) {
      if(String(users[u].user_id).trim() === userId) studentName = users[u].nama_lengkap;
    }
    
    // Hitung skor HANYA dari aktivitas kelas ini
    var scoreMateri = tracks.filter(t => String(t.user_id).trim() === userId).length * 5;
    var scoreLesson = lessonSubmits.filter(s => String(s.user_id).trim() === userId).length * 10;
    var scoreQuiz = quizTracks.filter(q => String(q.user_id).trim() === userId).length * 10;
    
    rankings.push({
      nama: studentName,
      skor: scoreMateri + scoreLesson + scoreQuiz
    });
  }
  
  // Urutkan dari tertinggi
  rankings.sort(function(a, b) { return b.skor - a.skor; });
  return rankings;
}

// UPDATE JUGA FUNGSI INACTIVE: Membutuhkan parameter courseId
function getInactiveStudents(courseId) {
  var rankings = getStudentRankings(courseId); 
  var inactive = [];
  for (var i = 0; i < rankings.length; i++) {
    if (rankings[i].skor === 0) inactive.push(rankings[i].nama);
  }
  return inactive;
}

// Mengambil daftar kelas yang diajar oleh Dosen tertentu
function getLecturerCourses(dosenId) {
  var courses = getSheetData("COURSES");
  var myCourses = [];
  
  for (var i = 0; i < courses.length; i++) {
    // Cocokkan dosen_id di tabel COURSES dengan userId yang login
    if (String(courses[i].dosen_id).trim() === String(dosenId).trim()) {
      myCourses.push(courses[i]);
    }
  }
  
  return myCourses;
}

// ==========================================
// FITUR CRUD DOSEN: MANAJEMEN MATA KULIAH
// ==========================================

// 1. Menambah Mata Kuliah Baru
function tambahMataKuliah(courseId, courseName, dosenId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("COURSES");
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(courseId).trim()) {
      return { success: false, message: "Gagal: Kode Kelas sudah digunakan!" };
    }
  }
  sheet.appendRow([courseId, courseName, dosenId]);

  // Cache: kelas baru tidak mempengaruhi cache kelas lain
  // Tidak perlu invalidate — cukup bersih
  return { success: true, message: "Mata Kuliah berhasil ditambahkan!" };
}

// 2. Menghapus Mata Kuliah beserta seluruh data turunannya (Cascade Delete)
function hapusMataKuliah(courseId, dosenId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var courseSheet = ss.getSheetByName("COURSES");
  var courseData = courseSheet.getDataRange().getValues();

  var isAuthorized = false;
  var courseRowIndex = -1;

  for (var i = 1; i < courseData.length; i++) {
    if (String(courseData[i][0]).trim() === String(courseId).trim() &&
        String(courseData[i][2]).trim() === String(dosenId).trim()) {
      isAuthorized = true;
      courseRowIndex = i + 1;
      break;
    }
  }

  if (!isAuthorized) {
    return { success: false, message: "Gagal: Anda tidak memiliki akses untuk menghapus kelas ini." };
  }

  var materials = getSheetData("MATERIALS").filter(m => String(m.course_id).trim() === String(courseId).trim()).map(m => m.material_id);
  var lessons   = getSheetData("LESSON_ASSIGN").filter(l => String(l.course_id).trim() === String(courseId).trim()).map(l => l.assign_id);
  var quizzes   = getSheetData("QUIZ").filter(q => String(q.course_id).trim() === String(courseId).trim()).map(q => q.quiz_id);

  function hapusBarisTerkait(sheetName, columnIndex, idsToDelete) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    for (var r = data.length - 1; r >= 1; r--) {
      if (idsToDelete.includes(String(data[r][columnIndex]).trim())) {
        sheet.deleteRow(r + 1);
      }
    }
  }

  if (materials.length > 0) hapusBarisTerkait("MATERIAL_TRACK", 2, materials);
  if (lessons.length > 0)   hapusBarisTerkait("LESSON_SUBMIT", 1, lessons);
  if (quizzes.length > 0)   hapusBarisTerkait("QUIZ_TRACK", 2, quizzes);

  hapusBarisTerkait("ENROLLMENTS", 1, [courseId]);
  hapusBarisTerkait("MATERIALS",   1, [courseId]);
  hapusBarisTerkait("QUIZ",        1, [courseId]);
  hapusBarisTerkait("LESSON_ASSIGN", 1, [courseId]);
  hapusBarisTerkait("NILAI",  0, [courseId]);
  hapusBarisTerkait("JADWAL", 0, [courseId]);

  courseSheet.deleteRow(courseRowIndex);

  // Cache: bersihkan semua cache kelas yang dihapus
  invalidateCourseCache(courseId);

  return { success: true, message: "Mata Kuliah beserta seluruh materi, tugas, dan log aktivitas mahasiswa telah dibersihkan!" };
}

// ==========================================
// FITUR CRUD DOSEN: MANAJEMEN MAHASISWA
// ==========================================

// 1. Mengambil data mahasiswa (yang terdaftar & semua mahasiswa)
function getStudentManagementData(courseId) {
  var users = getSheetData("USERS").filter(u => u.role === "Mahasiswa");
  var enrollments = getSheetData("ENROLLMENTS").filter(e => String(e.course_id).trim() === String(courseId).trim());
  
  var enrolled = [];
  for(var i = 0; i < enrollments.length; i++) {
    var user = users.find(u => String(u.user_id).trim() === String(enrollments[i].user_id).trim());
    if(user) {
      enrolled.push({ user_id: user.user_id, nama: user.nama_lengkap });
    }
  }
  return { enrolled: enrolled, all: users };
}

// 2. Memasukkan mahasiswa ke kelas (Enroll)
function enrollStudent(courseId, userId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ENROLLMENTS");
  var enrollmentId = "E-" + new Date().getTime();
  sheet.appendRow([enrollmentId, courseId, userId]);

  // Cache: daftar mahasiswa & ranking berubah
  invalidateCourseCache(courseId);

  return { success: true, message: "Mahasiswa berhasil ditambahkan ke kelas!" };
}

// 3. Mengeluarkan mahasiswa dari kelas (Unenroll)
function unenrollStudent(courseId, userId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ENROLLMENTS");
  var data = sheet.getDataRange().getValues();

  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]).trim() === String(courseId).trim() &&
        String(data[i][2]).trim() === String(userId).trim()) {
      sheet.deleteRow(i + 1);

      // Cache: daftar mahasiswa & ranking berubah
      invalidateCourseCache(courseId);
      // Cache personal mahasiswa ini juga dihapus
      cacheRemove('paket_personal_' + courseId + '_' + userId);

      return { success: true, message: "Mahasiswa berhasil dikeluarkan dari kelas!" };
    }
  }
  return { success: false, message: "Gagal: Data mahasiswa tidak ditemukan." };
}

// ==========================================
// FITUR CRUD DOSEN: MANAJEMEN MATERI
// ==========================================

// 1. Menambah Materi Baru
function tambahMateri(courseId, title, urlDrive) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("MATERIALS");
  var materialId = "M-" + new Date().getTime();
  sheet.appendRow([materialId, courseId, title, urlDrive]);

  // Cache: daftar materi berubah
  invalidateCourseCache(courseId);

  return { success: true, message: "Materi berhasil ditambahkan!" };
}

// 2. Menghapus Materi (Beserta Log Tracker-nya)
function hapusMateri(materialId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var matSheet = ss.getSheetByName("MATERIALS");
  var matData = matSheet.getDataRange().getValues();

  var courseId = null;

  for (var i = matData.length - 1; i >= 1; i--) {
    if (String(matData[i][0]).trim() === String(materialId).trim()) {
      courseId = String(matData[i][1]).trim(); // Ambil courseId sebelum dihapus
      matSheet.deleteRow(i + 1);
      break;
    }
  }

  var trackSheet = ss.getSheetByName("MATERIAL_TRACK");
  if (trackSheet) {
    var trackData = trackSheet.getDataRange().getValues();
    for (var j = trackData.length - 1; j >= 1; j--) {
      if (String(trackData[j][2]).trim() === String(materialId).trim()) {
        trackSheet.deleteRow(j + 1);
      }
    }
  }

  // Cache: materi & ranking berubah
  if (courseId) invalidateCourseCache(courseId);

  return { success: true, message: "Materi dan riwayat baca mahasiswa berhasil dihapus!" };
}

// ==========================================
// FITUR CRUD DOSEN: MANAJEMEN KUIS
// ==========================================
function tambahKuis(courseId, title, urlForm) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("QUIZ");
  var quizId = "Q-" + new Date().getTime();
  sheet.appendRow([quizId, courseId, title, urlForm]);

  // Cache: daftar kuis berubah
  invalidateCourseCache(courseId);

  return { success: true, message: "Kuis berhasil ditambahkan!" };
}

function hapusKuis(quizId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("QUIZ");
  var data = sheet.getDataRange().getValues();

  var courseId = null;

  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === String(quizId).trim()) {
      courseId = String(data[i][1]).trim(); // Ambil courseId sebelum dihapus
      sheet.deleteRow(i + 1);
      break;
    }
  }

  var trackSheet = ss.getSheetByName("QUIZ_TRACK");
  if (trackSheet) {
    var trackData = trackSheet.getDataRange().getValues();
    for (var j = trackData.length - 1; j >= 1; j--) {
      if (String(trackData[j][2]).trim() === String(quizId).trim()) trackSheet.deleteRow(j + 1);
    }
  }

  // Cache: kuis & ranking berubah
  if (courseId) invalidateCourseCache(courseId);

  return { success: true, message: "Kuis dan riwayat pengerjaan berhasil dihapus!" };
}

// ==========================================
// FITUR CRUD DOSEN: MANAJEMEN LESSON LEARN
// ==========================================
function tambahLesson(courseId, topic, deadline) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("LESSON_ASSIGN");
  var assignId = "L-" + new Date().getTime();
  sheet.appendRow([assignId, courseId, topic, deadline]);

  // Cache: daftar lesson berubah
  invalidateCourseCache(courseId);

  return { success: true, message: "Tugas Lesson Learn berhasil ditambahkan!" };
}

function hapusLesson(assignId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("LESSON_ASSIGN");
  var data = sheet.getDataRange().getValues();

  var courseId = null;

  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).trim() === String(assignId).trim()) {
      courseId = String(data[i][1]).trim(); // Ambil courseId sebelum dihapus
      sheet.deleteRow(i + 1);
      break;
    }
  }

  var submitSheet = ss.getSheetByName("LESSON_SUBMIT");
  if (submitSheet) {
    var submitData = submitSheet.getDataRange().getValues();
    for (var j = submitData.length - 1; j >= 1; j--) {
      if (String(submitData[j][1]).trim() === String(assignId).trim()) submitSheet.deleteRow(j + 1);
    }
  }

  // Cache: lesson & ranking berubah
  if (courseId) invalidateCourseCache(courseId);

  return { success: true, message: "Lesson Learn dan data presensi mahasiswa berhasil dihapus!" };
}

// ==========================================
// FITUR BARU: BATCH ENROLL (MEMASUKKAN BANYAK MAHASISWA SEKALIGUS)
// ==========================================
function enrollStudentsBatch(courseId, userIds) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ENROLLMENTS");
  for (var i = 0; i < userIds.length; i++) {
    var enrollmentId = "E-" + new Date().getTime() + "-" + i;
    sheet.appendRow([enrollmentId, courseId, userIds[i]]);
  }

  // Cache: daftar mahasiswa & ranking berubah
  invalidateCourseCache(courseId);

  return { success: true, message: userIds.length + " Mahasiswa berhasil ditambahkan ke kelas!" };
}

// ==========================================
// FITUR BARU: REKAPITULASI NILAI MAHASISWA
// ==========================================

// Fungsi untuk menarik data nilai berdasarkan Mata Kuliah dan ID Mahasiswa
function getRekapNilaiMahasiswa(courseId, userId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("NILAI");
  
  // Jika sheet NILAI belum dibuat, kembalikan array kosong
  if (!sheet) return []; 
  
  var data = sheet.getDataRange().getValues();
  var nilaiList = [];
  
  // Looping untuk mencari data yang cocok dengan courseId dan userId
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(courseId).trim() && 
        String(data[i][1]).trim() === String(userId).trim()) {
      
      // Masukkan ke dalam daftar nilai jika cocok
      nilaiList.push({
        jenis_nilai: String(data[i][2]),
        nilai: data[i][3]
      });
    }
  }
  
  return nilaiList;
}

// ==========================================
// FITUR BARU DOSEN: MANAJEMEN NILAI
// ==========================================

// 1. Menyimpan nilai baru ke dalam Sheet "NILAI"
function tambahNilaiMahasiswa(courseId, userId, jenisNilai, nilai) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("NILAI");
  if (!sheet) {
    sheet = ss.insertSheet("NILAI");
    sheet.appendRow(["course_id", "user_id", "jenis_nilai", "nilai"]);
  }
  sheet.appendRow([courseId, userId, jenisNilai, nilai]);

  // Cache: nilai kelas & nilai personal mahasiswa berubah
  invalidateCourseCache(courseId);
  cacheRemove('paket_personal_' + courseId + '_' + userId);

  return { success: true, message: "Nilai berhasil disimpan!" };
}

// 2. Mengambil semua data nilai di suatu kelas untuk ditampilkan di tabel Dosen
function getSemuaNilaiKelas(courseId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("NILAI");
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var users = getSheetData("USERS"); // Ambil data user untuk mencocokkan nama
  var listNilai = [];
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(courseId).trim()) {
      var uid = String(data[i][1]).trim();
      var namaLengkap = "Mahasiswa Tidak Ditemukan";
      
      // Cari nama mahasiswa berdasarkan user_id
      var userMatch = users.find(function(u) { return String(u.user_id).trim() === uid; });
      if (userMatch) { namaLengkap = userMatch.nama_lengkap; }
      
      listNilai.push({
        row_index: i + 1, // Menyimpan nomor baris untuk fitur Hapus
        user_id: uid,
        nama: namaLengkap,
        jenis_nilai: data[i][2],
        nilai: data[i][3]
      });
    }
  }
  
  return listNilai;
}

// 3. Menghapus data nilai (berdasarkan nomor baris di spreadsheet)
function hapusNilaiMahasiswa(rowIndex) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("NILAI");
  if (!sheet) return { success: false, message: "Gagal menghapus nilai." };

  // Ambil courseId & userId dari baris yang akan dihapus, sebelum dihapus
  var data = sheet.getDataRange().getValues();
  var courseId = null;
  var userId   = null;
  if (data[rowIndex - 1]) {
    courseId = String(data[rowIndex - 1][0]).trim();
    userId   = String(data[rowIndex - 1][1]).trim();
  }

  sheet.deleteRow(rowIndex);

  // Cache: nilai kelas & nilai personal mahasiswa berubah
  if (courseId) {
    invalidateCourseCache(courseId);
    if (userId) cacheRemove('paket_personal_' + courseId + '_' + userId);
  }

  return { success: true, message: "Data nilai berhasil dihapus!" };
}

// ==========================================
// FITUR BARU: KALENDER PERTEMUAN (JADWAL)
// ==========================================

// 1. Tambah Jadwal Baru
function tambahJadwal(courseId, pertemuan, tanggal, waktu, mode, lokasiLink) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("JADWAL");
  if (!sheet) {
    sheet = ss.insertSheet("JADWAL");
    sheet.appendRow(["course_id", "pertemuan", "tanggal", "waktu", "mode", "lokasi_link"]);
  }
  sheet.appendRow([courseId, pertemuan, tanggal, waktu, mode, lokasiLink]);

  // Cache: jadwal berubah
  invalidateCourseCache(courseId);

  return { success: true, message: "Jadwal berhasil ditambahkan!" };
}

// 2. Ambil Data Jadwal (DIPERBAIKI DENGAN FITUR AUTO-HIDE 1x24 JAM)
function getJadwalKelas(courseId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("JADWAL");
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getDisplayValues(); 
  var jadwalList = [];
  
  // Ambil waktu saat ini dalam milidetik
  var waktuSekarangMs = new Date().getTime(); 
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(courseId).trim()) {
      var tanggalStr = String(data[i][2]).trim(); // Format: DD-MM-YYYY
      var waktuStr = String(data[i][3]).trim();   // Format: HH:MM
      
      // Memecah string tanggal dan waktu
      var tParts = tanggalStr.split("-");
      var wParts = waktuStr.split(":");
      
      // Pastikan format tanggal dan waktu valid sebelum diproses
      if (tParts.length === 3 && wParts.length >= 2) {
        var hari = parseInt(tParts[0], 10);
        var bulan = parseInt(tParts[1], 10) - 1; // Di Javascript, bulan dimulai dari 0 (0 = Januari)
        var tahun = parseInt(tParts[2], 10);
        if (tahun < 100) tahun += 2000;
        
        var jam = parseInt(wParts[0], 10);
        var menit = parseInt(wParts[1], 10);
        
        // Buat objek waktu spesifik kapan kelas tersebut dimulai
        var waktuKelasMs = new Date(tahun, bulan, hari, jam, menit, 0).getTime();
        
        // Tambahkan batas kedaluwarsa 24 jam (24 jam * 60 mnt * 60 dtk * 1000 ms)
        var batasKedaluwarsaMs = waktuKelasMs + (24 * 60 * 60 * 1000);
        
        // FILTER: Hanya masukkan ke list jika waktu sekarang MASIH KURANG dari batas kedaluwarsa
        if (waktuSekarangMs <= batasKedaluwarsaMs) {
          jadwalList.push({
            row_index: i + 1,
            pertemuan: data[i][1],
            tanggal: tanggalStr,
            waktu: waktuStr,
            mode: data[i][4],
            lokasi_link: data[i][5]
          });
        }
        // Jika sudah lewat 24 jam, data akan dilewati (diabaikan dari dashboard)
      } 
      else {
        // Jika format input tanggal/waktu dari dosen tidak standar/error, tetap tampilkan agar tidak hilang
        jadwalList.push({
          row_index: i + 1,
          pertemuan: data[i][1],
          tanggal: tanggalStr,
          waktu: waktuStr,
          mode: data[i][4],
          lokasi_link: data[i][5]
        });
      }
    }
  }
  
  return jadwalList;
}

// 3. Hapus Jadwal
function hapusJadwal(rowIndex) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("JADWAL");
  if (!sheet) return { success: false, message: "Gagal menghapus jadwal." };

  // Ambil courseId sebelum dihapus
  var data = sheet.getDataRange().getValues();
  var courseId = null;
  if (data[rowIndex - 1]) {
    courseId = String(data[rowIndex - 1][0]).trim();
  }

  sheet.deleteRow(rowIndex);

  // Cache: jadwal berubah
  if (courseId) invalidateCourseCache(courseId);

  return { success: true, message: "Jadwal berhasil dihapus!" };
}

function getPaketDataRuangKelas(courseId, userId) {

  var keyKelas    = 'paket_kelas_'    + courseId;
  var keyPersonal = 'paket_personal_' + courseId + '_' + userId;

  var dataKelas    = cacheGet(keyKelas);
  var dataPersonal = cacheGet(keyPersonal);

  // 1. CACHE KELAS UMUM (TANPA KUIS)
  if (!dataKelas) {
    dataKelas = { materials: [], jadwal: [], lessons: [] }; // Kuis dikeluarkan dari sini
    try { dataKelas.materials = getCourseMaterials(courseId); } catch(e) {}
    try { dataKelas.jadwal    = getJadwalKelas(courseId);     } catch(e) {}
    try { dataKelas.lessons   = getCourseLessons(courseId);   } catch(e) {}
    cachePut(keyKelas, dataKelas);
  }

  // 2. CACHE PERSONAL MAHASISWA (KUIS PINDAH KE SINI)
  if (!dataPersonal) {
    dataPersonal = { nilai: [], submittedLessonIds: [], quizzes: [] };
    try { dataPersonal.nilai              = getRekapNilaiMahasiswa(courseId, userId); } catch(e) {}
    try { dataPersonal.submittedLessonIds = getSubmittedLessonIds(userId);            } catch(e) {}
    try { dataPersonal.quizzes            = getCourseQuizzes(courseId, userId);       } catch(e) {} // AMAN: Kuis disimpan secara personal
    cachePut(keyPersonal, dataPersonal);
  }

  // 3. FILTER LESSON (Logika Brilian dari Claude)
  var lessonsBelumDijawab = dataKelas.lessons.filter(function(l) {
    return dataPersonal.submittedLessonIds.indexOf(String(l.assign_id)) === -1;
  });

  return {
    materials : dataKelas.materials,
    quizzes   : dataPersonal.quizzes, // Mengambil kuis dari area personal
    jadwal    : dataKelas.jadwal,
    lessons   : lessonsBelumDijawab,
    nilai     : dataPersonal.nilai
  };
}

// ==========================================
// FITUR BARU: IMPOR KONTEN DARI KELAS LAIN (SMART IMPORT ANTI DUPLIKASI)
// ==========================================
function importKontenKelas(sourceCourseId, targetCourseId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var sourceMaterials = getSheetData("MATERIALS").filter(function(m) { return String(m.course_id).trim() === String(sourceCourseId).trim(); });
  var sourceQuizzes   = getSheetData("QUIZ").filter(function(q) { return String(q.course_id).trim() === String(sourceCourseId).trim(); });
  var sourceLessons   = getSheetData("LESSON_ASSIGN").filter(function(l) { return String(l.course_id).trim() === String(sourceCourseId).trim(); });

  if (sourceMaterials.length === 0 && sourceQuizzes.length === 0 && sourceLessons.length === 0) {
    return { success: false, message: "Kelas sumber tidak memiliki materi, kuis, atau presensi untuk diimpor." };
  }

  var targetMaterials = getSheetData("MATERIALS").filter(function(m) { return String(m.course_id).trim() === String(targetCourseId).trim(); });
  var targetQuizzes   = getSheetData("QUIZ").filter(function(q) { return String(q.course_id).trim() === String(targetCourseId).trim(); });
  var targetLessons   = getSheetData("LESSON_ASSIGN").filter(function(l) { return String(l.course_id).trim() === String(targetCourseId).trim(); });

  var existingMatTitles    = targetMaterials.map(function(m) { return String(m.title).toLowerCase().trim(); });
  var existingQuizTitles   = targetQuizzes.map(function(q) { return String(q.title).toLowerCase().trim(); });
  var existingLessonTopics = targetLessons.map(function(l) { return String(l.topic).toLowerCase().trim(); });

  var timeBase = new Date().getTime();
  var countMat = 0, countQuiz = 0, countLesson = 0;

  if (sourceMaterials.length > 0) {
    var matSheet = ss.getSheetByName("MATERIALS");
    for (var i = 0; i < sourceMaterials.length; i++) {
      if (existingMatTitles.indexOf(String(sourceMaterials[i].title).toLowerCase().trim()) === -1) {
        matSheet.appendRow(["M-" + timeBase + "-IMP" + i, targetCourseId, sourceMaterials[i].title, sourceMaterials[i].url_drive]);
        countMat++;
      }
    }
  }

  if (sourceQuizzes.length > 0) {
    var quizSheet = ss.getSheetByName("QUIZ");
    for (var j = 0; j < sourceQuizzes.length; j++) {
      if (existingQuizTitles.indexOf(String(sourceQuizzes[j].title).toLowerCase().trim()) === -1) {
        quizSheet.appendRow(["Q-" + timeBase + "-IMP" + j, targetCourseId, sourceQuizzes[j].title, sourceQuizzes[j].url_form]);
        countQuiz++;
      }
    }
  }

  if (sourceLessons.length > 0) {
    var lessonSheet = ss.getSheetByName("LESSON_ASSIGN");
    for (var k = 0; k < sourceLessons.length; k++) {
      if (existingLessonTopics.indexOf(String(sourceLessons[k].topic).toLowerCase().trim()) === -1) {
        lessonSheet.appendRow(["L-" + timeBase + "-IMP" + k, targetCourseId, sourceLessons[k].topic, sourceLessons[k].deadline]);
        countLesson++;
      }
    }
  }

  // Cache: konten kelas target berubah
  if (countMat + countQuiz + countLesson > 0) {
    invalidateCourseCache(targetCourseId);
  }

  var totalAdded = countMat + countQuiz + countLesson;
  if (totalAdded === 0) {
    return { success: true, message: "Tidak ada data baru yang diimpor. Semua konten dari kelas sumber sudah ada di kelas ini." };
  }
  return { success: true, message: "Berhasil mengimpor konten baru: " + countMat + " Materi, " + countQuiz + " Kuis, dan " + countLesson + " Presensi!" };
}

// ==========================================
// FITUR BARU: IMPORT NILAI BATCH (EXCEL/CSV)
// ==========================================
function importNilaiBatch(courseId, jenisNilai, dataNilaiArray) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("NILAI");
  if (!sheet) {
    sheet = ss.insertSheet("NILAI");
    sheet.appendRow(["course_id", "user_id", "jenis_nilai", "nilai"]);
  }

  var enrollments = getSheetData("ENROLLMENTS").filter(function(e) { return String(e.course_id).trim() === String(courseId).trim(); });
  var validNIMs   = enrollments.map(function(e) { return String(e.user_id).trim(); });
  var countSuccess = 0;

  for (var i = 0; i < dataNilaiArray.length; i++) {
    var nim   = String(dataNilaiArray[i].nim).trim();
    var nilai = dataNilaiArray[i].nilai;
    if (validNIMs.indexOf(nim) !== -1) {
      sheet.appendRow([courseId, nim, jenisNilai, nilai]);
      countSuccess++;
    }
  }

  // Cache: nilai seluruh kelas berubah, plus cache personal setiap mahasiswa yang nilainya diimport
  if (countSuccess > 0) {
    invalidateCourseCache(courseId);
    // Hapus juga cache personal setiap mahasiswa yang nilainya diimport
    for (var j = 0; j < dataNilaiArray.length; j++) {
      cacheRemove('paket_personal_' + courseId + '_' + String(dataNilaiArray[j].nim).trim());
    }
  }

  return { success: true, message: countSuccess + " data nilai berhasil diimpor ke kelas!" };
}

function getPaketDataAnalitikKelas(courseId) {
  var cacheKey = 'paket_analitik_' + courseId;
  var cached   = cacheGet(cacheKey);
  if (cached) return cached;

  var paket = {
    materials : getCourseMaterials(courseId),
    quizzes   : getCourseQuizzes(courseId),
    lessons   : getCourseLessons(courseId),
    students  : getStudentManagementData(courseId),
    rankings  : getStudentRankings(courseId),
    inactive  : getInactiveStudents(courseId),
    nilai     : getSemuaNilaiKelas(courseId),
    jadwal    : getJadwalKelas(courseId)
  };

  cachePut(cacheKey, paket);
  return paket;
}

// ══════════════════════════════════════════════
//  CACHE UTILITY
//  Simpan dan ambil data dari ScriptCache GAS
//  Max per entry: 100KB | Max TTL: 21600 detik (6 jam)
// ══════════════════════════════════════════════

var CACHE_TTL = 300; // 5 menit (ubah sesuai kebutuhan)

function cacheGet(key) {
  try {
    var raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch(e) {
    return null;
  }
}

function cachePut(key, data) {
  try {
    var str = JSON.stringify(data);
    // CacheService max 100KB per entry
    // Jika data terlalu besar, skip caching (jangan crash)
    if (str.length < 95000) {
      CacheService.getScriptCache().put(key, str, CACHE_TTL);
    }
  } catch(e) {
    // Gagal cache tidak boleh membuat fungsi utama crash
    Logger.log('Cache write failed: ' + e.message);
  }
}

function cacheRemove(key) {
  try {
    CacheService.getScriptCache().remove(key);
  } catch(e) {}
}

// Hapus semua cache yang terkait satu courseId
function invalidateCourseCache(courseId) {
  var keys = [
    'paket_analitik_' + courseId,
    'paket_kelas_'    + courseId, // <-- BARIS INI WAJIB ADA AGAR MATERI BARU LANGSUNG MUNCUL
    'materials_'      + courseId,
    'quizzes_'        + courseId,
    'lessons_'        + courseId,
    'students_'       + courseId,
    'rankings_'       + courseId,
    'inactive_'       + courseId,
    'nilai_'          + courseId,
    'jadwal_'         + courseId
  ];
  CacheService.getScriptCache().removeAll(keys);
}

// Mengambil daftar assign_id yang sudah dijawab oleh mahasiswa tertentu
function getSubmittedLessonIds(userId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("LESSON_SUBMIT");
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var ids = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim() === String(userId).trim()) {
      var assignId = String(data[i][1]).trim();
      if (ids.indexOf(assignId) === -1) ids.push(assignId);
    }
  }
  return ids;
}

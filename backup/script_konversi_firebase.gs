// ============================================================
// FILE: migration.gs
// Jalankan fungsi migrasiSemuaKeFirebase() SATU KALI saja
// dari Apps Script Editor setelah mengisi FIREBASE_URL di bawah
// ============================================================

var FIREBASE_URL = "FIREBASE URL";
// Ganti YOUR-PROJECT-ID dengan Project ID Firebase Anda

// ── HELPER: Kirim data ke Firebase via REST API ──────────────
function fbPut(path, data) {
  var url     = FIREBASE_URL + "/" + path + ".json";
  var options = {
    method:      "put",
    contentType: "application/json",
    payload:     JSON.stringify(data),
    muteHttpExceptions: true
  };
  var res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() !== 200) {
    Logger.log("❌ PUT gagal [" + path + "]: " + res.getContentText());
    return false;
  }
  return true;
}

function fbPatch(path, data) {
  var url     = FIREBASE_URL + "/" + path + ".json";
  var options = {
    method:      "patch",
    contentType: "application/json",
    payload:     JSON.stringify(data),
    muteHttpExceptions: true
  };
  var res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() !== 200) {
    Logger.log("❌ PATCH gagal [" + path + "]: " + res.getContentText());
    return false;
  }
  return true;
}

// Buat key aman untuk Firebase (tidak boleh ada . # $ [ ] /)
function safeKey(str) {
  return String(str).replace(/[.#$\[\]\/]/g, "_");
}

function safeJenisNilai(str) {
  // Jenis nilai bisa mengandung spasi dan karakter khusus
  // Encode sederhana: ganti karakter terlarang
  return String(str).replace(/[.#$\[\]\/]/g, "_");
}


// ════════════════════════════════════════════════════════════
// FUNGSI UTAMA — panggil ini dari Editor
// ════════════════════════════════════════════════════════════
function migrasiSemuaKeFirebase() {
  Logger.log("🚀 Memulai migrasi ke Firebase...");

  migrasiCourses();
  Utilities.sleep(500);

  migrasiEnrollments();
  Utilities.sleep(500);

  migrasiMaterials();
  Utilities.sleep(500);

  migrasiQuiz();
  Utilities.sleep(500);

  migrasiNilai();
  Utilities.sleep(500);

  migrasiGradeConfig();
  Utilities.sleep(500);

  migrasiJadwal();
  Utilities.sleep(500);

  migrasiLessonAssign();
  Utilities.sleep(500);

  migrasiLessonSubmit();
  Utilities.sleep(500);

  migrasiCbtQuestions();
  Utilities.sleep(500);

  migrasiCbtSettings();
  Utilities.sleep(500);

  migrasiCbtSubmissions();
  Utilities.sleep(500);

  migrasiCbtSessions();
  Utilities.sleep(500);

  migrasiDeviceBinding();

  Logger.log("✅ Migrasi selesai!");
}

// ── X. USERS ───────────────────────────────────────────────
function migrasiUsers() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("USERS");
  
  if (!sheet) { 
    Logger.log("⚠️ Sheet USERS tidak ada"); 
    return; 
  }

  var data  = sheet.getDataRange().getValues();
  var count = 0;

  // Mulai dari i = 1 untuk melewati baris header
  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var userId = String(row[0]).trim(); // Kolom A: user_id
    
    // Lewati baris jika ID kosong
    if (!userId) continue;

    // Menentukan lokasi folder di Firebase (menyamakan struktur Claude)
    var path = "aqualearn/users/" + safeKey(userId);

    // Mengirim data ke Firebase
    fbPut(path, {
      password:     String(row[1]).trim(), // Kolom B: password
      nama_lengkap: String(row[2]).trim(), // Kolom C: nama_lengkap
      role:         String(row[3]).trim()  // Kolom D: role
    });
    
    count++;
  }
  
  Logger.log("✅ USERS: " + count + " records berhasil dimigrasi");
}

// ── 1. COURSES ───────────────────────────────────────────────
function migrasiCourses() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("COURSES");
  if (!sheet) { Logger.log("⚠️ Sheet COURSES tidak ada"); return; }

  var data  = sheet.getDataRange().getValues();
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    var row      = data[i];
    var courseId = String(row[0]).trim();
    if (!courseId) continue;

    fbPut("aqualearn/courses/" + safeKey(courseId), {
      course_name: String(row[1]).trim(),
      dosen_id:    String(row[2]).trim()
    });
    count++;
  }
  Logger.log("✅ COURSES: " + count + " records");
}


// ── 2. ENROLLMENTS ───────────────────────────────────────────
// Struktur: enrollments/{course_id}/{user_id} = true
function migrasiEnrollments() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("ENROLLMENTS");
  if (!sheet) { Logger.log("⚠️ Sheet ENROLLMENTS tidak ada"); return; }

  var data = sheet.getDataRange().getValues();

  // Kelompokkan per course agar PATCH sekali per course
  var grouped = {};
  for (var i = 1; i < data.length; i++) {
    var row      = data[i];
    var courseId = String(row[1]).trim();
    var userId   = String(row[2]).trim();
    if (!courseId || !userId) continue;

    var key = safeKey(courseId);
    if (!grouped[key]) grouped[key] = {};
    grouped[key][safeKey(userId)] = true;
  }

  var count = 0;
  Object.keys(grouped).forEach(function(cKey) {
    fbPut("aqualearn/enrollments/" + cKey, grouped[cKey]);
    count += Object.keys(grouped[cKey]).length;
  });
  Logger.log("✅ ENROLLMENTS: " + count + " records");
}


// ── 3. MATERIALS ─────────────────────────────────────────────
function migrasiMaterials() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("MATERIALS");
  if (!sheet) { Logger.log("⚠️ Sheet MATERIALS tidak ada"); return; }

  var data  = sheet.getDataRange().getValues();
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var mid = String(row[0]).trim();
    if (!mid) continue;

    fbPut("aqualearn/materials/" + safeKey(mid), {
      course_id: String(row[1]).trim(),
      title:     String(row[2]).trim(),
      url_drive: String(row[3]).trim()
    });
    count++;
  }
  Logger.log("✅ MATERIALS: " + count + " records");
}


// ── 4. QUIZ ──────────────────────────────────────────────────
function migrasiQuiz() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("QUIZ");
  if (!sheet) { Logger.log("⚠️ Sheet QUIZ tidak ada"); return; }

  var data  = sheet.getDataRange().getValues();
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var qid = String(row[0]).trim();
    if (!qid) continue;

    fbPut("aqualearn/quiz/" + safeKey(qid), {
      course_id: String(row[1]).trim(),
      title:     String(row[2]).trim(),
      url_form:  String(row[3]).trim()
    });
    count++;
  }
  Logger.log("✅ QUIZ: " + count + " records");
}


// ── 5. NILAI ─────────────────────────────────────────────────
// Struktur: nilai/{course_id}/{user_id}/{jenis_key} = {jenis, nilai}
function migrasiNilai() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("NILAI");
  if (!sheet) { Logger.log("⚠️ Sheet NILAI tidak ada"); return; }

  var data    = sheet.getDataRange().getValues();
  var grouped = {}; // { courseKey: { userKey: { jenisKey: {jenis, nilai} } } }

  for (var i = 1; i < data.length; i++) {
    var row      = data[i];
    var courseId = String(row[0]).trim();
    var userId   = String(row[1]).trim();
    var jenis    = String(row[2]).trim();
    var nilai    = parseFloat(row[3]);
    if (!courseId || !userId || !jenis || isNaN(nilai)) continue;

    var cKey = safeKey(courseId);
    var uKey = safeKey(userId);
    var jKey = safeJenisNilai(jenis);

    if (!grouped[cKey])         grouped[cKey]         = {};
    if (!grouped[cKey][uKey])   grouped[cKey][uKey]   = {};
    grouped[cKey][uKey][jKey] = { jenis: jenis, nilai: nilai };
  }

  var count = 0;
  Object.keys(grouped).forEach(function(cKey) {
    fbPut("aqualearn/nilai/" + cKey, grouped[cKey]);
    count += Object.keys(grouped[cKey]).length;
  });
  Logger.log("✅ NILAI: " + count + " mahasiswa ter-migrasi");
}


// ── 6. GRADE_CONFIG ──────────────────────────────────────────
function migrasiGradeConfig() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("GRADE_CONFIG");
  if (!sheet) { Logger.log("⚠️ Sheet GRADE_CONFIG tidak ada"); return; }

  var data  = sheet.getDataRange().getValues();
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    var row      = data[i];
    var courseId = String(row[0]).trim();
    if (!courseId) continue;

    var bobot = {};
    try { bobot = JSON.parse(row[1] || "{}"); } catch(e) {}

    var isReleased = row[2] === true || String(row[2]).toUpperCase() === "TRUE";

    fbPut("aqualearn/grade_config/" + safeKey(courseId), {
      bobot:       bobot,
      is_released: isReleased
    });
    count++;
  }
  Logger.log("✅ GRADE_CONFIG: " + count + " records");
}


// ── 7. JADWAL ────────────────────────────────────────────────
function migrasiJadwal() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("JADWAL");
  if (!sheet) { Logger.log("⚠️ Sheet JADWAL tidak ada"); return; }

  var data    = sheet.getDataRange().getValues();
  var grouped = {};
  var count   = 0;

  for (var i = 1; i < data.length; i++) {
    var row      = data[i];
    var courseId = String(row[0]).trim();
    if (!courseId) continue;

    var jadwalId = "J-" + (Date.now() + i); // generate id unik
    var cKey     = safeKey(courseId);
    if (!grouped[cKey]) grouped[cKey] = {};

    grouped[cKey][jadwalId] = {
      pertemuan:   String(row[1]).trim(),
      tanggal:     String(row[2]).trim(),
      waktu:       String(row[3]).trim(),
      mode:        String(row[4]).trim(),
      lokasi_link: String(row[5]).trim()
    };
    count++;
  }

  Object.keys(grouped).forEach(function(cKey) {
    fbPut("aqualearn/jadwal/" + cKey, grouped[cKey]);
  });
  Logger.log("✅ JADWAL: " + count + " records");
}


// ── 8. LESSON_ASSIGN ─────────────────────────────────────────
function migrasiLessonAssign() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("LESSON_ASSIGN");
  if (!sheet) { Logger.log("⚠️ Sheet LESSON_ASSIGN tidak ada"); return; }

  var data  = sheet.getDataRange().getValues();
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var aid = String(row[0]).trim();
    if (!aid) continue;

    fbPut("aqualearn/lesson_assign/" + safeKey(aid), {
      course_id: String(row[1]).trim(),
      topic:     String(row[2]).trim(),
      deadline:  String(row[3]).trim()
    });
    count++;
  }
  Logger.log("✅ LESSON_ASSIGN: " + count + " records");
}


// ── 9. LESSON_SUBMIT ─────────────────────────────────────────
// Struktur: lesson_submit/{course_id}/{assign_id}/{user_id}
function migrasiLessonSubmit() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Bangun map assignId → courseId dari LESSON_ASSIGN
  var assignMap = {};
  var laSheet   = ss.getSheetByName("LESSON_ASSIGN");
  if (laSheet) {
    var laData = laSheet.getDataRange().getValues();
    for (var j = 1; j < laData.length; j++) {
      if (laData[j][0]) assignMap[String(laData[j][0]).trim()] = String(laData[j][1]).trim();
    }
  }

  var sheet = ss.getSheetByName("LESSON_SUBMIT");
  if (!sheet) { Logger.log("⚠️ Sheet LESSON_SUBMIT tidak ada"); return; }

  var data  = sheet.getDataRange().getValues();
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    var row      = data[i];
    var assignId = String(row[1]).trim();
    var userId   = String(row[2]).trim();
    if (!assignId || !userId) continue;

    var courseId = assignMap[assignId] || "unknown";
    var path     = "aqualearn/lesson_submit/" + safeKey(courseId)
                 + "/" + safeKey(assignId)
                 + "/" + safeKey(userId);

    fbPut(path, {
      insight:   String(row[3]).trim(),
      status:    String(row[4]).trim() || "Hadir",
      timestamp: row[5] ? new Date(row[5]).toISOString() : new Date().toISOString()
    });
    count++;
  }
  Logger.log("✅ LESSON_SUBMIT: " + count + " records");
}


// ── 10. CBT_QUESTIONS ────────────────────────────────────────
// Struktur: cbt_questions/{quiz_id}/{question_id}
function migrasiCbtQuestions() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("CBT_QUESTIONS");
  if (!sheet) { Logger.log("⚠️ Sheet CBT_QUESTIONS tidak ada"); return; }

  var data    = sheet.getDataRange().getValues();
  var grouped = {};
  var count   = 0;

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var qId    = String(row[0]).trim();
    var quizId = String(row[1]).trim();
    if (!qId || !quizId) continue;

    var options = [];
    try { options = JSON.parse(row[4] || "[]"); } catch(e) {}

    var qKey = safeKey(quizId);
    if (!grouped[qKey]) grouped[qKey] = {};

    grouped[qKey][safeKey(qId)] = {
      type:           String(row[2]).trim(),
      text:           String(row[3]).trim(),
      options:        options,
      correct_answer: String(row[5]).trim(),
      points:         parseFloat(row[6]) || 0
    };
    count++;
  }

  Object.keys(grouped).forEach(function(qKey) {
    fbPut("aqualearn/cbt_questions/" + qKey, grouped[qKey]);
  });
  Logger.log("✅ CBT_QUESTIONS: " + count + " records");
}


// ── 11. CBT_SETTINGS ─────────────────────────────────────────
function migrasiCbtSettings() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("CBT_SETTINGS");
  if (!sheet) { Logger.log("⚠️ Sheet CBT_SETTINGS tidak ada"); return; }

  var data  = sheet.getDataRange().getValues();
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var quizId = String(row[0]).trim();
    if (!quizId) continue;

    fbPut("aqualearn/cbt_settings/" + safeKey(quizId), {
      deadline:         String(row[1]).trim(),
      duration_minutes: parseInt(row[2]) || 0
    });
    count++;
  }
  Logger.log("✅ CBT_SETTINGS: " + count + " records");
}


// ── 12. CBT_SUBMISSIONS ──────────────────────────────────────
// Struktur: cbt_submissions/{quiz_id}/{user_id}
function migrasiCbtSubmissions() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("CBT_SUBMISSIONS");
  if (!sheet) { Logger.log("⚠️ Sheet CBT_SUBMISSIONS tidak ada"); return; }

  var data  = sheet.getDataRange().getValues();
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var quizId = String(row[1]).trim();
    var userId = String(row[2]).trim();
    if (!quizId || !userId) continue;

    var path = "aqualearn/cbt_submissions/" + safeKey(quizId) + "/" + safeKey(userId);

    fbPut(path, {
      answers_json:   String(row[3]).trim(),
      total_score:    parseFloat(row[4]) || 0,
      timestamp:      row[5] ? new Date(row[5]).toISOString() : new Date().toISOString(),
      violations:     parseInt(row[6]) || 0,
      essay_feedback: String(row[7] || "").trim()
    });
    count++;
  }
  Logger.log("✅ CBT_SUBMISSIONS: " + count + " records");
}


// ── 13. CBT_SESSIONS ─────────────────────────────────────────
function migrasiCbtSessions() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("CBT_SESSIONS");
  if (!sheet) { Logger.log("⚠️ Sheet CBT_SESSIONS tidak ada"); return; }

  var data  = sheet.getDataRange().getValues();
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var quizId = String(row[1]).trim();
    var userId = String(row[2]).trim();
    if (!quizId || !userId) continue;

    var path = "aqualearn/cbt_sessions/" + safeKey(quizId) + "/" + safeKey(userId);

    fbPut(path, {
      start_time: row[3] ? new Date(row[3]).toISOString() : new Date().toISOString()
    });
    count++;
  }
  Logger.log("✅ CBT_SESSIONS: " + count + " records");
}


// ── 14. DEVICE_BINDING ───────────────────────────────────────
function migrasiDeviceBinding() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("DEVICE_BINDING");
  if (!sheet) { Logger.log("⚠️ Sheet DEVICE_BINDING tidak ada"); return; }

  var data  = sheet.getDataRange().getValues();
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var userId = String(row[0]).trim();
    if (!userId) continue;

    fbPut("aqualearn/device_binding/" + safeKey(userId), {
      device_token:  String(row[1]).trim(),
      waktu_tertaut: row[2] ? new Date(row[2]).toISOString() : new Date().toISOString()
    });
    count++;
  }
  Logger.log("✅ DEVICE_BINDING: " + count + " records");
}

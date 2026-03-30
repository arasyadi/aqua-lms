// File: cbt_backend.gs

var GEMINI_API_KEY = "GEMINI API AI";

// 1. Mengambil soal untuk ditampilkan ke mahasiswa (Kunci jawaban dihilangkan demi keamanan)
function getCbtQuestions(quizId) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CBT_QUESTIONS");
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  
  var questions = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === String(quizId).trim()) {
      questions.push({
        question_id: data[i][0],
        type: data[i][2], // "PG" atau "ESSAY"
        text: data[i][3],
        options: data[i][4] ? JSON.parse(data[i][4]) : [], // Contoh: ["A. Ikan", "B. Sapi"]
        points: data[i][6] // Bobot poin soal ini
      });
    }
  }
  return questions;
}

// 2. Memproses pengumpulan ujian
function submitCbtExam(quizId, userId, answersObj) {
  var sheetSoal = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CBT_QUESTIONS");
  var dataSoal = sheetSoal.getDataRange().getValues();
  
  var totalScore = 0;
  var maxScore = 0;

  for (var i = 1; i < dataSoal.length; i++) {
    if (String(dataSoal[i][1]).trim() === String(quizId).trim()) {
      var qId   = dataSoal[i][0];
      var type  = dataSoal[i][2];
      var correctAnswer = String(dataSoal[i][5]).trim();
      var maxPoint = parseFloat(dataSoal[i][6]) || 0;
      maxScore += maxPoint;
      
      var userAnswer = answersObj[qId] || "";
      if (type === "PG") {
        if (String(userAnswer).trim().toLowerCase() === correctAnswer.toLowerCase()) {
          totalScore += maxPoint;
        }
      }
    }
  }

  var finalGrade = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
  finalGrade = Math.round(finalGrade * 100) / 100;

  // ✅ FIX: Ekstrak violations SEBELUM di-stringify, lalu hapus dari objek jawaban
  var jumlahPelanggaran = parseInt(answersObj._violations) || 0;
  delete answersObj._violations;

  var sheetSubmit = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CBT_SUBMISSIONS");
  if (!sheetSubmit) {
    sheetSubmit = SpreadsheetApp.getActiveSpreadsheet().insertSheet("CBT_SUBMISSIONS");
    // ✅ FIX: Header lengkap 8 kolom
    sheetSubmit.appendRow(["submit_id","quiz_id","user_id","answers_json","total_score","timestamp","violations","essay_feedback"]);
  }

  // ✅ FIX: Simpan violations di kolom ke-7 (G), essay_feedback kolom ke-8 (H) kosong dulu
  sheetSubmit.appendRow([
    "CBT-SUB-" + new Date().getTime(),
    quizId,
    userId,
    JSON.stringify(answersObj),
    finalGrade,
    new Date(),
    jumlahPelanggaran,   // kolom G — ANGKA
    ""                   // kolom H — diisi AI nanti
  ]);
  
  return { success: true, score: finalGrade, message: "Ujian berhasil diselesaikan!" };
}

// ==========================================
// KOREKSI ESSAY OTOMATIS (GEMINI 2.5 FLASH)
// ==========================================
function nilaiEssayDenganGemini(soal, rubrik, jawabanMhs, maxPoin) {
  // 1. TEMPELKAN API KEY BARU ANDA DI SINI
  var apiKey = "GEMINI API AI"; 
  
  // 2. Endpoint Gemini 2.5 Flash
  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;

  // 3. Prompt Penilaian (Sesuai eksperimen Anda yang sangat akurat)
  var promptText = 
    "Kamu adalah sistem CBT penilai otomatis. Kamu harus adil dan objektif.\n" +
    "Pertanyaan: " + soal + "\n" +
    "Kunci Jawaban / Rubrik: " + rubrik + "\n" +
    "Jawaban Mahasiswa: " + jawabanMhs + "\n\n" +
    "Tugasmu:\n" +
    "1. Berikan nilai skala 0 sampai " + maxPoin + " berdasarkan tingkat kemiripan makna jawaban mahasiswa dengan kunci jawaban.\n" +
    "2. Berikan alasan singkat maksimal 2 kalimat.\n" +
    "Wajib balas dengan format persis seperti ini: NILAI: [angka] | ALASAN: [teks]";

  var payload = {
    "contents": [{
      "parts": [{"text": promptText}]
    }]
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true // Mencegah script crash jika API limit
  };

  // 4. Eksekusi & Pemisahan Output
  try {
    var response = UrlFetchApp.fetch(url, options);
    var json = JSON.parse(response.getContentText());
    
    if (json.error) {
      Logger.log("❌ ERROR DARI GEMINI: " + json.error.message);
      // Jika error, kembalikan objek skor 0 dan alasan errornya
      return { skor: 0, alasan: "Gagal dinilai: " + json.error.message }; 
    }
    
    // Tarik balasan murni dari AI (Contoh: "NILAI: 85 | ALASAN: Bla bla bla")
    var hasilAI = json.candidates[0].content.parts[0].text;
    
    // Gunakan Regex untuk mengekstrak hanya angkanya saja
    var skorMatch = hasilAI.match(/NILAI:\s*(\d+(\.\d+)?)/i);
    var skorFinal = 0;
    
    if (skorMatch && skorMatch[1]) {
       var skorAngka = parseFloat(skorMatch[1]);
       // Cegah AI ngawur memberi nilai melebihi poin maksimal
       skorFinal = skorAngka > maxPoin ? maxPoin : skorAngka;
    }
    
    // KEMBALIKAN DUA DATA SEKALIGUS (Skor Angka & Teks Alasan)
    return { skor: skorFinal, alasan: hasilAI };
    
  } catch (error) {
    Logger.log("❌ Terjadi kesalahan sistem: " + error.toString());
    return { skor: 0, alasan: "Kesalahan sistem: " + error.toString() };
  }
}

// Fungsi untuk setup database khusus fitur CBT (Berjalan terpisah)
function setupCBTDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Definisi sheet khusus CBT
  var cbtSheetsData = [
    {
      name: "CBT_QUESTIONS",
      // type: "PG" atau "ESSAY"
      // options: array JSON format teks, contoh: '["A. Ikan", "B. Sapi"]'
      headers: ["question_id", "quiz_id", "type", "text", "options", "correct_answer", "points"],
      data: [
        // Contoh Data Dummy Soal PG
        ["Q-001", "KUIS-01", "PG", "Apa ibukota Indonesia?", '["A. Jakarta", "B. Bandung", "C. Surabaya"]', "A. Jakarta", 10],
        // Contoh Data Dummy Soal Essay
        ["Q-002", "KUIS-01", "ESSAY", "Jelaskan proses fotosintesis secara singkat!", "", "Fotosintesis adalah proses tumbuhan mengubah sinar matahari, air, dan karbon dioksida menjadi oksigen dan energi dalam bentuk gula.", 90]
      ]
    },
    {
      name: "CBT_SUBMISSIONS",
      headers: ["submit_id", "quiz_id", "user_id", "answers_json", "total_score", "timestamp"],
      data: [] // Dibiarkan kosong, akan terisi otomatis saat mahasiswa submit
    }
  ];

  // Looping untuk membuat setiap sheet CBT
  for (var i = 0; i < cbtSheetsData.length; i++) {
    var info = cbtSheetsData[i];
    var sheet = ss.getSheetByName(info.name);
    
    // Buat sheet jika belum ada
    if (!sheet) {
      sheet = ss.insertSheet(info.name);
    } else {
      // Bersihkan isi jika sheet sudah ada agar tidak tumpang tindih
      sheet.clear(); 
    }
    
    // Set Header dan cetak tebal (Bold)
    sheet.getRange(1, 1, 1, info.headers.length).setValues([info.headers]).setFontWeight("bold");
    
    // Set data awal/dummy jika ada
    if (info.data.length > 0) {
      sheet.getRange(2, 1, info.data.length, info.headers.length).setValues(info.data);
    }
  }
}

// Ambil daftar quiz berdasarkan courseId (untuk dropdown)
function getQuizzesForCourse(courseId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var safeCourseId = String(courseId).trim();
  var quizMap = {}; // { quizId: title } — pakai Map untuk deduplikasi otomatis

  // ── SUMBER 1: Scan COURSE_QUIZZES ──
  // Sheet ini menyimpan kuis yang ditambahkan via "Tambah Kuis/Tugas"
  // Cari baris yang course_id-nya cocok DAN URL-nya mengandung CBT quizId
  var cqSheet = ss.getSheetByName("COURSE_QUIZZES");
  if (cqSheet) {
    var cqData = cqSheet.getDataRange().getValues();
    
    for (var i = 1; i < cqData.length; i++) {
      var row = cqData[i];
      // Cek semua kolom karena urutan kolom bisa beda-beda
      var rowStr = row.join("|||");
      
      // Baris ini harus milik kelas yang sedang aktif
      var isMilikKelasIni = row.some(function(cell) {
        return String(cell).trim() === safeCourseId;
      });
      if (!isMilikKelasIni) continue;

      // Cari kolom URL yang mengandung CBT quizId
      for (var c = 0; c < row.length; c++) {
        var cellVal = String(row[c]);
        if (cellVal.indexOf("quizId=") > -1) {
          // Ekstrak quizId dari URL: ?page=cbt&quizId=KUIS-xxx
          var match = cellVal.match(/quizId=([^&\s]+)/);
          if (match && match[1]) {
            var extractedId = match[1].trim();
            // Ambil judul dari kolom lain (biasanya kolom title ada di row)
            var judulKolom = "";
            for (var t = 0; t < row.length; t++) {
              var v = String(row[t]).trim();
              if (v && v !== safeCourseId && v.indexOf("http") === -1 
                  && v.indexOf("quizId") === -1 && v !== extractedId) {
                judulKolom = v;
                break;
              }
            }
            quizMap[extractedId] = judulKolom || extractedId;
          }
        }
      }
    }
  }

  // ── SUMBER 2: Scan CBT_QUESTIONS langsung ──
  // Fallback untuk quiz lama yang tidak terdaftar di COURSE_QUIZZES
  // Strategi: ambil SEMUA quiz_id unik dari CBT_QUESTIONS,
  // lalu filter hanya yang ada di COURSE_QUIZZES milik kelas ini
  // ATAU tampilkan semua jika tidak ada di COURSE_QUIZZES sama sekali
  var qSheet = ss.getSheetByName("CBT_QUESTIONS");
  if (qSheet) {
    var qData = qSheet.getDataRange().getValues();
    
    // Kumpulkan semua quiz_id unik dari CBT_QUESTIONS
    var semuaQuizId = {};
    for (var j = 1; j < qData.length; j++) {
      var qId = String(qData[j][1]).trim(); // Kolom B = quiz_id
      if (qId) semuaQuizId[qId] = true;
    }

    // Untuk setiap quiz_id, cek apakah terdaftar di COURSE_QUIZZES
    // Jika iya → sudah masuk via Sumber 1
    // Jika tidak → coba cek apakah ada di CBT_SUBMISSIONS milik kelas ini
    Object.keys(semuaQuizId).forEach(function(qId) {
      if (quizMap[qId]) return; // Sudah ada dari Sumber 1, skip

      // Cek di CBT_SUBMISSIONS: apakah quiz ini pernah dikerjakan mahasiswa di kelas ini?
      // Cara: cek apakah user_id dari submission ini terdaftar di ENROLLED_USERS kelas ini
      var subSheet = ss.getSheetByName("CBT_SUBMISSIONS");
      if (subSheet) {
        var subData = subSheet.getDataRange().getValues();
        var enrolledSheet = ss.getSheetByName("ENROLLED_USERS");
        
        // Kumpulkan user_id yang terdaftar di kelas ini
        var enrolledIds = {};
        if (enrolledSheet) {
          var eData = enrolledSheet.getDataRange().getValues();
          for (var e = 1; e < eData.length; e++) {
            var col1 = String(eData[e][1]).trim();
            var col2 = String(eData[e][2]).trim();
            if (col1 === safeCourseId) enrolledIds[col2] = true;
            else if (col2 === safeCourseId) enrolledIds[col1] = true;
          }
        }

        for (var s = 1; s < subData.length; s++) {
          if (String(subData[s][1]).trim() === qId) {
            var submittingUser = String(subData[s][2]).trim();
            if (enrolledIds[submittingUser]) {
              // Quiz ini pernah dikerjakan mahasiswa di kelas ini
              quizMap[qId] = qId; // Gunakan ID sebagai judul fallback
              break;
            }
          }
        }
      }

      // Fallback terakhir: jika quiz ini ada di CBT_SETTINGS, masukkan juga
      // (untuk quiz yang belum pernah dikerjakan siapapun tapi sudah disetting)
      var settingsSheet = ss.getSheetByName("CBT_SETTINGS");
      if (settingsSheet && !quizMap[qId]) {
        var settData = settingsSheet.getDataRange().getValues();
        for (var st = 1; st < settData.length; st++) {
          if (String(settData[st][0]).trim() === qId) {
            quizMap[qId] = qId;
            break;
          }
        }
      }
    });
  }

  // Konversi Map ke Array untuk dikembalikan ke frontend
  return Object.keys(quizMap).map(function(id) {
    return { quizId: id, title: quizMap[id] !== id ? quizMap[id] : "" };
  });
}

// Update saveCbtQuestion — auto-register ke COURSE_QUIZZES jika ID baru
function saveCbtQuestion(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("CBT_QUESTIONS");
  if (!sheet) return { success: false, message: "Sheet CBT_QUESTIONS belum ada!" };

  var questionId = "Q-" + new Date().getTime();
  sheet.appendRow([
    questionId, data.quizId, data.type, data.text,
    JSON.stringify(data.options || []), data.correctAnswer, data.points
  ]);

  // ✅ Auto-register quiz ke COURSE_QUIZZES jika belum ada
  if (data.courseId) {
    var cqSheet = ss.getSheetByName("COURSE_QUIZZES");
    if (cqSheet) {
      var cqData = cqSheet.getDataRange().getValues();
      var sudahAda = false;
      for (var i = 1; i < cqData.length; i++) {
        if (String(cqData[i][0]).trim() === String(data.quizId).trim() &&
            String(cqData[i][1]).trim() === String(data.courseId).trim()) {
          sudahAda = true; break;
        }
      }
      if (!sudahAda) {
        cqSheet.appendRow([data.quizId, data.courseId, "Kuis CBT", new Date()]);
      }
    }
  }

  return { success: true, message: "Soal berhasil ditambahkan ke " + data.quizId + "!" };
}

// Update saveCbtSettings — tambah parameter durationMinutes
function saveCbtSettings(quizId, deadlineStr, durationMinutes) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("CBT_SETTINGS");
  if (!sheet) {
    sheet = ss.insertSheet("CBT_SETTINGS");
    // ✅ Schema baru: 3 kolom
    sheet.appendRow(["quiz_id", "deadline", "duration_minutes"]);
  }

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(quizId).trim()) {
      sheet.getRange(i + 1, 2).setValue(deadlineStr || "");
      sheet.getRange(i + 1, 3).setValue(durationMinutes || 0);
      return { success: true, message: "Pengaturan waktu kuis " + quizId + " diperbarui!" };
    }
  }
  sheet.appendRow([quizId, deadlineStr || "", durationMinutes || 0]);
  return { success: true, message: "Pengaturan waktu kuis " + quizId + " disimpan!" };
}

// Fungsi baru: Catat waktu mulai mahasiswa & kembalikan sisa durasi
function startCbtSession(quizId, userId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Ambil durasi dari settings
  var durasiMenit = 0;
  var setSheet = ss.getSheetByName("CBT_SETTINGS");
  if (setSheet) {
    var setData = setSheet.getDataRange().getValues();
    for (var i = 1; i < setData.length; i++) {
      if (String(setData[i][0]).trim() === String(quizId).trim()) {
        durasiMenit = parseInt(setData[i][2]) || 0;
        break;
      }
    }
  }

  // Cek apakah sesi sudah ada (reconnect — jangan reset timer!)
  var sessSheet = ss.getSheetByName("CBT_SESSIONS");
  if (!sessSheet) {
    sessSheet = ss.insertSheet("CBT_SESSIONS");
    sessSheet.appendRow(["session_id", "quiz_id", "user_id", "start_time"]);
  }

  var sessData = sessSheet.getDataRange().getValues();
  var startTime = null;

  for (var i = 1; i < sessData.length; i++) {
    if (String(sessData[i][1]).trim() === String(quizId).trim() &&
        String(sessData[i][2]).trim() === String(userId).trim()) {
      startTime = new Date(sessData[i][3]).getTime(); // Sesi lama ditemukan
      break;
    }
  }

  // Jika belum ada sesi, buat baru
  if (!startTime) {
    startTime = new Date().getTime();
    sessSheet.appendRow(["SESS-" + startTime, quizId, userId, new Date(startTime)]);
  }

  // Hitung sisa waktu
  var now = new Date().getTime();
  var sisaMs = durasiMenit > 0
    ? (startTime + durasiMenit * 60 * 1000) - now
    : -1; // -1 = tidak ada batas durasi

  return {
    startTime:      startTime,
    durationMs:     durasiMenit * 60 * 1000,
    remainingMs:    sisaMs,
    hasDuration:    durasiMenit > 0
  };
}

// 2. Validasi akses mahasiswa (Double Submit & Deadline)
function validateCbtAccess(quizId, userId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Cek double submit
  var subSheet = ss.getSheetByName("CBT_SUBMISSIONS");
  if (subSheet) {
    var subData = subSheet.getDataRange().getValues();
    for (var i = 1; i < subData.length; i++) {
      if (String(subData[i][1]).trim() === String(quizId).trim() &&
          String(subData[i][2]).trim() === String(userId).trim()) {
        return { allowed: false, reason: "submitted", score: subData[i][4] };
      }
    }
  }

  var deadline = null, durasiMenit = 0;
  var setSheet = ss.getSheetByName("CBT_SETTINGS");
  if (setSheet) {
    var setData = setSheet.getDataRange().getValues();
    for (var i = 1; i < setData.length; i++) {
      if (String(setData[i][0]).trim() === String(quizId).trim()) {
        deadline     = setData[i][1] ? new Date(setData[i][1]).getTime() : null;
        durasiMenit  = parseInt(setData[i][2]) || 0;
        break;
      }
    }
  }

  // Cek deadline
  if (deadline && new Date().getTime() > deadline) {
    return { allowed: false, reason: "deadline" };
  }

  // ✅ Cek apakah sesi durasi sudah habis
  if (durasiMenit > 0) {
    var sessSheet = ss.getSheetByName("CBT_SESSIONS");
    if (sessSheet) {
      var sessData = sessSheet.getDataRange().getValues();
      for (var i = 1; i < sessData.length; i++) {
        if (String(sessData[i][1]).trim() === String(quizId).trim() &&
            String(sessData[i][2]).trim() === String(userId).trim()) {
          var startTime  = new Date(sessData[i][3]).getTime();
          var expireTime = startTime + durasiMenit * 60 * 1000;
          if (new Date().getTime() > expireTime) {
            return { allowed: false, reason: "timeout" };
          }
          break;
        }
      }
    }
  }

  return { allowed: true };
}

// Merekap Data untuk Dashboard Dosen (Revisi Tipe Data)
function getCbtAnalytics(quizId, courseIdParams) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var safeQuizId = String(quizId).trim();
  var safeCourseId = courseIdParams ? String(courseIdParams).trim() : null;

  // 1. BACA TAB 'USERS' (KOLOM A=NIM, KOLOM C=NAMA)
  var userMap = {};
  var uSheet = ss.getSheetByName("USERS");
  if (uSheet) {
    var uData = uSheet.getDataRange().getValues();
    for (var i = 1; i < uData.length; i++) {
      var nim = String(uData[i][0]).trim();  // Kolom A (NIM)
      var nama = String(uData[i][2]).trim(); // Kolom C (Nama Mahasiswa) <--- PERBAIKAN DI SINI
      userMap[nim] = nama;
    }
  }

  // 2. Jika Course ID kosong, coba cari lewat tab COURSE_QUIZZES
  if (!safeCourseId) {
    var qSheet = ss.getSheetByName("COURSE_QUIZZES");
    if (qSheet) {
      var qData = qSheet.getDataRange().getValues();
      for (var i = 1; i < qData.length; i++) {
        var rowStr = qData[i].join("|||");
        if (rowStr.indexOf(safeQuizId) > -1) {
          safeCourseId = String(qData[i][1]).trim(); 
          break;
        }
      }
    }
  }

  var allStudents = [];
  
  // 3. Ambil daftar mahasiswa dari ENROLLED_USERS
  if (safeCourseId) {
    var eSheet = ss.getSheetByName("ENROLLED_USERS");
    if (eSheet) {
      var eData = eSheet.getDataRange().getValues();
      for (var i = 1; i < eData.length; i++) {
        var col1 = String(eData[i][1]).trim();
        var col2 = String(eData[i][2]).trim();
        var uid = null;
        
        if (col1 === safeCourseId) uid = col2;
        else if (col2 === safeCourseId) uid = col1;
        
        if (uid) {
           // Tarik nama dari kamus userMap
           var namaMhs = userMap[uid] || "Unknown";
           allStudents.push({ userId: uid, nama: namaMhs, status: 'Belum', score: '-', violations: 0 });
        }
      }
    }
  }

  // 4. Proses data dari CBT_SUBMISSIONS
  var subSheet = ss.getSheetByName("CBT_SUBMISSIONS");
  var totalSudah = 0;
  
  if (subSheet) {
    var subData = subSheet.getDataRange().getValues();
    for (var i = 1; i < subData.length; i++) {
      if (String(subData[i][1]).trim() === safeQuizId) {
        var sUid = String(subData[i][2]).trim();
        var sScore = subData[i][4];
        var sVio = subData[i][6] || 0; 
        
        var found = false;
        
        // Cek apakah mahasiswa ini ada di dalam daftar kelas
        for (var k = 0; k < allStudents.length; k++) {
          if (String(allStudents[k].userId) === sUid) {
            allStudents[k].status = 'Sudah';
            allStudents[k].score = sScore;
            allStudents[k].violations = sVio;
            totalSudah++;
            found = true; 
            break;
          }
        }
        
        // Jika tidak ditemukan di ENROLLED_USERS, cari namanya di 'USERS'
        if (!found) {
          var namaAsli = userMap[sUid] ? userMap[sUid] : "Tidak Terdaftar di Database";
          
          allStudents.push({ 
            userId: sUid, 
            nama: namaAsli,
            status: 'Sudah', 
            score: sScore, 
            violations: sVio 
          });
          totalSudah++;
        }
      }
    }
  }
  
  return { total: allStudents.length, sudah: totalSudah, students: allStudents };
}

// ==========================================
// PROSES PENILAIAN ESSAY MASSAL OLEH DOSEN
// ==========================================
function prosesPenilaianEssayMasal(quizId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetSoal = ss.getSheetByName("CBT_QUESTIONS");
  var sheetSubmit = ss.getSheetByName("CBT_SUBMISSIONS");
  
  if (!sheetSoal || !sheetSubmit) return { success: false, message: "Database tidak ditemukan." };

  // 1. Kumpulkan semua soal Essay dari kuis ini beserta bobotnya
  var dataSoal = sheetSoal.getDataRange().getValues();
  var daftarEssay = [];
  var totalMaxScoreKuis = 0;

  for (var i = 1; i < dataSoal.length; i++) {
    if (String(dataSoal[i][1]).trim() === String(quizId).trim()) {
      totalMaxScoreKuis += (parseFloat(dataSoal[i][6]) || 0); 
      if (dataSoal[i][2] === "ESSAY") {
        daftarEssay.push({
          qId: dataSoal[i][0],
          text: dataSoal[i][3],
          rubrik: dataSoal[i][5],
          maxPoin: parseFloat(dataSoal[i][6]) || 0
        });
      }
    }
  }

  if (daftarEssay.length === 0) return { success: true, message: "Tidak ada soal Essay di kuis ini." };

  // 2. Ambil data jawaban mahasiswa
  var dataSubmit = sheetSubmit.getDataRange().getValues();
  var jumlahDiproses = 0;

  for (var s = 1; s < dataSubmit.length; s++) {
    if (String(dataSubmit[s][1]).trim() === String(quizId).trim()) {
      var row = s + 1;
      var answersObj = {};
      try { answersObj = JSON.parse(dataSubmit[s][3]); } catch(e) {}
      
      // Lewati jika sudah pernah dinilai oleh AI (menghemat kuota)
      if (answersObj._essayGraded) continue;

      var currentTotalScore = parseFloat(dataSubmit[s][4]) || 0; 
      var poinPgMentah = (currentTotalScore / 100) * totalMaxScoreKuis; 

      var tambahanSkorEssay = 0;
      var kumpulanAlasanAI = ""; // Wadah penampung teks alasan AI

      // 3. Eksekusi penilaian AI untuk setiap soal essay
      for (var e = 0; e < daftarEssay.length; e++) {
        var soal = daftarEssay[e];
        var jwbMhs = answersObj[soal.qId] || "";
        
        if (jwbMhs.trim() !== "") {
          // Panggil Gemini dan ambil kembalian berupa Objek {skor, alasan}
          var hasilAI = nilaiEssayDenganGemini(soal.text, soal.rubrik, jwbMhs, soal.maxPoin);
          
          tambahanSkorEssay += hasilAI.skor;
          
          // Format rapi untuk disimpan ke database
          kumpulanAlasanAI += "Soal: " + soal.text + "\nJawaban Mhs: " + jwbMhs + "\nCatatan AI: " + hasilAI.alasan + "\n\n";
          
          // JEDA AMAN (4 DETIK) -> Mencegah API Limit 15 Request Per Menit
          Utilities.sleep(4000); 
        }
      }

      // 4. Kalkulasi ulang nilai akhir ke skala 100
      var finalPoinBaru = poinPgMentah + tambahanSkorEssay;
      var finalSkor100 = totalMaxScoreKuis > 0 ? (finalPoinBaru / totalMaxScoreKuis) * 100 : 0;
      finalSkor100 = Math.round(finalSkor100 * 100) / 100;

      answersObj._essayGraded = true; // Tandai agar tidak dinilai ulang

      // 5. Simpan ke Spreadsheet
      sheetSubmit.getRange(row, 4).setValue(JSON.stringify(answersObj)); // Update JSON jawaban
      sheetSubmit.getRange(row, 5).setValue(finalSkor100);               // Update Skor Akhir
      sheetSubmit.getRange(row, 8).setValue(kumpulanAlasanAI);           // Simpan Alasan ke Kolom 8 (H)
      
      jumlahDiproses++;
    }
  }

  return { success: true, message: "Selesai! " + jumlahDiproses + " mahasiswa telah berhasil dinilai Essay-nya oleh AI." };
}

// Helper: ambil semua CBT settings sebagai Map {quizId: {deadline, duration}}
function getCbtSettingsMap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("CBT_SETTINGS");
  var map = {};
  if (!sheet) return map;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var qId = String(data[i][0]).trim();
    if (!qId) continue;
    map[qId] = {
      deadline:      data[i][1] ? String(data[i][1]) : "",
      durationMenit: parseInt(data[i][2]) || 0
    };
  }
  return map;
}

// Wrapper: ambil kuis milik kelas + enrich dengan info deadline & durasi CBT
// Dipanggil dari frontend MENGGANTIKAN getCourseQuizzes untuk view mahasiswa
function getCourseQuizzesWithCbtInfo(courseId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var safeCourseId = String(courseId).trim();

  // ── 1. Baca sheet QUIZ (schema: quiz_id | course_id | title | url_form) ──
  var quizSheet = ss.getSheetByName("QUIZ");
  if (!quizSheet) return [];

  var quizData = quizSheet.getDataRange().getValues();
  var quizzes  = [];

  // Baca juga riwayat akses mahasiswa dari QUIZ_TRACK
  // schema QUIZ_TRACK: track_id | user_id | quiz_id | timestamp
  var trackMap = {}; // { quiz_id: true } untuk userId aktif
  // userId tidak tersedia di backend, jadi kita skip dikerjakan-flag di sini
  // (flag dikerjakan tetap dihandle oleh getCourseQuizzes lama via QUIZ_TRACK)

  for (var i = 1; i < quizData.length; i++) {
    if (String(quizData[i][1]).trim() !== safeCourseId) continue;

    quizzes.push({
      quiz_id:    String(quizData[i][0]).trim(),
      course_id:  safeCourseId,
      title:      String(quizData[i][2]).trim(),
      url_form:   String(quizData[i][3]).trim(),
      dikerjakan: false, // akan di-enrich oleh frontend via QUIZ_TRACK jika perlu
      cbt_deadline:       "",
      cbt_duration_menit: 0
    });
  }

  // ── 2. Enrich dengan CBT_SETTINGS ──
  var cbtSettings = getCbtSettingsMap(); // fungsi ini sudah ada di cbt_backend.gs

  for (var j = 0; j < quizzes.length; j++) {
    var urlForm = quizzes[j].url_form;
    if (urlForm.indexOf("quizId=") === -1) continue; // bukan CBT, skip

    var match = urlForm.match(/quizId=([^&\s]+)/);
    if (!match || !match[1]) continue;

    var cbtQuizId = match[1].trim();
    var setting   = cbtSettings[cbtQuizId];
    if (!setting) continue;

    quizzes[j].cbt_deadline       = setting.deadline;
    quizzes[j].cbt_duration_menit = setting.durationMenit;
  }

  return quizzes;
}

// ==========================================
// SUBMIT NILAI CBT KE SHEET NILAI (SINKRON DENGAN IMPOR NILAI)
// ==========================================
function submitNilaiCbtKeGrades(quizId, courseIdParam, jenisNilai) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var safeQuizId = String(quizId).trim();

  // ── 1. Cari course_id dari sheet QUIZ ──
  // Schema QUIZ: quiz_id(0) | course_id(1) | title(2) | url_form(3)
  var safeCourseId = courseIdParam ? String(courseIdParam).trim() : null;

  if (!safeCourseId) {
    var quizSheet = ss.getSheetByName("QUIZ");
    if (quizSheet) {
      var quizData = quizSheet.getDataRange().getValues();
      for (var i = 1; i < quizData.length; i++) {
        var urlForm = String(quizData[i][3]).trim();
        if (urlForm.indexOf("quizId=" + safeQuizId) > -1) {
          safeCourseId = String(quizData[i][1]).trim();
          break;
        }
      }
    }
  }

  if (!safeCourseId) {
    return {
      success: false,
      message: "Gagal mendeteksi ID Kelas. Pastikan kuis sudah terdaftar di sheet QUIZ."
    };
  }

  // ── 2. Ambil semua submission dari CBT_SUBMISSIONS ──
  // Schema: submit_id(0) | quiz_id(1) | user_id(2) | answers_json(3) |
  //         total_score(4) | timestamp(5) | pelanggaran(6) | Penilaian_essay_ai(7)
  var subSheet = ss.getSheetByName("CBT_SUBMISSIONS");
  if (!subSheet) {
    return { success: false, message: "Sheet CBT_SUBMISSIONS tidak ditemukan." };
  }

  var subData = subSheet.getDataRange().getValues();

  // Deduplikasi: jika 1 mahasiswa submit lebih dari 1x, ambil baris TERAKHIR
  var submissionsMap = {}; // { user_id: total_score }
  for (var s = 1; s < subData.length; s++) {
    if (String(subData[s][1]).trim() !== safeQuizId) continue;
    var uid   = String(subData[s][2]).trim();
    var score = parseFloat(subData[s][4]) || 0;
    submissionsMap[uid] = score; // Overwrite → otomatis ambil yang terakhir
  }

  if (Object.keys(submissionsMap).length === 0) {
    return {
      success: false,
      message: "Belum ada mahasiswa yang mengumpulkan ujian ini."
    };
  }

  // ── 3. Upsert ke sheet NILAI ──
  // Schema NILAI: course_id(0) | user_id(1) | jenis_nilai(2) | nilai(3)
  var nilaiSheet = ss.getSheetByName("NILAI");
  if (!nilaiSheet) {
    nilaiSheet = ss.insertSheet("NILAI");
    nilaiSheet.appendRow(["course_id", "user_id", "jenis_nilai", "nilai"]);
    nilaiSheet.getRange("A1:D1").setFontWeight("bold");
  }

  var nilaiData      = nilaiSheet.getDataRange().getValues();
  var barisExisting  = {}; // { user_id: nomor_baris_1based }

  // Scan baris yang sudah ada dengan kombinasi course+user+jenis yang sama
  for (var n = 1; n < nilaiData.length; n++) {
    var nCourse = String(nilaiData[n][0]).trim();
    var nUser   = String(nilaiData[n][1]).trim();
    var nJenis  = String(nilaiData[n][2]).trim();
    if (nCourse === safeCourseId && nJenis === jenisNilai) {
      barisExisting[nUser] = n + 1; // Simpan nomor baris (1-based untuk getRange)
    }
  }

  var jumlahBaru       = 0;
  var jumlahDiperbarui = 0;

  Object.keys(submissionsMap).forEach(function(uid) {
    var nilaiAkhir = submissionsMap[uid];

    if (barisExisting[uid]) {
      // UPDATE baris yang sudah ada — hanya kolom nilai (kolom D = kolom 4)
      nilaiSheet.getRange(barisExisting[uid], 4).setValue(nilaiAkhir);
      jumlahDiperbarui++;
    } else {
      // INSERT baris baru
      nilaiSheet.appendRow([safeCourseId, uid, jenisNilai, nilaiAkhir]);
      jumlahBaru++;
    }
  });

  // ── 4. Invalidasi cache agar perubahan langsung terlihat di LMS ──
  invalidateCourseCache(safeCourseId);

  // Invalidasi cache personal setiap mahasiswa yang nilainya berubah
  Object.keys(submissionsMap).forEach(function(uid) {
    cacheRemove('paket_personal_' + safeCourseId + '_' + uid);
  });

  var pesan = "✅ Berhasil! ";
  if (jumlahBaru > 0)       pesan += jumlahBaru + " nilai baru ditambahkan. ";
  if (jumlahDiperbarui > 0) pesan += jumlahDiperbarui + " nilai diperbarui. ";
  pesan += "(Kelas: " + safeCourseId + " | Jenis: " + jenisNilai + ")";

  return { success: true, message: pesan };
}

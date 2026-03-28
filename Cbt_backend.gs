// File: cbt_backend.gs

var GEMINI_API_KEY = "API Gemini AI";

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
  var feedbackEssay = {};

  // Looping semua soal ujian ini untuk mencocokkan jawaban
  for (var i = 1; i < dataSoal.length; i++) {
    if (String(dataSoal[i][1]).trim() === String(quizId).trim()) {
      var qId = dataSoal[i][0];
      var type = dataSoal[i][2];
      var questionText = dataSoal[i][3];
      var correctAnswer = String(dataSoal[i][5]).trim(); // Kunci jawaban
      var maxPoint = parseFloat(dataSoal[i][6]) || 0;
      maxScore += maxPoint;
      
      var userAnswer = answersObj[qId] || "";

      // PENILAIAN PILIHAN GANDA (PG) SAJA SECARA REAL-TIME
      if (type === "PG") {
        if (String(userAnswer).trim().toLowerCase() === correctAnswer.toLowerCase()) {
          totalScore += maxPoint;
        }
      } 
      // PENILAIAN ESSAY DITUNDA
      else if (type === "ESSAY") {
        // Jangan panggil Gemini di sini. Biarkan skor sementara 0 atau null.
        // Kita hanya menyimpan jawaban mentahnya saja di database
      }
    }
  }

  // Kalkulasi nilai akhir ke skala 100 jika diperlukan
  var finalGrade = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
  finalGrade = Math.round(finalGrade * 100) / 100;

  // Simpan ke database CBT_SUBMISSIONS
  var sheetSubmit = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CBT_SUBMISSIONS");
  if (!sheetSubmit) {
    sheetSubmit = SpreadsheetApp.getActiveSpreadsheet().insertSheet("CBT_SUBMISSIONS");
    sheetSubmit.appendRow(["submit_id", "quiz_id", "user_id", "answers_json", "total_score", "timestamp"]);
  }
  sheetSubmit.appendRow(["CBT-SUB-" + new Date().getTime(), quizId, userId, JSON.stringify(answersObj), finalGrade, new Date()]);
  
  return { success: true, score: finalGrade, message: "Ujian berhasil diselesaikan!" };
}

// ==========================================
// KOREKSI ESSAY OTOMATIS (GEMINI 2.5 FLASH)
// ==========================================
function nilaiEssayDenganGemini(soal, rubrik, jawabanMhs, maxPoin) {
  // 1. TEMPELKAN API KEY BARU ANDA DI SINI
  // Pastikan Anda sudah menghapus API Key yang lama di Google AI Studio!
  var apiKey = "API GEMINI AI"; 
  
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

// Fungsi untuk menyimpan soal baru dari Dashboard Dosen
function saveCbtQuestion(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CBT_QUESTIONS");
  if (!sheet) {
    return { success: false, message: "Sheet CBT_QUESTIONS belum ada! Jalankan setupCBTDatabase terlebih dahulu." };
  }

  // Generate ID Soal yang unik
  var questionId = "Q-" + new Date().getTime();

  // Memasukkan baris baru: [question_id, quiz_id, type, text, options, correct_answer, points]
  sheet.appendRow([
    questionId,
    data.quizId,
    data.type,
    data.text,
    JSON.stringify(data.options || []), // Diubah jadi JSON String agar rapi di sel Sheets
    data.correctAnswer,
    data.points
  ]);

  return { success: true, message: "Soal berhasil ditambahkan!" };
}

// 1. Menyimpan pengaturan deadline dari dosen
function saveCbtSettings(quizId, deadlineStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("CBT_SETTINGS");
  if (!sheet) {
    sheet = ss.insertSheet("CBT_SETTINGS");
    sheet.appendRow(["quiz_id", "deadline"]);
  }
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === quizId) {
      sheet.getRange(i + 1, 2).setValue(deadlineStr);
      return { success: true, message: "Deadline diperbarui!" };
    }
  }
  sheet.appendRow([quizId, deadlineStr]);
  return { success: true, message: "Deadline disimpan!" };
}

// 2. Validasi akses mahasiswa (Double Submit & Deadline)
function validateCbtAccess(quizId, userId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Cek Double Submit
  var subSheet = ss.getSheetByName("CBT_SUBMISSIONS");
  if (subSheet) {
    var subData = subSheet.getDataRange().getValues();
    for (var i = 1; i < subData.length; i++) {
      if (subData[i][1] === quizId && String(subData[i][2]) === String(userId)) {
        return { allowed: false, reason: "submitted", score: subData[i][4] };
      }
    }
  }
  
  // Cek Deadline
  var setSheet = ss.getSheetByName("CBT_SETTINGS");
  if (setSheet) {
    var setData = setSheet.getDataRange().getValues();
    for (var i = 1; i < setData.length; i++) {
      if (setData[i][0] === quizId) {
        var deadlineStr = setData[i][1];
        if (deadlineStr) {
          var deadlineTime = new Date(deadlineStr).getTime();
          var nowTime = new Date().getTime();
          if (nowTime > deadlineTime) {
            return { allowed: false, reason: "deadline" };
          }
        }
        break;
      }
    }
  }
  return { allowed: true };
}

// 3. Modifikasi fungsi submitCbtExam (Tambahkan penangkap violations)
// CATATAN: Cari fungsi submitCbtExam Anda yang lama, lalu GANTI bagian paling bawahnya (sebelum 'return') menjadi seperti ini:
/* ... kode penilaian Gemini & PG sebelumnya ...
  var finalGrade = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
  finalGrade = Math.round(finalGrade * 100) / 100;

  var jumlahPelanggaran = answersObj._violations || 0; // Menangkap jumlah kecurangan
  delete answersObj._violations;

  var sheetSubmit = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CBT_SUBMISSIONS");
  if (!sheetSubmit) {
    sheetSubmit = SpreadsheetApp.getActiveSpreadsheet().insertSheet("CBT_SUBMISSIONS");
    sheetSubmit.appendRow(["submit_id", "quiz_id", "user_id", "answers_json", "total_score", "timestamp", "violations"]);
  }
  // Simpan data beserta jumlah pelanggaran di kolom ke-7
  sheetSubmit.appendRow(["CBT-SUB-" + new Date().getTime(), quizId, userId, JSON.stringify(answersObj), finalGrade, new Date(), jumlahPelanggaran]);
  
  return { success: true, score: finalGrade, message: "Ujian berhasil diselesaikan!" };
*/

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
      sheetSubmit.getRange(row, 7).setValue(kumpulanAlasanAI);           // Simpan Alasan ke Kolom 7 (G)
      
      jumlahDiproses++;
    }
  }

  return { success: true, message: "Selesai! " + jumlahDiproses + " mahasiswa telah berhasil dinilai Essay-nya oleh AI." };
}

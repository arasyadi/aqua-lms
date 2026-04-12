// File: cbt_backend.gs
// Semua operasi database telah dimigrasi ke Firebase.
// Fungsi fbGet, fbPut, fbPatch, fbDelete tersedia di firebase_backend.gs

var GEMINI_API_KEY     = "API GEMINI";
var TELEGRAM_BOT_TOKEN = "BOT TOKEN";
var TELEGRAM_CHAT_ID   = "ID";

// ============================================================
// 1. Mengambil soal untuk ditampilkan ke mahasiswa
//    (Kunci jawaban dihilangkan demi keamanan)
// ============================================================
function getCbtQuestions(quizId) {
  var data = fbGet("aqualearn/cbt_questions/" + quizId);
  if (!data) return [];

  var questions = [];
  for (var qId in data) {
    questions.push({
      question_id: qId,
      type:        data[qId].type,
      text:        data[qId].text,
      options:     data[qId].options || [],
      points:      data[qId].points  || 0,
      image_url:   data[qId].image_url || ""   // ← hilang
    });
  }
  return questions;
}


// ============================================================
// 2. Memproses pengumpulan ujian
// ============================================================
function submitCbtExam(quizId, userId, answersObj) {
  var dataSoal = fbGet("aqualearn/cbt_questions/" + quizId) || {};

  var totalScore = 0;
  var maxScore   = 0;

  for (var qId in dataSoal) {
    var type          = dataSoal[qId].type;
    var correctAnswer = String(dataSoal[qId].correct_answer).trim();
    var maxPoint      = parseFloat(dataSoal[qId].points) || 0;
    maxScore += maxPoint;

    var userAnswer = answersObj[qId] || "";
    if (type === "PG") {
      if (String(userAnswer).trim().toLowerCase() === correctAnswer.toLowerCase()) {
        totalScore += maxPoint;
      }
    }
  }

  var finalGrade = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
  finalGrade = Math.round(finalGrade * 100) / 100;

  var jumlahPelanggaran = parseInt(answersObj._violations) || 0;
  delete answersObj._violations;

  var submitData = {
    submit_id:      "CBT-SUB-" + new Date().getTime(),
    quiz_id:        quizId,
    user_id:        userId,
    answers_json:   JSON.stringify(answersObj),
    total_score:    finalGrade,
    timestamp:      new Date().toISOString(),
    violations:     jumlahPelanggaran,
    essay_feedback: ""
  };

  fbPut("aqualearn/cbt_submissions/" + quizId + "/" + userId, submitData);

  return { success: true, score: finalGrade, message: "Ujian berhasil diselesaikan!" };
}

// ============================================================
// 3. Menyimpan soal baru
// ============================================================
function saveCbtQuestion(data) {
  var questionId = "Q-" + new Date().getTime();

  var questionData = {
    quiz_id:        data.quizId,
    type:           data.type,
    text:           data.text,
    options:        data.options || [],
    correct_answer: data.correctAnswer,
    points:         data.points,
    image_url:      data.imageUrl || ""   // ← hilang
  };

  fbPut("aqualearn/cbt_questions/" + data.quizId + "/" + questionId, questionData);

  return { success: true, message: "Soal berhasil ditambahkan ke " + data.quizId + "!" };
}


// ============================================================
// 4. Menyimpan deadline dan durasi
// ============================================================
function saveCbtSettings(quizId, deadlineStr, durationMinutes) {
  var settingData = {
    deadline:         deadlineStr    || "",
    duration_minutes: durationMinutes || 0
  };

  fbPut("aqualearn/cbt_settings/" + quizId, settingData);
  return { success: true, message: "Pengaturan waktu kuis " + quizId + " disimpan!" };
}


// ============================================================
// 5. Catat waktu mulai & kembalikan sisa durasi
// ============================================================
function startCbtSession(quizId, userId) {
  var setting    = fbGet("aqualearn/cbt_settings/" + quizId) || {};
  var durasiMenit = parseInt(setting.duration_minutes) || 0;

  var sesiData  = fbGet("aqualearn/cbt_sessions/" + quizId + "/" + userId);
  var startTime = null;

  if (sesiData && sesiData.start_time) {
    // Sesi lama ditemukan — jangan reset timer
    startTime = new Date(sesiData.start_time).getTime();
  } else {
    // Buat sesi baru
    startTime = new Date().getTime();
    fbPut("aqualearn/cbt_sessions/" + quizId + "/" + userId, {
      session_id: "SESS-" + startTime,
      start_time: new Date(startTime).toISOString()
    });
  }

  var now   = new Date().getTime();
  var sisaMs = durasiMenit > 0
    ? (startTime + durasiMenit * 60 * 1000) - now
    : -1; // -1 = tidak ada batas durasi

  return {
    startTime:   startTime,
    durationMs:  durasiMenit * 60 * 1000,
    remainingMs: sisaMs,
    hasDuration: durasiMenit > 0
  };
}


// ============================================================
// 6. Validasi akses mahasiswa (Double Submit, Deadline, Timeout)
// ============================================================
function validateCbtAccess(quizId, userId) {
  // Cek double submit
  var submission = fbGet("aqualearn/cbt_submissions/" + quizId + "/" + userId);
  if (submission) {
    return { allowed: false, reason: "submitted", score: submission.total_score };
  }

  // Cek deadline & durasi dari settings
  var setting     = fbGet("aqualearn/cbt_settings/" + quizId) || {};
  var deadline    = setting.deadline ? new Date(setting.deadline).getTime() : null;
  var durasiMenit = parseInt(setting.duration_minutes) || 0;

  if (deadline && new Date().getTime() > deadline) {
    return { allowed: false, reason: "deadline" };
  }

  // Cek apakah sesi durasi sudah habis
  if (durasiMenit > 0) {
    var sesiData = fbGet("aqualearn/cbt_sessions/" + quizId + "/" + userId);
    if (sesiData && sesiData.start_time) {
      var startTime  = new Date(sesiData.start_time).getTime();
      var expireTime = startTime + durasiMenit * 60 * 1000;
      if (new Date().getTime() > expireTime) {
        return { allowed: false, reason: "timeout" };
      }
    }
  }

  return { allowed: true };
}


// ============================================================
// 7. Ambil analitik kuis untuk dashboard dosen
// ============================================================
function getCbtAnalytics(quizId, courseIdParams) {
  var safeCourseId = courseIdParams ? String(courseIdParams).trim() : null;

  // Fallback: cari course_id dari node quiz jika tidak dikirim
  if (!safeCourseId) {
    var quizInfo = fbGet("aqualearn/quiz/" + quizId);
    if (quizInfo && quizInfo.course_id) {
      safeCourseId = quizInfo.course_id;
    }
  }

  var usersData      = fbGet("aqualearn/users")       || {};
  var enrollmentsData = fbGet("aqualearn/enrollments") || {};
  var allStudents    = [];

  // Bangun daftar mahasiswa dari enrollments kelas
  if (safeCourseId) {
    var cKey    = safeKey(safeCourseId);
    var members = enrollmentsData[cKey] || {};
    for (var uKey in members) {
      var namaMhs = (usersData[uKey] && usersData[uKey].nama_lengkap)
                  ? usersData[uKey].nama_lengkap
                  : "Unknown";
      allStudents.push({
        userId:     uKey,
        nama:       namaMhs,
        status:     'Belum',
        score:      '-',
        violations: 0
      });
    }
  }

  var submissionsData = fbGet("aqualearn/cbt_submissions/" + quizId) || {};
  var totalSudah = 0;

  for (var sUid in submissionsData) {
    var sub   = submissionsData[sUid];
    var found = false;

    for (var k = 0; k < allStudents.length; k++) {
      if (allStudents[k].userId === sUid) {
        allStudents[k].status     = 'Sudah';
        allStudents[k].score      = sub.total_score;
        allStudents[k].violations = sub.violations || 0;
        totalSudah++;
        found = true;
        break;
      }
    }

    // Mahasiswa submit tapi tidak terdaftar di kelas (tampilkan saja)
    if (!found) {
      var namaAsli = (usersData[sUid] && usersData[sUid].nama_lengkap)
                   ? usersData[sUid].nama_lengkap
                   : "Tidak Terdaftar";
      allStudents.push({
        userId:     sUid,
        nama:       namaAsli,
        status:     'Sudah',
        score:      sub.total_score,
        violations: sub.violations || 0
      });
      totalSudah++;
    }
  }

  return { total: allStudents.length, sudah: totalSudah, students: allStudents };
}


// ============================================================
// 8. Proses penilaian essay massal oleh AI
// ============================================================
function prosesPenilaianEssayMasal(quizId) {
  var soalData   = fbGet("aqualearn/cbt_questions/"  + quizId);
  var submitData = fbGet("aqualearn/cbt_submissions/" + quizId);

  if (!soalData || !submitData) {
    return { success: false, message: "Data tidak ditemukan." };
  }

  // Kumpulkan soal essay dan total max score kuis
  var daftarEssay      = [];
  var totalMaxScoreKuis = 0;

  for (var qId in soalData) {
    var poin = parseFloat(soalData[qId].points) || 0;
    totalMaxScoreKuis += poin;
    if (soalData[qId].type === "ESSAY") {
      daftarEssay.push({
        qId:     qId,
        text:    soalData[qId].text,
        rubrik:  soalData[qId].correct_answer,
        maxPoin: poin
      });
    }
  }

  if (daftarEssay.length === 0) {
    return { success: true, message: "Tidak ada soal Essay di kuis ini." };
  }

  var updates       = {};
  var jumlahDiproses = 0;

  for (var sUid in submitData) {
    var rowData    = submitData[sUid];
    var answersObj = {};
    try { answersObj = JSON.parse(rowData.answers_json); } catch(e) {}

    // Lewati jika sudah pernah dinilai AI (hemat kuota)
    if (answersObj._essayGraded) continue;

    var currentTotalScore  = parseFloat(rowData.total_score) || 0;
    var poinPgMentah       = (currentTotalScore / 100) * totalMaxScoreKuis;
    var tambahanSkorEssay  = 0;
    var kumpulanAlasanAI   = "";

    for (var e = 0; e < daftarEssay.length; e++) {
      var soal   = daftarEssay[e];
      var jwbMhs = answersObj[soal.qId] || "";

      if (jwbMhs.trim() !== "") {
        var hasilAI = nilaiEssayDenganGemini(soal.text, soal.rubrik, jwbMhs, soal.maxPoin);
        tambahanSkorEssay  += hasilAI.skor;
        kumpulanAlasanAI   += "Catatan AI: " + hasilAI.alasan + "\n\n";
        Utilities.sleep(4000); // Jeda aman — cegah API limit 15 req/menit
      }
    }

    var finalPoinBaru = poinPgMentah + tambahanSkorEssay;
    var finalSkor100  = totalMaxScoreKuis > 0
                      ? (finalPoinBaru / totalMaxScoreKuis) * 100
                      : 0;
    finalSkor100 = Math.round(finalSkor100 * 100) / 100;

    answersObj._essayGraded = true;

    // Siapkan update batch agar lebih efisien (satu fbPatch per mahasiswa)
    updates[sUid + "/answers_json"]   = JSON.stringify(answersObj);
    updates[sUid + "/total_score"]    = finalSkor100;
    updates[sUid + "/essay_feedback"] = kumpulanAlasanAI;

    jumlahDiproses++;
  }

  if (jumlahDiproses > 0) {
    fbPatch("aqualearn/cbt_submissions/" + quizId, updates);
  }

  return {
    success: true,
    message: "Selesai! " + jumlahDiproses + " mahasiswa telah berhasil dinilai Essay-nya oleh AI."
  };
}


// ============================================================
// 9. Helper — ambil semua CBT settings sebagai Map
// ============================================================
function getCbtSettingsMap() {
  return fbGet("aqualearn/cbt_settings") || {};
}


// ============================================================
// 10. Ambil kuis milik kelas + enrich dengan deadline & durasi CBT
//     Dipanggil dari frontend MENGGANTIKAN getCourseQuizzes
// ============================================================
function getCourseQuizzesWithCbtInfo(courseId) {
  var quizzesData = fbGet("aqualearn/quiz") || {};
  var cbtSettings = getCbtSettingsMap();
  var quizzes     = [];

  for (var quizId in quizzesData) {
    var q = quizzesData[quizId];
    if (q.course_id !== courseId) continue;

    var deadline = "";
    var duration = 0;

    // Ekstrak cbtQuizId dari URL (misal: "...?page=cbt&quizId=KUIS-123")
    // Key di cbt_settings adalah KUIS-xxx, bukan quiz_id Firebase (Q-xxx)
    var urlForm   = q.url_form || "";
    var cbtQuizId = "";
    var match     = urlForm.match(/quizId=([^&\s]+)/);
    if (match && match[1]) {
      cbtQuizId = match[1].trim();
    }

    if (cbtQuizId && cbtSettings[cbtQuizId]) {
      deadline = cbtSettings[cbtQuizId].deadline          || "";
      duration = parseInt(cbtSettings[cbtQuizId].duration_minutes) || 0;
    }

    quizzes.push({
      quiz_id:            quizId,
      course_id:          courseId,
      title:              q.title    || "",
      url_form:           urlForm,
      dikerjakan:         false, // di-enrich oleh getPaketDataRuangKelas
      cbt_deadline:       deadline,
      cbt_duration_menit: duration
    });
  }

  return quizzes;
}


// ============================================================
// 10b. Ambil daftar kuis CBT milik kelas (untuk dropdown modal soal)
// ============================================================
function getQuizzesForCourse(courseId) {
  var quizzesData = fbGet("aqualearn/quiz") || {};
  var quizArray   = [];

  for (var docKey in quizzesData) {
    var q = quizzesData[docKey];
    if (q.course_id !== courseId) continue;

    if (q.url_form && q.url_form.indexOf("quizId=") > -1) {
      var match = q.url_form.match(/quizId=([^&\s]+)/);
      if (!match || !match[1]) continue;
      var cbtQuizId = match[1].trim();
      quizArray.push({ quizId: cbtQuizId, title: q.title || cbtQuizId });
    }
  }

  return quizArray;
}
// ============================================================
// 11. Sinkronisasi nilai CBT ke rekap nilai kelas
// ============================================================
function submitNilaiCbtKeGrades(quizId, courseIdParam, jenisNilai) {
  var safeCourseId = courseIdParam ? String(courseIdParam).trim() : null;

  // Fallback: cari course_id dari node quiz
  if (!safeCourseId) {
    var quizInfo = fbGet("aqualearn/quiz/" + quizId);
    if (quizInfo && quizInfo.course_id) {
      safeCourseId = quizInfo.course_id;
    }
  }

  if (!safeCourseId) {
    return { success: false, message: "Gagal mendeteksi ID Kelas." };
  }

  // Bangun daftar NIM yang terdaftar di kelas ini
  var cKey    = safeKey(safeCourseId);
  var members = fbGet("aqualearn/enrollments/" + cKey) || {};

  if (Object.keys(members).length === 0) {
    return {
      success: false,
      message: "Tidak ada mahasiswa terdaftar di kelas " + safeCourseId + "."
    };
  }

  var submissionsData  = fbGet("aqualearn/cbt_submissions/" + quizId) || {};
  var updateNilaiCount = 0;
  var jKey             = safeJenisNilai(jenisNilai);

  for (var uid in submissionsData) {
    var uKey = safeKey(uid);
    if (!members[uKey]) continue; // hanya mahasiswa kelas ini

    var score = parseFloat(submissionsData[uid].total_score) || 0;
    var path  = "aqualearn/nilai/" + cKey + "/" + uKey + "/" + jKey;

    // Simpan dalam format { jenis, nilai } agar konsisten dengan tambahNilaiMahasiswa
    fbPut(path, { jenis: jenisNilai, nilai: score });

    cacheRemove('paket_personal_' + safeCourseId + '_' + uid);
    updateNilaiCount++;
  }

  invalidateCourseCache(safeCourseId);

  return {
    success: true,
    message: "✅ Berhasil! " + updateNilaiCount + " nilai disinkronkan. (Kelas: " + safeCourseId + ")"
  };
}


// ============================================================
// 12. Reset ujian mahasiswa (submission + session + quiz_track)
// ============================================================
function resetUjianMahasiswaCBT(quizId, userId, courseId) {
  var count = 0;

  if (fbGet("aqualearn/cbt_submissions/" + quizId + "/" + userId)) {
    fbDelete("aqualearn/cbt_submissions/" + quizId + "/" + userId);
    count++;
  }

  if (fbGet("aqualearn/cbt_sessions/" + quizId + "/" + userId)) {
    fbDelete("aqualearn/cbt_sessions/" + quizId + "/" + userId);
    count++;
  }

  if (fbGet("aqualearn/quiz_track/" + safeKey(courseId) + "/" + safeKey(userId) + "/" + safeKey(quizId))) {
    fbDelete("aqualearn/quiz_track/" + safeKey(courseId) + "/" + safeKey(userId) + "/" + safeKey(quizId));
    count++;
  }

  if (courseId && userId) {
    cacheRemove('paket_personal_' + String(courseId).trim() + '_' + String(userId).trim());
    invalidateCourseCache(courseId);
  }

  if (count > 0) {
    return { success: true, message: "Data ujian berhasil direset!" };
  } else {
    return { success: false, message: "Mahasiswa ini belum memiliki riwayat pengerjaan." };
  }
}


// ============================================================
// 13. Hapus seluruh data sebuah kuis
// ============================================================
function hapusKuisDiBackend(quizId) {
  if (!quizId) throw new Error("ID Kuis kosong, penghapusan dibatalkan.");

  fbDelete("aqualearn/cbt_questions/"  + quizId);
  fbDelete("aqualearn/cbt_sessions/"   + quizId);
  fbDelete("aqualearn/cbt_submissions/" + quizId);
  fbDelete("aqualearn/cbt_settings/"   + quizId);

  return {
    success: true,
    message: "Kuis beserta semua data soal, sesi, dan jawaban berhasil dihapus."
  };
}


// ============================================================
// 14. Sistem keamanan — One-Time Token
// ============================================================
function buatTokenSesiCbt(userObj) {
  var tokenRahasisa = Utilities.getUuid();
  var expiredMs     = new Date().getTime() + (2 * 60 * 1000); // 2 menit

  fbPut("aqualearn/auth_tokens/" + tokenRahasisa, {
    user:    userObj,
    expired: expiredMs
  });

  return tokenRahasisa;
}

function validasiDanGunakanToken(tokenInput) {
  var tokenData = fbGet("aqualearn/auth_tokens/" + tokenInput);

  if (!tokenData) {
    return { success: false, message: "Akses Ditolak: Token tidak valid atau sudah hangus dipakai." };
  }

  // Hapus segera — one-time token, tidak bisa dipakai dua kali
  fbDelete("aqualearn/auth_tokens/" + tokenInput);

  var now = new Date().getTime();
  if (now > tokenData.expired) {
    return { success: false, message: "Token sudah kedaluwarsa. Silakan buka ulang dari LMS." };
  }

  return { success: true, user: tokenData.user };
}

// ============================================================
// KOREKSI ESSAY OTOMATIS (GEMINI 2.5 FLASH)
// Fungsi ini tidak mengakses database — tidak ada perubahan
// ============================================================
function nilaiEssayDenganGemini(soal, rubrik, jawabanMhs, maxPoin) {
  var apiKey = API GEMINI;
  var url    = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;

  var promptText =
    "Kamu adalah sistem CBT penilai otomatis. Kamu harus adil dan objektif.\n" +
    "Pertanyaan: " + soal + "\n" +
    "Kunci Jawaban / Rubrik: " + rubrik + "\n" +
    "Jawaban Mahasiswa: " + jawabanMhs + "\n\n" +
    "Tugasmu:\n" +
    "1. Berikan nilai skala 0 sampai " + maxPoin + " berdasarkan tingkat kemiripan makna jawaban mahasiswa dengan kunci jawaban.\n" +
    "2. Berikan alasan singkat maksimal 2 kalimat.\n" +
    "Wajib balas dengan format persis seperti ini: NILAI: [angka] | ALASAN: [teks]";

  var payload = { "contents": [{ "parts": [{ "text": promptText }] }] };

  var options = {
    "method":      "post",
    "contentType": "application/json",
    "payload":     JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var json     = JSON.parse(response.getContentText());

    if (json.error) {
      Logger.log("❌ ERROR DARI GEMINI: " + json.error.message);
      return { skor: 0, alasan: "Gagal dinilai: " + json.error.message };
    }

    var hasilAI  = json.candidates[0].content.parts[0].text;
    var skorMatch = hasilAI.match(/NILAI:\s*(\d+(\.\d+)?)/i);
    var skorFinal = 0;

    if (skorMatch && skorMatch[1]) {
      var skorAngka = parseFloat(skorMatch[1]);
      skorFinal = skorAngka > maxPoin ? maxPoin : skorAngka;
    }

    return { skor: skorFinal, alasan: hasilAI };

  } catch (error) {
    Logger.log("❌ Terjadi kesalahan sistem: " + error.toString());
    return { skor: 0, alasan: "Kesalahan sistem: " + error.toString() };
  }
}

function _kirimNotifTelegramCBT(quizId, deadlineStr) {
  try {
    var subData = fbGet("aqualearn/cbt_submissions/" + quizId);
    if (!subData) return false;

    // ── FIX 1: Cari judul kuis & courseId dengan iterate node quiz ──
    var judulKuis = quizId; // fallback ke ID jika tidak ketemu
    var courseId  = "";

    var allQuiz = fbGet("aqualearn/quiz") || {};
    for (var docKey in allQuiz) {
      var q = allQuiz[docKey];
      if (q.url_form && q.url_form.indexOf("quizId=" + quizId) > -1) {
        if (q.title)     judulKuis = q.title;
        if (q.course_id) courseId  = q.course_id;
        break;
      }
    }

    var submissions = [];
    for (var uid in subData) {
      submissions.push({ score: parseFloat(subData[uid].total_score) || 0 });
    }

    var jumlahMhs = submissions.length;
    if (jumlahMhs === 0) return false;

    var scores    = submissions.map(function(s) { return s.score; });
    var rataRata  = (scores.reduce(function(a, b) { return a + b; }, 0) / jumlahMhs).toFixed(1);
    var tertinggi = Math.max.apply(null, scores);

    var dlDate      = new Date(deadlineStr);
    var dlFormatted = dlDate.toLocaleString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar'
    }) + ' WITA';

    // ── FIX 2: Gunakan URL production + tambah courseId ──
    var props      = PropertiesService.getScriptProperties();
    var baseUrl    = props.getProperty('AQUALEARN_PRODUCTION_URL') || ScriptApp.getService().getUrl();
    var dashboardUrl = baseUrl + "?page=cbt_dashboard&quizId=" + quizId;
    if (courseId) dashboardUrl += "&courseId=" + courseId;

    var pesanTeks =
      "🔔 <b>LAPORAN PENUTUPAN UJIAN / KUIS</b>\n" +
      "📚 <b>" + judulKuis + "</b>\n\n" +
      "⏳ <b>Deadline:</b> " + dlFormatted + "\n\n" +
      "📊 <b>RINGKASAN HASIL:</b>\n" +
      "👥 <b>Mhs Submit:</b> " + jumlahMhs + "\n" +
      "📈 <b>Rata-rata:</b> " + rataRata + "\n" +
      "🏆 <b>Nilai Tertinggi:</b> " + tertinggi + "\n\n" +
      "<a href=\"" + dashboardUrl + "\">Buka Dashboard Analitik ➡️</a>";

    var telegramUrl = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
    UrlFetchApp.fetch(telegramUrl, {
      "method":      "POST",
      "contentType": "application/json",
      "payload":     JSON.stringify({
        "chat_id":                  TELEGRAM_CHAT_ID,
        "text":                     pesanTeks,
        "parse_mode":               "HTML",
        "disable_web_page_preview": true
      })
    });

    return true;
  } catch(err) {
    Logger.log('Error Telegram: ' + err.toString());
    return false;
  }
}

// ============================================================
// TRIGGER OTOMATIS: PENGECEKAN DEADLINE UNTUK TELEGRAM
// ============================================================

// Jalankan SATU KALI secara manual dari Editor untuk mendaftarkan trigger
function setupTriggerTelegramCBT() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'cekDanKirimNotifTelegramCBT') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('cekDanKirimNotifTelegramCBT')
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log('✅ Trigger Telegram berhasil dibuat!');
}

// Dijalankan otomatis oleh trigger setiap jam
function cekDanKirimNotifTelegramCBT() {
  var now      = new Date().getTime();
  var settings = fbGet("aqualearn/cbt_settings") || {};

  var props      = PropertiesService.getScriptProperties();
  var sudahKirim = JSON.parse(props.getProperty('notifTelegramTerkirim') || '{}');

  for (var quizId in settings) {
    var deadlineStr = settings[quizId].deadline;
    if (!quizId || !deadlineStr) continue;

    var deadlineMs = new Date(deadlineStr).getTime();
    if (isNaN(deadlineMs)) continue;

    if (now > deadlineMs && !sudahKirim[quizId]) {
      var berhasil = _kirimNotifTelegramCBT(quizId, deadlineStr);
      if (berhasil) {
        sudahKirim[quizId] = new Date().toISOString();
        props.setProperty('notifTelegramTerkirim', JSON.stringify(sudahKirim));
      }
    }
  }
}

function setProductionUrl() {
  PropertiesService.getScriptProperties().setProperty(
    'AQUALEARN_PRODUCTION_URL',
    'https://script.google.com/macros/s/AKfycbyRKpsBY1OmA4keRIlogKvgJFzrJVGlvAn0ZFnYG7XSJ_7phAO3jc9IRLpHbNFRv7k1/exec'
  );
  Logger.log('✅ Production URL tersimpan.');
}

// ============================================================
// TES KIRIM NOTIFIKASI TELEGRAM (Jalankan manual dari Editor)
// ============================================================
function tesKirimNotifTelegram() {
  // ── Ganti sesuai data kuis yang sudah ada di Firebase ──
  var QUIZ_ID_TES     = "KUIS-1775231936601";          // quizId yang ada datanya di cbt_submissions
  var DEADLINE_TES    = "2025-04-12T23:59:00+08:00"; // deadline fiktif (format ISO)

  Logger.log("🚀 Memulai tes notifikasi Telegram...");
  Logger.log("   Quiz ID  : " + QUIZ_ID_TES);
  Logger.log("   Deadline : " + DEADLINE_TES);

  var hasil = _kirimNotifTelegramCBT(QUIZ_ID_TES, DEADLINE_TES);

  if (hasil) {
    Logger.log("✅ SUKSES — Pesan berhasil dikirim ke Telegram!");
  } else {
    Logger.log("❌ GAGAL — Cek log di atas untuk detail error.");
  }
}

// ============================================================
// KONFIGURASI GLOBAL
// ============================================================
var GEMINI_API_KEY     = "GEMINI API";
var TELEGRAM_BOT_TOKEN = "TELE BOT";
var TELEGRAM_CHAT_ID   = "TELE ID";

// ============================================================
// HELPER INTERNAL — Cari courseId dari quizId
// (dipakai oleh getCbtAnalytics, submitNilaiCbtKeGrades, Telegram)
// ============================================================
function _getCourseIdDariQuiz(quizId) {
  var allQuiz = fbGet("aqualearn/quiz") || {};
  for (var docKey in allQuiz) {
    var q = allQuiz[docKey];
    if (q.url_form && q.url_form.indexOf("quizId=" + quizId) > -1) {
      if (q.course_id) return q.course_id;
    }
  }
  return null;
}

// ============================================================
// HELPER INTERNAL — Cari judul kuis dari quizId
// ============================================================
function _getJudulKuisDariQuiz(quizId) {
  var allQuiz = fbGet("aqualearn/quiz") || {};
  for (var docKey in allQuiz) {
    var q = allQuiz[docKey];
    if (q.url_form && q.url_form.indexOf("quizId=" + quizId) > -1) {
      return { judul: q.title || quizId, courseId: q.course_id || "" };
    }
  }
  return { judul: quizId, courseId: "" };
}

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
      options:     data[qId].options   || [],
      points:      data[qId].points    || 0,
      image_url:   data[qId].image_url || ""
    });
  }
  return questions;
}

// ============================================================
// 2. Memproses pengumpulan ujian
//    Essay tidak dinilai di sini — skor awal hanya dari PG
// ============================================================
function submitCbtExam(quizId, userId, answersObj) {
  var dataSoal   = fbGet("aqualearn/cbt_questions/" + quizId) || {};
  var totalScore = 0;
  var maxScore   = 0;

  for (var qId in dataSoal) {
    var type          = dataSoal[qId].type;
    var correctAnswer = String(dataSoal[qId].correct_answer).trim();
    var maxPoint      = parseFloat(dataSoal[qId].points) || 0;
    maxScore += maxPoint;

    if (type === "PG") {
      var userAnswer = String(answersObj[qId] || "").trim();
      if (userAnswer.toLowerCase() === correctAnswer.toLowerCase()) {
        totalScore += maxPoint;
      }
    }
    // Essay: skor 0 dulu, akan diisi AI kemudian
  }

  var finalGrade        = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;
  var jumlahPelanggaran = parseInt(answersObj._violations) || 0;
  delete answersObj._violations;

  fbPut("aqualearn/cbt_submissions/" + quizId + "/" + userId, {
    submit_id:      "CBT-SUB-" + new Date().getTime(),
    quiz_id:        quizId,
    user_id:        userId,
    answers_json:   JSON.stringify(answersObj),
    total_score:    finalGrade,
    timestamp:      new Date().toISOString(),
    violations:     jumlahPelanggaran,
    essay_feedback: ""
  });

  return { success: true, score: finalGrade, message: "Ujian berhasil diselesaikan!" };
}

// ============================================================
// 3. Menyimpan soal baru
// ============================================================
function saveCbtQuestion(data) {
  var questionId   = "Q-" + new Date().getTime();
  fbPut("aqualearn/cbt_questions/" + data.quizId + "/" + questionId, {
    quiz_id:        data.quizId,
    type:           data.type,
    text:           data.text,
    options:        data.options       || [],
    correct_answer: data.correctAnswer,
    points:         data.points,
    image_url:      data.imageUrl      || ""
  });
  return { success: true, message: "Soal berhasil ditambahkan ke " + data.quizId + "!" };
}

// ============================================================
// 4. Menyimpan deadline dan durasi
// ============================================================
function saveCbtSettings(quizId, deadlineStr, durationMinutes) {
  fbPut("aqualearn/cbt_settings/" + quizId, {
    deadline:         deadlineStr     || "",
    duration_minutes: durationMinutes || 0
  });
  return { success: true, message: "Pengaturan waktu kuis " + quizId + " disimpan!" };
}

// ============================================================
// 5. Catat waktu mulai & kembalikan sisa durasi
// ============================================================
function startCbtSession(quizId, userId) {
  var setting     = fbGet("aqualearn/cbt_settings/" + quizId) || {};
  var durasiMenit = parseInt(setting.duration_minutes) || 0;
  var sesiData    = fbGet("aqualearn/cbt_sessions/" + quizId + "/" + userId);
  var startTime;

  if (sesiData && sesiData.start_time) {
    // Sesi lama — jangan reset timer
    startTime = new Date(sesiData.start_time).getTime();
  } else {
    startTime = new Date().getTime();
    fbPut("aqualearn/cbt_sessions/" + quizId + "/" + userId, {
      session_id: "SESS-" + startTime,
      start_time: new Date(startTime).toISOString()
    });
  }

  var sisaMs = durasiMenit > 0
    ? (startTime + durasiMenit * 60 * 1000) - new Date().getTime()
    : -1;

  return {
    startTime:   startTime,
    durationMs:  durasiMenit * 60 * 1000,
    remainingMs: sisaMs,
    hasDuration: durasiMenit > 0
  };
}

// ============================================================
// 6. Validasi akses mahasiswa (double submit, deadline, timeout)
// ============================================================
function validateCbtAccess(quizId, userId) {
  var submission = fbGet("aqualearn/cbt_submissions/" + quizId + "/" + userId);
  if (submission) {
    return { allowed: false, reason: "submitted", score: submission.total_score };
  }

  var setting     = fbGet("aqualearn/cbt_settings/" + quizId) || {};
  var deadline    = setting.deadline ? new Date(setting.deadline).getTime() : null;
  var durasiMenit = parseInt(setting.duration_minutes) || 0;
  var now         = new Date().getTime();

  if (deadline && now > deadline) {
    return { allowed: false, reason: "deadline" };
  }

  if (durasiMenit > 0) {
    var sesiData = fbGet("aqualearn/cbt_sessions/" + quizId + "/" + userId);
    if (sesiData && sesiData.start_time) {
      var expireTime = new Date(sesiData.start_time).getTime() + durasiMenit * 60 * 1000;
      if (now > expireTime) {
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
  if (!safeCourseId) safeCourseId = _getCourseIdDariQuiz(quizId);

  var usersData       = fbGet("aqualearn/users")       || {};
  var enrollmentsData = fbGet("aqualearn/enrollments") || {};
  var allStudents     = [];

  if (safeCourseId) {
    var cKey    = safeKey(safeCourseId);
    var members = enrollmentsData[cKey] || {};
    for (var uKey in members) {
      allStudents.push({
        userId:     uKey,
        nama:       (usersData[uKey] && usersData[uKey].nama_lengkap) || "Unknown",
        status:     'Belum',
        score:      '-',
        violations: 0
      });
    }
  }

  var submissionsData = fbGet("aqualearn/cbt_submissions/" + quizId) || {};
  var totalSudah      = 0;

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

    if (!found) {
      allStudents.push({
        userId:     sUid,
        nama:       (usersData[sUid] && usersData[sUid].nama_lengkap) || "Tidak Terdaftar",
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
// 8. Proses penilaian essay SATU mahasiswa — 1 request Gemini
//    Dipanggil per-mahasiswa dari frontend (loop di Dashboard)
// ============================================================
function prosesSatuMahasiswaEssay(quizId, userId) {
  var soalData   = fbGet("aqualearn/cbt_questions/"  + quizId);
  var submitData = fbGet("aqualearn/cbt_submissions/" + quizId + "/" + userId);

  if (!soalData || !submitData) {
    return { success: false, skipped: false, message: "Data tidak ditemukan untuk " + userId };
  }

  var answersObj = {};
  try { answersObj = JSON.parse(submitData.answers_json); } catch(e) {}

  if (answersObj._essayGraded) {
    return { success: true, skipped: true, userId: userId, message: "Sudah dinilai sebelumnya." };
  }

  // Kumpulkan semua soal + hitung totalMaxScore
  var daftarEssay       = [];
  var totalMaxScoreKuis = 0;

  for (var qId in soalData) {
    var poin = parseFloat(soalData[qId].points) || 0;
    totalMaxScoreKuis += poin;
    if (soalData[qId].type === "ESSAY") {
      daftarEssay.push({
        qId:     qId,
        text:    soalData[qId].text,
        rubrik:  soalData[qId].correct_answer,
        maxPoin: poin,
        jawaban: (answersObj[qId] || "").trim()
      });
    }
  }

  if (daftarEssay.length === 0) {
    return { success: true, skipped: true, userId: userId, message: "Tidak ada soal essay." };
  }

  // Panggil Gemini — 1 request untuk semua soal essay sekaligus
  var hasilBatch        = _panggilGeminiBatch(daftarEssay);
  var currentTotalScore = parseFloat(submitData.total_score) || 0;
  var poinPgMentah      = (currentTotalScore / 100) * totalMaxScoreKuis;
  var tambahanSkorEssay = 0;
  var detailSkor        = [];

  for (var i = 0; i < daftarEssay.length; i++) {
    var qId   = daftarEssay[i].qId;
    var maxP  = daftarEssay[i].maxPoin;
    var hasil = hasilBatch[qId] || { skor: 0, alasan: "Tidak ada response AI." };
    tambahanSkorEssay += hasil.skor;
    detailSkor.push({ no: i + 1, skor: hasil.skor, max: maxP, alasan: hasil.alasan });
  }

  // ── Hitung finalSkor DULU, baru susun feedback ──
  var finalPoin = poinPgMentah + tambahanSkorEssay;
  var finalSkor = totalMaxScoreKuis > 0
                ? Math.round((finalPoin / totalMaxScoreKuis) * 10000) / 100
                : 0;

  // Rekap skor
  var skorPg          = Math.round(poinPgMentah * 100) / 100;
  var essayFeedback   = "=== REKAP SKOR ===\n"
                      + "PG: " + skorPg + " poin\n";
  detailSkor.forEach(function(d) {
    essayFeedback += "Essay " + d.no + ": " + d.skor + "/" + d.max + " poin\n";
  });
  essayFeedback += "Total: " + finalSkor + "/100\n\n";

  // Detail feedback per soal
  detailSkor.forEach(function(d) {
    essayFeedback += "Essay " + d.no + " [" + d.skor + "/" + d.max + " poin]: "
                   + d.alasan + "\n\n";
  });

  answersObj._essayGraded = true;

  fbPatch("aqualearn/cbt_submissions/" + quizId + "/" + userId, {
    answers_json:   JSON.stringify(answersObj),
    total_score:    finalSkor,
    essay_feedback: essayFeedback
  });

  return {
    success:    true,
    skipped:    false,
    userId:     userId,
    finalScore: finalSkor,
    message:    "Berhasil. Skor: " + finalSkor
  };
}

// ============================================================
// Helper — Kirim SEMUA soal essay dalam 1 prompt ke Gemini
// Return: { qId: { skor, alasan }, ... }
// ============================================================
function _panggilGeminiBatch(soalList) {
  var promptLines = [
    "Kamu adalah sistem CBT penilai otomatis. Adil dan objektif.",
    "Nilai setiap jawaban mahasiswa berikut berdasarkan rubrik masing-masing.",
    ""
  ];

  soalList.forEach(function(s, i) {
    promptLines.push("=== SOAL " + (i + 1) + " (ID: " + s.qId + ", Maks: " + s.maxPoin + " poin) ===");
    promptLines.push("Pertanyaan: " + s.text);
    promptLines.push("Rubrik: " + s.rubrik);
    promptLines.push("Jawaban Mahasiswa: " + (s.jawaban || "(kosong)"));
    promptLines.push("");
  });

  promptLines.push("Balas HANYA dalam format JSON berikut, tanpa teks lain:");
  promptLines.push("{");
  soalList.forEach(function(s, i) {
    var comma = i < soalList.length - 1 ? "," : "";
    promptLines.push('  "' + s.qId + '": { "nilai": [angka 0-' + s.maxPoin + '], "alasan": "[maks 2 kalimat]" }' + comma);
  });
  promptLines.push("}");

  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + GEMINI_API_KEY;
  var MAX_RETRY = 3;
  var lastError = "";

  for (var attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      var response = UrlFetchApp.fetch(url, {
        method:             "post",
        contentType:        "application/json",
        payload:            JSON.stringify({ contents: [{ parts: [{ text: promptLines.join("\n") }] }] }),
        muteHttpExceptions: true
      });

      var json = JSON.parse(response.getContentText());

      if (json.error) {
        lastError    = json.error.message;
        var retrySec = _parseRetryDelay(lastError);
        var sleepMs  = retrySec > 0 ? (retrySec * 1000 + 1000) : (6000 * Math.pow(2, attempt));
        Logger.log('[GeminiBatch Retry] Attempt ' + attempt + '/' + MAX_RETRY
                 + ' — sleep ' + (sleepMs / 1000).toFixed(1) + 's. Error: ' + lastError);
        if (attempt < MAX_RETRY) Utilities.sleep(sleepMs);
        continue;
      }

      var rawText   = json.candidates[0].content.parts[0].text;
      var cleanText = rawText.replace(/```json|```/gi, '').trim();
      var parsed    = JSON.parse(cleanText);

      var hasil = {};
      soalList.forEach(function(s) {
        var entry = parsed[s.qId];
        if (entry && typeof entry.nilai !== 'undefined') {
          hasil[s.qId] = {
            skor:   Math.min(Math.max(parseFloat(entry.nilai) || 0, 0), s.maxPoin),
            alasan: String(entry.alasan || "")
          };
        } else {
          hasil[s.qId] = { skor: 0, alasan: "Tidak ada response untuk soal ini." };
        }
      });

      return hasil;

    } catch(e) {
      lastError = e.toString();
      var sleepMs = 6000 * Math.pow(2, attempt);
      Logger.log('[GeminiBatch Error] Attempt ' + attempt + ' — ' + lastError);
      if (attempt < MAX_RETRY) Utilities.sleep(sleepMs);
    }
  }

  // Gagal total — kembalikan skor 0 semua
  var fallback = {};
  soalList.forEach(function(s) {
    fallback[s.qId] = { skor: 0, alasan: "Gagal setelah " + MAX_RETRY + " percobaan: " + lastError };
  });
  return fallback;
}

// ============================================================
// Helper — Ekstrak angka detik dari pesan "Please retry in X.XXs"
// ============================================================
function _parseRetryDelay(pesanError) {
  if (!pesanError) return 0;
  var match = pesanError.match(/retry in\s+([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1])) : 0;
}

// ============================================================
// 9. Catat log pelanggaran anti-cheat dari CBT.html
// ============================================================
function logCbtViolations(quizId, userId, violations) {
  if (!quizId || !userId || !violations || !violations.length) return;
  var path     = "aqualearn/cbt_violations/" + quizId + "/" + userId;
  var existing = fbGet(path) || [];
  var updated  = existing.concat(violations);
  fbPut(path, updated);
}

// ============================================================
// 10. Kembalikan URL script (untuk redirect tutupAman)
// ============================================================
function getScriptUrl() {
  return PropertiesService.getScriptProperties().getProperty('AQUALEARN_PRODUCTION_URL')
         || ScriptApp.getService().getUrl();
}

// ============================================================
// 11. Ambil kuis milik kelas + enrich dengan info deadline/durasi CBT
// ============================================================
function getCourseQuizzesWithCbtInfo(courseId) {
  var quizzesData = fbGet("aqualearn/quiz")          || {};
  var cbtSettings = fbGet("aqualearn/cbt_settings")  || {};
  var quizzes     = [];

  for (var quizId in quizzesData) {
    var q = quizzesData[quizId];
    if (q.course_id !== courseId) continue;

    var urlForm   = q.url_form || "";
    var cbtQuizId = "";
    var deadline  = "";
    var duration  = 0;

    var match = urlForm.match(/quizId=([^&\s]+)/);
    if (match && match[1]) cbtQuizId = match[1].trim();

    if (cbtQuizId && cbtSettings[cbtQuizId]) {
      deadline = cbtSettings[cbtQuizId].deadline                     || "";
      duration = parseInt(cbtSettings[cbtQuizId].duration_minutes)   || 0;
    }

    quizzes.push({
      quiz_id:            quizId,
      course_id:          courseId,
      title:              q.title || "",
      url_form:           urlForm,
      dikerjakan:         false,
      cbt_deadline:       deadline,
      cbt_duration_menit: duration
    });
  }

  return quizzes;
}

// ============================================================
// 12. Ambil daftar kuis CBT milik kelas (untuk dropdown modal soal)
// ============================================================
function getQuizzesForCourse(courseId) {
  var quizzesData = fbGet("aqualearn/quiz") || {};
  var quizArray   = [];

  for (var docKey in quizzesData) {
    var q = quizzesData[docKey];
    if (q.course_id !== courseId) continue;
    if (!q.url_form || q.url_form.indexOf("quizId=") === -1) continue;

    var match = q.url_form.match(/quizId=([^&\s]+)/);
    if (!match || !match[1]) continue;

    quizArray.push({ quizId: match[1].trim(), title: q.title || match[1].trim() });
  }

  return quizArray;
}

// ============================================================
// 13. Sinkronisasi nilai CBT ke rekap nilai kelas
// ============================================================
function submitNilaiCbtKeGrades(quizId, courseIdParam, jenisNilai) {
  var safeCourseId = courseIdParam ? String(courseIdParam).trim() : null;
  if (!safeCourseId) safeCourseId = _getCourseIdDariQuiz(quizId);
  if (!safeCourseId) return { success: false, message: "Gagal mendeteksi ID Kelas." };

  var cKey    = safeKey(safeCourseId);
  var members = fbGet("aqualearn/enrollments/" + cKey) || {};

  if (Object.keys(members).length === 0) {
    return { success: false, message: "Tidak ada mahasiswa terdaftar di kelas " + safeCourseId + "." };
  }

  var submissionsData  = fbGet("aqualearn/cbt_submissions/" + quizId) || {};
  var jKey             = safeJenisNilai(jenisNilai);
  var updateNilaiCount = 0;

  for (var uid in submissionsData) {
    var uKey = safeKey(uid);
    if (!members[uKey]) continue;

    var score = parseFloat(submissionsData[uid].total_score) || 0;
    fbPut("aqualearn/nilai/" + cKey + "/" + uKey + "/" + jKey, { jenis: jenisNilai, nilai: score });
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
// 14. Reset ujian mahasiswa (submission + session + quiz_track)
// ============================================================
function resetUjianMahasiswaCBT(quizId, userId, courseId) {
  var count = 0;

  if (fbGet("aqualearn/cbt_submissions/" + quizId + "/" + userId)) {
    fbDelete("aqualearn/cbt_submissions/" + quizId + "/" + userId); count++;
  }
  if (fbGet("aqualearn/cbt_sessions/" + quizId + "/" + userId)) {
    fbDelete("aqualearn/cbt_sessions/" + quizId + "/" + userId); count++;
  }
  if (courseId && userId) {
    var trackPath = "aqualearn/quiz_track/" + safeKey(courseId) + "/" + safeKey(userId) + "/" + safeKey(quizId);
    if (fbGet(trackPath)) { fbDelete(trackPath); count++; }
    cacheRemove('paket_personal_' + String(courseId).trim() + '_' + String(userId).trim());
    invalidateCourseCache(courseId);
  }

  return count > 0
    ? { success: true,  message: "Data ujian berhasil direset!" }
    : { success: false, message: "Mahasiswa ini belum memiliki riwayat pengerjaan." };
}

// ============================================================
// 15. Hapus seluruh data sebuah kuis
// ============================================================
function hapusKuisDiBackend(quizId) {
  if (!quizId) throw new Error("ID Kuis kosong, penghapusan dibatalkan.");
  fbDelete("aqualearn/cbt_questions/"   + quizId);
  fbDelete("aqualearn/cbt_sessions/"    + quizId);
  fbDelete("aqualearn/cbt_submissions/" + quizId);
  fbDelete("aqualearn/cbt_settings/"    + quizId);
  fbDelete("aqualearn/cbt_violations/"  + quizId);
  return { success: true, message: "Kuis beserta semua data berhasil dihapus." };
}

// ============================================================
// 16. Sistem keamanan — One-Time Token
// ============================================================
function buatTokenSesiCbt(userObj) {
  var token     = Utilities.getUuid();
  var expiredMs = new Date().getTime() + (2 * 60 * 1000); // 2 menit
  fbPut("aqualearn/auth_tokens/" + token, { user: userObj, expired: expiredMs });
  return token;
}

function validasiDanGunakanToken(tokenInput) {
  var tokenData = fbGet("aqualearn/auth_tokens/" + tokenInput);
  if (!tokenData) {
    return { success: false, message: "Akses Ditolak: Token tidak valid atau sudah hangus." };
  }

  fbDelete("aqualearn/auth_tokens/" + tokenInput); // One-time: hapus segera

  if (new Date().getTime() > tokenData.expired) {
    return { success: false, message: "Token sudah kedaluwarsa. Silakan buka ulang dari LMS." };
  }

  return { success: true, user: tokenData.user };
}

// ============================================================
// NOTIFIKASI TELEGRAM
// ============================================================
function _kirimNotifTelegramCBT(quizId, deadlineStr) {
  try {
    var subData = fbGet("aqualearn/cbt_submissions/" + quizId);
    if (!subData) return false;

    var info      = _getJudulKuisDariQuiz(quizId);
    var judulKuis = info.judul;
    var courseId  = info.courseId;

    var scores = [];
    for (var uid in subData) {
      scores.push(parseFloat(subData[uid].total_score) || 0);
    }

    if (scores.length === 0) return false;

    var rataRata  = (scores.reduce(function(a, b) { return a + b; }, 0) / scores.length).toFixed(1);
    var tertinggi = Math.max.apply(null, scores);

    var dlFormatted = new Date(deadlineStr).toLocaleString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar'
    }) + ' WITA';

    var baseUrl      = getScriptUrl();
    var dashboardUrl = baseUrl + "?page=cbt_dashboard&quizId=" + quizId;
    if (courseId) dashboardUrl += "&courseId=" + courseId;

    UrlFetchApp.fetch("https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage", {
      method:      "POST",
      contentType: "application/json",
      payload:     JSON.stringify({
        chat_id:                  TELEGRAM_CHAT_ID,
        text:
          "🔔 <b>LAPORAN PENUTUPAN UJIAN / KUIS</b>\n"  +
          "📚 <b>" + judulKuis + "</b>\n\n"              +
          "⏳ <b>Deadline:</b> " + dlFormatted + "\n\n"  +
          "📊 <b>RINGKASAN HASIL:</b>\n"                 +
          "👥 <b>Mhs Submit:</b> " + scores.length + "\n"+
          "📈 <b>Rata-rata:</b> " + rataRata + "\n"      +
          "🏆 <b>Nilai Tertinggi:</b> " + tertinggi + "\n\n" +
          "<a href=\"" + dashboardUrl + "\">Buka Dashboard Analitik ➡️</a>",
        parse_mode:               "HTML",
        disable_web_page_preview: true
      })
    });

    return true;

  } catch(err) {
    Logger.log("Error Telegram: " + err.toString());
    return false;
  }
}

// ============================================================
// TRIGGER OTOMATIS — Cek deadline & kirim notif Telegram tiap jam
// ============================================================
function cekDanKirimNotifTelegramCBT() {
  var now        = new Date().getTime();
  var settings   = fbGet("aqualearn/cbt_settings") || {};
  var props      = PropertiesService.getScriptProperties();
  var sudahKirim = JSON.parse(props.getProperty('notifTelegramTerkirim') || '{}');

  for (var quizId in settings) {
    var deadlineStr = settings[quizId].deadline;
    if (!deadlineStr) continue;

    var deadlineMs = new Date(deadlineStr).getTime();
    if (isNaN(deadlineMs) || now <= deadlineMs || sudahKirim[quizId]) continue;

    var berhasil = _kirimNotifTelegramCBT(quizId, deadlineStr);
    if (berhasil) {
      sudahKirim[quizId] = new Date().toISOString();
      props.setProperty('notifTelegramTerkirim', JSON.stringify(sudahKirim));
    }
  }
}

// ============================================================
// SETUP — Jalankan sekali manual dari Editor setelah deployment
// ============================================================
function setProductionUrl() {
  PropertiesService.getScriptProperties().setProperty(
    'AQUALEARN_PRODUCTION_URL',
    'https://script.google.com/macros/s/AKfycbyRKpsBY1OmA4keRIlogKvgJFzrJVGlvAn0ZFnYG7XSJ_7phAO3jc9IRLpHbNFRv7k1/exec'
  );
  Logger.log('✅ Production URL tersimpan.');
}

function setupTriggerTelegramCBT() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'cekDanKirimNotifTelegramCBT') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cekDanKirimNotifTelegramCBT').timeBased().everyHours(1).create();
  Logger.log('✅ Trigger Telegram berhasil dibuat!');
}

function tesKirimNotifTelegram() {
  var QUIZ_ID_TES  = "KUIS-1775231936601";
  var DEADLINE_TES = "2025-04-12T23:59:00+08:00";
  Logger.log("🚀 Memulai tes notifikasi Telegram...");
  Logger.log(
    _kirimNotifTelegramCBT(QUIZ_ID_TES, DEADLINE_TES)
      ? "✅ SUKSES" : "❌ GAGAL — Cek log di atas."
  );
}

// ============================================================
// 17. Ambil detail jawaban mahasiswa untuk popup di dashboard
//     Dipanggil dari cbt_dashboard.html saat dosen klik nama
// ============================================================
function getDetailJawabanMahasiswa(quizId, userId) {
  var soalData   = fbGet("aqualearn/cbt_questions/" + quizId) || {};
  var submitData = fbGet("aqualearn/cbt_submissions/" + quizId + "/" + userId);

  if (!submitData) {
    return { success: false, message: "Mahasiswa ini belum memiliki riwayat pengerjaan." };
  }

  var answersObj = {};
  try { answersObj = JSON.parse(submitData.answers_json); } catch(e) {}

  var userData = fbGet("aqualearn/users/" + userId) || {};

  var questions = [];
  for (var qId in soalData) {
    var q = soalData[qId];
    var isCorrect = null;
    if (q.type === "PG") {
      isCorrect = String(answersObj[qId] || "").trim().toLowerCase()
               === String(q.correct_answer || "").trim().toLowerCase();
    }
    questions.push({
      question_id:    qId,
      type:           q.type           || "PG",
      text:           q.text           || "",
      options:        q.options        || [],
      correct_answer: q.correct_answer || "",
      points:         q.points         || 0,
      image_url:      q.image_url      || "",
      user_answer:    answersObj[qId]  || "",
      is_correct:     isCorrect
    });
  }

  // Urutkan: PG lebih dulu, lalu Essay; dalam tiap tipe urut by question_id (asc)
  questions.sort(function(a, b) {
    if (a.type !== b.type) return a.type === "PG" ? -1 : 1;
    return a.question_id < b.question_id ? -1 : 1;
  });

  return {
    success:        true,
    userId:         userId,
    nama:           userData.nama_lengkap || userId,
    total_score:    submitData.total_score,
    timestamp:      submitData.timestamp  || "",
    violations:     submitData.violations || 0,
    essay_feedback: submitData.essay_feedback || "",
    essay_graded:   !!(answersObj._essayGraded),
    questions:      questions
  };
}

// ============================================================
// REPAIR — Reset data essay yang gagal di-grade AI
// Jalankan sekali dari Apps Script Editor: Run > perbaikiEssayGagal
// ============================================================
function perbaikiEssayGagal() {
  var quizId  = "KUIS-1779721948566";
  var targets = ["2213521053", "2213521099"];
  var hasil   = [];

  targets.forEach(function(userId) {
    var path    = "aqualearn/cbt_submissions/" + quizId + "/" + userId;
    var sub     = fbGet(path);

    if (!sub) {
      hasil.push("❌ " + userId + ": Data submission tidak ditemukan.");
      return;
    }

    // ── 1. Normalkan answers_json → selalu string, tanpa _essayGraded ──
    var answersObj = {};

    if (typeof sub.answers_json === "string") {
      // Kasus 2213521099: string tapi ada _essayGraded di dalamnya
      try { answersObj = JSON.parse(sub.answers_json); } catch(e) { answersObj = {}; }
    } else if (typeof sub.answers_json === "object" && sub.answers_json !== null) {
      // Kasus 2213521053: tersimpan sebagai object (bukan string)
      answersObj = sub.answers_json;
    }

    // Hapus flag _essayGraded agar AI grading mau jalan ulang
    delete answersObj["_essayGraded"];

    // Hitung ulang skor PG saja (essay di-reset ke 0 sampai AI jalan ulang)
    var soalData   = fbGet("aqualearn/cbt_questions/" + quizId) || {};
    var pgEarned   = 0;
    var totalMax   = 0;

    for (var qId in soalData) {
      var poin = parseFloat(soalData[qId].points) || 0;
      totalMax += poin;
      if (soalData[qId].type === "PG") {
        var userAns    = String(answersObj[qId] || "").trim().toLowerCase();
        var correctAns = String(soalData[qId].correct_answer || "").trim().toLowerCase();
        if (userAns && userAns === correctAns) pgEarned += poin;
      }
    }

    var pgScore = totalMax > 0 ? Math.round((pgEarned / totalMax) * 10000) / 100 : 0;

    // ── 2. Patch Firebase ──
    fbPatch(path, {
      answers_json:   JSON.stringify(answersObj),   // selalu string, tanpa _essayGraded
      essay_feedback: "",                           // bersihkan feedback error lama
      total_score:    pgScore                       // skor sementara = PG only
    });

    hasil.push(
      "✅ " + userId + " — diperbaiki."
      + " answers_json → string"
      + " | _essayGraded → dihapus"
      + " | total_score sementara: " + pgScore
      + " | essay_feedback → dikosongkan"
    );
  });

  Logger.log("\n=== HASIL REPAIR ===\n" + hasil.join("\n"));
  Logger.log("\n✅ Selesai. Sekarang buka Dashboard CBT dan klik '🤖 Nilai Essay' untuk menjalankan ulang AI grading.");
}

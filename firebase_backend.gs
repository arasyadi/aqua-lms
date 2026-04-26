// ============================================================
// FILE: firebase_backend.gs
// Pengganti database.gs — semua operasi kini ke Firebase
// ============================================================

var FB_URL = "FIREBASE URL";
// Ganti dengan URL Firebase Anda (sama dengan migration.gs)

// ══════════════════════════════════════════════
// FIREBASE REST HELPERS — v3 (URL-safe + Query Filter)
// ══════════════════════════════════════════════

/** Sanitasi URL: hapus trailing slash dari base, leading slash dari path */
function _fbUrl(path) {
  var base  = String(FB_URL).replace(/\/+$/, '');
  var clean = String(path).replace(/^\/+/, '');
  return base + '/' + clean + '.json';
}

function fbGet(path) {
  var res = UrlFetchApp.fetch(_fbUrl(path), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  var text = res.getContentText();
  return text === 'null' ? null : JSON.parse(text);
}

// Fungsi BARU untuk Filter Bandwidth (Hanya ambil data kelas terkait) - DIPERBAIKI (URL Encoded)
function fbGetFiltered(path, filterField, filterValue) {
  // Gunakan encodeURIComponent untuk mengubah tanda kutip (") menjadi format URL aman (%22)
  var query = '?orderBy=' + encodeURIComponent('"' + filterField + '"') + 
              '&equalTo=' + encodeURIComponent('"' + filterValue + '"');
              
  var res = UrlFetchApp.fetch(_fbUrl(path) + query, { muteHttpExceptions: true });
  
  if (res.getResponseCode() !== 200) return null;
  var text = res.getContentText();
  return text === 'null' ? null : JSON.parse(text);
}

function fbPut(path, data) {
  UrlFetchApp.fetch(_fbUrl(path), {
    method: 'put', contentType: 'application/json',
    payload: JSON.stringify(data), muteHttpExceptions: true
  });
}

function fbPatch(path, data) {
  UrlFetchApp.fetch(_fbUrl(path), {
    method: 'patch', contentType: 'application/json',
    payload: JSON.stringify(data), muteHttpExceptions: true
  });
}

function fbDelete(path) {
  UrlFetchApp.fetch(_fbUrl(path), { method: 'delete', muteHttpExceptions: true });
}

function safeKey(str) {
  return String(str).replace(/[.#$\[\]\/]/g, "_");
}

function safeJenisNilai(str) {
  return String(str).replace(/[.#$\[\]\/]/g, "_");
}

// ══════════════════════════════════════════════
// AUTH & SESSION
// ══════════════════════════════════════════════

function checkLogin(username, password) {
  var userData = fbGet("aqualearn/users/" + safeKey(username));
  if (!userData) return { success: false, message: "Username tidak ditemukan." };

  if (String(userData.password).trim() !== String(password).trim()) {
    return { success: false, message: "Password salah." };
  }

  return {
    success: true,
    userId:  username,
    name:    userData.nama_lengkap,
    role:    userData.role
  };
}

function verifikasiDeviceBinding(userId, deviceToken) {
  var key      = safeKey(userId);
  var existing = fbGet("aqualearn/device_binding/" + key);

  // ── LOGIN PERTAMA: Ikat perangkat ──
  if (!existing) {
    fbPut("aqualearn/device_binding/" + key, {
      device_token:  deviceToken,
      waktu_tertaut: new Date().toISOString()
    });
    return { success: true, isNewBind: true };
  }

  // ── PENGECEKAN KETAT (Exact Match) ──
  // Karena token klien sekarang stabil dan berdasarkan hardware, 
  // hapus cache/incognito tidak akan mengubah token.
  if (existing.device_token === deviceToken) {
    return { success: true, isNewBind: false };
  }

  // Jika tidak cocok, tolak dengan pesan yang informatif
  var savedParts = String(existing.device_token).split("_");
  
  function cap(t) {
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Tidak Dikenali";
  }

  var savedOs      = cap(savedParts[0] || "");
  var savedBrowser = cap(savedParts[1] || "");

  return {
    success: false,
    message: "⛔ Akses Ditolak: Akun ini sudah tertaut dengan perangkat lain.\n\n"
           + "📱 Perangkat Terdaftar:\n"
           + "OS: " + savedOs + "\n"
           + "Browser: " + savedBrowser + "\n\n"
           + "Hubungi dosen jika Anda berganti perangkat atau mereset HP."
  };
}

function resetDeviceBindingBatch(nimArray) {
  var count = 0;
  nimArray.forEach(function(nim) {
    fbDelete("aqualearn/device_binding/" + safeKey(nim));
    count++;
  });
  return { success: true, message: "✅ Berhasil mereset " + count + " perangkat." };
}

// ══════════════════════════════════════════════
// DASHBOARD MAHASISWA — Optimized Loading (Paralel)
// ══════════════════════════════════════════════
function getStudentCourses(userId) {
  var uKey = safeKey(userId);

  // 1. Ambil daftar enrollment & kelas
  var enrollments = fbGet("aqualearn/enrollments") || {};
  var courses     = fbGet("aqualearn/courses")     || {};
  var myCourses   = [];

  Object.keys(enrollments).forEach(function(courseKey) {
    if (enrollments[courseKey][uKey] && courses[courseKey]) {
      myCourses.push({
        course_id: courseKey,
        course_name: courses[courseKey].course_name,
        progress: 0 // Default 0, akan dihitung cepat di bawah
      });
    }
  });

  if (myCourses.length === 0) return []; // Jika tidak ada kelas, langsung berhenti

  // 2. Siapkan request PARALEL untuk menghitung progress secara instan
  var requests = [];
  myCourses.forEach(function(c) {
    var cKey = safeKey(c.course_id);
    var filterID = encodeURIComponent('"' + c.course_id + '"');

    // Kumpulkan 6 request per kelas ke dalam satu antrean
    requests.push({ url: _fbUrl('aqualearn/materials') + '?orderBy=%22course_id%22&equalTo=' + filterID, muteHttpExceptions: true });
    requests.push({ url: _fbUrl('aqualearn/material_track/' + cKey + '/' + uKey), muteHttpExceptions: true });
    requests.push({ url: _fbUrl('aqualearn/quiz') + '?orderBy=%22course_id%22&equalTo=' + filterID, muteHttpExceptions: true });
    requests.push({ url: _fbUrl('aqualearn/quiz_track/' + cKey + '/' + uKey), muteHttpExceptions: true });
    requests.push({ url: _fbUrl('aqualearn/lesson_assign') + '?orderBy=%22course_id%22&equalTo=' + filterID, muteHttpExceptions: true });
    requests.push({ url: _fbUrl('aqualearn/lesson_submit/' + cKey), muteHttpExceptions: true });
  });

  // 3. JALANKAN SEMUA REQUEST BERSAMAAN (Sangat Menghemat Waktu!)
  var responses = UrlFetchApp.fetchAll(requests);

  // Helper untuk membaca hasil dengan aman
  function parseRes(res) {
    if (res.getResponseCode() !== 200) return {};
    var txt = res.getContentText();
    return (txt === 'null' || !txt) ? {} : JSON.parse(txt);
  }

  // 4. Hitung progress dari data yang sudah terkumpul
  var idx = 0;
  myCourses.forEach(function(c) {
    var resMat    = parseRes(responses[idx++]);
    var resMatTrk = parseRes(responses[idx++]);
    var resQz     = parseRes(responses[idx++]);
    var resQzTrk  = parseRes(responses[idx++]);
    var resLes    = parseRes(responses[idx++]);
    var resLesSub = parseRes(responses[idx++]);

    var matIds    = Object.keys(resMat);
    var quizIds   = Object.keys(resQz);
    var lessonIds = Object.keys(resLes);

    var matDone    = matIds.filter(function(k) { return !!resMatTrk[safeKey(k)]; }).length;
    var quizDone   = quizIds.filter(function(k) { return !!resQzTrk[safeKey(k)]; }).length;
    var lessonDone = lessonIds.filter(function(k) { return resLesSub[safeKey(k)] && resLesSub[safeKey(k)][uKey]; }).length;

    var pMat    = matIds.length > 0    ? (matDone / matIds.length) * 40 : 0;
    var pLesson = lessonIds.length > 0 ? (lessonDone / lessonIds.length) * 40 : 0;
    var pQuiz   = quizIds.length > 0   ? (quizDone / quizIds.length) * 20 : 0;

    c.progress = Math.round(pMat + pLesson + pQuiz);
  });

  return myCourses;
}

function getLecturerCourses(dosenId) {
  var courses = fbGet("aqualearn/courses") || {};
  var result  = [];

  Object.keys(courses).forEach(function(cKey) {
    if (courses[cKey].dosen_id === dosenId) {
      result.push({ course_id: cKey, course_name: courses[cKey].course_name });
    }
  });

  return result;
}

function tambahMataKuliah(courseId, courseName, dosenId) {
  var key      = safeKey(courseId);
  var existing = fbGet("aqualearn/courses/" + key);
  if (existing) return { success: false, message: "Kode Kelas sudah digunakan!" };

  fbPut("aqualearn/courses/" + key, {
    course_name: courseName,
    dosen_id:    dosenId
  });
  return { success: true };
}

function hapusMataKuliah(courseId, dosenId) {
  var key    = safeKey(courseId);
  var course = fbGet("aqualearn/courses/" + key);

  if (!course || course.dosen_id !== dosenId) {
    return { success: false, message: "Tidak punya akses." };
  }

  fbDelete("aqualearn/courses/"     + key);
  fbDelete("aqualearn/enrollments/" + key);
  fbDelete("aqualearn/materials/");   // partial delete butuh query — lihat catatan di bawah
  fbDelete("aqualearn/quiz/");
  fbDelete("aqualearn/nilai/"        + key);
  fbDelete("aqualearn/grade_config/" + key);
  fbDelete("aqualearn/jadwal/"       + key);
  fbDelete("aqualearn/lesson_assign/");
  fbDelete("aqualearn/lesson_submit/" + key);

  // Catatan: materials & quiz disimpan flat dengan course_id di dalam node-nya,
  // penghapusan cascade-nya memerlukan query filter (lihat hapusMateri/hapusKuis)

  return { success: true, message: "Kelas berhasil dihapus." };
}


// ══════════════════════════════════════════════
// ENROLLMENTS
// ══════════════════════════════════════════════

function enrollStudentsBatch(courseId, userIds) {
  var cKey    = safeKey(courseId);
  var users   = fbGet("aqualearn/users") || {};
  var members = fbGet("aqualearn/enrollments/" + cKey) || {};

  var berhasil    = 0;
  var tidakAda    = [];
  var sudahMasuk  = [];

  userIds.forEach(function(nim) {
    var uKey = safeKey(nim);
    if (!users[uKey]) { tidakAda.push(nim); return; }
    if (members[uKey]) { sudahMasuk.push(nim); return; }

    members[uKey] = true;
    berhasil++;
  });

  if (berhasil > 0) fbPut("aqualearn/enrollments/" + cKey, members);

  return {
    success:       true,
    message:       berhasil + " mahasiswa didaftarkan.",
    countBerhasil: berhasil,
    nimTidakAda:   tidakAda,
    nimSudahMasuk: sudahMasuk
  };
}

function unenrollStudent(courseId, userId) {
  fbDelete("aqualearn/enrollments/" + safeKey(courseId) + "/" + safeKey(userId));
  return { success: true };
}

function getStudentManagementData(courseId) {
  var cKey    = safeKey(courseId);
  var members = fbGet("aqualearn/enrollments/" + cKey) || {};
  var users   = fbGet("aqualearn/users") || {};

  var enrolled = [];
  Object.keys(members).forEach(function(uKey) {
    if (!users[uKey]) return;
    enrolled.push({ user_id: uKey, nama: users[uKey].nama_lengkap });
  });

  // Semua mahasiswa (role = Mahasiswa)
  var all = [];
  Object.keys(users).forEach(function(uKey) {
    if (users[uKey].role === "Mahasiswa") {
      all.push({ user_id: uKey, nama_lengkap: users[uKey].nama_lengkap });
    }
  });

  return { enrolled: enrolled, all: all };
}


// ══════════════════════════════════════════════
// MATERIALS
// ══════════════════════════════════════════════

function getCourseMaterials(courseId) {
  var all    = fbGet("aqualearn/materials") || {};
  var result = [];

  Object.keys(all).forEach(function(mKey) {
    var m = all[mKey];
    if (m.course_id === courseId) {
      result.push({ material_id: mKey, course_id: m.course_id,
                    title: m.title, url_drive: m.url_drive });
    }
  });
  return result;
}

function tambahMateri(courseId, title, urlDrive) {
  var mId = "M-" + new Date().getTime();
  fbPut("aqualearn/materials/" + safeKey(mId), {
    course_id: courseId, title: title, url_drive: urlDrive
  });
  invalidateCourseCache(courseId);
  return { success: true };
}

function hapusMateri(materialId) {
  var mat = fbGet("aqualearn/materials/" + safeKey(materialId));
  fbDelete("aqualearn/materials/" + safeKey(materialId));
  if (mat) invalidateCourseCache(mat.course_id);
  return { success: true };
}

function logMaterialAccess(userId, materialId) {
  var mat = fbGet("aqualearn/materials/" + safeKey(materialId));
  if (!mat) return false;

  var path = "aqualearn/material_track/"
           + safeKey(mat.course_id) + "/"
           + safeKey(userId) + "/"
           + safeKey(materialId);

  fbPut(path, new Date().toISOString());
  invalidateCourseCache(mat.course_id);
  return true;
}


// ══════════════════════════════════════════════
// QUIZ
// ══════════════════════════════════════════════

function getCourseQuizzes(courseId, userId) {
  var all    = fbGet("aqualearn/quiz") || {};
  var result = [];

  // Kumpulkan quiz_id yang sudah diklik user
  var doneIds = {};
  if (userId) {
    var tracks = fbGet("aqualearn/quiz_track/" + safeKey(courseId)
                     + "/" + safeKey(userId)) || {};
    Object.keys(tracks).forEach(function(qKey) { doneIds[qKey] = true; });
  }

  Object.keys(all).forEach(function(qKey) {
    var q = all[qKey];
    if (q.course_id !== courseId) return;
    result.push({
      quiz_id:   qKey,
      course_id: q.course_id,
      title:     q.title,
      url_form:  q.url_form,
      dikerjakan: !!doneIds[qKey]
    });
  });

  return result;
}

function tambahKuis(courseId, title, urlForm) {
  var qId = "Q-" + new Date().getTime();
  fbPut("aqualearn/quiz/" + safeKey(qId), {
    course_id: courseId, title: title, url_form: urlForm
  });
  invalidateCourseCache(courseId);
  return { success: true };
}

function hapusKuis(quizId) {
  var q = fbGet("aqualearn/quiz/" + safeKey(quizId));
  fbDelete("aqualearn/quiz/" + safeKey(quizId));
  if (q) invalidateCourseCache(q.course_id);
  return { success: true };
}

function logQuizAccess(userId, quizId) {
  var q = fbGet("aqualearn/quiz/" + safeKey(quizId));
  if (!q) return false;

  var path = "aqualearn/quiz_track/"
           + safeKey(q.course_id) + "/"
           + safeKey(userId) + "/"
           + safeKey(quizId);

  fbPut(path, new Date().toISOString());
  invalidateCourseCache(q.course_id);
  return true;
}


// ══════════════════════════════════════════════
// LESSON LEARN
// ══════════════════════════════════════════════

function getCourseLessons(courseId) {
  var all    = fbGet("aqualearn/lesson_assign") || {};
  var result = [];

  Object.keys(all).forEach(function(aKey) {
    var l = all[aKey];
    if (l.course_id !== courseId) return;

    var deadlineMs = 0;
    var parts      = String(l.deadline).split("-");
    if (parts.length === 3) {
      var d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1,
                       parseInt(parts[0]), 23, 59, 59);
      deadlineMs = d.getTime();
    }

    result.push({
      assign_id:   aKey,
      course_id:   l.course_id,
      topic:       l.topic,
      deadline:    l.deadline,
      deadline_ms: deadlineMs
    });
  });

  return result;
}

function tambahLesson(courseId, topic, deadline) {
  var aId = "L-" + new Date().getTime();
  fbPut("aqualearn/lesson_assign/" + safeKey(aId), {
    course_id: courseId, topic: topic, deadline: deadline
  });
  invalidateCourseCache(courseId);
  return { success: true };
}

function hapusLesson(assignId) {
  var l = fbGet("aqualearn/lesson_assign/" + safeKey(assignId));
  fbDelete("aqualearn/lesson_assign/" + safeKey(assignId));
  if (l) {
    fbDelete("aqualearn/lesson_submit/" + safeKey(l.course_id) + "/" + safeKey(assignId));
    invalidateCourseCache(l.course_id);
  }
  return { success: true };
}

function submitLesson(assignId, userId, insight) {
  var l = fbGet("aqualearn/lesson_assign/" + safeKey(assignId));
  if (!l) return false;

  var path = "aqualearn/lesson_submit/"
           + safeKey(l.course_id) + "/"
           + safeKey(assignId) + "/"
           + safeKey(userId);

  fbPut(path, {
    insight:   insight,
    status:    "Hadir",
    timestamp: new Date().toISOString()
  });

  invalidateCourseCache(l.course_id);
  return true;
}

function getSubmittedLessonIds(userId) {
  // Perlu scan semua course — cukup efisien karena data per user kecil
  var allSubmit = fbGet("aqualearn/lesson_submit") || {};
  var ids       = [];

  Object.keys(allSubmit).forEach(function(cKey) {
    Object.keys(allSubmit[cKey]).forEach(function(aKey) {
      if (allSubmit[cKey][aKey][safeKey(userId)]) {
        ids.push(aKey);
      }
    });
  });

  return ids;
}


// ══════════════════════════════════════════════
// JADWAL
// ══════════════════════════════════════════════

function getJadwalKelas(courseId) {
  var jadwal = fbGet("aqualearn/jadwal/" + safeKey(courseId)) || {};
  var result = [];

  Object.keys(jadwal).forEach(function(jKey) {
    var j = jadwal[jKey];
    if (!j || !j.pertemuan) return; // skip baris kosong/corrupt

    result.push({
      jadwal_id:   jKey,
      pertemuan:   j.pertemuan   || "",
      tanggal:     j.tanggal     || "",
      waktu:       j.waktu       || "",
      mode:        j.mode        || "Luring",
      lokasi_link: j.lokasi_link || ""
    });
  });

  // Urutkan berdasarkan tanggal ascending (format DD-MM-YYYY)
  result.sort(function(a, b) {
    function toMs(tgl) {
      var p = String(tgl).split("-");
      if (p.length !== 3) return 0;
      // DD-MM-YYYY → new Date(YYYY, MM-1, DD)
      return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0])).getTime();
    }
    return toMs(a.tanggal) - toMs(b.tanggal);
  });

  return result;
}

function tambahJadwal(courseId, pertemuan, tanggal, waktu, mode, lokasiLink) {
  var jId = "J-" + new Date().getTime();
  fbPut("aqualearn/jadwal/" + safeKey(courseId) + "/" + jId, {
    pertemuan: pertemuan, tanggal: tanggal, waktu: waktu,
    mode: mode, lokasi_link: lokasiLink
  });
  invalidateCourseCache(courseId);
  return { success: true };
}

function hapusJadwal(courseId, jadwalId) {
  fbDelete("aqualearn/jadwal/" + safeKey(courseId) + "/" + jadwalId);
  invalidateCourseCache(courseId);
  return { success: true };
}


// ══════════════════════════════════════════════
// NILAI
// ══════════════════════════════════════════════

function getRekapNilaiMahasiswa(courseId, userId) {
  var data   = fbGet("aqualearn/nilai/" + safeKey(courseId) + "/" + safeKey(userId)) || {};
  var result = [];

  Object.keys(data).forEach(function(jKey) {
    var entry = data[jKey];
    result.push({ jenis_nilai: entry.jenis, nilai: entry.nilai });
  });

  return result;
}

function getSemuaNilaiKelas(courseId) {
  var nilaiKelas = fbGet("aqualearn/nilai/" + safeKey(courseId)) || {};
  var users      = fbGet("aqualearn/users") || {};
  var result     = [];

  Object.keys(nilaiKelas).forEach(function(uKey) {
    var userNilai = nilaiKelas[uKey];
    var nama      = users[uKey] ? users[uKey].nama_lengkap : "Tidak Ditemukan";

    Object.keys(userNilai).forEach(function(jKey) {
      var entry = userNilai[jKey];
      result.push({
        jenis_nilai_key: jKey,
        user_id:         uKey,
        nama:            nama,
        jenis_nilai:     entry.jenis,
        nilai:           entry.nilai
      });
    });
  });

  return result;
}

function tambahNilaiMahasiswa(courseId, userId, jenisNilai, nilai) {
  var jKey = safeJenisNilai(jenisNilai);
  var path = "aqualearn/nilai/" + safeKey(courseId) + "/" + safeKey(userId) + "/" + jKey;

  fbPut(path, { jenis: jenisNilai, nilai: parseFloat(nilai) });
  invalidateCourseCache(courseId);
  return { success: true };
}

function hapusNilaiMahasiswa(courseId, userId, jenisNilaiKey) {
  var path = "aqualearn/nilai/" + safeKey(courseId) + "/" + safeKey(userId) + "/" + jenisNilaiKey;
  fbDelete(path);
  invalidateCourseCache(courseId);
  return { success: true };
}

function importNilaiBatch(courseId, jenisNilai, dataNilaiArray) {
  var cKey    = safeKey(courseId);
  var jKey    = safeJenisNilai(jenisNilai);
  var members = fbGet("aqualearn/enrollments/" + cKey) || {};
  var count   = 0;

  dataNilaiArray.forEach(function(item) {
    var nim  = String(item.nim).trim();
    var uKey = safeKey(nim);
    if (!members[uKey]) return;

    var path = "aqualearn/nilai/" + cKey + "/" + uKey + "/" + jKey;
    fbPut(path, { jenis: jenisNilai, nilai: parseFloat(item.nilai) });
    count++;
  });

  invalidateCourseCache(courseId);
  return { success: true, message: count + " data nilai berhasil diimpor!" };
}


// ══════════════════════════════════════════════
// GRADE CONFIG
// ══════════════════════════════════════════════

function getAdminGradeConfig(courseId) {
  var data = fbGet("aqualearn/grade_config/" + safeKey(courseId));
  if (!data) return { bobot: {}, is_released: false };
  return {
    bobot:       data.bobot || {},
    is_released: data.is_released === true
  };
}

function saveGradeConfig(courseId, bobotJsonStr, isReleased) {
  var bobot = {};
  try { bobot = JSON.parse(bobotJsonStr); } catch(e) {}

  fbPut("aqualearn/grade_config/" + safeKey(courseId), {
    bobot:       bobot,
    is_released: isReleased
  });
  return { success: true, message: "Pengaturan bobot berhasil disimpan!" };
}

// ══════════════════════════════════════════════
// RANKING & PROGRESS (kalkulasi dari Firebase)
// ══════════════════════════════════════════════

function calculateCourseProgress(userId, courseId) {
  var cKey = safeKey(courseId);
  var uKey = safeKey(userId);

  var materials   = fbGet("aqualearn/materials")  || {};
  var matTrack    = fbGet("aqualearn/material_track/" + cKey + "/" + uKey) || {};
  var quizAll     = fbGet("aqualearn/quiz")        || {};
  var quizTrack   = fbGet("aqualearn/quiz_track/"  + cKey + "/" + uKey) || {};
  var lessonAll   = fbGet("aqualearn/lesson_assign") || {};
  var lessonSubmit = fbGet("aqualearn/lesson_submit/" + cKey) || {};

  var matIds     = Object.keys(materials).filter(function(k){ return materials[k].course_id === courseId; });
  var quizIds    = Object.keys(quizAll).filter(function(k){ return quizAll[k].course_id === courseId; });
  var lessonIds  = Object.keys(lessonAll).filter(function(k){ return lessonAll[k].course_id === courseId; });

  var matDone    = matIds.filter(function(k){ return !!matTrack[safeKey(k)]; }).length;
  var quizDone   = quizIds.filter(function(k){ return !!quizTrack[safeKey(k)]; }).length;
  var lessonDone = lessonIds.filter(function(k){
    return lessonSubmit[safeKey(k)] && lessonSubmit[safeKey(k)][uKey];
  }).length;

  var pMat    = matIds.length    > 0 ? (matDone    / matIds.length)    * 40 : 0;
  var pLesson = lessonIds.length > 0 ? (lessonDone / lessonIds.length) * 40 : 0;
  var pQuiz   = quizIds.length   > 0 ? (quizDone   / quizIds.length)   * 20 : 0;

  return Math.round(pMat + pLesson + pQuiz);
}

function getStudentRankings(courseId) {
  var cKey    = safeKey(courseId);
  var members = fbGet("aqualearn/enrollments/" + cKey) || {};
  var users   = fbGet("aqualearn/users") || {};

  var matAll     = fbGet("aqualearn/materials")  || {};
  var quizAll    = fbGet("aqualearn/quiz")        || {};
  var lessonAll  = fbGet("aqualearn/lesson_assign") || {};
  var matTrackC  = fbGet("aqualearn/material_track/"  + cKey) || {};
  var quizTrackC = fbGet("aqualearn/quiz_track/"      + cKey) || {};
  var lSubC      = fbGet("aqualearn/lesson_submit/"   + cKey) || {};

  var matIds    = Object.keys(matAll).filter(function(k){ return matAll[k].course_id === courseId; });
  var quizIds   = Object.keys(quizAll).filter(function(k){ return quizAll[k].course_id === courseId; });
  var lessonIds = Object.keys(lessonAll).filter(function(k){ return lessonAll[k].course_id === courseId; });

  var rankings = [];

  Object.keys(members).forEach(function(uKey) {
    var nama     = users[uKey] ? users[uKey].nama_lengkap : uKey;
    var matTrack = matTrackC[uKey] || {};
    var qTrack   = quizTrackC[uKey] || {};

    // Poin materi
    var totalMat   = Object.keys(matTrack).length;
    var uniqueMat  = matIds.filter(function(k){ return !!matTrack[safeKey(k)]; }).length;
    var dupMat     = totalMat - uniqueMat;
    var scoreMat   = (uniqueMat * 5) + (dupMat * 3);

    // Poin kuis
    var uniqueQuiz = quizIds.filter(function(k){ return !!qTrack[safeKey(k)]; }).length;
    var scoreQuiz  = uniqueQuiz * 10;

    // Poin lesson
    var doneLessons = lessonIds.filter(function(k){
      return lSubC[safeKey(k)] && lSubC[safeKey(k)][uKey];
    }).length;
    var scoreLesson = doneLessons * 10;

    rankings.push({ userId: uKey, nama: nama, skor: scoreMat + scoreQuiz + scoreLesson });
  });

  rankings.sort(function(a, b){ return b.skor - a.skor; });
  return rankings;
}

function getInactiveStudents(courseId) {
  return getStudentRankings(courseId)
    .filter(function(r){ return r.skor === 0; })
    .map(function(r){ return r.nama; });
}

// ══════════════════════════════════════════════
// PAKET DATA RUANG KELAS MAHASISWA — Optimized (v3)
// Hemat Bandwidth & Filter Otomatis
// ══════════════════════════════════════════════
function getPaketDataRuangKelas(courseId, userId) {
  var cKey = safeKey(courseId);
  var uKey = safeKey(userId);

  // ── 1. Fetch data SATU KALI dengan Filter Kelas ──
  // Hanya mengambil data materi, kuis, dan tugas milik kelas ini saja
  var allMat     = fbGetFiltered('aqualearn/materials', 'course_id', courseId) || {};
  var allQuiz    = fbGetFiltered('aqualearn/quiz', 'course_id', courseId) || {};
  var allLesson  = fbGetFiltered('aqualearn/lesson_assign', 'course_id', courseId) || {};
  
  // Ambil data pendukung (spesifik path kelas/user)
  var cbtSet     = fbGet('aqualearn/cbt_settings')   || {};
  var qtData     = fbGet('aqualearn/quiz_track/' + cKey + '/' + uKey) || {};
  var lSubCourse = fbGet('aqualearn/lesson_submit/'  + cKey)          || {};
  var nilaiMhs   = fbGet('aqualearn/nilai/' + cKey + '/' + uKey)     || {};
  var gradeRaw   = fbGet('aqualearn/grade_config/'   + cKey);
  var jadwalRaw  = fbGet('aqualearn/jadwal/'         + cKey)          || {};

  // ── 2. Proses Materi ──
  var materials = [];
  Object.keys(allMat).forEach(function(k) {
    var m = allMat[k];
    materials.push({ 
      material_id: k, 
      course_id: m.course_id,
      title: m.title || '', 
      url_drive: m.url_drive || '' 
    });
  });

  // ── 3. Proses Kuis + Info CBT + Status Dikerjakan ──
  var doneQuizIds = {};
  Object.keys(qtData).forEach(function(k) { doneQuizIds[k] = true; });

  var quizzes = [];
  Object.keys(allQuiz).forEach(function(k) {
    var q = allQuiz[k];
    var urlForm = q.url_form || '';
    
    // Deteksi ID Kuis CBT dari URL Google Form
    var cbtQuizId = '';
    var match = urlForm.match(/quizId=([^&\s]+)/);
    if (match && match[1]) cbtQuizId = match[1].trim();
    
    var deadline = '', duration = 0;
    if (cbtQuizId && cbtSet[cbtQuizId]) {
      deadline = cbtSet[cbtQuizId].deadline           || '';
      duration = parseInt(cbtSet[cbtQuizId].duration_minutes) || 0;
    }
    
    quizzes.push({ 
      quiz_id: k, 
      course_id: courseId, 
      title: q.title || '',
      url_form: urlForm, 
      dikerjakan: !!doneQuizIds[safeKey(k)],
      cbt_deadline: deadline, 
      cbt_duration_menit: duration 
    });
  });

  // ── 4. Proses Lesson (Hanya tampilkan yang belum dikumpulkan) ──
  var lessons = [];
  Object.keys(allLesson).forEach(function(k) {
    var l = allLesson[k];
    
    // Cek apakah mahasiswa ini sudah mengumpulkan tugas ini
    var lessonSub = lSubCourse[safeKey(k)];
    if (lessonSub && lessonSub[uKey]) return; // Jika sudah submit, jangan tampilkan di daftar

    var deadlineMs = 0;
    var parts = String(l.deadline).split('-');
    if (parts.length === 3) {
      deadlineMs = new Date(
        parseInt(parts[2]), parseInt(parts[1]) - 1,
        parseInt(parts[0]), 23, 59, 59
      ).getTime();
    }
    lessons.push({ 
      assign_id: k, 
      course_id: l.course_id, 
      topic: l.topic || '',
      deadline: l.deadline || '', 
      deadline_ms: deadlineMs 
    });
  });

  // ── 5. Format Nilai & Pengaturan Bobot ──
  var nilai = [];
  Object.keys(nilaiMhs).forEach(function(jKey) {
    nilai.push({ 
      jenis_nilai: nilaiMhs[jKey].jenis, 
      nilai: nilaiMhs[jKey].nilai 
    });
  });

  var gradeConfig = { bobot: {}, is_released: false };
  if (gradeRaw) {
    gradeConfig = { 
      bobot: gradeRaw.bobot || {}, 
      is_released: gradeRaw.is_released === true 
    };
  }

  // ── 6. Proses Jadwal (Diurutkan berdasarkan tanggal) ──
  var jadwal = [];
  Object.keys(jadwalRaw).forEach(function(jKey) {
    var j = jadwalRaw[jKey];
    if (!j || !j.pertemuan) return;
    jadwal.push({ 
      jadwal_id: jKey, 
      pertemuan: j.pertemuan || '',
      tanggal: j.tanggal || '', 
      waktu: j.waktu || '',
      mode: j.mode || 'Luring', 
      lokasi_link: j.lokasi_link || '' 
    });
  });
  
  jadwal.sort(function(a, b) {
    function toMs(tgl) {
      var p = String(tgl).split('-');
      if (p.length !== 3) return 0;
      return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0])).getTime();
    }
    return toMs(a.tanggal) - toMs(b.tanggal);
  });

  // Kembalikan semua data dalam satu paket
  return {
    materials:   materials,
    quizzes:     quizzes,
    lessons:     lessons,
    nilai:       nilai,
    gradeConfig: gradeConfig,
    jadwal:      jadwal
  };
}

// ══════════════════════════════════════════════
// PAKET DATA ANALITIK KELAS — Ultimate Version
// ══════════════════════════════════════════════
function getPaketDataAnalitikKelas(courseId) {
  var cKey = safeKey(courseId);

  // ── 1. Fetch data SATU KALI, TAPI HANYA UNTUK KELAS INI ──
  // Menggunakan fbGetFiltered agar bandwidth sangat super hemat!
  var allMat    = fbGetFiltered('aqualearn/materials', 'course_id', courseId) || {};
  var allQuiz   = fbGetFiltered('aqualearn/quiz', 'course_id', courseId) || {};
  var allLesson = fbGetFiltered('aqualearn/lesson_assign', 'course_id', courseId) || {};
  
  var cbtSet    = fbGet('aqualearn/cbt_settings')   || {};
  var users     = fbGet('aqualearn/users')           || {};
  var members   = fbGet('aqualearn/enrollments/' + cKey)      || {};
  var matTrackC = fbGet('aqualearn/material_track/' + cKey)   || {};
  var qTrackC   = fbGet('aqualearn/quiz_track/'     + cKey)   || {};
  var lSubC     = fbGet('aqualearn/lesson_submit/'  + cKey)   || {};
  var nilaiCKey = fbGet('aqualearn/nilai/'          + cKey)   || {};
  var jadwalRaw = fbGet('aqualearn/jadwal/'         + cKey)   || {};

  // ── 2. Format materi ──
  var materials = [];
  Object.keys(allMat).forEach(function(k) {
    var m = allMat[k];
    materials.push({ material_id: k, course_id: m.course_id, title: m.title || '', url_drive: m.url_drive || '' });
  });

  // ── 3. Format kuis ──
  var quizzes = [];
  Object.keys(allQuiz).forEach(function(k) {
    var q = allQuiz[k];
    var urlForm = q.url_form || '';
    var cbtQuizId = '';
    var match = urlForm.match(/quizId=([^&\s]+)/);
    if (match && match[1]) cbtQuizId = match[1].trim();
    var deadline = '', duration = 0;
    if (cbtQuizId && cbtSet[cbtQuizId]) {
      deadline = cbtSet[cbtQuizId].deadline || '';
      duration = parseInt(cbtSet[cbtQuizId].duration_minutes) || 0;
    }
    quizzes.push({ quiz_id: k, course_id: courseId, title: q.title || '', url_form: urlForm, dikerjakan: false, cbt_deadline: deadline, cbt_duration_menit: duration });
  });

  // ── 4. Format lesson ──
  var lessons = [];
  Object.keys(allLesson).forEach(function(k) {
    var l = allLesson[k];
    var deadlineMs = 0;
    var parts = String(l.deadline).split('-');
    if (parts.length === 3) {
      deadlineMs = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]), 23, 59, 59).getTime();
    }
    lessons.push({ assign_id: k, course_id: l.course_id, topic: l.topic || '', deadline: l.deadline || '', deadline_ms: deadlineMs });
  });

  // ── 5. Daftar mahasiswa ──
  var enrolled = [];
  Object.keys(members).forEach(function(uKey) {
    if (!users[uKey]) return;
    enrolled.push({ user_id: uKey, nama: users[uKey].nama_lengkap });
  });
  var all = [];
  Object.keys(users).forEach(function(uKey) {
    if (users[uKey].role === 'Mahasiswa') all.push({ user_id: uKey, nama_lengkap: users[uKey].nama_lengkap });
  });

  // ── 6. Ranking (Aman karena data mat/quiz/lesson di atas sudah spesifik 1 kelas) ──
  var matIds    = Object.keys(allMat);
  var quizIds   = Object.keys(allQuiz);
  var lessonIds = Object.keys(allLesson);

  var rankings = [];
  Object.keys(members).forEach(function(uKey) {
    var nama    = users[uKey] ? users[uKey].nama_lengkap : uKey;
    var matTrk  = matTrackC[uKey] || {};
    var qTrk    = qTrackC[uKey]   || {};

    var totalMatClick = Object.keys(matTrk).length;
    var uniqueMat     = matIds.filter(function(k) { return !!matTrk[safeKey(k)]; }).length;
    var scoreMat      = (uniqueMat * 5) + ((totalMatClick - uniqueMat) * 3);
    var scoreQuiz     = quizIds.filter(function(k) { return !!qTrk[safeKey(k)]; }).length * 10;
    var doneLessons   = lessonIds.filter(function(k) { return lSubC[safeKey(k)] && lSubC[safeKey(k)][uKey]; }).length;
    var scoreLesson   = doneLessons * 10;

    rankings.push({ userId: uKey, nama: nama, skor: scoreMat + scoreQuiz + scoreLesson });
  });
  rankings.sort(function(a, b) { return b.skor - a.skor; });

  var inactive = rankings.filter(function(r) { return r.skor === 0; }).map(function(r) { return r.nama; });

  // ── 7 & 8 Nilai dan Jadwal (Sama seperti usulan sebelumnya) ──
  var nilaiResult = [];
  Object.keys(nilaiCKey).forEach(function(uKey) {
    var userNilai = nilaiCKey[uKey];
    var nama = users[uKey] ? users[uKey].nama_lengkap : 'Tidak Ditemukan';
    Object.keys(userNilai).forEach(function(jKey) {
      nilaiResult.push({ jenis_nilai_key: jKey, user_id: uKey, nama: nama, jenis_nilai: userNilai[jKey].jenis, nilai: userNilai[jKey].nilai });
    });
  });

  var jadwal = [];
  Object.keys(jadwalRaw).forEach(function(jKey) {
    var j = jadwalRaw[jKey];
    if (!j || !j.pertemuan) return;
    jadwal.push({ jadwal_id: jKey, pertemuan: j.pertemuan || '', tanggal: j.tanggal || '', waktu: j.waktu || '', mode: j.mode || 'Luring', lokasi_link: j.lokasi_link || '' });
  });
  jadwal.sort(function(a, b) {
    function toMs(tgl) {
      var p = String(tgl).split('-');
      if (p.length !== 3) return 0;
      return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0])).getTime();
    }
    return toMs(a.tanggal) - toMs(b.tanggal);
  });

  return { materials: materials, quizzes: quizzes, lessons: lessons, students: { enrolled: enrolled, all: all }, rankings: rankings, inactive: inactive, nilai: nilaiResult, jadwal: jadwal };
}

// ══════════════════════════════════════════════
// IMPORT KONTEN ANTAR KELAS
// ══════════════════════════════════════════════

function importKontenKelas(sourceCourseId, targetCourseId, newDeadline) {
  var srcMat   = getCourseMaterials(sourceCourseId);
  var srcQuiz  = getCourseQuizzes(sourceCourseId);
  var srcLesson = getCourseLessons(sourceCourseId);

  var tgtMat    = getCourseMaterials(targetCourseId).map(function(m){ return m.title.toLowerCase(); });
  var tgtQuiz   = getCourseQuizzes(targetCourseId).map(function(q){ return q.title.toLowerCase(); });
  var tgtLesson = getCourseLessons(targetCourseId).map(function(l){ return l.topic.toLowerCase(); });

  var t    = new Date().getTime();
  var cMat = 0, cQuiz = 0, cLesson = 0;

  srcMat.forEach(function(m, i) {
    if (tgtMat.indexOf(m.title.toLowerCase()) !== -1) return;
    var id = "M-" + t + "-IMP" + i;
    fbPut("aqualearn/materials/" + safeKey(id), {
      course_id: targetCourseId, title: m.title, url_drive: m.url_drive
    });
    cMat++;
  });

  srcQuiz.forEach(function(q, i) {
    if (tgtQuiz.indexOf(q.title.toLowerCase()) !== -1) return;
    var id = "Q-" + t + "-IMP" + i;
    fbPut("aqualearn/quiz/" + safeKey(id), {
      course_id: targetCourseId, title: q.title, url_form: q.url_form
    });
    cQuiz++;
  });

  srcLesson.forEach(function(l, i) {
    if (tgtLesson.indexOf(l.topic.toLowerCase()) !== -1) return;
    var id = "L-" + t + "-IMP" + i;
    fbPut("aqualearn/lesson_assign/" + safeKey(id), {
      course_id: targetCourseId, topic: l.topic, deadline: newDeadline
    });
    cLesson++;
  });

  if (cMat + cQuiz + cLesson > 0) invalidateCourseCache(targetCourseId);

  return {
    success: true,
    message: "Berhasil: " + cMat + " Materi, " + cQuiz + " Kuis, " + cLesson + " Presensi diimpor."
  };
}

// ══════════════════════════════════════════════
// CACHE (tetap pakai ScriptCache untuk speed)
// Firebase sebagai source of truth,
// CacheService sebagai lapisan cepat 5 menit
// ══════════════════════════════════════════════

var CACHE_TTL = 300;

function cacheGet(key) {
  try {
    var raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function cachePut(key, data) {
  try {
    var str = JSON.stringify(data);
    if (str.length < 95000) CacheService.getScriptCache().put(key, str, CACHE_TTL);
  } catch(e) {}
}

function cacheRemove(key) {
  try { CacheService.getScriptCache().remove(key); } catch(e) {}
}

function invalidateCourseCache(courseId) {
  var keys = [
    'paket_analitik_' + courseId,
    'paket_kelas_'    + courseId,
    'materials_'      + courseId,
    'quizzes_'        + courseId,
    'lessons_'        + courseId,
    'nilai_'          + courseId,
    'jadwal_'         + courseId
  ];
  CacheService.getScriptCache().removeAll(keys);
}

function refreshAndGetCourseData(courseId) {
  invalidateCourseCache(courseId);
  return {
    success:   true,
    materials: getCourseMaterials(courseId),
    quizzes:   getCourseQuizzes(courseId),
    lessons:   getCourseLessons(courseId)
  };
}

function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

function logCbtViolations(quizId, userId, violations) {
  if (!quizId || !userId || !violations || !violations.length) return false;
  var path = "aqualearn/cbt_violations/" + safeKey(quizId) + "/" + safeKey(userId);
  var existing = fbGet(path) || { total: 0, log: [] };
  existing.total += violations.length;
  existing.log = (existing.log || []).concat(violations);
  fbPut(path, existing);
  return true;
}

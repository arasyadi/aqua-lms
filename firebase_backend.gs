// ============================================================
// FILE: firebase_backend.gs
// Pengganti database.gs — semua operasi kini ke Firebase
// ============================================================

var FB_URL = "FIREBASE URL";
// Ganti dengan URL Firebase Anda (sama dengan migration.gs)

// ══════════════════════════════════════════════
// FIREBASE REST HELPERS
// ══════════════════════════════════════════════

function fbGet(path) {
  var res = UrlFetchApp.fetch(FB_URL + "/" + path + ".json",
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  var text = res.getContentText();
  return text === "null" ? null : JSON.parse(text);
}

function fbPut(path, data) {
  UrlFetchApp.fetch(FB_URL + "/" + path + ".json", {
    method:      "put",
    contentType: "application/json",
    payload:     JSON.stringify(data),
    muteHttpExceptions: true
  });
}

function fbPatch(path, data) {
  UrlFetchApp.fetch(FB_URL + "/" + path + ".json", {
    method:      "patch",
    contentType: "application/json",
    payload:     JSON.stringify(data),
    muteHttpExceptions: true
  });
}

function fbDelete(path) {
  UrlFetchApp.fetch(FB_URL + "/" + path + ".json", {
    method:             "delete",
    muteHttpExceptions: true
  });
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

  if (!existing) {
    // Login pertama — ikat perangkat
    fbPut("aqualearn/device_binding/" + key, {
      device_token:  deviceToken,
      waktu_tertaut: new Date().toISOString()
    });
    return { success: true, isNewBind: true };
  }

  if (existing.device_token === deviceToken) {
    return { success: true, isNewBind: false };
  }

  // Token beda — tolak
  var parts      = String(existing.device_token).split('_');
  var savedOs    = parts[0] || "Tidak diketahui";
  var savedBrwsr = parts[1] || "Tidak diketahui";
  function cap(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Tidak Dikenali"; }

  return {
    success: false,
    message: "⛔ Akses Ditolak: Akun Anda sudah tertaut dengan perangkat lain.\n\n"
           + "📱 Login Terakhir:\nPerangkat: " + cap(savedOs)
           + "\nBrowser: " + cap(savedBrwsr)
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
// COURSES
// ══════════════════════════════════════════════

function getStudentCourses(userId) {
  var enrollments = fbGet("aqualearn/enrollments") || {};
  var courses     = fbGet("aqualearn/courses")     || {};
  var result      = [];

  Object.keys(enrollments).forEach(function(courseKey) {
    var members = enrollments[courseKey];
    if (!members[safeKey(userId)]) return;

    var course = courses[courseKey];
    if (!course) return;

    result.push({
      course_id:   courseKey,
      course_name: course.course_name,
      progress:    calculateCourseProgress(userId, courseKey)
    });
  });

  return result;
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

    rankings.push({ nama: nama, skor: scoreMat + scoreQuiz + scoreLesson });
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
// PAKET DATA (satu call untuk semua UI)
// ══════════════════════════════════════════════

function getPaketDataRuangKelas(courseId, userId) {
  var quizzes      = getCourseQuizzesWithCbtInfo(courseId); // dari cbt_backend
  var doneQuizIds  = {};
  var qtData       = fbGet("aqualearn/quiz_track/" + safeKey(courseId) + "/" + safeKey(userId)) || {};
  Object.keys(qtData).forEach(function(k){ doneQuizIds[k] = true; });
  quizzes.forEach(function(q){ q.dikerjakan = !!doneQuizIds[safeKey(q.quiz_id)]; });

  var allLessons    = getCourseLessons(courseId);
  var submittedIds  = getSubmittedLessonIds(userId);
  var lessons       = allLessons.filter(function(l){
    return submittedIds.indexOf(String(l.assign_id)) === -1;
  });

  return {
    materials:   getCourseMaterials(courseId),
    quizzes:     quizzes,
    jadwal:      getJadwalKelas(courseId),
    lessons:     lessons,
    nilai:       getRekapNilaiMahasiswa(courseId, userId),
    gradeConfig: getAdminGradeConfig(courseId)
  };
}

function getPaketDataAnalitikKelas(courseId) {
  return {
    materials: getCourseMaterials(courseId),
    quizzes:   getCourseQuizzes(courseId),
    lessons:   getCourseLessons(courseId),
    students:  getStudentManagementData(courseId),
    rankings:  getStudentRankings(courseId),
    inactive:  getInactiveStudents(courseId),
    nilai:     getSemuaNilaiKelas(courseId),
    jadwal:    getJadwalKelas(courseId)
  };
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

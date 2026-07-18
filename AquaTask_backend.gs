// ============================================================
// AQUATASK — BACKEND GOOGLE APPS SCRIPT  (Revisi: Multi-File)
// Sisipkan file ini di GAS project AquaLearn yang sama.
// Semua path Firebase menggunakan prefix aqualearn/aquatask/
//
// PERUBAHAN DARI VERSI SEBELUMNYA:
//   - aquaTaskSimpanTugas : tambah field max_files
//   - aquaTaskSubmit      : terima fileUrls[] & fileNames[] (array)
//                           tetap kompatibel dengan parameter lama
//   - aquaTaskGetDashboard: sertakan file_urls & file_names dalam respons
//   - aquaTaskGetDataMahasiswa: idem
//   - aquaTaskExportCSV   : join multi-file URL dengan " | "
// ============================================================

// ============================================================
// HELPER: Generate ID unik
// ============================================================
function _aquaTaskId() {
  return 'TASK-' + new Date().getTime();
}
function _aquaSubId() {
  return 'SUB-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
}

// ============================================================
// 1. DOSEN — Simpan tugas baru
//    BARU: field max_files (default 1, nilai 1–10)
// ============================================================
function aquaTaskSimpanTugas(courseId, taskData) {
  if (!courseId || !taskData || !taskData.judul) {
    return { success: false, message: 'Data tugas tidak lengkap.' };
  }

  var taskId = _aquaTaskId();
  var path   = 'aqualearn/aquatask/tasks/' + courseId + '/' + taskId;
  var maxF   = parseInt(taskData.max_files) || 1;
  if (maxF < 1)  maxF = 1;
  if (maxF > 10) maxF = 10;

  fbPut(path, {
    task_id:    taskId,
    course_id:  courseId,
    judul:      taskData.judul,
    deskripsi:  taskData.deskripsi || '',
    docs_url:   taskData.docs_url  || '',
    tipe:       taskData.tipe      || 'Individu',
    bobot:      parseFloat(taskData.bobot) || 0,
    deadline:   taskData.deadline  || '',
    max_files:  maxF,
    created_at: new Date().toISOString()
  });

  try { invalidateCourseCache(courseId); } catch(e) {}

  return { success: true, taskId: taskId, message: 'Tugas "' + taskData.judul + '" berhasil dibuat!' };
}

// ============================================================
// 2. DOSEN — Hapus tugas beserta seluruh pengumpulan
// ============================================================
function aquaTaskHapusTugas(courseId, taskId) {
  if (!courseId || !taskId) return { success: false, message: 'Parameter tidak lengkap.' };

  fbDelete('aqualearn/aquatask/tasks/'       + courseId + '/' + taskId);
  fbDelete('aqualearn/aquatask/submissions/' + taskId);

  try { invalidateCourseCache(courseId); } catch(e) {}

  return { success: true, message: 'Tugas berhasil dihapus.' };
}

// ============================================================
// 3. DOSEN — Update deadline tugas
// ============================================================
function aquaTaskUpdateDeadline(courseId, taskId, newDeadline) {
  if (!courseId || !taskId || !newDeadline) {
    return { success: false, message: 'Parameter tidak lengkap.' };
  }

  var path     = 'aqualearn/aquatask/tasks/' + courseId + '/' + taskId;
  var existing = fbGet(path);

  if (!existing) {
    return { success: false, message: 'Tugas tidak ditemukan.' };
  }

  fbPatch(path, { deadline: newDeadline });

  try { invalidateCourseCache(courseId); } catch(e) {}

  return { success: true, message: 'Deadline berhasil diperbarui.' };
}

// ============================================================
// 4. MAHASISWA — Upload file ke Google Drive
//    Tidak berubah; dipanggil satu kali per file dari frontend.
// ============================================================
function aquaTaskUploadFile(base64Data, fileName, mimeType, courseId) {
  if (!base64Data || !fileName) {
    return { success: false, message: 'Data file tidak lengkap.' };
  }

  try {
    var decoded    = Utilities.base64Decode(base64Data);
    var blob       = Utilities.newBlob(decoded, mimeType || 'application/octet-stream', fileName);
    var folderName = 'AquaTask_' + (courseId || 'Umum');
    var folders    = DriveApp.getFoldersByName(folderName);
    var folder     = folders.hasNext()
                   ? folders.next()
                   : DriveApp.createFolder(folderName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      success:  true,
      fileUrl:  file.getUrl(),
      fileName: fileName
    };
  } catch(e) {
    return { success: false, message: 'Upload gagal: ' + e.toString() };
  }
}

// ============================================================
// 5. MAHASISWA — Ambil data untuk panel kumpul tugas
//    BARU: sertakan file_urls & file_names di mySubmissions
// ============================================================
function aquaTaskGetDataMahasiswa(courseId, userId) {
  var tasksRaw = fbGet('aqualearn/aquatask/tasks/' + courseId) || {};
  var tasks    = [];
  for (var tid in tasksRaw) {
    tasks.push(tasksRaw[tid]);
  }

  var mySubmissions = {};
  tasks.forEach(function(t) {
    var allSubs = fbGet('aqualearn/aquatask/submissions/' + t.task_id) || {};
    for (var sid in allSubs) {
      var sub = allSubs[sid];
      if (sub.anggota_kelompok && sub.anggota_kelompok.indexOf(userId) > -1) {
        mySubmissions[t.task_id] = _normalizeSubFiles(sub);
        break;
      }
    }
  });

  var cKey        = safeKey(courseId);
  var enrollments = fbGet('aqualearn/enrollments/' + cKey) || {};
  var usersData   = fbGet('aqualearn/users')              || {};
  var mahasiswaList = [];
  for (var uKey in enrollments) {
    mahasiswaList.push({
      userId: uKey,
      nama:   (usersData[uKey] && usersData[uKey].nama_lengkap) || uKey
    });
  }

  var userInfo = usersData[userId] || { nama_lengkap: userId };

  return {
    tasks:         tasks,
    mySubmissions: mySubmissions,
    mahasiswaList: mahasiswaList,
    userInfo:      userInfo
  };
}

// ============================================================
// 6. MAHASISWA — Submit pengumpulan tugas
//    BARU: fileUrls & fileNames bisa berupa array atau string
//          (backward compatible dengan versi lama yang kirim
//           string tunggal)
// ============================================================
function aquaTaskSubmit(taskId, courseId, userId, anggotaArr, fileUrls, fileNames) {
  if (!taskId || !userId) return { success: false, message: 'Parameter tidak lengkap.' };

  // Deadline check
  var taskData = fbGet('aqualearn/aquatask/tasks/' + courseId + '/' + taskId);
  if (taskData && taskData.deadline) {
    var dl = new Date(taskData.deadline).getTime();
    if (!isNaN(dl) && new Date().getTime() > dl) {
      return { success: false, message: 'Deadline telah lewat. Pengumpulan tidak diterima.' };
    }
  }

  // Duplikat check
  var existing = fbGet('aqualearn/aquatask/submissions/' + taskId) || {};
  for (var sid in existing) {
    var sub = existing[sid];
    if (sub.anggota_kelompok && sub.anggota_kelompok.indexOf(userId) > -1) {
      return { success: false, message: 'Anda (atau kelompok Anda) sudah pernah mengumpulkan tugas ini.' };
    }
  }

  // Normalisasi fileUrls & fileNames ke array
  // Frontend baru kirim array; jaga kompatibilitas jika ada pemanggil lama
  var urlsArr  = Array.isArray(fileUrls)  ? fileUrls  : (fileUrls  ? [fileUrls]  : []);
  var namesArr = Array.isArray(fileNames) ? fileNames : (fileNames ? [fileNames] : []);

  // Validasi max_files
  var maxF = parseInt(taskData && taskData.max_files) || 1;
  if (urlsArr.length > maxF) {
    return { success: false, message: 'Jumlah file melebihi batas yang diizinkan (' + maxF + ' file).' };
  }

  var subId = _aquaSubId();
  fbPut('aqualearn/aquatask/submissions/' + taskId + '/' + subId, {
    sub_id:           subId,
    task_id:          taskId,
    course_id:        courseId,
    pengumpul_utama:  userId,
    anggota_kelompok: anggotaArr || [userId],
    // ── Multi-file fields (baru) ──
    file_urls:        urlsArr,
    file_names:       namesArr,
    // ── Backward compat: simpan juga field lama (indeks 0) ──
    file_url:         urlsArr[0]  || '',
    file_nama:        namesArr[0] || '',
    waktu_kumpul:     new Date().toISOString(),
    nilai:            null,
    catatan_dosen:    ''
  });

  var jumlahFile = urlsArr.length;
  return {
    success: true,
    subId:   subId,
    message: 'Tugas berhasil dikumpulkan!' +
             (jumlahFile > 1 ? ' (' + jumlahFile + ' file terkirim)' : '')
  };
}

// ============================================================
// 7. DOSEN — Hapus submission (izinkan re-submission)
// ============================================================
function aquaTaskHapusSubmission(taskId, subId, courseId) {
  if (!taskId || !subId) {
    return { success: false, message: 'Parameter tidak lengkap.' };
  }

  var path     = 'aqualearn/aquatask/submissions/' + taskId + '/' + subId;
  var existing = fbGet(path);

  if (!existing) {
    return { success: false, message: 'Data pengumpulan tidak ditemukan.' };
  }

  fbDelete(path);

  return { success: true, message: 'Pengumpulan berhasil dihapus. Mahasiswa dapat mengumpulkan ulang.' };
}

// ============================================================
// 8. DOSEN — Ambil data dashboard (tugas + rekap pengumpulan)
//    BARU: sertakan file_urls & file_names di setiap submission
// ============================================================
function aquaTaskGetDashboard(courseId) {
  var tasksRaw  = fbGet('aqualearn/aquatask/tasks/' + courseId) || {};
  var usersData = fbGet('aqualearn/users')                      || {};

  var cKey        = safeKey(courseId);
  var enrollments = fbGet('aqualearn/enrollments/' + cKey) || {};
  var totalMhs    = Object.keys(enrollments).length;

  var tasks = [];
  for (var tid in tasksRaw) {
    var t    = tasksRaw[tid];
    var subs = fbGet('aqualearn/aquatask/submissions/' + tid) || {};

    var submissionsArr = [];
    for (var sid in subs) {
      var s        = subs[sid];
      var normSub  = _normalizeSubFiles(s);
      submissionsArr.push({
        sub_id:           s.sub_id,
        task_id:          tid,
        pengumpul_utama:  s.pengumpul_utama,
        pengumpul_nama:   (usersData[s.pengumpul_utama] && usersData[s.pengumpul_utama].nama_lengkap) || s.pengumpul_utama,
        anggota_kelompok: s.anggota_kelompok || [],
        anggota_nama:     (s.anggota_kelompok || []).map(function(u) {
          return (usersData[u] && usersData[u].nama_lengkap) || u;
        }),
        // ── Multi-file (baru) ──
        file_urls:        normSub.file_urls,
        file_names:       normSub.file_names,
        // ── Backward compat ──
        file_url:         normSub.file_url,
        file_nama:        normSub.file_nama,
        waktu_kumpul:     s.waktu_kumpul,
        nilai:            s.nilai,
        catatan_dosen:    s.catatan_dosen || ''
      });
    }

    var sudahNimSet = {};
    submissionsArr.forEach(function(s) {
      (s.anggota_kelompok || []).forEach(function(nim) { sudahNimSet[nim] = true; });
    });

    tasks.push({
      task:           t,
      submissions:    submissionsArr,
      jumlah_masuk:   submissionsArr.length,
      individu_sudah: Object.keys(sudahNimSet).length,
      total_mhs:      totalMhs
    });
  }

  return { tasks: tasks, totalMhs: totalMhs };
}

// ============================================================
// 9. DOSEN — Simpan nilai satu submission (TANPA auto-sync LMS)
//    Gunakan "📤 Submit Nilai ke LMS" untuk sinkronisasi manual.
// ============================================================
function aquaTaskSimpanNilai(taskId, courseId, subId, nilai, catatanDosen) {
  var n = parseFloat(nilai);
  if (isNaN(n) || n < 0 || n > 100) {
    return { success: false, message: 'Nilai harus antara 0–100.' };
  }

  fbPatch('aqualearn/aquatask/submissions/' + taskId + '/' + subId, {
    nilai:         n,
    catatan_dosen: catatanDosen || ''
  });

  // ── DIHAPUS: _distribusiNilai tidak dipanggil di sini ──
  // Sinkronisasi ke Manajemen Nilai LMS dilakukan secara eksplisit
  // melalui tombol "📤 Submit Nilai ke LMS" (aquaTaskSimpanNilaiBatch).

  return { success: true, message: 'Nilai berhasil disimpan.' };
}

// ============================================================
// 10. DOSEN — Simpan nilai BATCH
// ============================================================
function aquaTaskSimpanNilaiBatch(taskId, courseId, nilaiBatch, label) {
  if (!taskId || !courseId || !nilaiBatch || !nilaiBatch.length) {
    return { success: false, message: 'Parameter tidak lengkap.' };
  }

  var berhasil = 0;
  var gagal    = 0;

  nilaiBatch.forEach(function(item) {
    try {
      var n = parseFloat(item.nilai);
      if (isNaN(n) || n < 0 || n > 100) { gagal++; return; }

      fbPatch('aqualearn/aquatask/submissions/' + taskId + '/' + item.subId, {
        nilai:         n,
        catatan_dosen: label || ''
      });

      var subData = fbGet('aqualearn/aquatask/submissions/' + taskId + '/' + item.subId);
      if (subData && subData.anggota_kelompok) {
        _distribusiNilai(courseId, taskId, subData.anggota_kelompok, n, label);
      }

      berhasil++;
    } catch(e) {
      gagal++;
      Logger.log('aquaTaskSimpanNilaiBatch error subId=' + item.subId + ': ' + e.toString());
    }
  });

  return {
    success:  true,
    berhasil: berhasil,
    gagal:    gagal,
    message:  berhasil + ' nilai berhasil disimpan.'
  };
}

// ============================================================
// INTERNAL — Distribusi nilai ke node aqualearn/nilai
// ============================================================
function _distribusiNilai(courseId, taskId, anggotaArr, n, labelOverride) {
  var cKey         = safeKey(courseId);
  var taskD        = fbGet('aqualearn/aquatask/tasks/' + courseId + '/' + taskId);
  var judulDefault = taskD ? taskD.judul : taskId;
  var label        = (labelOverride && labelOverride.trim())
                   ? labelOverride.trim()
                   : judulDefault;
  var jKey         = safeKey(taskId);

  var oldKeys = [];
  if (safeKey(judulDefault) !== jKey) oldKeys.push(safeKey(judulDefault));
  if (labelOverride && safeKey(labelOverride.trim()) !== jKey) oldKeys.push(safeKey(labelOverride.trim()));

  anggotaArr.forEach(function(nim) {
    var uKey = safeKey(nim);

    oldKeys.forEach(function(ok) {
      if (fbGet('aqualearn/nilai/' + cKey + '/' + uKey + '/' + ok)) {
        fbDelete('aqualearn/nilai/' + cKey + '/' + uKey + '/' + ok);
      }
    });

    fbPut('aqualearn/nilai/' + cKey + '/' + uKey + '/' + jKey, {
      jenis: label,
      nilai: n
    });

    cacheRemove('paket_personal_' + courseId + '_' + nim);
  });

  invalidateCourseCache(courseId);
}

// ============================================================
// 11. DOSEN — Export rekap ke format CSV
//     BARU: multi-file URL digabung dengan " | "
// ============================================================
function aquaTaskExportCSV(taskId, courseId) {
  var taskData  = fbGet('aqualearn/aquatask/tasks/' + courseId + '/' + taskId);
  var subsRaw   = fbGet('aqualearn/aquatask/submissions/' + taskId) || {};
  var usersData = fbGet('aqualearn/users') || {};

  var judulTugas = taskData ? taskData.judul : taskId;
  var rows = [['NIM', 'Nama Mahasiswa', 'Judul Tugas', 'Tipe', 'Pengumpul Utama',
               'Waktu Kumpul', 'File URL', 'Nama File', 'Jumlah File', 'Nilai', 'Catatan Dosen']];

  for (var sid in subsRaw) {
    var s        = subsRaw[sid];
    var tipe     = taskData ? taskData.tipe : '-';
    var norm     = _normalizeSubFiles(s);
    var pengumpulNama = (usersData[s.pengumpul_utama] && usersData[s.pengumpul_utama].nama_lengkap) || s.pengumpul_utama;
    var waktu    = s.waktu_kumpul ? new Date(s.waktu_kumpul).toLocaleString('id-ID') : '-';
    var fileUrls = norm.file_urls.join(' | ');
    var fileNames= norm.file_names.join(' | ');
    var fileCount= norm.file_urls.length;

    (s.anggota_kelompok || [s.pengumpul_utama]).forEach(function(nim) {
      var nama = (usersData[nim] && usersData[nim].nama_lengkap) || nim;
      rows.push([
        nim, nama, judulTugas, tipe, pengumpulNama, waktu,
        fileUrls, fileNames, fileCount,
        s.nilai !== null && s.nilai !== undefined ? s.nilai : '-',
        s.catatan_dosen || ''
      ]);
    });
  }

  var csv = rows.map(function(r) {
    return r.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');

  return { success: true, csv: csv, judul: judulTugas };
}

// ============================================================
// INTERNAL HELPER — Normalisasi field file submission
//   Agar kompatibel dengan data lama (field tunggal) dan
//   data baru (array file_urls / file_names).
//   Selalu kembalikan objek dengan KEDUA format.
// ============================================================
function _normalizeSubFiles(sub) {
  var urls, names;

  if (sub.file_urls && Array.isArray(sub.file_urls) && sub.file_urls.length) {
    // Data baru — array sudah ada
    urls  = sub.file_urls;
    names = sub.file_names || urls.map(function(_, i) { return 'File '+(i+1); });
  } else if (sub.file_url) {
    // Data lama — field tunggal, bungkus ke array
    urls  = [sub.file_url];
    names = [sub.file_nama || 'File Tugas'];
  } else {
    urls  = [];
    names = [];
  }

  return {
    file_urls:  urls,
    file_names: names,
    // backward compat fields
    file_url:   urls[0]  || '',
    file_nama:  names[0] || ''
  };
}

// ============================================================
// 12. ROUTING — Tambahkan ke doGet() yang sudah ada:
//
//   if (page === 'aquatask') {
//     return HtmlService
//       .createHtmlOutputFromFile('AquaTask')
//       .setTitle('AquaTask — Pengumpulan Tugas')
//       .addMetaTag('viewport','width=device-width,initial-scale=1.0')
//       .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
//   }
//
// ============================================================

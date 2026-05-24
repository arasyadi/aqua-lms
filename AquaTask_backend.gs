// ============================================================
// AQUATASK — BACKEND GOOGLE APPS SCRIPT
// Sisipkan file ini di GAS project AquaLearn yang sama.
// Semua path Firebase menggunakan prefix aqualearn/aquatask/
// sehingga tidak mengganggu struktur data LMS yang sudah ada.
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
// ============================================================
function aquaTaskSimpanTugas(courseId, taskData) {
  if (!courseId || !taskData || !taskData.judul) {
    return { success: false, message: 'Data tugas tidak lengkap.' };
  }

  var taskId = _aquaTaskId();
  var path   = 'aqualearn/aquatask/tasks/' + courseId + '/' + taskId;

  fbPut(path, {
    task_id:   taskId,
    course_id: courseId,
    judul:     taskData.judul,
    deskripsi: taskData.deskripsi  || '',
    tipe:      taskData.tipe       || 'Individu',   // 'Individu' | 'Kelompok'
    bobot:     parseFloat(taskData.bobot) || 0,
    deadline:  taskData.deadline   || '',
    created_at: new Date().toISOString()
  });

  return { success: true, taskId: taskId, message: 'Tugas "' + taskData.judul + '" berhasil dibuat!' };
}

// ============================================================
// 2. DOSEN — Hapus tugas beserta seluruh pengumpulan
// ============================================================
function aquaTaskHapusTugas(courseId, taskId) {
  if (!courseId || !taskId) return { success: false, message: 'Parameter tidak lengkap.' };

  fbDelete('aqualearn/aquatask/tasks/'       + courseId + '/' + taskId);
  fbDelete('aqualearn/aquatask/submissions/' + taskId);

  return { success: true, message: 'Tugas berhasil dihapus.' };
}

// ============================================================
// 3. MAHASISWA — Ambil data lengkap untuk panel kumpul tugas
//    Return: { tasks, submissions, mahasiswaList, userInfo }
// ============================================================
function aquaTaskGetDataMahasiswa(courseId, userId) {
  // Daftar tugas di kelas ini
  var tasksRaw = fbGet('aqualearn/aquatask/tasks/' + courseId) || {};
  var tasks    = [];
  for (var tid in tasksRaw) {
    tasks.push(tasksRaw[tid]);
  }

  // Pengumpulan milik user ini di semua tugas kelas
  var mySubmissions = {};
  tasks.forEach(function(t) {
    var allSubs = fbGet('aqualearn/aquatask/submissions/' + t.task_id) || {};
    for (var sid in allSubs) {
      var sub = allSubs[sid];
      if (sub.anggota_kelompok && sub.anggota_kelompok.indexOf(userId) > -1) {
        mySubmissions[t.task_id] = sub;
        break;
      }
    }
  });

  // Daftar mahasiswa sekelas (untuk centang anggota kelompok)
  var cKey = safeKey(courseId);
  var enrollments = fbGet('aqualearn/enrollments/' + cKey) || {};
  var usersData   = fbGet('aqualearn/users')              || {};
  var mahasiswaList = [];
  for (var uKey in enrollments) {
    mahasiswaList.push({
      userId: uKey,
      nama:   (usersData[uKey] && usersData[uKey].nama_lengkap) || uKey
    });
  }

  // Info user sendiri
  var userInfo = usersData[userId] || { nama_lengkap: userId };

  return {
    tasks:         tasks,
    mySubmissions: mySubmissions,
    mahasiswaList: mahasiswaList,
    userInfo:      userInfo
  };
}

// ============================================================
// 4. MAHASISWA — Submit pengumpulan tugas
//    fileUrl: link Google Drive yang di-paste mahasiswa
// ============================================================
function aquaTaskSubmit(taskId, courseId, userId, anggotaArr, fileUrl, fileName) {
  if (!taskId || !userId) return { success: false, message: 'Parameter tidak lengkap.' };

  // Cek deadline
  var taskData = fbGet('aqualearn/aquatask/tasks/' + courseId + '/' + taskId);
  if (taskData && taskData.deadline) {
    var dl = new Date(taskData.deadline).getTime();
    if (!isNaN(dl) && new Date().getTime() > dl) {
      return { success: false, message: 'Deadline telah lewat. Pengumpulan tidak diterima.' };
    }
  }

  // Cek apakah user sudah pernah submit di tugas ini
  var existing = fbGet('aqualearn/aquatask/submissions/' + taskId) || {};
  for (var sid in existing) {
    var sub = existing[sid];
    if (sub.anggota_kelompok && sub.anggota_kelompok.indexOf(userId) > -1) {
      return { success: false, message: 'Anda (atau kelompok Anda) sudah pernah mengumpulkan tugas ini.' };
    }
  }

  var subId = _aquaSubId();
  fbPut('aqualearn/aquatask/submissions/' + taskId + '/' + subId, {
    sub_id:           subId,
    task_id:          taskId,
    course_id:        courseId,
    pengumpul_utama:  userId,
    anggota_kelompok: anggotaArr || [userId],
    file_url:         fileUrl  || '',
    file_nama:        fileName || '',
    waktu_kumpul:     new Date().toISOString(),
    nilai:            null,
    catatan_dosen:    ''
  });

  return { success: true, subId: subId, message: 'Tugas berhasil dikumpulkan!' };
}

// ============================================================
// 5. DOSEN — Ambil data dashboard (tugas + rekap pengumpulan)
// ============================================================
function aquaTaskGetDashboard(courseId) {
  var tasksRaw = fbGet('aqualearn/aquatask/tasks/' + courseId) || {};
  var usersData = fbGet('aqualearn/users') || {};

  // Enrollments untuk mengetahui total mahasiswa
  var cKey = safeKey(courseId);
  var enrollments  = fbGet('aqualearn/enrollments/' + cKey) || {};
  var totalMhs     = Object.keys(enrollments).length;

  var tasks = [];
  for (var tid in tasksRaw) {
    var t    = tasksRaw[tid];
    var subs = fbGet('aqualearn/aquatask/submissions/' + tid) || {};

    // Kumpulkan submission
    var submissionsArr = [];
    for (var sid in subs) {
      var s = subs[sid];
      submissionsArr.push({
        sub_id:           s.sub_id,
        pengumpul_utama:  s.pengumpul_utama,
        pengumpul_nama:   (usersData[s.pengumpul_utama] && usersData[s.pengumpul_utama].nama_lengkap) || s.pengumpul_utama,
        anggota_kelompok: s.anggota_kelompok || [],
        anggota_nama:     (s.anggota_kelompok || []).map(function(u) {
          return (usersData[u] && usersData[u].nama_lengkap) || u;
        }),
        file_url:         s.file_url,
        file_nama:        s.file_nama,
        waktu_kumpul:     s.waktu_kumpul,
        nilai:            s.nilai,
        catatan_dosen:    s.catatan_dosen || ''
      });
    }

    // Hitung individu yang sudah submit (flat dari semua kelompok)
    var sudahNimSet = {};
    submissionsArr.forEach(function(s) {
      (s.anggota_kelompok || []).forEach(function(nim) { sudahNimSet[nim] = true; });
    });

    tasks.push({
      task:            t,
      submissions:     submissionsArr,
      jumlah_masuk:    submissionsArr.length,
      individu_sudah:  Object.keys(sudahNimSet).length,
      total_mhs:       totalMhs
    });
  }

  return { tasks: tasks, totalMhs: totalMhs };
}

// ============================================================
// 6. DOSEN — Simpan nilai (batch ke semua anggota kelompok)
//    Sekaligus sinkron ke aqualearn/nilai untuk rekap utama LMS
// ============================================================
function aquaTaskSimpanNilai(taskId, courseId, subId, nilai, catatanDosen) {
  var n = parseFloat(nilai);
  if (isNaN(n) || n < 0 || n > 100) return { success: false, message: 'Nilai harus antara 0–100.' };

  // Update submission record
  fbPatch('aqualearn/aquatask/submissions/' + taskId + '/' + subId, {
    nilai:         n,
    catatan_dosen: catatanDosen || ''
  });

  // Distribusi batch ke anggota → aqualearn/nilai (agar muncul di rekap LMS)
  var subData = fbGet('aqualearn/aquatask/submissions/' + taskId + '/' + subId);
  if (subData && subData.anggota_kelompok && courseId) {
    var cKey  = safeKey(courseId);
    // Ambil judul tugas untuk label jenis nilai
    var taskD = fbGet('aqualearn/aquatask/tasks/' + courseId + '/' + taskId);
    var label = taskD ? taskD.judul : taskId;
    var jKey  = safeKey(label);

    subData.anggota_kelompok.forEach(function(nim) {
      var uKey = safeKey(nim);
      fbPut('aqualearn/nilai/' + cKey + '/' + uKey + '/' + jKey, {
        jenis: label,
        nilai: n
      });
      cacheRemove('paket_personal_' + courseId + '_' + nim);
    });
    invalidateCourseCache(courseId);
  }

  return { success: true, message: 'Nilai berhasil disimpan dan didistribusikan ke semua anggota!' };
}

// ============================================================
// 7. DOSEN — Export rekap ke format CSV (string)
//    Dipanggil dari frontend, hasil di-download via Blob
// ============================================================
function aquaTaskExportCSV(taskId, courseId) {
  var taskData  = fbGet('aqualearn/aquatask/tasks/' + courseId + '/' + taskId);
  var subsRaw   = fbGet('aqualearn/aquatask/submissions/' + taskId) || {};
  var usersData = fbGet('aqualearn/users') || {};

  var judulTugas = taskData ? taskData.judul : taskId;
  var rows = [['NIM', 'Nama Mahasiswa', 'Judul Tugas', 'Tipe', 'Pengumpul Utama', 'Waktu Kumpul', 'Nilai', 'Catatan Dosen']];

  for (var sid in subsRaw) {
    var s = subsRaw[sid];
    var tipe = taskData ? taskData.tipe : '-';
    var pengumpulNama = (usersData[s.pengumpul_utama] && usersData[s.pengumpul_utama].nama_lengkap) || s.pengumpul_utama;
    var waktu = s.waktu_kumpul ? new Date(s.waktu_kumpul).toLocaleString('id-ID') : '-';

    (s.anggota_kelompok || [s.pengumpul_utama]).forEach(function(nim) {
      var nama = (usersData[nim] && usersData[nim].nama_lengkap) || nim;
      rows.push([nim, nama, judulTugas, tipe, pengumpulNama, waktu, s.nilai !== null ? s.nilai : '-', s.catatan_dosen || '']);
    });
  }

  // Bangun string CSV
  var csv = rows.map(function(r) {
    return r.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');

  return { success: true, csv: csv, judul: judulTugas };
}

// ============================================================
// 8. ROUTING — Tambahkan ke fungsi doGet() yang sudah ada:
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

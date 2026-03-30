// File: Code.gs

// Fungsi ini akan dieksekusi pertama kali saat Web App dibuka
// File: Kode.gs

function doGet(e) {
  // Routing untuk Halaman Ujian (Mahasiswa)
  if (e.parameter.page === 'cbt') {
    var htmlOutput = HtmlService.createTemplateFromFile('CBT').evaluate();
    htmlOutput.setTitle('Ujian CBT - AquaLearn LMS');
    htmlOutput.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    return htmlOutput;
  }
  
  // Routing untuk Dashboard Analitik CBT (Dosen)
  if (e.parameter.page === 'cbt_dashboard') {
    var htmlOutput = HtmlService.createTemplateFromFile('CBT_Dashboard').evaluate();
    htmlOutput.setTitle('Dashboard CBT - AquaLearn');
    htmlOutput.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    return htmlOutput;
  }
  
  // Default: Halaman Utama LMS
  var htmlOutput = HtmlService.createTemplateFromFile('Index').evaluate();
  htmlOutput.setTitle('AquaLearn LMS');
  htmlOutput.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return htmlOutput;
}

// Fungsi untuk mengecek login pengguna (Diperbarui)
function checkLogin(username, password) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("USERS");
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    // data[i][0] = user_id, data[i][1] = password, data[i][2] = nama_lengkap, data[i][3] = role
    if (data[i][0] == username && data[i][1] == password) {
      return { 
        success: true, 
        userId: data[i][0],
        name: data[i][2],
        role: data[i][3] 
      };
    }
  }
  return { success: false, message: "Username atau Password salah!" };
}

// Fungsi untuk mengambil Link Web App secara otomatis
function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

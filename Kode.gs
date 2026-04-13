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

// Fungsi untuk mengambil Link Web App secara otomatis
function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

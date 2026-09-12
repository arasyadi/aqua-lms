// File: Code.gs

function doGet(e) {
  var page = (e.parameter && e.parameter.page) ? e.parameter.page : '';

  // Routing untuk Halaman Ujian (Mahasiswa)
  if (page === 'cbt') {
    var htmlOutput = HtmlService.createTemplateFromFile('CBT').evaluate();
    htmlOutput.setTitle('Ujian CBT - AquaLearn LMS');
    htmlOutput.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    return htmlOutput;
  }

  // Routing untuk Dashboard Analitik CBT (Dosen)
  if (page === 'cbt_dashboard') {
    var htmlOutput = HtmlService.createTemplateFromFile('CBT_Dashboard').evaluate();
    htmlOutput.setTitle('Dashboard CBT - AquaLearn');
    htmlOutput.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    return htmlOutput;
  }

  // ── AquaTask — Portal Pengumpulan Tugas ──
  if (page === 'aquatask') {
    var htmlOutput = HtmlService.createHtmlOutputFromFile('AquaTask');
    htmlOutput.setTitle('AquaTask — Pengumpulan Tugas');
    htmlOutput.addMetaTag('viewport', 'width=device-width,initial-scale=1.0');
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

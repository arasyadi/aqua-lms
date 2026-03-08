// File: Code.gs

// Fungsi ini akan dieksekusi pertama kali saat Web App dibuka
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Private LMS by @arasyadi_')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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

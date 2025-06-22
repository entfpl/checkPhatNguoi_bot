// --- Cấu hình Telegram ---
// THAY THẾ HAI GIÁ TRỊ NÀY BẰNG TOKEN CỦA BOT VÀ CHAT ID CỦA BẠN
var TELEGRAM_BOT_TOKEN = 'YOUR_BOT_TOKEN';
var TELEGRAM_CHAT_ID = 'YOUR_CHAT_ID';

function sendTelegramMessage(chatId, text) {
  var telegramUrl = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';

  if (text.length > 4096) {
    text = text.substring(0, 4000) + "\n... (tin nhắn quá dài, đã cắt bớt)";
  }

  var options = {
    method: 'post',
    payload: {
      chat_id: chatId,
      text: text,
    },
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(telegramUrl, options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();

    if (responseCode >= 200 && responseCode < 300) {
      Logger.log('Telegram message sent successfully.');
      return true;
    } else {
      Logger.log('Failed to send Telegram message. Code: ' + responseCode + ', Response: ' + responseText);
      return false;
    }
  } catch (e) {
    Logger.log('Error sending Telegram message: ' + e.toString());
    return false;
  }
}

function getPhatNguoiDataForPlate(bienso) {
  var cleanedBienso = bienso.replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "");

  if (!cleanedBienso) {
    return '⚠️ Biển số trống/không hợp lệ được bỏ qua.';
  }

  var apiUrl = 'https://api.checkphatnguoi.vn/phatnguoi';
  var payload = {
    bienso: cleanedBienso
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(apiUrl, options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();

    if (responseCode >= 200 && responseCode < 300) {
      var data = JSON.parse(responseText);

      if (data.error) {
        return '❌ Biển số: ' + bienso + ' - Lỗi từ API: ' + data.error;
      } else if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        var allViolations = data.data;
        var pendingViolations = allViolations.filter(item => item["Trạng thái"] === "Chưa xử phạt");
        var resolvedViolations = allViolations.filter(item => item["Trạng thái"] === "Đã xử phạt");

        var resultMessage = '';

        if (pendingViolations.length > 0) {
          resultMessage += '🚨🚨 Biển số: ' + bienso + ' - *CÓ LỖI PHẠT NGUỘI CHƯA XỬ PHẠT!* \n\n';

          var formattedPendingViolations = pendingViolations.map(function(item) {
             var noiGiaiQuyet = Array.isArray(item["Nơi giải quyết vụ việc"]) ? item["Nơi giải quyết vụ việc"].join(', ') : (item["Nơi giải quyết vụ việc"] || 'Không rõ');
             return (
               '  - Thời gian: ' + item["Thời gian vi phạm"] + '\n' +
               '  - Địa điểm: ' + item["Địa điểm vi phạm"] + '\n' +
               '  - Hành vi: ' + item["Hành vi vi phạm"] + '\n' +
               '  - Trạng thái: ' + item["Trạng thái"] + '\n' +
               '  - Nơi giải quyết: ' + noiGiaiQuyet
             );
          }).join('\n---\n');

          resultMessage += formattedPendingViolations;

          if (resolvedViolations.length > 0) {
            resultMessage += '\n\n_(' + resolvedViolations.length + ' lỗi đã xử phạt trước đó)_';
          }

        } else if (resolvedViolations.length > 0) {
          resultMessage = '✅ Biển số: ' + bienso + ' - Có lỗi phạt nguội nhưng *TẤT CẢ ' + resolvedViolations.length + ' LỖI ĐÃ XỬ PHẠT*.';

        } else {
           resultMessage = '✅ Biển số: ' + bienso + ' - Có dữ liệu trả về nhưng không phân loại được trạng thái lỗi.';
           Logger.log('Warning: API returned data but no violations with known statuses for plate ' + bienso);
        }

        return resultMessage;

      } else {
        return '✅ Biển số: ' + bienso + ' - Không tìm thấy lỗi phạt nguội.';
      }

    } else {
       try {
           var errorData = JSON.parse(responseText);
           if (errorData && errorData.error) {
               return '❌ Biển số: ' + bienso + ' - Lỗi server (' + responseCode + '): ' + errorData.error;
           } else {
               return '❌ Biển số: ' + bienso + ' - Lỗi kết nối/Server (' + responseCode + ')';
           }
       } catch(e){
            return '❌ Biển số: ' + bienso + ' - Lỗi kết nối/Server (' + responseCode + ')';
       }
    }

  } catch (e) {
    return '❌ Biển số: ' + bienso + ' - Lỗi khi gửi yêu cầu: ' + e.toString();
  }
}

function sendTelegramDailyPhatNguoiReport() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var timeZone = ss.getSpreadsheetTimeZone();

  var range = sheet.getRange('A:A');
  var values = range.getValues();

  var licensePlates = [];
  for (var i = 0; i < values.length; i++) {
    var plate = values[i][0];
    if (plate) {
      var cleanedPlate = String(plate).trim().replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "");
       if (cleanedPlate) {
         licensePlates.push(cleanedPlate);
       }
    }
  }

  if (licensePlates.length === 0) {
    Logger.log('Không có biển số nào trong cột A để kiểm tra.');
    sendTelegramMessage(TELEGRAM_CHAT_ID, 'ℹ️ Báo cáo Phạt Nguội hàng ngày: Không tìm thấy biển số nào trong cột A để tra cứu.');
    return;
  }

  var today = new Date();
  var formattedDate = Utilities.formatDate(today, timeZone, 'dd/MM/yyyy');

  var startMessage = '📰 *Bắt đầu tra cứu Phạt Nguội hàng ngày cho ' + licensePlates.length + ' biển số ngày ' + formattedDate + '...*';
  sendTelegramMessage(TELEGRAM_CHAT_ID, startMessage);

  Utilities.sleep(2000);

  for (var i = 0; i < licensePlates.length; i++) {
    var plate = licensePlates[i];
    Logger.log('Checking plate: ' + plate);

    var result = getPhatNguoiDataForPlate(plate);

    sendTelegramMessage(TELEGRAM_CHAT_ID, result);

    Utilities.sleep(1500);
  }

  Utilities.sleep(2000);
  sendTelegramMessage(TELEGRAM_CHAT_ID, ' *Hoàn thành tra cứu Phạt Nguội hàng ngày.*');

  Logger.log('Finished daily Phat Nguoi report, sent as separate messages.');
}

function createDailyTrigger() {
  deleteDailyTrigger();

  ScriptApp.newTrigger('sendDailyPhatNguoiReport')
      .timeBased()
      .everyDays(1)
      .atHour(8)
      .create();

  SpreadsheetApp.getUi().alert('Thông báo', 'Đã thiết lập Trigger gửi báo cáo Phạt Nguội hàng ngày vào khoảng 8-9 giờ sáng.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function deleteDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailyPhatNguoiReport') {
      ScriptApp.deleteTrigger(triggers[i]);
      Logger.log('Đã xóa Trigger báo cáo Telegram cũ.');
    }
  }
  SpreadsheetApp.getUi().alert('Thông báo', 'Đã xóa các Trigger báo cáo Phạt Nguội hàng ngày (nếu có).', SpreadsheetApp.getUi().ButtonSet.OK);
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Tra Cứu PN')
      .addItem('Tra cứu biển số đã chọn', 'checkPhatNguoiSelectedCell')
      .addSeparator()
      .addItem('Thiết lập báo cáo Telegram hàng ngày', 'createDailyTrigger')
      .addItem('Xóa báo cáo Telegram hàng ngày', 'deleteDailyTrigger')
      .addToUi();
}
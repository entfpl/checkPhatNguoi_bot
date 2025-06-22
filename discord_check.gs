// --- Cấu hình Discord ---
// THAY BẰNG LINK WEBHOOK CỦA BẠN (vào kênh Discord > Edit Channel > Integrations > Webhook > Copy URL)
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/YOUR_WEBHOOK';

function sendDiscordMessage(content) {
  if (content.length > 1900) {
    content = content.substring(0, 1900) + '\n... (tin nhắn quá dài, đã cắt bớt)';
  }

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ content }),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, options);
    const code = response.getResponseCode();

    if (code >= 200 && code < 300) {
      Logger.log('Đã gửi tin nhắn Discord.');
      return true;
    } else {
      Logger.log('Lỗi gửi Discord: ' + code + ' - ' + response.getContentText());
      return false;
    }
  } catch (e) {
    Logger.log('Lỗi khi gửi Discord: ' + e.toString());
    return false;
  }
}

function getPhatNguoiDataForPlate(bienso) {
  const cleanedBienso = bienso.replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "");
  if (!cleanedBienso) return '⚠️ Biển số trống/không hợp lệ.';

  const apiUrl = 'https://api.checkphatnguoi.vn/phatnguoi';
  const payload = { bienso: cleanedBienso };
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(apiUrl, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode >= 200 && responseCode < 300) {
      const data = JSON.parse(responseText);

      if (data.error) {
        return '❌ Biển số: ' + bienso + ' - Lỗi API: ' + data.error;
      } else if (data.data?.length > 0) {
        const pending = data.data.filter(i => i["Trạng thái"] === "Chưa xử phạt");
        const resolved = data.data.filter(i => i["Trạng thái"] === "Đã xử phạt");
        let msg = '';

        if (pending.length > 0) {
          msg += '🚨🚨 Biển số: ' + bienso + ' - *CÓ LỖI PHẠT NGUỘI CHƯA XỬ PHẠT!*\n\n';
          msg += pending.map(i => {
            const noi = Array.isArray(i["Nơi giải quyết vụ việc"]) ? i["Nơi giải quyết vụ việc"].join(', ') : (i["Nơi giải quyết vụ việc"] || 'Không rõ');
            return `- Thời gian: ${i["Thời gian vi phạm"]}\n- Địa điểm: ${i["Địa điểm vi phạm"]}\n- Hành vi: ${i["Hành vi vi phạm"]}\n- Trạng thái: ${i["Trạng thái"]}\n- Nơi giải quyết: ${noi}`;
          }).join('\n---\n');

          if (resolved.length > 0) {
            msg += `\n\n_(${resolved.length} lỗi đã xử phạt trước đó)_`;
          }

        } else if (resolved.length > 0) {
          msg = '✅ Biển số: ' + bienso + ` - Có lỗi phạt nguội nhưng "TẤT CẢ ${resolved.length} LỖI ĐÃ XỬ PHẠT".`;
        } else {
          msg = '✅ Biển số: ' + bienso + ' - Có dữ liệu trả về nhưng không phân loại được lỗi.';
        }

        return msg;
      } else {
        return '✅ Biển số: ' + bienso + ' - Không tìm thấy lỗi phạt nguội.';
      }

    } else {
      try {
        const err = JSON.parse(responseText);
        return '❌ Biển số: ' + bienso + ` - Lỗi server (${responseCode}): ` + (err?.error || 'Không rõ');
      } catch (e) {
        return '❌ Biển số: ' + bienso + ' - Lỗi kết nối/Server (' + responseCode + ')';
      }
    }
  } catch (e) {
    return '❌ Biển số: ' + bienso + ' - Lỗi khi gửi yêu cầu: ' + e.toString();
  }
}

function sendDiscordDailyPhatNguoiReport() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timeZone = ss.getSpreadsheetTimeZone();
  const values = sheet.getRange('A:A').getValues();
  const licensePlates = values.map(v => String(v[0] || '').trim().replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "")).filter(v => v);

  if (licensePlates.length === 0) {
    Logger.log('Không có biển số.');
    sendDiscordMessage('ℹ️ Không có biển số nào trong cột A để tra cứu.');
    return;
  }

  const today = new Date();
  const formattedDate = Utilities.formatDate(today, timeZone, 'dd/MM/yyyy');
  sendDiscordMessage(`📰 *Bắt đầu tra cứu Phạt Nguội ngày ${formattedDate} cho ${licensePlates.length} biển số...*`);

  Utilities.sleep(2000);

  for (const plate of licensePlates) {
    Logger.log('Checking plate: ' + plate);
    const result = getPhatNguoiDataForPlate(plate);
    sendDiscordMessage(result);
    Utilities.sleep(1500);
  }

  Utilities.sleep(2000);
  sendDiscordMessage('📢 *Hoàn thành tra cứu Phạt Nguội hàng ngày.*');
}

function createDailyTrigger() {
  deleteDailyTrigger();

  ScriptApp.newTrigger('sendDailyPhatNguoiReport')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();

  SpreadsheetApp.getUi().alert('Thông báo', 'Đã thiết lập Trigger gửi báo cáo Discord hàng ngày vào khoảng 8-9 giờ sáng.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function deleteDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'sendDailyPhatNguoiReport') {
      ScriptApp.deleteTrigger(t);
    }
  });
  SpreadsheetApp.getUi().alert('Thông báo', 'Đã xóa các Trigger báo cáo Discord hàng ngày.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tra Cứu Phạt Nguội')
    .addItem('Tra cứu biển số đã chọn', 'checkPhatNguoiSelectedCell')
    .addSeparator()
    .addItem('Thiết lập báo cáo Discord hàng ngày', 'createDailyTrigger')
    .addItem('Xóa báo cáo Discord hàng ngày', 'deleteDailyTrigger')
    .addToUi();
}
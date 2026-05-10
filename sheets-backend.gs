// ============================================================
//  AI 튜터 Google Sheets 백엔드
//  배포 방법:
//  1. https://script.google.com 접속 → 새 프로젝트
//  2. 이 코드 전체를 Code.gs에 붙여넣기
//  3. SPREADSHEET_ID를 본인의 Google Sheets ID로 변경
//     (Sheets URL: docs.google.com/spreadsheets/d/[여기가 ID]/edit)
//  4. 배포 → 새 배포 → 웹 앱
//     - 실행: 나(본인 계정)
//     - 액세스: 모든 사용자
//  5. 배포 URL을 복사하여 ai-tutor.html의 SHEETS_WEBAPP_URL에 붙여넣기
// ============================================================

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  try {
    if (data.action === 'save') saveConversation(data);
    else if (data.action === 'updateStatus') updateStudentStatus(data);
  } catch (err) {
    console.error(err);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const { action, studentName, limit } = e.parameter;
  let result = {};
  try {
    if (action === 'history') {
      result.history = getHistory(studentName, parseInt(limit) || 30);
    }
  } catch (err) {
    result.error = err.toString();
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// 대화기록 시트에 한 턴 저장
function saveConversation(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('대화기록');
  if (!sheet) {
    sheet = ss.insertSheet('대화기록');
    sheet.getRange(1, 1, 1, 7).setValues([
      ['교육생명', '날짜', '시간', '질문', '답변', '페이지', '세션ID']
    ]);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    data.studentName, data.date, data.time,
    data.question, data.answer,
    data.pageNumber || '', data.sessionId
  ]);
}

// 교육생현황 시트 업데이트
function updateStudentStatus(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('교육생현황');
  if (!sheet) {
    sheet = ss.insertSheet('교육생현황');
    sheet.getRange(1, 1, 1, 3).setValues([
      ['교육생명', '마지막접속', '총질문수']
    ]);
    sheet.setFrozenRows(1);
  }
  const values = sheet.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.studentName) { rowIdx = i + 1; break; }
  }
  if (rowIdx === -1) {
    sheet.appendRow([data.studentName, data.lastAccess, data.totalQuestions]);
  } else {
    sheet.getRange(rowIdx, 2, 1, 2).setValues([[data.lastAccess, data.totalQuestions]]);
  }
}

// 특정 학생의 최근 기록 조회
function getHistory(studentName, limit) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('대화기록');
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  const history = [];
  for (let i = values.length - 1; i >= 1 && history.length < limit; i--) {
    if (values[i][0] === studentName) {
      history.unshift({
        date: values[i][1],
        time: values[i][2],
        question: values[i][3],
        answer: values[i][4],
        pageNumber: values[i][5],
        sessionId: values[i][6]
      });
    }
  }
  return history;
}

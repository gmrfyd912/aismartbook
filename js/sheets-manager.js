// Google Sheets 연동 모듈
// Google Apps Script Web App을 통해 대화 기록을 저장/로드합니다.
const SheetsManager = (() => {
  let _url = '';
  const SESSION_ID = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function configure(url) { _url = (url || '').trim(); }
  function isConfigured() { return !!_url; }

  function extractPage(text) {
    const m = text.match(/(\d+)\s*페이지|페이지\s*(\d+)/);
    return m ? (m[1] || m[2]) : '';
  }

  // 대화 한 턴 저장 (fire-and-forget, CORS 우회)
  async function saveConversation({ studentName, question, answer }) {
    if (!_url) return;
    const now = new Date();
    try {
      fetch(_url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'save',
          studentName,
          date: now.toLocaleDateString('ko-KR'),
          time: now.toLocaleTimeString('ko-KR'),
          question,
          answer,
          pageNumber: extractPage(question),
          sessionId: SESSION_ID
        })
      });
    } catch {}
  }

  // 이전 대화 기록 로드 (최근 limit개)
  async function loadHistory(studentName, limit = 30) {
    if (!_url) return [];
    try {
      const url = `${_url}?action=history&studentName=${encodeURIComponent(studentName)}&limit=${limit}`;
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.history) ? data.history : [];
    } catch { return []; }
  }

  // 교육생 현황 시트 업데이트 (fire-and-forget)
  async function updateStudentStatus(studentName, totalQuestions) {
    if (!_url) return;
    const now = new Date();
    try {
      fetch(_url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'updateStatus',
          studentName,
          lastAccess: now.toLocaleDateString('ko-KR'),
          totalQuestions
        })
      });
    } catch {}
  }

  return { configure, isConfigured, saveConversation, loadHistory, updateStudentStatus, SESSION_ID };
})();

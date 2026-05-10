// Google Sheets API — 서비스 계정 JWT 인증 (브라우저 직접 호출)
const SheetsManager = (() => {
  const SPREADSHEET_ID = '1OJP0vGKju90cE9kCpv7W1v3mtutxyFzWMdzVhTOMLFw';
  const SCOPE          = 'https://www.googleapis.com/auth/spreadsheets';
  const SHEETS_BASE    = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

  let _sa          = null;  // service account JSON (캐시)
  let _token       = null;  // access token (캐시)
  let _tokenExpiry = 0;

  // ── 서비스 계정 JSON 로드 ───────────────────────
  async function loadSA() {
    if (_sa) return _sa;
    // student/ 하위 페이지 → 프로젝트 루트가 ../
    for (const path of ['../service-account.json', '/service-account.json', './service-account.json']) {
      try {
        const r = await fetch(path);
        if (r.ok) { _sa = await r.json(); return _sa; }
      } catch {}
    }
    console.warn('[Sheets] service-account.json을 찾을 수 없습니다. 프로젝트 루트에 파일을 배치하세요.');
    return null;
  }

  // ── Access Token 발급/갱신 ──────────────────────
  async function getToken() {
    if (_token && Date.now() < _tokenExpiry - 60000) return _token;
    const sa = await loadSA();
    if (!sa) return null;
    try {
      const jwt = await makeJWT(sa);
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt
        })
      });
      const data = await res.json();
      if (!data.access_token) throw new Error(JSON.stringify(data));
      _token       = data.access_token;
      _tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
      return _token;
    } catch (e) {
      console.warn('[Sheets] 토큰 발급 실패:', e.message);
      return null;
    }
  }

  // ── JWT 생성 (RS256) ────────────────────────────
  async function makeJWT(sa) {
    const now = Math.floor(Date.now() / 1000);
    const hdr = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const pay = b64u(JSON.stringify({ iss: sa.client_email, scope: SCOPE,
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const sig = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      await importKey(sa.private_key),
      new TextEncoder().encode(`${hdr}.${pay}`)
    );
    return `${hdr}.${pay}.${b64uBytes(new Uint8Array(sig))}`;
  }

  async function importKey(pem) {
    const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
    const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
      'pkcs8', der.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign']
    );
  }

  function b64u(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
  function b64uBytes(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  // ── Sheets API 저수준 호출 ──────────────────────
  async function appendRow(sheet, values) {
    const token = await getToken();
    if (!token) return;
    const range = encodeURIComponent(`${sheet}!A:Z`);
    await fetch(`${SHEETS_BASE}/values/${range}:append?valueInputOption=RAW`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [values] })
    });
  }

  async function readSheet(sheet) {
    const token = await getToken();
    if (!token) return null;
    const range = encodeURIComponent(`${sheet}!A:Z`);
    const res = await fetch(`${SHEETS_BASE}/values/${range}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.ok ? res.json() : null;
  }

  async function updateRow(sheet, rowNum, values) {
    const token = await getToken();
    if (!token) return;
    const range = encodeURIComponent(`${sheet}!A${rowNum}:Z${rowNum}`);
    await fetch(`${SHEETS_BASE}/values/${range}?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [values] })
    });
  }

  // ── 헬퍼 ────────────────────────────────────────
  const nowDate = () => new Date().toLocaleDateString('ko-KR');
  const nowTime = () => new Date().toLocaleTimeString('ko-KR');

  function extractPage(text) {
    const m = text.match(/(\d+)\s*페이지|페이지\s*(\d+)/);
    return m ? (m[1] || m[2]) : '';
  }

  // ── Public API ──────────────────────────────────

  // AI 튜터 대화 한 턴 저장
  async function saveConversation(studentName, question, answer) {
    try {
      await appendRow('대화기록', [studentName, nowDate(), nowTime(), question, answer, extractPage(question)]);
    } catch (e) { console.warn('[Sheets] 대화기록 저장 실패:', e.message); }
  }

  // OX 퀴즈 결과 한 문제 저장
  async function saveQuizResult(studentName, question, isCorrect, relatedPage) {
    try {
      await appendRow('퀴즈기록', [studentName, nowDate(), nowTime(), question, isCorrect ? 'O' : 'X', relatedPage || '']);
    } catch (e) { console.warn('[Sheets] 퀴즈기록 저장 실패:', e.message); }
  }

  // 동작 연습 결과 저장
  async function saveMotionResult(studentName, motionName, isSuccess, attempts) {
    try {
      await appendRow('동작연습기록', [studentName, nowDate(), nowTime(), motionName, isSuccess ? '성공' : '실패', attempts]);
    } catch (e) { console.warn('[Sheets] 동작연습기록 저장 실패:', e.message); }
  }

  // AR 열람 기록 저장 (durationSec: 체류시간 초, 생략 시 빈칸)
  async function saveARView(studentName, page, durationSec) {
    try {
      await appendRow('AR열람기록', [studentName, nowDate(), nowTime(), page, durationSec != null ? durationSec + '초' : '']);
    } catch (e) { console.warn('[Sheets] AR열람기록 저장 실패:', e.message); }
  }

  // 이전 대화 기록 불러오기 (최근 limit개)
  async function loadRecentHistory(studentName, limit = 20) {
    try {
      const data = await readSheet('대화기록');
      if (!data?.values) return [];
      const rows = data.values.slice(1).filter(r => r[0] === studentName);
      return rows.slice(-limit).map(r => ({
        date: r[1] || '', time: r[2] || '',
        question: r[3] || '', answer: r[4] || '',
        pageNumber: r[5] || ''
      }));
    } catch (e) {
      console.warn('[Sheets] 이전 기록 로드 실패:', e.message);
      return [];
    }
  }

  // 교육생현황 시트 업데이트 (접속 시마다 호출)
  async function updateStudentStatus(studentName, totalQuestions, weakPoints, progress) {
    try {
      const data = await readSheet('교육생현황');
      const rows = data?.values || [];
      const idx  = rows.findIndex((r, i) => i > 0 && r[0] === studentName);
      const row  = [studentName, `${nowDate()} ${nowTime()}`, totalQuestions, weakPoints || '', progress || ''];
      if (idx === -1) await appendRow('교육생현황', row);
      else            await updateRow('교육생현황', idx + 1, row);
    } catch (e) { console.warn('[Sheets] 교육생현황 업데이트 실패:', e.message); }
  }

  return { saveConversation, saveQuizResult, saveMotionResult, saveARView, loadRecentHistory, updateStudentStatus };
})();

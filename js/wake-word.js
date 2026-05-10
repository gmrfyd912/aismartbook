// AI 조교 Wake Word Engine — 상시 대기 모드
(function () {
  'use strict';

  // ── 상수 ──────────────────────────────────────────────────────
  const PROXY      = 'https://orange-resonance-c0d3.gmrfyd912.workers.dev';
  const WAKE_WORDS = ['ai조교', 'ai 조교', '에이아이조교', '조교야', 'ai야', '조교'];
  const IDLE_MS    = 30000;

  // 스크립트 기준 경로 계산 (어느 디렉터리에서 로드해도 정확)
  const scriptEl  = document.currentScript;
  const scriptSrc = scriptEl ? scriptEl.src : '';
  const jsDir     = scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1);
  const CHAR_IMG  = jsDir.replace('/js/', '/assets/') + 'instructor_idle.png';

  // 전용 AI 조교가 있거나 관련 없는 페이지는 인식 생략
  const pagePath   = location.pathname;
  const SKIP_REC   = ['ai-tutor.html', 'instructor/dashboard'].some(p => pagePath.includes(p));
  const SKIP_ALL   = ['landing.html', 'index.html', 'pose.html', 'pose-capture', 'pose-extract']
                       .some(p => pagePath.includes(p));

  if (SKIP_ALL) return;

  // ── 상태 ──────────────────────────────────────────────────────
  let state     = 'idle';   // idle | active | thinking | speaking
  let rec       = null;
  let idleTimer = null;
  let history   = [];
  let userName  = '';
  let userRole  = '교육생';

  // ── 세션 감지 ─────────────────────────────────────────────────
  function loadSession() {
    try {
      if (window.SessionManager) {
        const s = SessionManager.get?.();
        if (s?.name) { userName = s.name; userRole = '교육생'; return; }
      }
    } catch {}
    try {
      const instr = JSON.parse(localStorage.getItem('instructorSession') || 'null');
      if (instr?.isInstructor) { userName = instr.name || ''; userRole = '강사'; return; }
    } catch {}
  }

  // ── CSS 주입 ──────────────────────────────────────────────────
  function injectCSS() {
    const s = document.createElement('style');
    s.textContent = `
      #ww-icon {
        position: fixed; bottom: 76px; right: 14px; z-index: 9000;
        width: 50px; height: 50px; border-radius: 50%;
        background: rgba(14,14,28,0.88); border: 2px solid rgba(79,142,247,0.5);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; backdrop-filter: blur(8px);
        box-shadow: 0 2px 12px rgba(0,0,0,0.45);
        -webkit-tap-highlight-color: transparent;
        transition: border-color 0.2s, background 0.2s;
        overflow: hidden;
      }
      #ww-icon.ww-listening {
        border-color: rgba(79,142,247,0.9);
        animation: wwIconPulse 2s ease-in-out infinite;
      }
      #ww-icon.ww-active { border-color: #27ae60; background: rgba(0,40,16,0.92); }
      @keyframes wwIconPulse {
        0%,100% { box-shadow: 0 0 0 0 rgba(79,142,247,0.5); }
        50%     { box-shadow: 0 0 0 9px rgba(79,142,247,0); }
      }
      #ww-icon img { width: 100%; height: 200%; object-fit: cover; object-position: top center; }
      #ww-icon-fallback { font-size: 1.5rem; display: none; }

      #ww-panel {
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 9001;
        background: rgba(10,10,20,0.97); backdrop-filter: blur(18px);
        border-top: 1.5px solid rgba(79,142,247,0.3);
        border-radius: 1.4rem 1.4rem 0 0;
        padding: 0.75rem 1rem 1rem;
        display: flex; flex-direction: column; gap: 0.7rem;
        transform: translateY(100%);
        transition: transform 0.32s cubic-bezier(0.32,0.72,0,1);
        max-height: 55vh;
      }
      #ww-panel.ww-open { transform: translateY(0); }

      #ww-close {
        position: absolute; top: 0.55rem; right: 0.9rem;
        background: none; border: none; color: #555; font-size: 1.1rem;
        cursor: pointer; padding: 0.25rem 0.5rem; line-height: 1;
        -webkit-tap-highlight-color: transparent;
      }

      #ww-top-row {
        display: flex; align-items: flex-start; gap: 0.8rem;
      }
      #ww-char-wrap {
        width: 56px; height: 76px; overflow: hidden;
        border-radius: 0.7rem; flex-shrink: 0; background: transparent;
      }
      #ww-char-wrap img {
        width: 100%; height: 200%; object-fit: cover; object-position: top center;
      }
      #ww-char-fallback { font-size: 2.2rem; line-height: 76px; text-align: center; display: none; }

      #ww-right { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
      #ww-status-row {
        display: flex; align-items: center; gap: 0.35rem;
        font-size: 0.68rem; color: #4f8ef7;
      }
      #ww-status-dot {
        width: 6px; height: 6px; border-radius: 50%; background: #4f8ef7; flex-shrink: 0;
        animation: wwDotBlink 1s ease-in-out infinite;
      }
      @keyframes wwDotBlink { 0%,100%{opacity:1} 50%{opacity:0.2} }
      #ww-status-text { font-size: 0.68rem; }
      #ww-latest-text {
        font-size: 0.85rem; color: #eee; line-height: 1.5;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      #ww-msgs {
        flex: 1; overflow-y: auto; display: flex; flex-direction: column;
        gap: 0.4rem; padding-right: 0.2rem; max-height: 30vh;
      }
      .ww-msg {
        max-width: 82%; padding: 0.5rem 0.8rem; border-radius: 1rem;
        font-size: 0.82rem; line-height: 1.5; word-break: break-word;
      }
      .ww-msg-user { align-self: flex-end; background: #1e3a7a; color: #e8f0ff; border-radius: 1rem 1rem 0.25rem 1rem; }
      .ww-msg-ai   { align-self: flex-start; background: rgba(255,255,255,0.08); color: #ddd; border-radius: 1rem 1rem 1rem 0.25rem; }
    `;
    document.head.appendChild(s);
  }

  // ── HTML 생성 ─────────────────────────────────────────────────
  function createUI() {
    // 플로팅 아이콘
    const icon = document.createElement('div');
    icon.id = 'ww-icon';
    icon.title = '"조교야" 또는 클릭으로 AI 조교 호출';
    icon.innerHTML = `
      <img src="${CHAR_IMG}" alt=""
        onerror="this.style.display='none';document.getElementById('ww-icon-fallback').style.display='block'">
      <span id="ww-icon-fallback">🤖</span>
    `;
    icon.addEventListener('click', onIconClick);
    document.body.appendChild(icon);

    // 채팅 패널
    const panel = document.createElement('div');
    panel.id = 'ww-panel';
    panel.innerHTML = `
      <button id="ww-close">✕</button>
      <div id="ww-top-row">
        <div id="ww-char-wrap">
          <img src="${CHAR_IMG}" alt=""
            onerror="this.style.display='none';document.getElementById('ww-char-fallback').style.display='block'">
          <div id="ww-char-fallback">🤖</div>
        </div>
        <div id="ww-right">
          <div id="ww-status-row">
            <div id="ww-status-dot"></div>
            <span id="ww-status-text">대기 중...</span>
          </div>
          <div id="ww-latest-text">무엇이든 물어보세요!</div>
        </div>
      </div>
      <div id="ww-msgs"></div>
    `;
    panel.querySelector('#ww-close').addEventListener('click', onCloseClick);
    document.body.appendChild(panel);
  }

  // ── UI 헬퍼 ───────────────────────────────────────────────────
  function panelOpen(yes) {
    document.getElementById('ww-panel')?.classList.toggle('ww-open', yes);
    document.getElementById('ww-icon')?.classList.toggle('ww-active', yes);
  }
  function setStatus(txt) { const e = document.getElementById('ww-status-text'); if (e) e.textContent = txt; }
  function setLatest(txt) { const e = document.getElementById('ww-latest-text'); if (e) e.textContent = txt; }
  function addMsg(role, txt) {
    const c = document.getElementById('ww-msgs');
    if (!c) return;
    const d = document.createElement('div');
    d.className = `ww-msg ww-msg-${role}`;
    d.textContent = txt;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
  }
  function clearMsgs() { const c = document.getElementById('ww-msgs'); if (c) c.innerHTML = ''; }

  // ── 아이콘 / 닫기 ─────────────────────────────────────────────
  function onIconClick() {
    if (state === 'idle') activate('icon');
    else onCloseClick();
  }
  function onCloseClick() {
    stopTTS();
    enterIdle();
  }

  // ── 상태 전환 ─────────────────────────────────────────────────
  function activate(trigger) {
    if (state !== 'idle') return;
    state = 'active';
    history = [];
    clearMsgs();
    panelOpen(true);
    const greeting = `네, ${userName || '선생님'}! 궁금한 사항이 있으신가요?`;
    setStatus('듣는 중...');
    setLatest(greeting);
    addMsg('ai', greeting);
    speak(greeting, () => {
      setStatus('듣는 중...');
      if (!SKIP_REC) restartRec();
    });
    resetIdleTimer();
  }

  function enterIdle() {
    state = 'idle';
    clearTimeout(idleTimer);
    panelOpen(false);
    history = [];
    if (!SKIP_REC) restartRec();
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(enterIdle, IDLE_MS);
  }

  // ── Wake Word 감지 ────────────────────────────────────────────
  function hasWakeWord(txt) {
    const lower = txt.toLowerCase().replace(/\s+/g, ' ').trim();
    const nospace = lower.replace(/ /g, '');
    return WAKE_WORDS.some(w => lower.includes(w) || nospace.includes(w.replace(/ /g, '')));
  }

  // ── 음성 인식 ─────────────────────────────────────────────────
  function initRec() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;

    rec = new SR();
    rec.lang = 'ko-KR';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (e) => {
      if (state === 'speaking' || state === 'thinking') return;
      const result = e.results[e.resultIndex];
      if (!result?.isFinal) return;
      const txt = result[0].transcript.trim();
      if (!txt) return;

      if (state === 'idle') {
        if (hasWakeWord(txt)) activate(txt);
      } else if (state === 'active') {
        // wake word만 반복하면 무시
        if (hasWakeWord(txt) && txt.replace(/\s/g, '').length <= 5) return;
        processQuestion(txt);
      }
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed') { showPermDenied(); return; }
      if (e.error !== 'no-speech' && e.error !== 'aborted') console.warn('[WW STT]', e.error);
    };

    rec.onend = () => {
      if (state !== 'speaking' && state !== 'thinking') {
        setTimeout(startRec, 700);
      }
    };

    return true;
  }

  function startRec() {
    if (!rec || state === 'speaking' || state === 'thinking') return;
    try {
      rec.start();
      document.getElementById('ww-icon')?.classList.add('ww-listening');
    } catch (err) {
      if (!err.message?.includes('already started')) {
        setTimeout(startRec, 1200);
      }
    }
  }

  function stopRec() {
    try { rec?.stop(); } catch {}
    document.getElementById('ww-icon')?.classList.remove('ww-listening');
  }

  function restartRec() {
    stopRec();
    setTimeout(startRec, 600);
  }

  // ── 질문 처리 ─────────────────────────────────────────────────
  async function processQuestion(txt) {
    state = 'thinking';
    stopRec();
    addMsg('user', txt);
    setStatus('생각 중...');
    setLatest('...');
    resetIdleTimer();

    const answer = await callGemini(txt);

    state = 'speaking';
    addMsg('ai', answer);
    setLatest(answer.slice(0, 55) + (answer.length > 55 ? '…' : ''));
    setStatus('말하는 중...');

    speak(answer, () => {
      state = 'active';
      setStatus('듣는 중...');
      setLatest('');
      resetIdleTimer();
      if (!SKIP_REC) startRec();
    });
  }

  // ── Gemini API ────────────────────────────────────────────────
  function buildSystem() {
    return `당신은 신호수 스마트교재의 AI 조교입니다.\n현재 사용자는 ${userName || '사용자'}이며 ${userRole} 역할입니다.\n교육생에게는 학습을 돕고, 강사에게는 수업 관리를 돕습니다.\n항상 친절하고 간결하게 한국어로 답변하세요.`;
  }

  async function callGemini(query) {
    try {
      history.push({ role: 'user', parts: [{ text: query }] });
      const res = await fetch(PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystem() }] },
          contents: history,
          generationConfig: { temperature: 0.7, maxOutputTokens: 256 }
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '다시 말씀해주세요.';
      history.push({ role: 'model', parts: [{ text: answer }] });
      if (history.length > 20) history.splice(0, 2);
      return answer;
    } catch (e) {
      console.warn('[WW Gemini]', e.message);
      history.pop(); // 실패한 user 메시지 제거
      return '죄송합니다, 잠시 후 다시 시도해주세요.';
    }
  }

  // ── TTS ───────────────────────────────────────────────────────
  function speak(txt, onDone) {
    if (!window.speechSynthesis) { onDone?.(); return; }
    stopTTS();
    const utt = new SpeechSynthesisUtterance(txt.slice(0, 300));
    utt.lang = 'ko-KR';
    utt.rate = 1.05;
    utt.onend = utt.onerror = () => onDone?.();
    window.speechSynthesis.speak(utt);
  }

  function stopTTS() {
    try { window.speechSynthesis?.cancel(); } catch {}
  }

  // ── 권한 거부 안내 ────────────────────────────────────────────
  function showPermDenied() {
    const d = document.createElement('div');
    d.style.cssText = `
      position:fixed;bottom:0;left:0;right:0;z-index:8999;
      background:rgba(231,76,60,0.12);border-top:1px solid rgba(231,76,60,0.35);
      padding:0.75rem 1rem;font-size:0.78rem;color:#f88;text-align:center;
    `;
    d.textContent = 'AI 조교 상시 대기를 위해 마이크 권한이 필요해요. 브라우저 설정에서 허용해주세요.';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 6000);
  }

  // ── 초기화 ────────────────────────────────────────────────────
  function init() {
    loadSession();
    injectCSS();
    createUI();

    if (!SKIP_REC) {
      if (initRec()) {
        startRec();
      } else {
        // Web Speech API 미지원 — 아이콘만 표시, 클릭 시 패널 열림
        console.info('[WW] 이 브라우저는 Wake Word를 지원하지 않습니다. 아이콘 클릭으로 사용하세요.');
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})();

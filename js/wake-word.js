// AI 조교 Wake Word Engine — VAD 백그라운드 + STT 트리거 방식
(function () {
  'use strict';

  const PROXY      = 'https://orange-resonance-c0d3.gmrfyd912.workers.dev';
  const WAKE_WORDS = ['ai조교', 'ai 조교', '에이아이조교', '조교야', 'ai야', '조교'];
  const IDLE_MS    = 30000;
  const VAD_THRESHOLD  = 18;  // 주파수 평균값 기준
  const VAD_CONFIRM_MS = 300; // 음성 감지 확인 시간 (ms)

  const scriptEl  = document.currentScript;
  const scriptSrc = scriptEl ? scriptEl.src : '';
  const jsDir     = scriptSrc.substring(0, scriptSrc.lastIndexOf('/') + 1);
  const CHAR_IMG  = jsDir.replace('/js/', '/assets/') + 'instructor_idle.png';

  const pagePath = location.pathname;
  // ai-tutor는 자체 AI 인터페이스이므로 완전 스킵
  const SKIP_ALL = ['landing.html', 'index.html', 'pose.html', 'pose-capture', 'pose-extract', 'ai-tutor.html']
                     .some(p => pagePath.includes(p));
  if (SKIP_ALL) return;

  // ── 상태 ──────────────────────────────────────────────────────
  let state     = 'idle';  // idle | active | thinking | speaking
  let rec       = null;
  let idleTimer = null;
  let history   = [];
  let userName  = '';
  let userRole  = '교육생';

  // VAD 관련
  let vadStream   = null;
  let vadCtx      = null;
  let vadAnalyser = null;
  let vadRunning  = false;
  let vadTimer    = null;
  let vadLoud     = false;

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
      #ww-top-row { display: flex; align-items: flex-start; gap: 0.8rem; }
      #ww-char-wrap {
        width: 56px; height: 76px; overflow: hidden;
        border-radius: 0.7rem; flex-shrink: 0;
      }
      #ww-char-wrap img { width: 100%; height: 200%; object-fit: cover; object-position: top center; }
      #ww-char-fallback { font-size: 2.2rem; line-height: 76px; text-align: center; display: none; }
      #ww-right { flex: 1; display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
      #ww-status-row { display: flex; align-items: center; gap: 0.35rem; font-size: 0.68rem; color: #4f8ef7; }
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
  function onCloseClick() { stopTTS(); enterIdle(); }

  // ── VAD — Web Audio API 음량 감지 (STT 없이 백그라운드 대기) ──
  function startVAD() {
    if (vadRunning) return;
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
      .then(stream => {
        vadStream   = stream;
        vadCtx      = new (window.AudioContext || window.webkitAudioContext)();
        const src   = vadCtx.createMediaStreamSource(stream);
        vadAnalyser = vadCtx.createAnalyser();
        vadAnalyser.fftSize = 256;
        src.connect(vadAnalyser);
        vadRunning  = true;
        vadLoud     = false;
        vadPoll();
      })
      .catch(e => {
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') showPermDenied();
      });
  }

  function stopVAD() {
    vadRunning = false;
    vadLoud    = false;
    clearTimeout(vadTimer);
    if (vadCtx)    { try { vadCtx.close(); } catch {} vadCtx = null; vadAnalyser = null; }
    if (vadStream) { vadStream.getTracks().forEach(t => t.stop()); vadStream = null; }
  }

  function vadPoll() {
    if (!vadRunning || !vadAnalyser) return;
    // 대화 중에는 VAD 체크 스킵
    if (state !== 'idle') { vadLoud = false; setTimeout(vadPoll, 200); return; }

    const buf = new Uint8Array(vadAnalyser.frequencyBinCount);
    vadAnalyser.getByteFrequencyData(buf);
    const avg = buf.reduce((s, v) => s + v, 0) / buf.length;

    if (avg >= VAD_THRESHOLD) {
      if (!vadLoud) {
        vadLoud  = true;
        // VAD_CONFIRM_MS 동안 지속되면 STT 시작 (이 때 첫 띵~ 소리)
        vadTimer = setTimeout(() => {
          if (vadLoud && state === 'idle') {
            stopVAD();
            startRec();
          }
        }, VAD_CONFIRM_MS);
      }
    } else {
      vadLoud = false;
      clearTimeout(vadTimer);
    }
    setTimeout(vadPoll, 150);
  }

  // ── 상태 전환 ─────────────────────────────────────────────────
  function activate(trigger) {
    if (state !== 'idle') return;
    state = 'speaking';   // TTS 중 STT 결과 차단
    stopRec();            // 인사말이 마이크에 잡히지 않도록 미리 중단
    history = [];
    clearMsgs();
    panelOpen(true);
    const greeting = `네, ${userName || '선생님'}! 궁금한 사항이 있으신가요?`;
    setStatus('말하는 중...');
    setLatest(greeting);
    addMsg('ai', greeting);
    speak(greeting, () => {
      state = 'active';
      setStatus('듣는 중...');
      startRec();
    });
    resetIdleTimer();
  }

  function enterIdle() {
    state = 'idle';
    clearTimeout(idleTimer);
    panelOpen(false);
    history = [];
    stopRec();
    stopVAD();
    setTimeout(startVAD, 600); // VAD 백그라운드 대기로 복귀 (띵~ 없음)
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(enterIdle, IDLE_MS);
  }

  // ── Wake Word 감지 ────────────────────────────────────────────
  function hasWakeWord(txt) {
    const lower   = txt.toLowerCase().replace(/\s+/g, ' ').trim();
    const nospace = lower.replace(/ /g, '');
    return WAKE_WORDS.some(w => lower.includes(w) || nospace.includes(w.replace(/ /g, '')));
  }

  // ── 음성 인식 (VAD가 음성 감지한 뒤에만 시작) ─────────────────
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
        if (hasWakeWord(txt)) {
          activate(txt);
        } else {
          // wake word 없음 → STT 종료 후 VAD 복귀 (추가 띵~ 없음)
          stopRec();
          setTimeout(startVAD, 500);
        }
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
      if (state === 'idle') {
        // no-speech 등으로 종료 → VAD로 복귀
        setTimeout(startVAD, 500);
      } else if (state === 'active') {
        // 대화 중 Chrome 세션 만료 → 재시작
        setTimeout(startRec, 700);
      }
      // speaking/thinking 중에는 재시작하지 않음
    };

    return true;
  }

  function startRec() {
    if (!rec || state === 'speaking' || state === 'thinking') return;
    document.getElementById('ww-icon')?.classList.add('ww-listening');
    try {
      rec.start();
    } catch (err) {
      if (!err.message?.includes('already started')) {
        document.getElementById('ww-icon')?.classList.remove('ww-listening');
        setTimeout(startVAD, 1000);
      }
    }
  }

  function stopRec() {
    document.getElementById('ww-icon')?.classList.remove('ww-listening');
    try { rec?.stop(); } catch {}
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
      startRec();
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
      history.pop();
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

  // ── 외부 훅 — 강사 대시보드 자체 STT와 마이크 충돌 방지 ─────
  window.wakeWordPause  = () => { stopVAD(); stopRec(); };
  window.wakeWordResume = () => { if (state === 'idle') setTimeout(startVAD, 500); };

  // ── 초기화 ────────────────────────────────────────────────────
  function init() {
    loadSession();
    injectCSS();
    createUI();

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.info('[WW] Web Speech API 미지원 — 아이콘 클릭으로만 사용 가능');
      return;
    }
    initRec();
    startVAD(); // STT 대신 VAD로 조용히 백그라운드 대기 (띵~ 소리 없음)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})();

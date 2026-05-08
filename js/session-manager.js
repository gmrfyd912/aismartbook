// 세션 관리 - 교육생 로그인 정보 LocalStorage 저장/불러오기
const SESSION_KEY = 'aismartbook_session';

const SessionManager = (() => {
  function get() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
    catch { return null; }
  }

  function save(data) {
    const existing = get() || {};
    const session = {
      ...existing,
      ...data,
      lastAccess: new Date().toISOString().slice(0, 10)
    };
    if (!session.firstAccess) session.firstAccess = session.lastAccess;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function clear() {
    localStorage.removeItem(SESSION_KEY);
  }

  function isLoggedIn() {
    const s = get();
    return !!(s && s.studentId && s.name);
  }

  function getDaysSinceLastAccess() {
    const s = get();
    if (!s || !s.lastAccess) return 0;
    const last = new Date(s.lastAccess);
    const now  = new Date();
    return Math.floor((now - last) / 86400000);
  }

  function updateProgress(unit) {
    const s = get();
    if (!s) return;
    save({ currentUnit: unit });
  }

  // 세션 없으면 모달 표시, 있으면 callback 즉시 실행
  function requireSession(callback) {
    if (isLoggedIn()) {
      // lastAccess 갱신
      save({});
      callback(get());
      return;
    }
    showLoginModal(callback);
  }

  function showLoginModal(callback) {
    const existing = document.getElementById('session-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'session-modal';
    modal.innerHTML = `
      <div id="session-backdrop" style="
        position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;
        display:flex;align-items:center;justify-content:center;padding:1.5rem;
        font-family:sans-serif;
      ">
        <div style="
          background:#1a1a2e;border-radius:1.2rem;padding:2rem;width:100%;
          max-width:340px;display:flex;flex-direction:column;gap:1.2rem;
          border:1px solid rgba(79,142,247,0.3);
        ">
          <div style="text-align:center">
            <div style="font-size:2.5rem;margin-bottom:0.5rem">🪖</div>
            <h2 style="color:#fff;font-size:1.2rem;margin-bottom:0.3rem">신호수 AI 교재</h2>
            <p style="color:#888;font-size:0.82rem">교육생 정보를 입력해주세요</p>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.8rem">
            <div>
              <label style="color:#aaa;font-size:0.8rem;display:block;margin-bottom:0.3rem">이름</label>
              <input id="sm-name" type="text" placeholder="홍길동" style="
                width:100%;padding:0.7rem 0.9rem;background:#111;border:1px solid #333;
                border-radius:0.6rem;color:#fff;font-size:1rem;outline:none;
              ">
            </div>
            <div>
              <label style="color:#aaa;font-size:0.8rem;display:block;margin-bottom:0.3rem">교육생 번호</label>
              <input id="sm-number" type="text" placeholder="001" style="
                width:100%;padding:0.7rem 0.9rem;background:#111;border:1px solid #333;
                border-radius:0.6rem;color:#fff;font-size:1rem;outline:none;
              ">
            </div>
          </div>
          <div id="sm-error" style="color:#e55;font-size:0.82rem;min-height:1em;text-align:center"></div>
          <button id="sm-submit" style="
            width:100%;padding:0.8rem;background:#4f8ef7;color:#fff;border:none;
            border-radius:0.8rem;font-size:1rem;font-weight:bold;cursor:pointer;
          ">입장하기</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const nameInput   = modal.querySelector('#sm-name');
    const numberInput = modal.querySelector('#sm-number');
    const errorEl     = modal.querySelector('#sm-error');
    const submitBtn   = modal.querySelector('#sm-submit');

    // 입력 포커스 스타일
    [nameInput, numberInput].forEach(el => {
      el.addEventListener('focus',  () => el.style.borderColor = '#4f8ef7');
      el.addEventListener('blur',   () => el.style.borderColor = '#333');
    });

    function submit() {
      const name   = nameInput.value.trim();
      const number = numberInput.value.trim();
      if (!name)   { errorEl.textContent = '이름을 입력해주세요'; nameInput.focus(); return; }
      if (!number) { errorEl.textContent = '교육생 번호를 입력해주세요'; numberInput.focus(); return; }
      errorEl.textContent = '';
      const session = save({
        studentId: `${name}_${number}`,
        name,
        number,
        currentUnit: 1
      });
      modal.remove();
      callback(session);
    }

    submitBtn.addEventListener('click', submit);
    [nameInput, numberInput].forEach(el =>
      el.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); })
    );
    setTimeout(() => nameInput.focus(), 100);
  }

  return { get, save, clear, isLoggedIn, getDaysSinceLastAccess, requireSession, updateProgress };
})();

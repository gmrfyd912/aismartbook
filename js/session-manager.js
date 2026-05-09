// 다중 세션 관리 — 교육생별 개별 슬롯, currentUser 포인터 방식
const SESSION_KEY = 'aismartbook_session';

const SessionManager = (() => {

  // ── 내부 store 헬퍼 ──────────────────────────────────────
  function _store() {
    try {
      const raw = JSON.parse(localStorage.getItem(SESSION_KEY)) || {};
      // 구버전 단일 세션 자동 마이그레이션
      if (raw.studentId && !raw.currentUser) {
        const migrated = { currentUser: raw.studentId, users: { [raw.studentId]: raw } };
        localStorage.setItem(SESSION_KEY, JSON.stringify(migrated));
        return migrated;
      }
      return raw;
    } catch { return {}; }
  }

  function _saveStore(store) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(store));
  }

  // ── Public: 현재 사용자 세션 반환 (하위 호환) ─────────────
  function get() {
    const store = _store();
    if (!store.currentUser || !store.users) return null;
    return store.users[store.currentUser] || null;
  }

  // ── Public: 현재 사용자 슬롯에 데이터 저장 ───────────────
  function save(data) {
    const store = _store();
    const userId = store.currentUser;
    if (!userId) return null;
    const existing = store.users?.[userId] || {};
    const today = new Date().toISOString().slice(0, 10);
    const session = { ...existing, ...data, lastAccess: today };
    if (!session.firstAccess) session.firstAccess = today;
    store.users = store.users || {};
    store.users[userId] = session;
    _saveStore(store);
    return session;
  }

  // ── Public: 전체 데이터 삭제 ──────────────────────────────
  function clear() {
    localStorage.removeItem(SESSION_KEY);
  }

  // ── Public: 로그아웃 (users 데이터 유지, currentUser만 해제) ─
  function logout() {
    if (!confirm('로그아웃 하시겠습니까?\n학습 데이터는 유지됩니다.')) return;
    const store = _store();
    store.currentUser = null;
    _saveStore(store);
    location.href = './home.html';
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
    save({ currentUnit: unit });
  }

  // ── 내부: 이름+번호로 로그인 (기존 계정 이어서 or 신규 생성) ─
  function _login(name, number, callback) {
    const store = _store();
    const userId = `${name}_${number}`;
    const today  = new Date().toISOString().slice(0, 10);
    store.users  = store.users || {};
    if (store.users[userId]) {
      store.users[userId].lastAccess = today;
    } else {
      store.users[userId] = {
        studentId: userId, name, number,
        firstAccess: today, lastAccess: today, currentUnit: 1
      };
    }
    store.currentUser = userId;
    _saveStore(store);
    callback(store.users[userId]);
  }

  // ── 내부: 최근 로그인 계정 목록 (lastAccess 내림차순) ───────
  function _getRecentUsers(max = 3) {
    const store = _store();
    if (!store.users) return [];
    return Object.values(store.users)
      .sort((a, b) => (b.lastAccess || '').localeCompare(a.lastAccess || ''))
      .slice(0, max);
  }

  // ── Public: 세션 필요 시 콜백, 없으면 로그인 모달 ────────
  function requireSession(callback) {
    if (isLoggedIn()) {
      save({});          // lastAccess 갱신
      callback(get());
      return;
    }
    showLoginModal(callback);
  }

  // ── 로그인 모달 ───────────────────────────────────────────
  function showLoginModal(callback) {
    const existing = document.getElementById('session-modal');
    if (existing) existing.remove();

    const recentUsers = _getRecentUsers(3);
    const recentHTML  = recentUsers.length > 0 ? `
      <div>
        <div style="color:#555;font-size:0.73rem;margin-bottom:0.5rem">이전 계정으로 계속하기</div>
        <div style="display:flex;flex-direction:column;gap:0.4rem">
          ${recentUsers.map(u => `
            <button class="sm-recent-btn" data-id="${u.studentId}" style="
              display:flex;align-items:center;gap:0.7rem;width:100%;
              background:#111;border:1px solid #252535;border-radius:0.75rem;
              padding:0.55rem 0.82rem;color:#fff;cursor:pointer;text-align:left;
              font-family:sans-serif;
            ">
              <div style="width:32px;height:32px;border-radius:50%;flex-shrink:0;
                background:rgba(79,142,247,0.22);color:#4f8ef7;
                display:flex;align-items:center;justify-content:center;
                font-weight:bold;font-size:0.88rem;">${u.name.slice(0,1)}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:0.88rem;font-weight:bold">${u.name}</div>
                <div style="font-size:0.7rem;color:#555">${u.number}번 · ${u.lastAccess || ''}</div>
              </div>
              <div style="color:#4f8ef7;font-size:1.1rem;flex-shrink:0">›</div>
            </button>
          `).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;color:#303040;font-size:0.72rem;margin:0.85rem 0 0.1rem">
          <div style="flex:1;height:1px;background:#222"></div>
          <span>또는 새 계정으로</span>
          <div style="flex:1;height:1px;background:#222"></div>
        </div>
      </div>
    ` : '';

    const modal = document.createElement('div');
    modal.id = 'session-modal';
    modal.innerHTML = `
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:99999;
        display:flex;align-items:center;justify-content:center;padding:1.5rem;
        font-family:sans-serif;overflow-y:auto;">
        <div style="background:#1a1a2e;border-radius:1.2rem;padding:1.8rem;width:100%;
          max-width:340px;display:flex;flex-direction:column;gap:1rem;
          border:1px solid rgba(79,142,247,0.3);">
          <div style="text-align:center">
            <div style="font-size:2.4rem;margin-bottom:0.4rem">🪖</div>
            <h2 style="color:#fff;font-size:1.15rem;margin-bottom:0.25rem;font-weight:bold">신호수 AI 교재</h2>
            <p style="color:#666;font-size:0.8rem">교육생 정보를 입력해주세요</p>
          </div>
          ${recentHTML}
          <div style="display:flex;flex-direction:column;gap:0.75rem">
            <div>
              <label style="color:#888;font-size:0.78rem;display:block;margin-bottom:0.28rem">이름</label>
              <input id="sm-name" type="text" placeholder="홍길동" autocomplete="off" style="
                width:100%;padding:0.68rem 0.88rem;background:#111;border:1px solid #252535;
                border-radius:0.6rem;color:#fff;font-size:1rem;outline:none;font-family:sans-serif;">
            </div>
            <div>
              <label style="color:#888;font-size:0.78rem;display:block;margin-bottom:0.28rem">교육생 번호</label>
              <input id="sm-number" type="text" placeholder="001" autocomplete="off" style="
                width:100%;padding:0.68rem 0.88rem;background:#111;border:1px solid #252535;
                border-radius:0.6rem;color:#fff;font-size:1rem;outline:none;font-family:sans-serif;">
            </div>
          </div>
          <div id="sm-error" style="color:#e55;font-size:0.8rem;min-height:1em;text-align:center"></div>
          <button id="sm-submit" style="
            width:100%;padding:0.78rem;background:#4f8ef7;color:#fff;border:none;
            border-radius:0.8rem;font-size:1rem;font-weight:bold;cursor:pointer;font-family:sans-serif;">
            입장하기
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const nameInput   = modal.querySelector('#sm-name');
    const numberInput = modal.querySelector('#sm-number');
    const errorEl     = modal.querySelector('#sm-error');
    const submitBtn   = modal.querySelector('#sm-submit');

    // 이전 계정 클릭
    modal.querySelectorAll('.sm-recent-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => btn.style.borderColor = '#4f8ef7');
      btn.addEventListener('mouseleave', () => btn.style.borderColor = '#252535');
      btn.addEventListener('click', () => {
        const store  = _store();
        const userId = btn.dataset.id;
        if (!store.users?.[userId]) return;
        const today = new Date().toISOString().slice(0, 10);
        store.users[userId].lastAccess = today;
        store.currentUser = userId;
        _saveStore(store);
        modal.remove();
        callback(store.users[userId]);
      });
    });

    [nameInput, numberInput].forEach(el => {
      el.addEventListener('focus', () => el.style.borderColor = '#4f8ef7');
      el.addEventListener('blur',  () => el.style.borderColor = '#252535');
    });

    function submit() {
      const name   = nameInput.value.trim();
      const number = numberInput.value.trim();
      if (!name)   { errorEl.textContent = '이름을 입력해주세요'; nameInput.focus(); return; }
      if (!number) { errorEl.textContent = '교육생 번호를 입력해주세요'; numberInput.focus(); return; }
      errorEl.textContent = '';
      modal.remove();
      _login(name, number, callback);
    }

    submitBtn.addEventListener('click', submit);
    [nameInput, numberInput].forEach(el =>
      el.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); })
    );
    setTimeout(() => nameInput.focus(), 100);
  }

  // ── 공통 로그아웃 버튼 CSS 주입 ──────────────────────────
  (function injectStyles() {
    if (document.getElementById('sm-global-styles')) return;
    const s = document.createElement('style');
    s.id = 'sm-global-styles';
    s.textContent = `
      .sm-logout-btn {
        background: transparent;
        color: #555;
        border: 1px solid #2a2a3e;
        border-radius: 2rem;
        padding: 0.22rem 0.65rem;
        font-size: 0.7rem;
        cursor: pointer;
        flex-shrink: 0;
        font-family: sans-serif;
        white-space: nowrap;
      }
      .sm-logout-btn:active { color: #e74c3c; border-color: #e74c3c; }
    `;
    document.head.appendChild(s);
  })();

  return { get, save, clear, logout, isLoggedIn, getDaysSinceLastAccess, requireSession, updateProgress };
})();

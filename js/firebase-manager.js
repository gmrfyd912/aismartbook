// Firebase 실시간 연결 관리
// Firebase CDN은 각 HTML에서 직접 로드, 여기서는 래퍼만 제공

const FirebaseManager = (() => {
  let db = null;
  let initialized = false;

  async function init() {
    if (initialized) return db !== null;
    initialized = true;

    if (typeof FIREBASE_ENABLED === 'undefined' || !FIREBASE_ENABLED) {
      console.info('[Firebase] 오프라인 모드 (config.js 설정 필요)');
      return false;
    }

    try {
      if (typeof firebase === 'undefined') {
        console.warn('[Firebase] SDK가 로드되지 않았습니다');
        return false;
      }
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.database();
      console.info('[Firebase] 연결됨');
      return true;
    } catch (e) {
      console.warn('[Firebase] 초기화 실패:', e.message);
      return false;
    }
  }

  function ref(path) {
    if (!db) return null;
    return db.ref(path);
  }

  // 집체교육 classMode (정식 경로: session/classMode)
  function watchInstructorMode(callback) {
    const r = ref('session/classMode');
    if (!r) { callback(false); return () => {}; }
    r.on('value', snap => callback(!!snap.val()));
    return () => r.off('value');
  }

  function watchClassMode(callback) {
    return watchInstructorMode(callback);
  }

  function setInstructorMode(active) {
    if (!db) return Promise.resolve();
    return db.ref().update({ 'session/classMode': active, 'session/instructorMode': active });
  }

  // 수업 세션 일괄 업데이트 (대시보드용)
  function setClassSession(active) {
    if (!db) return Promise.resolve();
    const update = { 'session/classMode': active, 'session/instructorMode': active };
    if (active) {
      update['session/instructorCameraActive'] = true;
      update['session/classStartTime']         = Date.now();
      update['session/instructorHeartbeat']    = Date.now();
    } else {
      update['session/instructorCameraActive'] = false;
    }
    return db.ref().update(update);
  }

  // 강사 heartbeat
  function setHeartbeat() {
    const r = ref('session/instructorHeartbeat');
    if (!r) return Promise.resolve();
    return r.set(Date.now());
  }

  function watchHeartbeat(callback) {
    const r = ref('session/instructorHeartbeat');
    if (!r) { callback(null); return () => {}; }
    r.on('value', snap => callback(snap.val()));
    return () => r.off('value');
  }

  // 퀴즈 발사
  function watchActiveQuiz(callback) {
    const r = ref('session/activeQuiz');
    if (!r) { callback(null); return () => {}; }
    r.on('value', snap => callback(snap.val()));
    return () => r.off('value');
  }

  function launchQuiz(quizData) {
    const r = ref('session/activeQuiz');
    if (!r) return Promise.resolve();
    return r.set({ ...quizData, timestamp: Date.now() });
  }

  function clearQuiz() {
    const r = ref('session/activeQuiz');
    if (!r) return Promise.resolve();
    return r.remove();
  }

  // 교육생 데이터 동기화
  function saveStudentData(studentId, data) {
    const r = ref(`students/${sanitizeKey(studentId)}`);
    if (!r) return Promise.resolve();
    return r.update({ ...data, lastSync: Date.now() });
  }

  function watchStudents(callback) {
    const r = ref('students');
    if (!r) { callback({}); return () => {}; }
    r.on('value', snap => callback(snap.val() || {}));
    return () => r.off('value');
  }

  // 퀴즈 결과 저장
  function saveQuizResult(quizId, studentId, result) {
    const r = ref(`quizResults/${quizId}/${sanitizeKey(studentId)}`);
    if (!r) return Promise.resolve();
    return r.set({ ...result, timestamp: Date.now() });
  }

  function watchQuizResults(quizId, callback) {
    const r = ref(`quizResults/${quizId}`);
    if (!r) { callback({}); return () => {}; }
    r.on('value', snap => callback(snap.val() || {}));
    return () => r.off('value');
  }

  // 동작 평가 결과 저장
  function saveMotionResult(studentId, result) {
    const r = ref(`motionResults/${sanitizeKey(studentId)}/${Date.now()}`);
    if (!r) return Promise.resolve();
    return r.set(result);
  }

  // Firebase key에 허용되지 않는 문자 제거
  function sanitizeKey(str) {
    return String(str).replace(/[.#$\[\]/]/g, '_');
  }

  // 집중도 업데이트
  function updateConcentration(studentId, score) {
    const r = ref(`students/${sanitizeKey(studentId)}/concentration`);
    if (!r) return Promise.resolve();
    return r.set(score);
  }

  return {
    init, ref,
    watchInstructorMode, setInstructorMode,
    watchClassMode, setClassSession, setHeartbeat, watchHeartbeat,
    watchActiveQuiz, launchQuiz, clearQuiz,
    saveStudentData, watchStudents,
    saveQuizResult, watchQuizResults,
    saveMotionResult, updateConcentration
  };
})();

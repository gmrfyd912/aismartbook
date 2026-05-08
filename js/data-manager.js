// 학습 데이터 저장/불러오기 (LocalStorage + Firebase 동기화)
const PROGRESS_KEY = 'aismartbook_progress';

const DataManager = (() => {
  function getProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; }
    catch { return {}; }
  }

  function saveProgress(data) {
    const existing = getProgress();
    const merged = deepMerge(existing, data);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(merged));
    // Firebase 동기화 (비동기, 실패해도 무시)
    const session = SessionManager.get();
    if (session && typeof FirebaseManager !== 'undefined') {
      FirebaseManager.saveStudentData(session.studentId, {
        name: session.name,
        number: session.number,
        progress: merged
      }).catch(() => {});
    }
    return merged;
  }

  // 학습 시간 누적 (초 단위)
  function addStudyTime(seconds) {
    const p = getProgress();
    const today = new Date().toISOString().slice(0, 10);
    if (!p.studyTime) p.studyTime = {};
    p.studyTime[today] = (p.studyTime[today] || 0) + seconds;
    p.totalStudyTime = (p.totalStudyTime || 0) + seconds;
    saveProgress(p);
  }

  // 단원 진도 업데이트
  function setUnit(unit) {
    saveProgress({ currentUnit: unit });
    SessionManager.updateProgress(unit);
  }

  // OX 퀴즈 오답 기록
  function recordWrongAnswer(questionId) {
    const p = getProgress();
    if (!p.wrongAnswers) p.wrongAnswers = {};
    p.wrongAnswers[questionId] = (p.wrongAnswers[questionId] || 0) + 1;
    saveProgress(p);
  }

  // 오답 3회 이상 문항 반환
  function getFrequentWrong(threshold = 3) {
    const p = getProgress();
    if (!p.wrongAnswers) return [];
    return Object.entries(p.wrongAnswers)
      .filter(([, cnt]) => cnt >= threshold)
      .map(([id]) => id);
  }

  // 동작 평가 점수 저장
  function saveMotionScore(motionId, score) {
    const p = getProgress();
    if (!p.motionScores) p.motionScores = {};
    if (!p.motionScores[motionId]) p.motionScores[motionId] = [];
    p.motionScores[motionId].push({ score, date: new Date().toISOString() });
    // 최근 10회만 보관
    if (p.motionScores[motionId].length > 10)
      p.motionScores[motionId] = p.motionScores[motionId].slice(-10);
    saveProgress(p);
  }

  function getMotionAvg(motionId) {
    const p = getProgress();
    const scores = p.motionScores?.[motionId];
    if (!scores?.length) return null;
    return Math.round(scores.reduce((a, b) => a + b.score, 0) / scores.length);
  }

  // 퀴즈 결과 저장
  function saveQuizResult(quizId, results) {
    const p = getProgress();
    if (!p.quizHistory) p.quizHistory = [];
    p.quizHistory.push({ quizId, results, date: new Date().toISOString() });
    if (p.quizHistory.length > 50) p.quizHistory = p.quizHistory.slice(-50);
    // 오답 누적
    results.forEach(r => { if (!r.correct) recordWrongAnswer(r.questionId); });
    saveProgress(p);
  }

  function deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  return {
    getProgress, saveProgress,
    addStudyTime, setUnit,
    recordWrongAnswer, getFrequentWrong,
    saveMotionScore, getMotionAvg,
    saveQuizResult
  };
})();

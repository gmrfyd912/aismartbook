// 퀴즈 엔진 - 학습용/테스트용 공통 로직
const QuizEngine = (() => {
  let questions = [];
  let currentIndex = 0;
  let results = [];
  let timerInterval = null;
  let timeLeft = 0;
  let mode = 'study'; // 'study' | 'test'
  let onAnswerCallback = null;
  let onCompleteCallback = null;

  async function loadQuestions(unitFilter = null) {
    try {
      const res = await fetch('../data/quiz-bank.json');
      const data = await res.json();
      let pool = data.quizzes;
      if (unitFilter !== null) {
        pool = pool.filter(q => q.unit === unitFilter);
      }
      return pool;
    } catch (e) {
      console.error('퀴즈 로드 실패:', e);
      return [];
    }
  }

  // 퀴즈 초기화
  async function init(options = {}) {
    const {
      unitFilter = null,
      count = 10,
      shuffled = true,
      timePerQuestion = 0, // 0 = 시간제한 없음
      quizMode = 'study'
    } = options;

    mode = quizMode;
    const pool = await loadQuestions(unitFilter);
    if (!pool.length) return false;

    let selected = shuffled ? shuffle([...pool]) : [...pool];
    questions = selected.slice(0, Math.min(count, selected.length));
    currentIndex = 0;
    results = [];
    return true;
  }

  // 현재 문제 반환
  function current() {
    return questions[currentIndex] || null;
  }

  function total() { return questions.length; }
  function index() { return currentIndex; }

  // 답변 제출
  function answer(userAnswer) {
    const q = current();
    if (!q) return null;

    const correct = userAnswer === q.answer;
    const result = {
      questionId: q.id,
      question: q.question,
      userAnswer,
      correct,
      correctAnswer: q.answer,
      explanation: q.explanation,
      relatedUnit: q.relatedUnit,
      relatedPage: q.relatedPage
    };
    results.push(result);

    if (onAnswerCallback) onAnswerCallback(result, currentIndex, questions.length);

    return result;
  }

  function next() {
    currentIndex++;
    if (currentIndex >= questions.length) {
      if (onCompleteCallback) onCompleteCallback(getResults());
      return false;
    }
    return true;
  }

  function getResults() {
    const correct = results.filter(r => r.correct).length;
    const total = results.length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { results, correct, total, score };
  }

  // 오답 문항만 다시 뽑기
  function getWrongQuestions() {
    return results.filter(r => !r.correct).map(r => r.questionId);
  }

  // 타이머 (테스트 모드)
  function startTimer(seconds, onTick, onTimeout) {
    clearTimer();
    timeLeft = seconds;
    onTick(timeLeft);
    timerInterval = setInterval(() => {
      timeLeft--;
      onTick(timeLeft);
      if (timeLeft <= 0) {
        clearTimer();
        onTimeout();
      }
    }, 1000);
  }

  function clearTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function setOnAnswer(cb) { onAnswerCallback = cb; }
  function setOnComplete(cb) { onCompleteCallback = cb; }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  return {
    init, current, total, index, answer, next, getResults, getWrongQuestions,
    startTimer, clearTimer, setOnAnswer, setOnComplete
  };
})();

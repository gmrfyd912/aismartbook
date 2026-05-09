// AI 튜터 엔진 — Gemini 2.0 Flash API + 키워드 매칭 fallback
const AiTutor = (() => {
  let speechSynthesis = window.speechSynthesis;
  let recognition = null;
  let isListening = false;
  let isSpeaking  = false;
  let voiceEnabled = true;
  let onMessageCallback = null;
  let currentVoice = null;

  const GEMINI_API_KEY = 'AIzaSyCgjgu3vXiGmcY8VvxaRbC6HBmr9IM9vwo';
  const GEMINI_MODEL  = 'gemini-2.0-flash';
  const GEMINI_SYSTEM = '당신은 건설현장 신호수 교육 전문 AI 튜터입니다. 교육생이 신호수 교재를 공부하다 모르는 것을 물어봅니다. 친근하고 명확하게 한국어로, 짧고 핵심만 답변하세요. 답변은 2~4문장으로 간결하게 해주세요.';

  async function callGemini(text) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: GEMINI_SYSTEM }] },
            contents: [{ role: 'user', parts: [{ text }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
          })
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch {
      return null;
    }
  }

  // 키워드 매칭 fallback DB
  const RESPONSES = [
    {
      keywords: ['신호수', '역할', '하는 일'],
      answer: '신호수는 건설현장에서 크레인·지게차 같은 중장비 운전자와 현장 작업자 사이에서 안전한 신호를 전달하는 핵심 인원입니다. 운전자의 사각지대를 감시하고 위험을 사전에 차단하는 역할을 합니다.'
    },
    {
      keywords: ['보권', '빨간', '빨간 깃발', '빨간 기'],
      answer: '보권은 빨간 깃발로 위험·정지를 의미합니다. 머리 위로 올려 좌우로 흔들면 정지 신호가 되고, 양팔을 X자로 교차하면 긴급 정지 신호가 됩니다.'
    },
    {
      keywords: ['주권', '노란', '노란 깃발', '노란 기'],
      answer: '주권은 노란 깃발로 진행·서행을 의미합니다. 팔을 앞으로 뻗어 전방을 지시하면 진행 허가 신호가 됩니다. 진행 전 반드시 전방 안전을 확인해야 합니다.'
    },
    {
      keywords: ['위로', '올리기', '상승'],
      answer: '위로 올리기 신호는 팔을 아래에서 위로 올리는 동작입니다. 장비의 상승 또는 전진을 지시할 때 사용합니다. 팔꿈치를 완전히 펴고 크게 올려주세요.'
    },
    {
      keywords: ['아래로', '내리기', '하강'],
      answer: '아래로 내리기 신호는 팔을 위에서 아래로 내리는 동작입니다. 장비의 하강 또는 정지를 지시할 때 사용합니다. 팔을 완전히 펴서 아래로 내려주세요.'
    },
    {
      keywords: ['수평', '이동', '좌우'],
      answer: '수평 이동 신호는 팔을 수평으로 펼쳐 이동 방향을 지시합니다. 이동 방향의 팔을 뻗어 방향을 안내하고, 정지 시에는 주먹을 쥐어 신호합니다.'
    },
    {
      keywords: ['운전', '방향', '지시', '직접'],
      answer: '운전 방향 직접 지시는 손가락으로 진행 방향을 명확히 안내하는 신호입니다. 반드시 장비 이동 경로 밖에서 신호를 보내야 합니다.'
    },
    {
      keywords: ['천천히', '서행', '느리게'],
      answer: '서행 신호는 팔을 천천히 위아래로 움직이거나 손바닥을 아래로 밀어내는 동작입니다. 위험 구역 진입 전에 반드시 사용하세요.'
    },
    {
      keywords: ['위치', '어디', '서야'],
      answer: '신호수는 운전자가 항상 볼 수 있고, 동시에 작업 구역 전체가 보이는 위치에 있어야 합니다. 장비 이동 경로와 선회 반경 밖의 안전한 위치를 선택하세요.'
    },
    {
      keywords: ['복장', '옷', '조끼', '안전모'],
      answer: '신호수는 형광 조끼와 안전모를 반드시 착용해야 합니다. 다른 작업자와 명확히 구분되어야 하므로 빨강 또는 주황색 형광 조끼를 권장합니다.'
    },
    {
      keywords: ['긴급', '정지', '비상', '위험'],
      answer: '긴급 정지 신호는 보권을 머리 위에서 크게 흔들거나 양팔을 X자로 교차합니다. 긴급 정지 신호는 누구나 발신할 수 있습니다. 신호 후 장비가 완전히 멈출 때까지 유지하세요.'
    },
    {
      keywords: ['퀴즈', '문제', '틀렸'],
      answer: '틀린 문제는 다시 복습하면 확실히 기억됩니다! 학습 퀴즈 페이지에서 해당 단원을 다시 풀어보세요. 오답이 누적되면 자동으로 복습 문제로 출제됩니다.'
    },
    {
      keywords: ['동작', '연습', '점수'],
      answer: '동작 연습은 동작 연습 페이지에서 할 수 있습니다. MediaPipe AI가 실시간으로 자세를 분석해 점수를 줍니다. 참고 영상을 보며 천천히 따라해보세요!'
    },
    {
      keywords: ['자격', '시험', '합격'],
      answer: '신호수 자격을 위해서는 건설기계 안전운전 신호수 교육을 이수해야 합니다. 이 앱으로 충분히 연습하면 실습 시험에서 좋은 성과를 거둘 수 있습니다!'
    }
  ];

  function init() {
    if (speechSynthesis) {
      function loadVoices() {
        const voices = speechSynthesis.getVoices();
        currentVoice = voices.find(v => v.lang.startsWith('ko')) ||
                       voices.find(v => v.lang.startsWith('ko-KR')) ||
                       voices[0] || null;
      }
      loadVoices();
      speechSynthesis.onvoiceschanged = loadVoices;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.lang = 'ko-KR';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (e) => {
        const text = e.results[0][0].transcript;
        handleInput(text);
      };
      recognition.onerror = () => {
        isListening = false;
        if (onMessageCallback) onMessageCallback('stt-error', null);
      };
      recognition.onend = () => { isListening = false; };
    }
  }

  function setVoiceEnabled(enabled) {
    voiceEnabled = enabled;
    if (!enabled && isSpeaking) speechSynthesis?.cancel();
  }

  function setOnMessage(cb) { onMessageCallback = cb; }

  async function handleInput(text) {
    if (!text?.trim()) return;
    if (onMessageCallback) onMessageCallback('user', text);

    const response = await getResponse(text);
    if (onMessageCallback) onMessageCallback('tutor', response);
    if (voiceEnabled) speak(response);
  }

  async function getResponse(text) {
    // 1. Gemini 2.0 Flash
    const geminiReply = await callGemini(text);
    if (geminiReply) return geminiReply;

    // 2. 키워드 매칭 fallback
    const lower = text.toLowerCase();
    for (const item of RESPONSES) {
      if (item.keywords.some(k => lower.includes(k))) {
        return item.answer;
      }
    }

    // 3. 기본 응답
    return `"${text}"에 대한 내용은 교재를 참고해주세요. 신호수 역할, 보권/주권 사용법, 수신호 종류 등에 대해 질문해보세요!`;
  }

  function speak(text) {
    if (!speechSynthesis || !voiceEnabled) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    if (currentVoice) utterance.voice = currentVoice;
    utterance.onstart = () => { isSpeaking = true; };
    utterance.onend   = () => { isSpeaking = false; };
    speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    speechSynthesis?.cancel();
    isSpeaking = false;
  }

  function startListening() {
    if (!recognition || isListening) return false;
    try {
      recognition.start();
      isListening = true;
      return true;
    } catch { return false; }
  }

  function stopListening() {
    if (recognition && isListening) {
      recognition.stop();
      isListening = false;
    }
  }

  const INTERVENTIONS = {
    longStay: '이 부분에서 오래 머무르고 계시네요. 헷갈리는 부분이 있으신가요? 제가 설명해드릴까요?',
    frown: '뭔가 어려우신 것 같은데, 어떤 부분이 이해가 안 되시나요?',
    returnAfterDays: (days, unit) =>
      `${days}일 만에 오셨네요! 반갑습니다. 지난번에 ${unit}단원까지 하셨는데, 핵심만 30초 복습하고 시작할까요?`,
    wrongAnswer: '잠깐요! 현장에서 사고가 많이 나는 부분이에요. 함께 다시 살펴볼까요?',
    lowConcentration: '잠깐 쉬고 가실까요? 집중이 어려울 때는 잠시 스트레칭하고 다시 시작하면 더 잘 기억돼요!',
    greeting: (name) => `안녕하세요, ${name}님! 오늘도 열심히 공부해봅시다. 궁금한 건 언제든지 물어보세요!`
  };

  function intervene(type, data = {}) {
    let msg = '';
    switch (type) {
      case 'longStay':        msg = INTERVENTIONS.longStay; break;
      case 'frown':           msg = INTERVENTIONS.frown; break;
      case 'returnAfterDays': msg = INTERVENTIONS.returnAfterDays(data.days, data.unit); break;
      case 'wrongAnswer':     msg = INTERVENTIONS.wrongAnswer; break;
      case 'lowConcentration':msg = INTERVENTIONS.lowConcentration; break;
      case 'greeting':        msg = INTERVENTIONS.greeting(data.name); break;
      default: return;
    }
    if (onMessageCallback) onMessageCallback('tutor', msg);
    if (voiceEnabled) speak(msg);
  }

  function isVoiceEnabled() { return voiceEnabled; }
  function isSpeechAvailable() { return !!recognition; }

  return {
    init, setVoiceEnabled, setOnMessage, handleInput, speak, stopSpeaking,
    startListening, stopListening, intervene,
    isVoiceEnabled, isSpeechAvailable
  };
})();

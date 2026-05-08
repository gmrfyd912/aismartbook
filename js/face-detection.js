// 표정/집중도 감지 - MediaPipe FaceMesh 기반
const FaceDetection = (() => {
  let faceLandmarker = null;
  let videoEl = null;
  let canvasEl = null;
  let rafId = null;
  let lastInferMs = 0;
  let concentrationCallback = null;
  let initialized = false;

  // 집중도 이력 (스무딩용)
  const history = [];
  const HISTORY_SIZE = 30;

  async function init(videoElement, canvasElement) {
    videoEl = videoElement;
    canvasEl = canvasElement;

    try {
      const { FaceLandmarker, FilesetResolver } = await import(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
      );

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );

      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false
      });

      initialized = true;
      return true;
    } catch (e) {
      try {
        const { FaceLandmarker, FilesetResolver } = await import(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
        );
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU'
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true
        });
        initialized = true;
        return true;
      } catch (e2) {
        console.warn('[FaceDetection] 초기화 실패:', e2.message);
        return false;
      }
    }
  }

  function start(callback) {
    if (!initialized) return;
    concentrationCallback = callback;
    if (rafId) return;
    loop();
  }

  function stop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    if (!videoEl || videoEl.readyState < 2 || videoEl.paused) return;

    const now = performance.now();
    if (now - lastInferMs < 200) return; // 5fps 충분
    lastInferMs = now;

    let result;
    try { result = faceLandmarker.detectForVideo(videoEl, now); }
    catch { return; }

    if (!result?.faceLandmarks?.length) {
      pushHistory(0); // 얼굴 없음 = 집중도 0
      if (concentrationCallback) concentrationCallback({ score: smoothed(), frown: false, drowsy: false, noFace: true });
      return;
    }

    const landmarks = result.faceLandmarks[0];
    const blendshapes = result.faceBlendshapes?.[0]?.categories || [];

    // 눈썹 찌푸림 감지 (browInnerUp, browDownLeft, browDownRight)
    const browInnerUp    = getBlend(blendshapes, 'browInnerUp');
    const browDownLeft   = getBlend(blendshapes, 'browDownLeft');
    const browDownRight  = getBlend(blendshapes, 'browDownRight');
    const frown = browInnerUp > 0.3 || (browDownLeft > 0.4 && browDownRight > 0.4);

    // 졸음 감지 (eyeBlinkLeft, eyeBlinkRight)
    const blinkL = getBlend(blendshapes, 'eyeBlinkLeft');
    const blinkR = getBlend(blendshapes, 'eyeBlinkRight');
    const drowsy = blinkL > 0.6 && blinkR > 0.6;

    // 머리 숙임 감지 (랜드마크 기반 - 코 끝과 턱 상대 위치)
    const noseTip = landmarks[4];
    const chin    = landmarks[152];
    const headTilt = noseTip && chin ? Math.abs(noseTip.y - chin.y) : 0.3;
    const headDown = headTilt < 0.15; // 머리를 많이 숙인 상태

    // 집중도 점수 계산 (0~100)
    let score = 100;
    if (frown)    score -= 20;
    if (drowsy)   score -= 40;
    if (headDown) score -= 30;
    score = Math.max(0, score);

    pushHistory(score);
    const smoothScore = smoothed();

    if (concentrationCallback) {
      concentrationCallback({ score: smoothScore, frown, drowsy, headDown, noFace: false });
    }

    // 캔버스에 얼굴 윤곽 그리기 (옵션)
    if (canvasEl) drawFaceOutline(landmarks);
  }

  function getBlend(categories, name) {
    const cat = categories.find(c => c.categoryName === name);
    return cat ? cat.score : 0;
  }

  function pushHistory(score) {
    history.push(score);
    if (history.length > HISTORY_SIZE) history.shift();
  }

  function smoothed() {
    if (!history.length) return 100;
    return Math.round(history.reduce((a, b) => a + b, 0) / history.length);
  }

  function drawFaceOutline(landmarks) {
    if (!canvasEl || !videoEl) return;
    const ctx = canvasEl.getContext('2d');
    canvasEl.width  = videoEl.videoWidth  || 640;
    canvasEl.height = videoEl.videoHeight || 480;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    // 얼굴 윤곽 점 (간략화)
    const faceOval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
                      397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
                      172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
    ctx.strokeStyle = 'rgba(79,142,247,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    faceOval.forEach((idx, i) => {
      const p = landmarks[idx];
      const x = p.x * canvasEl.width;
      const y = p.y * canvasEl.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  function isInitialized() { return initialized; }

  return { init, start, stop, isInitialized };
})();

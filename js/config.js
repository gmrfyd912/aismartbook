// Firebase 설정 - 아래 값을 Firebase 콘솔에서 복사하여 입력하세요
// Firebase Console → 프로젝트 설정 → 내 앱 → SDK 설정 및 구성
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Firebase 미설정 시 오프라인(LocalStorage) 모드로만 동작
const FIREBASE_ENABLED = FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY";

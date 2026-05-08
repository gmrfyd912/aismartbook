const firebaseConfig = {
  apiKey: "AIzaSyBL5tcopKMNAf1XznEqRol1LulYQv73gtM",
  authDomain: "aismartbook-87522.firebaseapp.com",
  databaseURL: "https://aismartbook-87522-default-rtdb.firebaseio.com",
  projectId: "aismartbook-87522",
  storageBucket: "aismartbook-87522.firebasestorage.app",
  messagingSenderId: "416747155518",
  appId: "1:416747155518:web:224159e9790ba6d66d216f"
};

// Firebase 초기화 (전역 export)
if (typeof window !== 'undefined') {
  window.FIREBASE_CONFIG = firebaseConfig;
}

// firebase-manager.js 호환성 (non-module 스크립트에서 사용)
const FIREBASE_CONFIG = firebaseConfig;
const FIREBASE_ENABLED = true;

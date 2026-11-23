// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCKR1pp05VKmFL4Gqissedvq7TZQgdOmfM",
  authDomain: "talkinmute.firebaseapp.com",
  projectId: "talkinmute",
  storageBucket: "talkinmute.firebasestorage.app",
  messagingSenderId: "1020047274273",
  appId: "1:1020047274273:web:636f7492c3dd86770b0e60",
  measurementId: "G-KBT04Y981W"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
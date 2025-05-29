// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAxKBDrXvDB_Gl0OKa2B3xdSUQvjoS2B08",
  authDomain: "smashorpass-79674.firebaseapp.com",
  projectId: "smashorpass-79674",
  storageBucket: "smashorpass-79674.firebasestorage.app",
  messagingSenderId: "1040926778116",
  appId: "1:1040926778116:web:2396ef6b4c3e1e27d4a651",
  measurementId: "G-RT47JGEW3E"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// const analytics = getAnalytics(app); // Analytics can be added if needed

export { app, auth, db };

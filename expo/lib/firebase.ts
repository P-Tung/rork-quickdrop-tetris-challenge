import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD9H_PEKqZbiCZf7-PCCi1Iv7zg5t3VHss",
  authDomain: "rork-tetris.firebaseapp.com",
  projectId: "rork-tetris",
  storageBucket: "rork-tetris.firebasestorage.app",
  messagingSenderId: "518668919554",
  appId: "1:518668919554:web:04bfcbe648fa7339c3d81b",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const firebaseApp = firebase.app();
export const auth = firebase.auth;
export const firestore = firebase.firestore;
export default firebase;

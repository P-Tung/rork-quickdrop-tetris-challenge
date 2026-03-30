import { Platform } from "react-native";

// For Native (iOS/Android)
import nativeAuth from "@react-native-firebase/auth";
import nativeFirestore from "@react-native-firebase/firestore";

// For Web
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
  measurementId: "G-JJMRQDJHFB",
};

let auth: any;
let firestore: any;

if (Platform.OS === "web") {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  auth = firebase.auth;
  firestore = firebase.firestore;
  // Initialize FieldValue for web to match native
  (firestore as any).FieldValue = firebase.firestore.FieldValue;
} else {
  auth = nativeAuth;
  firestore = nativeFirestore;
}

export { auth, firestore };
export default { auth, firestore };

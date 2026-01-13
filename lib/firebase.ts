import { initializeApp, getApps } from "@react-native-firebase/app";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: "AIzaSyD9H_PEKqZbiCZf7-PCCi1Iv7zg5t3VHss",
  authDomain: "rork-tetris.firebaseapp.com",
  projectId: "rork-tetris",
  storageBucket: "rork-tetris.firebasestorage.app",
  messagingSenderId: "518668919554",
  appId: "1:518668919554:web:04bfcbe648fa7339c3d81b",
};

let firebaseApp: any = null;
let auth: any = null;
let firestore: any = null;

if (Platform.OS !== "web") {
  try {
    firebaseApp =
      getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = require("@react-native-firebase/auth").default;
    firestore = require("@react-native-firebase/firestore").default;
  } catch (e) {
    console.error("Firebase native init failed:", e);
  }
}

if (!auth || Platform.OS === "web") {
  // Fallback for web or failed native init
  auth = () => ({
    currentUser: null,
    signInAnonymously: () => Promise.resolve({ user: { uid: "anonymous" } }),
  });
  firestore = () => ({
    collection: () => ({
      doc: () => ({
        get: () => Promise.resolve({ exists: false, data: () => ({}) }),
        set: () => Promise.resolve(),
      }),
      orderBy: () => ({
        orderBy: () => ({
          limit: () => ({
            get: () => Promise.resolve({ docs: [] }),
          }),
        }),
      }),
    }),
    runTransaction: async (cb: any) => {
      const tx = {
        get: () => Promise.resolve({ exists: false, data: () => ({}) }),
        set: () => {},
        update: () => {},
        delete: () => {},
      };
      return cb(tx);
    },
  });
  firestore.FieldValue = { serverTimestamp: () => new Date() };
}

export { firebaseApp, auth, firestore };

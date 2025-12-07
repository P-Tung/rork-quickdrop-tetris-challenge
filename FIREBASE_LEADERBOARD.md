# Firebase Auth + Firestore Leaderboard Guide

This is a step-by-step plan to add Firebase authentication and a best-score leaderboard to the QuickDrop Tetris Challenge app. It assumes you’ll use a **Development Build** (Expo Go cannot load the React Native Firebase native SDKs).

## 1) Prerequisites
- Firebase project created.
- Apple Developer and Google Play developer accounts (for production builds).
- Expo/EAS CLI logged in: `bunx expo login` and `eas login`.
- Bun installed (already done).

## 2) Install dependencies
```bash
bun add @react-native-firebase/app @react-native-firebase/auth @react-native-firebase/firestore
```

## 3) Firebase project setup
1) In Firebase console:
   - Enable Email/Password auth (and any social providers you want).
   - Create a Firestore database (Production mode).
2) Download configs:
   - iOS: `GoogleService-Info.plist`
   - Android: `google-services.json`
3) Expo config:
   - iOS bundle id: `app.rork.quickdrop-tetris-challenge`
   - Android package: `app.rork.quickdrop_tetris_challenge`

## 4) Add configs to the repo (after running `expo prebuild` or in your native dirs)
- Place `GoogleService-Info.plist` in `ios/` (or project root before prebuild).
- Place `google-services.json` in `android/app/`.
- If you’re staying managed and using EAS Build (no git-native), just keep these files locally and let EAS handle them via `eas.json` `env`/`secrets` or “Upload” prompts during build.

## 5) Create a Firebase bootstrap helper (e.g., `firebase.ts`)
```ts
import { FirebaseApp, initializeApp, getApps } from '@react-native-firebase/app';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

export const firebaseApp: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export { auth, firestore, FirebaseAuthTypes };
```
- Replace config values with your project’s Web API config (Firebase console → Project settings → General).

## 6) App integration outline (`app/index.tsx`)
- On mount, initialize Firebase (import the helper once).
- Sign in anonymously by default (`auth().signInAnonymously()` if not already signed in).
- Generate a display name like `user-<4 digits>` from the UID and store it in a profile doc (optional).
- Subscribe to `auth().onAuthStateChanged` and store `user` in state.
- Game over: call `submitScore(bestScore)` if `user` exists (anonymous users included).
- Offer an optional “Keep my progress” action that links the current (anonymous) user to a durable login:
  - Google sign-in → `currentUser.linkWithCredential(googleCred)`
  - Email/password → `currentUser.linkWithCredential(emailCred)` (use `createUserWithEmailAndPassword` + link, not `signInAnonymously` again)
- IMPORTANT: Anonymous accounts are lost on uninstall. Tell users to link (Google or email/password) if they want to keep progress across devices.

### Submit score (best-score only)
```ts
async function submitScore(bestScore: number) {
  const user = auth().currentUser;
  if (!user) return;

  const ref = firestore().collection('scores').doc(user.uid);
  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data()?.bestScore ?? 0 : 0;
    if (bestScore > prev) {
      tx.set(ref, {
        bestScore,
        displayName: user.displayName ?? user.email ?? 'Anonymous',
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    }
  });
}
```

### Load leaderboard (top N)
```ts
async function loadLeaderboard(limit = 50) {
  const snap = await firestore()
    .collection('scores')
    .orderBy('bestScore', 'desc')
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
```

## 7) Firestore security rules (best-score only writes)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /scores/{userId} {
      allow read: if true; // or require auth: request.auth != null
      allow write: if request.auth != null
        && request.auth.uid == userId
        && request.resource.data.bestScore is number
        && (!exists(/databases/$(database)/documents/scores/$(userId))
            || request.resource.data.bestScore >= resource.data.bestScore);
    }
  }
}
```

## 7.1) Account linking behavior
- Linking keeps the same UID, so scores stay attached. Do NOT create a new account when the user links; use `linkWithCredential`.
- If Firebase returns `auth/credential-already-in-use`, sign in with that credential and decide whether to merge scores or show a message (e.g., “This Google/email is already linked to another account”).
- New devices that sign in with the linked provider will load the same UID and scores.

## 7.2) UX reminders
- After a few games or when a high score is reached, show a subtle prompt: “Keep your progress across devices” with Google or email/password options.
- Add an FAQ note: “If you uninstall before linking, your anonymous progress may be lost. Link your account to keep scores.”

## 8) Add `eas.json` for dev and prod builds
```jsonc
{
  "cli": { "requireCommit": false },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "production": {
      "distribution": "store"
    }
  },
  "submit": {
    "production": {}
  }
}
```

## 9) Build and run
```bash
eas login
eas build --profile development --platform ios      # install .ipa/.app on simulator/device
eas build --profile development --platform android  # install .apk/.aab on emulator/device
bunx expo start --dev-client                        # start Metro and open the dev client
```

## 10) Ship to stores
```bash
eas build --profile production --platform ios
eas build --profile production --platform android
eas submit --platform ios
eas submit --platform android
```

## 11) Data model (scores collection)
- `scores/{uid}` document:
  - `bestScore`: number
  - `displayName`: string
  - `updatedAt`: timestamp

## 12) Expo Go vs Development Build
- Expo Go: great for quick UI prototyping, but cannot load `@react-native-firebase/*`.
- Development Build: required for Firebase native SDKs (Auth + Firestore). Use this for real testing and for production parity.


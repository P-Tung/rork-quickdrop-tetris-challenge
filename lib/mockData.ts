import { firestore, auth } from "./firebase";

const MOCK_PLAYERS = [
  { displayName: "CyberPunk", bestScore: 12500 },
  { displayName: "NeonGhost", bestScore: 9800 },
  { displayName: "TetrisWizard", bestScore: 8400 },
  { displayName: "QuickDropMaster", bestScore: 7200 },
  { displayName: "PixelWarrior", bestScore: 6500 },
  { displayName: "RetroKing", bestScore: 5900 },
  { displayName: "SynthWave", bestScore: 4800 },
  { displayName: "BlockBreaker", bestScore: 3200 },
  { displayName: "GravityDefier", bestScore: 2100 },
  { displayName: "ZeroG", bestScore: 1500 },
];

export const seedMockScores = async () => {
  const user = auth().currentUser;
  console.log("👤 Current User for Seeding:", {
    uid: user?.uid,
    isAnonymous: user?.isAnonymous,
    email: user?.email,
  });
  console.log("🚀 Seeding mock scores...");
  const batch = firestore().batch();

  MOCK_PLAYERS.forEach((player, index) => {
    // Generate a consistent mock ID based on name
    const docId = `mock_user_${index}`;
    const ref = firestore().collection("scores").doc(docId);

    batch.set(ref, {
      ...player,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
  console.log("✅ Mock scores seeded successfully!");
};

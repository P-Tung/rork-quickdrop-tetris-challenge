import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Trophy, X, Medal } from "lucide-react-native";
import { firestore, auth } from "@/lib/firebase";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

interface LeaderboardEntry {
  id: string;
  bestScore: number;
  displayName: string;
  updatedAt: any;
  rank?: number;
}

interface LeaderboardModalProps {
  isVisible: boolean;
  onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isVisible,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<LeaderboardEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserScoreEntry, setCurrentUserScoreEntry] =
    useState<LeaderboardEntry | null>(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [showTooltip, setShowTooltip] = useState(false);
  const [isUserVisible, setIsUserVisible] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const viewabilityConfig = React.useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const onViewableItemsChanged = React.useRef(({ viewableItems }: any) => {
    const isVisible = viewableItems.some(
      (v: any) => v.item.id === auth().currentUser?.uid,
    );
    setIsUserVisible(isVisible);
  }).current;

  const fetchScores = useCallback(
    async (uid?: string) => {
      try {
        const state = await NetInfo.fetch();
        if (!state.isConnected) {
          await loadCachedData();
          setLoading(false);
          return;
        }

        setLoading(true);
        const snap = await firestore()
          .collection("scores")
          .orderBy("bestScore", "desc")
          .orderBy("updatedAt", "desc")
          .limit(50)
          .get();

        const leaderboardData = snap.docs.map((d: any) => ({
          id: d.id,
          ...d.data(),
        })) as LeaderboardEntry[];

        setScores(leaderboardData);
        await AsyncStorage.setItem(
          "leaderboard_cache",
          JSON.stringify(leaderboardData),
        );

        // Set current user entry for footer (will be hidden if visible in list)
        const userId = uid || currentUserId;
        if (userId) {
          const userIndex = leaderboardData.findIndex(
            (entry) => entry.id === userId,
          );

          let userEntry: LeaderboardEntry | null = null;

          if (userIndex !== -1) {
            userEntry = {
              ...leaderboardData[userIndex],
              rank: userIndex + 1,
            };
          } else {
            const userDoc = await firestore()
              .collection("scores")
              .doc(userId)
              .get();
            if (userDoc.exists) {
              const data = userDoc.data();
              userEntry = {
                id: userDoc.id,
                ...data,
                rank: undefined,
              } as LeaderboardEntry;
            } else {
              // Mock entry for 0 score
              userEntry = {
                id: userId,
                bestScore: 0,
                displayName: "",
                updatedAt: new Date(),
              };
            }
          }

          if (userEntry) {
            setCurrentUserScoreEntry(userEntry);
            await AsyncStorage.setItem(
              "user_score_entry_cache",
              JSON.stringify(userEntry),
            );
          }
        }
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
        await loadCachedData();
      } finally {
        setLoading(false);
      }
    },
    [currentUserId],
  );

  const loadCachedData = async () => {
    try {
      const cachedScores = await AsyncStorage.getItem("leaderboard_cache");
      const cachedUserEntry = await AsyncStorage.getItem(
        "user_score_entry_cache",
      );

      if (cachedScores) {
        setScores(JSON.parse(cachedScores));
      }
      if (cachedUserEntry) {
        setCurrentUserScoreEntry(JSON.parse(cachedUserEntry));
      }
    } catch (error) {
      console.error("Error loading cached leaderboard data:", error);
    }
  };

  useEffect(() => {
    if (isVisible) {
      const user = auth().currentUser;
      if (user) {
        setCurrentUserId(user.uid);
      }
      fetchScores(user?.uid);
    }
  }, [isVisible, fetchScores]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // Only consider offline if isConnected is false.
      // isInternetReachable can be null while determining, which shouldn't block the UI.
      const offline =
        state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
      if (!offline && isVisible) {
        fetchScores(auth().currentUser?.uid);
      }
    });

    // Check initial state
    NetInfo.fetch().then((state) => {
      setIsOffline(
        state.isConnected === false || state.isInternetReachable === false,
      );
    });

    return () => unsubscribe();
  }, [isVisible, fetchScores]);

  // Tooltip logic: show every time if name is empty/default, hide after 10s
  useEffect(() => {
    if (isVisible && currentUserId) {
      const userInList = scores.find((s) => s.id === currentUserId);
      const userEntry = userInList || currentUserScoreEntry;

      if (userEntry && !userEntry.displayName) {
        setShowTooltip(true);
        const timer = setTimeout(() => {
          setShowTooltip(false);
        }, 10000);
        return () => clearTimeout(timer);
      } else {
        setShowTooltip(false);
      }
    }
  }, [isVisible, currentUserId, scores, currentUserScoreEntry]);

  const handleUpdateName = async () => {
    if (!newName.trim()) {
      Alert.alert("Error", "Please enter a valid name");
      return;
    }

    try {
      if (currentUserId) {
        const userDocRef = firestore().collection("scores").doc(currentUserId);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
          // If doc doesn't exist, create it with initial score 0
          await userDocRef.set({
            displayName: newName.trim(),
            bestScore: 0,
            updatedAt: firestore.FieldValue.serverTimestamp(),
          });
        } else {
          // If doc exists, just update name
          await userDocRef.update({
            displayName: newName.trim(),
            updatedAt: firestore.FieldValue.serverTimestamp(),
          });
        }

        setRenameModalVisible(false);
        setNewName("");
        setShowTooltip(false);
        const user = auth().currentUser;
        fetchScores(user?.uid); // Refresh leaderboard
      }
    } catch (error) {
      console.error("Error updating name:", error);
      Alert.alert("Error", "Failed to update name");
    }
  };

  const getDisplayName = (item: LeaderboardEntry) => {
    if (item.displayName && item.displayName.trim() !== "") {
      return item.displayName;
    }
    return `User ${item.id.slice(-4).toUpperCase()}`;
  };

  const renderItem = ({
    item,
    index,
  }: {
    item: LeaderboardEntry;
    index: number;
  }) => {
    const isCurrentUser = item.id === currentUserId;
    const isTopThree = index >= 0 && index < 3;
    const colors = ["#FFD700", "#C0C0C0", "#CD7F32"];

    return (
      <View style={[styles.entryRow, isCurrentUser && styles.highlightedRow]}>
        <View style={styles.rankContainer}>
          {isTopThree && index >= 0 ? (
            <Medal color={colors[index]} size={24} />
          ) : (
            <Text style={styles.rankText}>
              {item.rank ? item.rank : index >= 0 ? index + 1 : "-"}
            </Text>
          )}
        </View>
        <View style={styles.nameSection}>
          <Text style={styles.displayName} numberOfLines={1}>
            {getDisplayName(item)}
          </Text>
          {isCurrentUser && (
            <View style={styles.youContainer}>
              <TouchableOpacity
                onPress={() => {
                  setNewName(item.displayName || "");
                  setRenameModalVisible(true);
                }}
              >
                <Text style={styles.youText}>(you)</Text>
              </TouchableOpacity>
              {showTooltip && (
                <View style={styles.tooltip}>
                  <Text style={styles.tooltipText}>
                    tap on to change your name
                  </Text>
                  <View style={styles.tooltipArrow} />
                </View>
              )}
            </View>
          )}
        </View>
        <Text style={styles.scoreText}>{item.bestScore.toLocaleString()}</Text>
      </View>
    );
  };

  return (
    <>
      <Modal
        visible={isVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={onClose}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <LinearGradient
            colors={["#1a3566", "#0a1628"]}
            style={styles.modalContent}
          >
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Trophy color="#FFD700" size={32} />
                <Text
                  style={styles.title}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {isOffline ? "OFFLINE LEADERBOARD" : "LEADERBOARD"}
                </Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <X color="#fff" size={28} />
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color="#FFD700" />
              </View>
            ) : (
              <View style={styles.mainContainer}>
                <FlatList
                  data={scores}
                  keyExtractor={(item) => item.id}
                  renderItem={renderItem}
                  style={styles.flatList}
                  contentContainerStyle={styles.listContent}
                  onViewableItemsChanged={onViewableItemsChanged}
                  viewabilityConfig={viewabilityConfig}
                  ListEmptyComponent={
                    <View style={styles.center}>
                      <Text style={styles.emptyText}>
                        No scores yet. Be the first!
                      </Text>
                    </View>
                  }
                />
                {currentUserScoreEntry && !isUserVisible && (
                  <View
                    style={[
                      styles.footerContainer,
                      { paddingBottom: Math.max(insets.bottom, 24) },
                    ]}
                  >
                    <View style={styles.separator} />
                    {renderItem({ item: currentUserScoreEntry, index: -1 })}
                  </View>
                )}
              </View>
            )}
          </LinearGradient>
        </View>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={renameModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <View style={styles.renameOverlay}>
          <View style={styles.renameContent}>
            <Text style={styles.renameTitle}>Change Display Name</Text>
            <TextInput
              style={styles.textInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Enter your name"
              placeholderTextColor="rgba(255,255,255,0.4)"
              autoFocus
            />
            <View style={styles.renameButtons}>
              <TouchableOpacity
                style={[styles.btn, styles.cancelBtn]}
                onPress={() => setRenameModalVisible(false)}
              >
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.saveBtn]}
                onPress={handleUpdateName}
              >
                <Text style={styles.btnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    width: "100%",
    height: "85%",
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
    backgroundColor: "#020617",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 24,
  },
  header: {
    padding: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  titleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  mainContainer: {
    flex: 1,
  },
  flatList: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
  },
  highlightedRow: {
    backgroundColor: "rgba(34, 211, 238, 0.08)",
    borderColor: "rgba(34, 211, 238, 0.2)",
    borderWidth: 1.5,
  },
  rankContainer: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 14,
    fontWeight: "800",
  },
  nameSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
  },
  displayName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  youContainer: {
    marginLeft: 8,
  },
  youText: {
    color: "#22d3ee",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tooltip: {
    position: "absolute",
    bottom: 28,
    left: -40,
    width: 160,
    backgroundColor: "#22d3ee",
    padding: 8,
    borderRadius: 12,
    zIndex: 10,
    shadowColor: "#22d3ee",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  tooltipText: {
    color: "#020617",
    fontSize: 11,
    textAlign: "center",
    fontWeight: "800",
  },
  tooltipArrow: {
    position: "absolute",
    bottom: -6,
    left: "50%",
    marginLeft: -6,
    borderWidth: 6,
    borderColor: "transparent",
    borderTopColor: "#22d3ee",
  },
  scoreText: {
    color: "#facc15",
    fontSize: 18,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.3)",
    fontSize: 16,
    fontWeight: "600",
  },
  footerContainer: {
    padding: 16,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  separator: {
    display: "none",
  },
  renameOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  renameContent: {
    width: "100%",
    backgroundColor: "#0f172a",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
  },
  renameTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 24,
    textAlign: "center",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  textInput: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    padding: 18,
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  renameButtons: {
    flexDirection: "row",
    gap: 12,
  },
  btn: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  saveBtn: {
    backgroundColor: "#22d3ee",
  },
  btnText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});

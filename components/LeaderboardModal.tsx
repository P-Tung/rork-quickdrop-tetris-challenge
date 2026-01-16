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
import { Trophy, X, Medal } from "lucide-react-native";
import { firestore, auth } from "@/lib/firebase";
import { LinearGradient } from "expo-linear-gradient";

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
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<LeaderboardEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserScoreEntry, setCurrentUserScoreEntry] =
    useState<LeaderboardEntry | null>(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [showTooltip, setShowTooltip] = useState(false);
  const [isUserVisible, setIsUserVisible] = useState(false);

  const viewabilityConfig = React.useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const onViewableItemsChanged = React.useRef(({ viewableItems }: any) => {
    const isVisible = viewableItems.some(
      (v: any) => v.item.id === auth().currentUser?.uid
    );
    setIsUserVisible(isVisible);
  }).current;

  const fetchScores = useCallback(
    async (uid?: string) => {
      try {
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

        // Set current user entry for footer (will be hidden if visible in list)
        const userId = uid || currentUserId;
        if (userId) {
          const userIndex = leaderboardData.findIndex(
            (entry) => entry.id === userId
          );

          if (userIndex !== -1) {
            setCurrentUserScoreEntry({
              ...leaderboardData[userIndex],
              rank: userIndex + 1,
            });
          } else {
            const userDoc = await firestore()
              .collection("scores")
              .doc(userId)
              .get();
            if (userDoc.exists) {
              const data = userDoc.data();
              setCurrentUserScoreEntry({
                id: userDoc.id,
                ...data,
                rank: undefined,
              } as LeaderboardEntry);
            } else {
              // Mock entry for 0 score
              setCurrentUserScoreEntry({
                id: userId,
                bestScore: 0,
                displayName: "",
                updatedAt: new Date(),
              });
            }
          }
        }
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
      } finally {
        setLoading(false);
      }
    },
    [currentUserId]
  );

  useEffect(() => {
    if (isVisible) {
      const user = auth().currentUser;
      if (user) {
        setCurrentUserId(user.uid);
      }
      fetchScores(user?.uid);
    }
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
          <LinearGradient
            colors={["#1a3566", "#0a1628"]}
            style={styles.modalContent}
          >
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Trophy color="#FFD700" size={32} />
                <Text style={styles.title}>LEADERBOARD</Text>
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
                  <View style={styles.footerContainer}>
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
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    height: "80%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  header: {
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 2,
  },
  closeButton: {
    padding: 4,
  },
  mainContainer: {
    flex: 1,
    overflow: "hidden",
  },
  flatList: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40, // More space for the footer
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#FFD700",
  },
  highlightedRow: {
    borderColor: "#FFD700",
    borderWidth: 2,
    borderRadius: 12,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    marginVertical: 4,
  },
  rankContainer: {
    width: 40,
    alignItems: "center",
  },
  rankText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 16,
    fontWeight: "bold",
  },
  nameSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
  },
  displayName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "500",
    maxWidth: "70%",
  },
  youContainer: {
    position: "relative",
    marginLeft: 4,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  youText: {
    color: "#FFD700",
    fontSize: 14,
    textDecorationLine: "underline",
    fontWeight: "bold",
  },
  tooltip: {
    position: "absolute",
    bottom: 25,
    left: -60,
    width: 150,
    backgroundColor: "#FFD700",
    padding: 8,
    borderRadius: 8,
    zIndex: 10,
  },
  tooltipText: {
    color: "#000",
    fontSize: 12,
    textAlign: "center",
    fontWeight: "600",
  },
  tooltipArrow: {
    position: "absolute",
    bottom: -8,
    left: "50%",
    marginLeft: -4,
    borderWidth: 8,
    borderColor: "transparent",
    borderTopColor: "#FFD700",
  },
  scoreText: {
    color: "#FFD700",
    fontSize: 20,
    fontWeight: "900",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 18,
  },
  footerContainer: {
    padding: 16,
    paddingBottom: 24, // Extra padding at the very bottom
    backgroundColor: "#0a1628", // Solid background to avoid overlapping issues
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginBottom: 12,
    display: "none", // Using borderTopWidth on footerContainer instead
  },
  renameOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  renameContent: {
    width: "100%",
    backgroundColor: "#1a3566",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  renameTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  textInput: {
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 10,
    padding: 15,
    color: "#fff",
    fontSize: 16,
    marginBottom: 20,
  },
  renameButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  btn: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  saveBtn: {
    backgroundColor: "#FFD700",
  },
  btnText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
});

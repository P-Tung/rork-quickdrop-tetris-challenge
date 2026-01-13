import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { Trophy, X, Medal } from "lucide-react-native";
import { firestore } from "@/lib/firebase";
import { LinearGradient } from "expo-linear-gradient";

interface LeaderboardEntry {
  id: string;
  bestScore: number;
  displayName: string;
  updatedAt: any;
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

  useEffect(() => {
    if (isVisible) {
      fetchScores();
    }
  }, [isVisible]);

  const fetchScores = async () => {
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
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({
    item,
    index,
  }: {
    item: LeaderboardEntry;
    index: number;
  }) => {
    const isTopThree = index < 3;
    const colors = ["#FFD700", "#C0C0C0", "#CD7F32"];

    return (
      <View style={styles.entryRow}>
        <View style={styles.rankContainer}>
          {isTopThree ? (
            <Medal color={colors[index]} size={24} />
          ) : (
            <Text style={styles.rankText}>{index + 1}</Text>
          )}
        </View>
        <Text style={styles.displayName} numberOfLines={1}>
          {item.displayName || "Anonymous"}
        </Text>
        <Text style={styles.scoreText}>{item.bestScore.toLocaleString()}</Text>
      </View>
    );
  };

  return (
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
            <FlatList
              data={scores}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.emptyText}>
                    No scores yet. Be the first!
                  </Text>
                </View>
              }
            />
          )}
        </LinearGradient>
      </View>
    </Modal>
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
  listContent: {
    padding: 16,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
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
  displayName: {
    flex: 1,
    color: "#fff",
    fontSize: 18,
    marginHorizontal: 12,
    fontWeight: "500",
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
});

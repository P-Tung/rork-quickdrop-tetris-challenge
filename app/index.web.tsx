import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Trophy,
  Apple,
  Play as PlayIcon,
  Medal,
  Twitter,
  MessageCircle,
} from "lucide-react-native";
import { firestore } from "@/lib/firebase";
import { WaitlistModal } from "@/components/WaitlistModal";

// const { width } = Dimensions.get("window");

interface LeaderboardEntry {
  id: string;
  bestScore: number;
  displayName: string;
  updatedAt: any;
}

const GridBackground = () => (
  <View style={styles.gridContainer}>
    {Array.from({ length: 20 }).map((_, i) => (
      <View
        key={`h-${i}`}
        style={[
          styles.gridLine,
          styles.horizontalLine,
          { top: `${(i / 20) * 100}%` },
        ]}
      />
    ))}
    {Array.from({ length: 15 }).map((_, i) => (
      <View
        key={`v-${i}`}
        style={[
          styles.gridLine,
          styles.verticalLine,
          { left: `${(i / 15) * 100}%` },
        ]}
      />
    ))}
  </View>
);

export default function LandingPage() {
  const [scores, setScores] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const PAGE_SIZE = 10;

  const fetchScores = useCallback(
    async (isInitial = true) => {
      if (loadingMore || (!isInitial && !hasMore)) {
        console.log("[Leaderboard] Fetch skipped:", {
          loadingMore,
          isInitial,
          hasMore,
        });
        return;
      }

      try {
        if (isInitial) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }

        console.log(
          `[Leaderboard] Fetching scores (isInitial: ${isInitial})...`,
        );

        let query = firestore()
          .collection("scores")
          .orderBy("bestScore", "desc")
          .orderBy("updatedAt", "desc")
          .limit(PAGE_SIZE);

        if (!isInitial && lastVisible) {
          query = query.startAfter(lastVisible);
        }

        const snap = await query.get();
        console.log(`[Leaderboard] Fetched ${snap.docs.length} records.`);

        if (snap.docs.length < PAGE_SIZE) {
          console.log("[Leaderboard] No more records to fetch.");
          setHasMore(false);
        }

        const data = snap.docs.map((d: any) => ({
          id: d.id,
          ...d.data(),
        })) as LeaderboardEntry[];

        if (isInitial) {
          setScores(data);
        } else {
          setScores((prev) => [...prev, ...data]);
        }

        setLastVisible(snap.docs[snap.docs.length - 1]);
      } catch (error) {
        console.error("[Leaderboard] Error fetching scores:", error);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        if (isInitial) {
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }).start();
        }
      }
    },
    [hasMore, lastVisible, loadingMore, fadeAnim],
  );

  useEffect(() => {
    fetchScores(true);
  }, []);

  const handleScroll = (event: any) => {
    let isCloseToBottom = false;

    if (Platform.OS === "web") {
      const { scrollTop, scrollHeight, clientHeight } = event.target;
      isCloseToBottom = scrollTop + clientHeight >= scrollHeight - 20;
    } else {
      const { layoutMeasurement, contentOffset, contentSize } =
        event.nativeEvent;
      isCloseToBottom =
        layoutMeasurement.height + contentOffset.y >= contentSize.height - 20;
    }

    if (isCloseToBottom && !loadingMore && hasMore) {
      console.log("[Leaderboard] Reached bottom, triggering next page...");
      fetchScores(false);
    }
  };

  const getDisplayName = (item: LeaderboardEntry) => {
    if (item.displayName && item.displayName.trim() !== "") {
      return item.displayName;
    }
    return `User ${item.id.slice(-4).toUpperCase()}`;
  };

  const renderLeaderboardList = () => {
    const listContent = (
      <View style={styles.scoreList}>
        {scores.map((item, index) => (
          <View key={item.id} style={styles.scoreEntry}>
            <View style={styles.rankBadge}>
              {index < 3 ? (
                <Medal
                  color={["#FFD700", "#C0C0C0", "#CD7F32"][index]}
                  size={20}
                />
              ) : (
                <Text style={styles.rankNumber}>{index + 1}</Text>
              )}
            </View>
            <Text style={styles.playerName}>{getDisplayName(item)}</Text>
            <Text style={styles.playerScore}>
              {item.bestScore.toLocaleString()}
            </Text>
          </View>
        ))}
        {loadingMore && (
          <View style={styles.loadingMoreFooter}>
            <ActivityIndicator size="small" color="#22d3ee" />
          </View>
        )}
      </View>
    );

    if (Platform.OS === "web") {
      return (
        <div
          style={{
            height: "400px",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "thin",
            scrollbarColor: "#22d3ee transparent",
          }}
          className="custom-scrollbar"
          onScroll={handleScroll}
        >
          <style>{`
            .custom-scrollbar::-webkit-scrollbar {
              width: 8px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
              background: rgba(255, 255, 255, 0.05);
              border-radius: 10px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background: #22d3ee;
              border-radius: 10px;
              box-shadow: 0 0 15px rgba(34, 211, 238, 0.4);
              border: 2px solid transparent;
              background-clip: content-box;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: #67e8f9;
              background-clip: content-box;
            }
          `}</style>
          {listContent as any}
        </div>
      );
    }

    return (
      <ScrollView
        style={styles.scoreListContainer}
        contentContainerStyle={styles.scoreListContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        nestedScrollEnabled={true}
      >
        {listContent}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#020617", "#0f172a", "#1e1b4b"]}
        style={StyleSheet.absoluteFill}
      />
      <GridBackground />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <Animated.View style={[styles.headerSection, { opacity: fadeAnim }]}>
          <Text style={styles.headerText}>QUICKDROP TETRIS</Text>

          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.pillButton}
              onPress={() => setShowWaitlist(true)}
            >
              <Apple color="#fff" size={20} />
              <Text style={styles.pillButtonText}>Download iOS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pillButton, styles.primaryPill]}
              onPress={() =>
                window.open("https://play.google.com/store", "_blank")
              }
            >
              <PlayIcon color="#020617" size={20} fill="#020617" />
              <Text style={[styles.pillButtonText, { color: "#020617" }]}>
                Download Android
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Leaderboard Section */}
        <View style={styles.leaderboardContainer}>
          <View style={styles.leaderboardBox}>
            <View style={styles.leaderboardHeader}>
              <Trophy color="#facc15" size={24} />
              <Text style={styles.leaderboardTitle}>LEADERBOARD</Text>
            </View>

            {loading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color="#22d3ee" />
              </View>
            ) : (
              renderLeaderboardList()
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text style={styles.footerText}>© 2026 RORK AI</Text>
            <Text style={styles.footerSubtext}>QUICKDROP CHALLENGE</Text>
          </View>
          <View style={styles.footerRight}>
            <TouchableOpacity style={styles.socialLink}>
              <Twitter color="rgba(255,255,255,0.6)" size={20} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialLink}>
              <MessageCircle color="rgba(255,255,255,0.6)" size={20} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <WaitlistModal
        isVisible={showWaitlist}
        onClose={() => setShowWaitlist(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  scrollContent: {
    paddingHorizontal: 20,
    alignItems: "center",
  },
  gridContainer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.05,
  },
  gridLine: {
    position: "absolute",
    backgroundColor: "#22d3ee",
  },
  horizontalLine: { left: 0, right: 0, height: 1 },
  verticalLine: { top: 0, bottom: 0, width: 1 },

  headerSection: {
    marginTop: 80,
    alignItems: "center",
    width: "100%",
  },
  headerText: {
    fontSize: 42,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 4,
    textAlign: "center",
  },
  buttonGroup: {
    flexDirection: "row",
    gap: 20,
    marginTop: 40,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  pillButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 12,
  },
  primaryPill: {
    backgroundColor: "#22d3ee",
    borderColor: "#22d3ee",
  },
  pillButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
  },

  leaderboardContainer: {
    marginTop: 60,
    width: "100%",
    maxWidth: 600,
  },
  leaderboardBox: {
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    overflow: "hidden",
    padding: 20,
  },
  leaderboardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
    gap: 12,
  },
  leaderboardTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 2,
  },
  loadingState: {
    padding: 60,
  },
  scoreListContainer: {
    height: 400,
  },
  scoreListContent: {
    flexGrow: 1,
  },
  scoreList: {
    paddingBottom: 20,
  },
  scoreEntry: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.02)",
  },
  loadingMoreFooter: {
    paddingVertical: 20,
    alignItems: "center",
  },
  rankBadge: {
    width: 40,
  },
  rankNumber: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 14,
    fontWeight: "800",
  },
  playerName: {
    flex: 1,
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    fontWeight: "600",
  },
  playerScore: {
    color: "#facc15",
    fontSize: 18,
    fontWeight: "900",
  },

  footer: {
    width: "100%",
    maxWidth: 600,
    marginTop: 80,
    paddingVertical: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  footerLeft: {
    gap: 2,
  },
  footerText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontWeight: "800",
  },
  footerSubtext: {
    color: "rgba(255,255,255,0.2)",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  footerRight: {
    flexDirection: "row",
    gap: 20,
  },
  socialLink: {
    padding: 5,
  },
});

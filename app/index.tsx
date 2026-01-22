import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Animated,
  Dimensions,
  Platform,
  PanResponder,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Trophy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as NavigationBar from "expo-navigation-bar";
import { LinearGradient } from "expo-linear-gradient";
import { auth, firestore } from "@/lib/firebase";
import { LeaderboardModal } from "@/components/LeaderboardModal";
import NetInfo from "@react-native-community/netinfo";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 14; // Reduced further to 14 rows for more breathing room
const CELL_SIZE = (SCREEN_WIDTH - 64) / BOARD_WIDTH; // Reduced width to ensure height fits
const INITIAL_DROP_SPEED = 260; // Lower is faster (ms)

type TetrominoType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
type GameState = "attract" | "playing" | "gameover";

const TETROMINOS: Record<TetrominoType, { shape: number[][]; color: string }> =
  {
    I: { shape: [[1, 1, 1, 1]], color: "#22d3ee" }, // Cyan
    O: {
      shape: [
        [1, 1],
        [1, 1],
      ],
      color: "#facc15", // Yellow
    },
    T: {
      shape: [
        [0, 1, 0],
        [1, 1, 1],
      ],
      color: "#c084fc", // Purple
    },
    S: {
      shape: [
        [0, 1, 1],
        [1, 1, 0],
      ],
      color: "#4ade80", // Green
    },
    Z: {
      shape: [
        [1, 1, 0],
        [0, 1, 1],
      ],
      color: "#fb7185", // Rose
    },
    J: {
      shape: [
        [1, 0, 0],
        [1, 1, 1],
      ],
      color: "#60a5fa", // Blue
    },
    L: {
      shape: [
        [0, 0, 1],
        [1, 1, 1],
      ],
      color: "#fb923c", // Orange
    },
  };

const GridBackground = () => {
  const gridLines = [];
  const rows = 30;
  const cols = 20;

  for (let i = 0; i <= rows; i++) {
    gridLines.push(
      <View
        key={`h-${i}`}
        style={[
          styles.gridLine,
          styles.horizontalLine,
          {
            top: `${(i / rows) * 100}%`,
            opacity: i % 5 === 0 ? 0.2 : 0.05,
          },
        ]}
      />,
    );
  }

  for (let i = 0; i <= cols; i++) {
    gridLines.push(
      <View
        key={`v-${i}`}
        style={[
          styles.gridLine,
          styles.verticalLine,
          {
            left: `${(i / cols) * 100}%`,
            opacity: i % 5 === 0 ? 0.2 : 0.05,
          },
        ]}
      />,
    );
  }

  return <View style={styles.gridContainer}>{gridLines}</View>;
};

const StarParticles = () => {
  const stars = useRef(
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: Math.random() * 2 + 1,
      anim: new Animated.Value(Math.random() * 0.5 + 0.2),
    })),
  ).current;

  useEffect(() => {
    stars.forEach((star) => {
      const animate = () => {
        Animated.sequence([
          Animated.timing(star.anim, {
            toValue: Math.random() * 0.8 + 0.2,
            duration: 1000 + Math.random() * 2000,
            useNativeDriver: true,
          }),
          Animated.timing(star.anim, {
            toValue: Math.random() * 0.3 + 0.1,
            duration: 1000 + Math.random() * 2000,
            useNativeDriver: true,
          }),
        ]).start(() => animate());
      };
      animate();
    });
  }, []);

  return (
    <View style={styles.starsContainer}>
      {stars.map((star) => (
        <Animated.View
          key={star.id}
          style={[
            styles.star,
            {
              left: `${star.left}%`,
              top: `${star.top}%`,
              width: star.size,
              height: star.size,
              opacity: star.anim,
            },
          ]}
        />
      ))}
    </View>
  );
};

export default function TetrisGame() {
  const insets = useSafeAreaInsets();
  const [gameState, setGameState] = useState<GameState>("attract");
  const [board, setBoard] = useState<(string | null)[][]>(() =>
    Array(BOARD_HEIGHT)
      .fill(null)
      .map(() => Array(BOARD_WIDTH).fill(null)),
  );
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [currentPiece, setCurrentPiece] = useState<{
    type: TetrominoType;
    x: number;
    y: number;
    rotation: number;
  } | null>(null);
  const [nextQueue, setNextQueue] = useState<TetrominoType[]>([]);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [lineFlashRows, setLineFlashRows] = useState<number[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [floatingPoints, setFloatingPoints] = useState<
    { id: number; value: number; x: number; y: number }[]
  >([]);
  const nextFloatingId = useRef(0);

  const bagRef = useRef<TetrominoType[]>([]);
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const overlayScale = useRef(new Animated.Value(1)).current;
  const scoreGlow = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const timerScale = useRef(new Animated.Value(1)).current;
  const lastSecondRef = useRef(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scoreRef = useRef(0);
  const bestScoreRef = useRef(0);
  const boardRef = useRef(board);
  const gameStateRef = useRef<GameState>(gameState);
  const currentPieceRef = useRef(currentPiece);
  const nextQueueRef = useRef(nextQueue);

  const updateBoard = (newBoard: (string | null)[][]) => {
    boardRef.current = newBoard;
    setBoard(newBoard);
  };

  const updateCurrentPiece = (piece: typeof currentPiece) => {
    currentPieceRef.current = piece;
    setCurrentPiece(piece);
  };

  const updateNextQueue = (queue: TetrominoType[]) => {
    nextQueueRef.current = queue;
    setNextQueue(queue);
  };
  const [gameoverReason, setGameoverReason] = useState<
    "time" | "collision" | null
  >(null);

  // Keep refs in sync with state for use in timers
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    bestScoreRef.current = bestScore;
  }, [bestScore]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    currentPieceRef.current = currentPiece;
  }, [currentPiece]);

  useEffect(() => {
    nextQueueRef.current = nextQueue;
  }, [nextQueue]);

  useEffect(() => {
    loadBestScore();
    const newBag = generateBag();
    const initialQueue: TetrominoType[] = [];
    for (let i = 0; i < 4; i++) {
      initialQueue.push(newBag.shift()!);
    }
    bagRef.current = newBag;
    updateNextQueue(initialQueue);
    spawnPiece(
      initialQueue[0],
      Array(BOARD_HEIGHT)
        .fill(null)
        .map(() => Array(BOARD_WIDTH).fill(null)),
    );
    startAttractMode();

    // Initialize Firebase Anonymous Auth and sync on auth state change
    const unsubscribeAuth = auth().onAuthStateChanged(async (user) => {
      if (user) {
        console.log("👤 Authenticated as:", user.uid);
        // Once authenticated, sync local best score with remote
        syncBestScoreWithRemote();
      } else {
        try {
          await auth().signInAnonymously();
        } catch (error) {
          console.error("Firebase auth error:", error);
        }
      }
    });

    // Sync score when coming online
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        syncBestScoreWithRemote();
      }
    });

    // Hide navigation bar and status bar for full screen
    if (Platform.OS === "android") {
      NavigationBar.setVisibilityAsync("hidden");
      NavigationBar.setBehaviorAsync("overlay-swipe");
    }

    return () => {
      unsubscribeAuth();
      unsubscribeNetInfo();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncBestScoreWithRemote = async () => {
    try {
      const stored = await AsyncStorage.getItem("tetris_best_score");
      if (!stored) return;

      const localScore = parseInt(stored, 10);
      const user = auth().currentUser;
      if (!user) return;

      const ref = firestore().collection("scores").doc(user.uid);
      await firestore().runTransaction(async (tx: any) => {
        const snap = await tx.get(ref);
        const remoteScore = snap.exists ? (snap.data()?.bestScore ?? 0) : 0;

        if (localScore > remoteScore) {
          const defaultName = `User ${user.uid.slice(0, 4).toUpperCase()}`;
          tx.set(
            ref,
            {
              bestScore: localScore,
              displayName:
                user.displayName || snap.data()?.displayName || defaultName,
              updatedAt: firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          console.log("✅ Synced offline score to remote:", localScore);
        }
      });
    } catch (error) {
      console.log("❌ Failed to sync best score:", error);
    }
  };

  const loadBestScore = async () => {
    try {
      const stored = await AsyncStorage.getItem("tetris_best_score");
      if (stored) setBestScore(parseInt(stored, 10));
    } catch (error) {
      console.log("Failed to load best score:", error);
    }
  };

  const saveBestScore = async (newScore: number) => {
    try {
      // Always update local storage and state if it's a new personal record
      if (newScore > bestScoreRef.current) {
        await AsyncStorage.setItem("tetris_best_score", newScore.toString());
        setBestScore(newScore);
      }

      // Check connectivity and submit to Firestore
      const state = await NetInfo.fetch();
      // Only skip if explicitly disconnected. If isInternetReachable is null, we still try.
      const isOnline = state.isConnected && state.isInternetReachable !== false;

      if (isOnline) {
        const user = auth().currentUser;
        if (user) {
          const ref = firestore().collection("scores").doc(user.uid);
          await firestore().runTransaction(async (tx: any) => {
            const snap = await tx.get(ref);
            const remoteScore = snap.exists ? (snap.data()?.bestScore ?? 0) : 0;

            const defaultName = `User ${user.uid.slice(0, 4).toUpperCase()}`;

            // We update remote if newScore is better than remote,
            // OR if newScore is equal to local best but remote is still behind
            if (newScore > remoteScore) {
              tx.set(
                ref,
                {
                  bestScore: newScore,
                  displayName:
                    user.displayName || snap.data()?.displayName || defaultName,
                  updatedAt: firestore.FieldValue.serverTimestamp(),
                },
                { merge: true },
              );
              console.log("✅ Score saved to Firestore:", newScore);
            }
          });
        }
      } else {
        console.log("📱 Offline: Score saved locally only.");
      }
    } catch (error) {
      console.log("❌ Failed to save best score:", error);
    }
  };

  const generateBag = (): TetrominoType[] => {
    const pieces: TetrominoType[] = ["I", "O", "T", "S", "Z", "J", "L"];
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    return pieces;
  };

  const getNextPieceFromBag = useCallback(() => {
    if (bagRef.current.length === 0) {
      bagRef.current = generateBag();
    }
    return bagRef.current.shift()!;
  }, []);

  const spawnPiece = (
    type: TetrominoType,
    currentBoard: (string | null)[][],
  ) => {
    const shape = TETROMINOS[type].shape;
    const startX = Math.floor((BOARD_WIDTH - shape[0].length) / 2);
    const newPiece = { type, x: startX, y: 0, rotation: 0 };

    if (checkCollision(startX, 0, shape, currentBoard)) {
      if (gameStateRef.current === "playing") {
        endGame("collision");
      }
      return;
    }

    setCurrentPiece(newPiece);
    currentPieceRef.current = newPiece;
  };

  const startAttractMode = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(overlayScale, {
          toValue: 1.1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(overlayScale, {
          toValue: 1.0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    if (dropTimerRef.current) clearInterval(dropTimerRef.current);
    dropTimerRef.current = setInterval(() => {
      setCurrentPiece((prev) => {
        if (!prev) return prev;
        const shape = getRotatedShape(prev.type, prev.rotation);
        if (!checkCollision(prev.x, prev.y + 1, shape, boardRef.current)) {
          return { ...prev, y: prev.y + 1 };
        } else {
          lockPieceInternal(prev, boardRef.current);
          return prev;
        }
      });
    }, 2000);
  };

  const startGame = () => {
    setGameState("playing");
    gameStateRef.current = "playing";
    setTimeLeft(60);
    setScore(0);
    setIsNewRecord(false);

    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Clear board for fresh start
    const emptyBoard = Array(BOARD_HEIGHT)
      .fill(null)
      .map(() => Array(BOARD_WIDTH).fill(null));
    updateBoard(emptyBoard);
    setScore(0);
    setGameoverReason(null);

    // Spawn a fresh piece for the game - USE REF to avoid stale closure
    if (nextQueueRef.current.length > 0) {
      spawnPiece(nextQueueRef.current[0], emptyBoard);
    }

    if (dropTimerRef.current) clearInterval(dropTimerRef.current);
    dropTimerRef.current = setInterval(() => {
      // Use ref as the base for logic to avoid any stale state closures
      const p = currentPieceRef.current;
      if (!p || gameStateRef.current !== "playing") return;

      const shape = getRotatedShape(p.type, p.rotation);
      if (!checkCollision(p.x, p.y + 1, shape, boardRef.current)) {
        updateCurrentPiece({ ...p, y: p.y + 1 });
      } else {
        // Lock piece immediately and prevent further moves in this tick
        lockPieceInternal(p, boardRef.current);
      }
    }, INITIAL_DROP_SPEED);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0.1) {
          setTimeout(() => endGame("time"), 0);
          return 0;
        }
        return Math.max(0, prev - 0.1);
      });
    }, 100);
  };

  const endGame = (reason: "time" | "collision") => {
    if (dropTimerRef.current) clearInterval(dropTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    setGameState("gameover");
    setGameoverReason(reason);

    const finalScore = scoreRef.current;

    // Update personal record state
    if (finalScore > bestScoreRef.current) {
      setIsNewRecord(true);
    }

    // Always attempt to save/sync if score > 0
    if (finalScore > 0) {
      saveBestScore(finalScore);
    }
  };

  const restartGame = () => {
    const newBag = generateBag();
    const initialQueue: TetrominoType[] = [];
    for (let i = 0; i < 4; i++) {
      initialQueue.push(newBag.shift()!);
    }
    const emptyBoard = Array(BOARD_HEIGHT)
      .fill(null)
      .map(() => Array(BOARD_WIDTH).fill(null));

    bagRef.current = newBag;
    setNextQueue(initialQueue);
    updateBoard(emptyBoard);
    setScore(0);
    setGameState("attract");
    setTimeLeft(60);
    setLineFlashRows([]);
    setGameoverReason(null);

    spawnPiece(initialQueue[0], emptyBoard);

    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 0,
      useNativeDriver: true,
    }).start();

    startAttractMode();
  };

  const getRotatedShape = (type: TetrominoType, rotation: number) => {
    let shape = TETROMINOS[type].shape;
    for (let i = 0; i < rotation % 4; i++) {
      shape = shape[0].map((_, colIndex) =>
        shape.map((row) => row[colIndex]).reverse(),
      );
    }
    return shape;
  };

  const checkCollision = (
    x: number,
    y: number,
    shape: number[][],
    currentBoard: (string | null)[][],
  ) => {
    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          const newX = x + col;
          const newY = y + row;
          if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) {
            return true;
          }
          if (newY >= 0 && currentBoard[newY][newX]) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const moveLeft = () => {
    if (!currentPieceRef.current || gameStateRef.current !== "playing") return;
    const p = currentPieceRef.current;
    const shape = getRotatedShape(p.type, p.rotation);
    if (!checkCollision(p.x - 1, p.y, shape, boardRef.current)) {
      updateCurrentPiece({ ...p, x: p.x - 1 });
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const moveRight = () => {
    if (!currentPieceRef.current || gameStateRef.current !== "playing") return;
    const p = currentPieceRef.current;
    const shape = getRotatedShape(p.type, p.rotation);
    if (!checkCollision(p.x + 1, p.y, shape, boardRef.current)) {
      updateCurrentPiece({ ...p, x: p.x + 1 });
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const movePieceDown = () => {
    if (!currentPieceRef.current || gameStateRef.current !== "playing") return;
    const p = currentPieceRef.current;
    const shape = getRotatedShape(p.type, p.rotation);
    if (!checkCollision(p.x, p.y + 1, shape, boardRef.current)) {
      updateCurrentPiece({ ...p, y: p.y + 1 });
    } else {
      lockPieceInternal(p, boardRef.current);
    }
  };

  const rotate = () => {
    if (!currentPieceRef.current || gameStateRef.current !== "playing") return;
    const p = currentPieceRef.current;
    const newRotation = (p.rotation + 1) % 4;
    const shape = getRotatedShape(p.type, newRotation);
    if (!checkCollision(p.x, p.y, shape, boardRef.current)) {
      updateCurrentPiece({ ...p, rotation: newRotation });
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  };

  const rotateCCW = () => {
    if (!currentPieceRef.current || gameStateRef.current !== "playing") return;
    const p = currentPieceRef.current;
    const newRotation = (p.rotation + 3) % 4;
    const shape = getRotatedShape(p.type, newRotation);
    if (!checkCollision(p.x, p.y, shape, boardRef.current)) {
      updateCurrentPiece({ ...p, rotation: newRotation });
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  };

  const hardDrop = () => {
    if (!currentPieceRef.current || gameStateRef.current !== "playing") return;
    const p = currentPieceRef.current;
    let dropY = p.y;
    const shape = getRotatedShape(p.type, p.rotation);
    while (!checkCollision(p.x, dropY + 1, shape, boardRef.current)) {
      dropY++;
    }
    const next = { ...p, y: dropY };
    updateCurrentPiece(next);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    setTimeout(() => {
      lockPieceInternal(next, boardRef.current);
    }, 50);
  };

  const getGhostY = () => {
    if (!currentPiece) return -1;
    let ghostY = currentPiece.y;
    const shape = getRotatedShape(currentPiece.type, currentPiece.rotation);
    while (!checkCollision(currentPiece.x, ghostY + 1, shape, board)) {
      ghostY++;
    }
    return ghostY;
  };

  const lockPieceInternal = (
    piece: { type: TetrominoType; x: number; y: number; rotation: number },
    currentBoard: (string | null)[][],
  ) => {
    const shape = getRotatedShape(piece.type, piece.rotation);
    const color = TETROMINOS[piece.type].color;
    const newBoard = currentBoard.map((row) => [...row]);

    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          const y = piece.y + row;
          const x = piece.x + col;
          if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
            newBoard[y][x] = color;
          }
        }
      }
    }

    updateBoard(newBoard);

    // Clear current piece before processing lines and spawning next
    updateCurrentPiece(null);

    checkLines(newBoard);
    spawnNextPiece(newBoard);
  };

  const checkLines = (currentBoard: (string | null)[][]) => {
    const fullLines: number[] = [];
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      if (currentBoard[y].every((cell) => cell !== null)) {
        fullLines.push(y);
      }
    }

    if (fullLines.length > 0) {
      setLineFlashRows(fullLines);

      if (Platform.OS !== "web") {
        if (fullLines.length >= 4) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }

      Animated.sequence([
        Animated.timing(scoreGlow, {
          toValue: 1,
          duration: 100,
          useNativeDriver: false,
        }),
        Animated.timing(scoreGlow, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }),
      ]).start();

      Animated.sequence([
        Animated.timing(shakeAnim, {
          toValue: 10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: -10,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnim, {
          toValue: 0,
          duration: 50,
          useNativeDriver: true,
        }),
      ]).start();

      setTimeout(() => {
        const newBoard = currentBoard.filter(
          (_, index) => !fullLines.includes(index),
        );
        while (newBoard.length < BOARD_HEIGHT) {
          newBoard.unshift(Array(BOARD_WIDTH).fill(null));
        }
        updateBoard(newBoard);
        setLineFlashRows([]);

        // New scoring: 100 points base, more for multi-lines
        const lineScores = [0, 100, 300, 500, 800];
        const addedPoints = lineScores[fullLines.length] || 0;

        // Add floating points animation
        const id = nextFloatingId.current++;
        setFloatingPoints((prev) => [
          ...prev,
          {
            id,
            value: addedPoints,
            x: SCREEN_WIDTH / 2,
            y: SCREEN_HEIGHT / 3,
          },
        ]);

        setTimeout(() => {
          setFloatingPoints((prev) => prev.filter((p) => p.id !== id));
        }, 1000);

        // Incremental score add for "attracting" effect
        let count = 0;
        const tickValue = 10;
        const interval = setInterval(() => {
          setScore((prev) => prev + tickValue);
          count += tickValue;
          if (count >= addedPoints) {
            clearInterval(interval);
          }
        }, 20);
      }, 150);
    }
  };

  const pulseTimer = useCallback(() => {
    Animated.sequence([
      Animated.timing(timerScale, {
        toValue: 1.4,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(timerScale, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [timerScale]);

  useEffect(() => {
    if (gameState === "playing") {
      const currentSec = Math.ceil(timeLeft);
      if (currentSec !== lastSecondRef.current) {
        if (currentSec <= 5 && currentSec > 0) {
          pulseTimer();
        }
        lastSecondRef.current = currentSec;
      }
    } else {
      lastSecondRef.current = 60;
    }
  }, [timeLeft, gameState, pulseTimer]);

  const spawnNextPiece = (currentBoard: (string | null)[][]) => {
    if (nextQueueRef.current.length === 0) return;

    const [next, ...rest] = nextQueueRef.current;
    if (!next) return;

    const newPiece = getNextPieceFromBag();
    updateNextQueue([...rest, newPiece]);

    // Delay spawning slightly to let board rendering settle
    setTimeout(() => spawnPiece(next, currentBoard), 0);
  };

  const handleTapToStart = () => {
    if (gameStateRef.current === "attract") {
      startGame();
    } else if (gameStateRef.current === "gameover") {
      restartGame();
    }
  };

  const longPressTimerRef = useRef<any>(null);
  const isRotatingCCW = useRef(false);
  const lastMoveX = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        if (gameStateRef.current !== "playing") return;

        isRotatingCCW.current = false;
        lastMoveX.current = gestureState.x0;

        if (gestureState.numberActiveTouches >= 2) {
          isRotatingCCW.current = true;
          rotateCCW();
        } else {
          longPressTimerRef.current = setTimeout(() => {
            isRotatingCCW.current = true;
            rotateCCW();
            longPressTimerRef.current = null;
          }, 350);
        }
      },
      onPanResponderMove: (_, gestureState) => {
        if (gameStateRef.current !== "playing") return;

        const { dx, dy } = gestureState;

        // Reset long press if moved significantly
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
        }

        // Incremental horizontal movement
        const moveThreshold = CELL_SIZE * 0.8;
        const currentX = gestureState.moveX;
        const diffX = currentX - lastMoveX.current;

        if (Math.abs(diffX) > moveThreshold) {
          if (diffX > 0) {
            moveRight();
          } else {
            moveLeft();
          }
          lastMoveX.current = currentX;
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }

        if (gameStateRef.current !== "playing") {
          const { dx, dy } = gestureState;
          if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
            handleTapToStart();
          }
          return;
        }

        if (isRotatingCCW.current) return;

        const { dx, dy } = gestureState;

        // Only handle vertical swipes and tap on release
        // Horizontal is handled in Move for better feel
        if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
          rotate();
        } else if (Math.abs(dy) > Math.abs(dx)) {
          if (dy < -40) {
            hardDrop();
          } else if (dy > 40) {
            movePieceDown();
          }
        }
      },
    }),
  ).current;

  const renderMiniPiece = (type: TetrominoType, size: number) => {
    const shape = TETROMINOS[type].shape;
    const color = TETROMINOS[type].color;

    return (
      <View style={{ alignItems: "center", justifyContent: "center" }}>
        {shape.map((row, rowIndex) => (
          <View key={`mini-row-${rowIndex}`} style={{ flexDirection: "row" }}>
            {row.map((cell, colIndex) => (
              <View
                key={`mini-cell-${rowIndex}-${colIndex}`}
                style={[
                  { width: size, height: size, margin: 0.5 },
                  cell
                    ? {
                        backgroundColor: color,
                        borderRadius: 2,
                        shadowColor: color,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.8,
                        shadowRadius: 5,
                        elevation: 5,
                      }
                    : {},
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    );
  };

  const renderCell = (
    color: string | null,
    key: string,
    isFlashing: boolean,
    isGhost: boolean,
  ) => (
    <View
      key={key}
      style={[
        styles.cell,
        { width: CELL_SIZE, height: CELL_SIZE },
        color &&
          !isGhost && {
            backgroundColor: color,
            borderRadius: 3,
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: 8,
            elevation: 8,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.3)",
          },
        isGhost && {
          borderWidth: 1,
          borderColor: color ?? undefined,
          opacity: 0.35,
          borderRadius: 3,
        },
        isFlashing && { backgroundColor: "#ffffff", shadowRadius: 20 },
      ]}
    />
  );

  const renderBoard = () => {
    const displayBoard = board.map((row) => [...row]);
    const ghostY = getGhostY();

    if (currentPiece && ghostY !== currentPiece.y && ghostY >= 0) {
      const shape = getRotatedShape(currentPiece.type, currentPiece.rotation);
      const color = TETROMINOS[currentPiece.type].color;

      for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
          if (shape[row][col]) {
            const y = ghostY + row;
            const x = currentPiece.x + col;
            if (
              y >= 0 &&
              y < BOARD_HEIGHT &&
              x >= 0 &&
              x < BOARD_WIDTH &&
              !displayBoard[y][x]
            ) {
              displayBoard[y][x] = `ghost-${color}`;
            }
          }
        }
      }
    }

    if (currentPiece) {
      const shape = getRotatedShape(currentPiece.type, currentPiece.rotation);
      const color = TETROMINOS[currentPiece.type].color;

      for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
          if (shape[row][col]) {
            const y = currentPiece.y + row;
            const x = currentPiece.x + col;
            if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
              displayBoard[y][x] = color;
            }
          }
        }
      }
    }

    return displayBoard.map((row, rowIndex) => {
      const isFlashing = lineFlashRows.includes(rowIndex);
      return (
        <View key={`row-${rowIndex}`} style={styles.row}>
          {row.map((cell, colIndex) => {
            const isGhost =
              typeof cell === "string" && cell.startsWith("ghost-");
            const color = isGhost ? cell.replace("ghost-", "") : cell;
            return renderCell(
              color,
              `cell-${rowIndex}-${colIndex}`,
              isFlashing,
              isGhost,
            );
          })}
        </View>
      );
    });
  };

  const glowColor = scoreGlow.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255, 255, 255, 0)", "rgba(255, 215, 0, 1)"],
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#020617", "#0f172a", "#1e1b4b", "#0f172a", "#020617"]}
        locations={[0, 0.3, 0.5, 0.7, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <GridBackground />
      <StarParticles />

      <Animated.View
        style={[styles.content, { transform: [{ translateX: shakeAnim }] }]}
      >
        <StatusBar hidden />

        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <LinearGradient
            colors={["rgba(30, 41, 59, 0.5)", "rgba(15, 23, 42, 0.5)"]}
            style={styles.headerPill}
          >
            <View style={styles.headerLeft}>
              <Text style={styles.bestLabel}>BEST</Text>
              <Text style={styles.bestScore}>{bestScore}</Text>
            </View>
            <View style={styles.headerDivider} />
            <Pressable
              style={styles.trophyButton}
              onPress={() => setShowLeaderboard(true)}
            >
              <Trophy color="#facc15" size={20} fill="#facc15" />
            </Pressable>
          </LinearGradient>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>SCORE</Text>
            <Animated.Text
              style={[
                styles.scoreText,
                { textShadowColor: glowColor, textShadowRadius: 15 },
              ]}
            >
              {score}
            </Animated.Text>
          </View>

          <View style={styles.statCard}>
            <Text
              style={[
                styles.statLabel,
                timeLeft <= 3 &&
                  gameState === "playing" && { color: "#ef4444" },
              ]}
            >
              TIME
            </Text>
            <Animated.Text
              style={[
                styles.timer,
                { transform: [{ scale: timerScale }] },
                timeLeft <= 3 &&
                  gameState === "playing" &&
                  styles.timerEmergency,
              ]}
            >
              {timeLeft >= 1
                ? Math.ceil(timeLeft).toString()
                : timeLeft.toFixed(1)}
            </Animated.Text>
          </View>
        </View>

        <View style={styles.nextContainer}>
          <Text style={styles.nextTitle}>NEXT</Text>
          <View style={styles.nextQueue}>
            {nextQueue.slice(0, 3).map((piece, index) => (
              <View key={`next-${index}`} style={styles.nextPiecePreview}>
                {renderMiniPiece(piece, CELL_SIZE * 0.5)}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.gameContainer}>
          <View {...panResponder.panHandlers} style={styles.centerArea}>
            <View style={styles.boardWrapper}>
              <LinearGradient
                colors={["rgba(34, 211, 238, 0.3)", "rgba(192, 132, 252, 0.3)"]}
                style={styles.boardGlow}
              />
              <View style={styles.boardContainer}>{renderBoard()}</View>

              {(gameState === "attract" || gameState === "gameover") && (
                <Animated.View
                  style={[
                    styles.overlay,
                    {
                      opacity: gameState === "attract" ? overlayOpacity : 1,
                      transform: [
                        { scale: gameState === "attract" ? overlayScale : 1 },
                      ],
                    },
                  ]}
                >
                  <LinearGradient
                    colors={["rgba(15, 23, 42, 0.95)", "rgba(2, 6, 23, 0.95)"]}
                    style={StyleSheet.absoluteFillObject}
                  />
                  {gameState === "attract" && (
                    <View style={styles.attractContent}>
                      <Text style={styles.overlayTitle}>
                        QUICK DROP{"\n"}CHALLENGE
                      </Text>
                      <View style={styles.startBadge}>
                        <Text style={styles.startBadgeText}>TAP TO START</Text>
                      </View>
                      <Text style={styles.overlaySubtitle}>
                        60 SECONDS • HIGH SPEED
                      </Text>
                    </View>
                  )}
                  {gameState === "gameover" && (
                    <View style={styles.gameOverContainer}>
                      <Text style={styles.gameOverTitle}>
                        {gameoverReason === "time" ? "TIME'S UP!" : "GAME OVER"}
                      </Text>
                      <View style={styles.finalScoreCard}>
                        <Text style={styles.finalScoreLabel}>FINAL SCORE</Text>
                        <Text style={styles.finalScore}>
                          {score.toLocaleString()}
                        </Text>
                        {isNewRecord && (
                          <Text style={styles.newRecord}>NEW RECORD!</Text>
                        )}
                      </View>
                      <Pressable
                        style={styles.restartButton}
                        onPress={restartGame}
                      >
                        <Text style={styles.restartButtonText}>PLAY AGAIN</Text>
                      </Pressable>
                    </View>
                  )}
                </Animated.View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.footerAd}>
          {/* place admob here in the fureture */}
          {/* <Text style={styles.adText}>admob</Text> */}
        </View>

        {floatingPoints.map((p) => (
          <FloatingScore key={p.id} value={p.value} />
        ))}
      </Animated.View>

      <LeaderboardModal
        isVisible={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  content: {
    flex: 1,
  },
  gridContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  gridLine: {
    position: "absolute" as const,
    backgroundColor: "rgba(100, 150, 255, 0.2)",
  },
  horizontalLine: {
    left: 0,
    right: 0,
    height: 1,
  },
  verticalLine: {
    top: 0,
    bottom: 0,
    width: 1,
  },
  starsContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  star: {
    position: "absolute" as const,
    backgroundColor: "#ffffff",
    borderRadius: 10,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  headerPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 41, 59, 0.4)",
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    gap: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerDivider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  bestLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: "rgba(255, 255, 255, 0.5)",
    letterSpacing: 1,
  },
  bestScore: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#ffffff",
  },
  trophyButton: {
    padding: 4,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    gap: 16,
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.3)",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "rgba(255, 255, 255, 0.4)",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  scoreText: {
    fontSize: 24,
    fontWeight: "900" as const,
    color: "#ffffff",
    letterSpacing: 1,
  },
  timer: {
    fontSize: 24,
    fontWeight: "900" as const,
    color: "#ffffff",
    fontVariant: ["tabular-nums"],
  },
  timerEmergency: {
    color: "#ef4444",
    textShadowColor: "rgba(239, 68, 68, 0.5)",
    textShadowRadius: 15,
  },
  nextContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  nextTitle: {
    fontSize: 12,
    fontWeight: "800" as const,
    color: "rgba(255, 255, 255, 0.3)",
    letterSpacing: 1.5,
  },
  nextQueue: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  nextPiecePreview: {
    minHeight: CELL_SIZE * 1.4,
    minWidth: CELL_SIZE * 1.4,
    justifyContent: "center",
    alignItems: "center",
    padding: 8,
    backgroundColor: "rgba(30, 41, 59, 0.4)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  gameContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  centerArea: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  boardWrapper: {
    position: "relative",
    padding: 12,
  },
  boardGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    opacity: 0.15,
  },
  boardContainer: {
    backgroundColor: "rgba(2, 6, 23, 0.8)",
    padding: 4,
    borderRadius: 12,
    alignSelf: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  row: {
    flexDirection: "row",
  },
  cell: {
    margin: 1.5,
    backgroundColor: "rgba(30, 41, 59, 0.2)",
    borderRadius: 3,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    borderRadius: 12,
    overflow: "hidden",
  },
  attractContent: {
    alignItems: "center",
    zIndex: 1,
  },
  overlayTitle: {
    fontSize: 32,
    fontWeight: "900" as const,
    color: "#ffffff",
    textAlign: "center",
    letterSpacing: 2,
    lineHeight: 40,
    textShadowColor: "rgba(34, 211, 238, 0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
  },
  startBadge: {
    backgroundColor: "#22d3ee",
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginTop: 24,
    shadowColor: "#22d3ee",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
  },
  startBadgeText: {
    fontSize: 14,
    fontWeight: "800" as const,
    color: "#020617",
    letterSpacing: 1,
  },
  overlaySubtitle: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "center",
    letterSpacing: 2,
    marginTop: 20,
  },
  gameOverContainer: {
    alignItems: "center",
    zIndex: 1,
    width: "100%",
  },
  gameOverTitle: {
    fontSize: 42,
    fontWeight: "900" as const,
    color: "#fb7185",
    textShadowColor: "rgba(251, 113, 133, 0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
    letterSpacing: 2,
    marginBottom: 24,
  },
  finalScoreCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: 24,
    borderRadius: 24,
    width: "100%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 32,
  },
  finalScoreLabel: {
    fontSize: 12,
    fontWeight: "700" as const,
    color: "rgba(255, 255, 255, 0.4)",
    letterSpacing: 2,
    marginBottom: 8,
  },
  finalScore: {
    fontSize: 56,
    fontWeight: "900" as const,
    color: "#ffffff",
  },
  newRecord: {
    fontSize: 16,
    fontWeight: "800" as const,
    color: "#facc15",
    marginTop: 12,
    letterSpacing: 1,
  },
  restartButton: {
    backgroundColor: "#ffffff",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 32,
    shadowColor: "#ffffff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  restartButtonText: {
    fontSize: 16,
    fontWeight: "800" as const,
    color: "#020617",
    letterSpacing: 1,
  },
  footerAd: {
    height: 70,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  adText: {
    color: "rgba(255, 255, 255, 0.2)",
    fontSize: 12,
    fontWeight: "600" as const,
    letterSpacing: 2,
  },
  floatingPoint: {
    position: "absolute",
    alignSelf: "center",
    top: "30%",
    zIndex: 100,
  },
  floatingPointText: {
    fontSize: 48,
    fontWeight: "900",
    color: "#facc15",
    textShadowColor: "rgba(250, 204, 21, 0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    letterSpacing: 2,
  },
});

const FloatingScore = ({ value }: { value: number }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
  }, []);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -120],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.1, 0.8, 1],
    outputRange: [0, 1, 1, 0],
  });

  const scale = anim.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0.5, 1.2, 1],
  });

  return (
    <Animated.View
      style={[
        styles.floatingPoint,
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      <Text style={styles.floatingPointText}>+{value}</Text>
    </Animated.View>
  );
};

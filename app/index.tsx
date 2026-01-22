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
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RotateCw,
  Trophy,
  ChevronsDown,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { auth, firestore } from "@/lib/firebase";
import { LeaderboardModal } from "@/components/LeaderboardModal";
import NetInfo from "@react-native-community/netinfo";

const SCREEN_WIDTH = Dimensions.get("window").width;

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 14; // Reduced further to 14 rows for more breathing room
const CELL_SIZE = (SCREEN_WIDTH - 64) / BOARD_WIDTH; // Reduced width to ensure height fits
const INITIAL_DROP_SPEED = 200; // Lower is faster (ms)

type TetrominoType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
type GameState = "attract" | "playing" | "gameover";

const TETROMINOS: Record<TetrominoType, { shape: number[][]; color: string }> =
  {
    I: { shape: [[1, 1, 1, 1]], color: "#00E5E5" },
    O: {
      shape: [
        [1, 1],
        [1, 1],
      ],
      color: "#FFE500",
    },
    T: {
      shape: [
        [0, 1, 0],
        [1, 1, 1],
      ],
      color: "#D64DFF",
    },
    S: {
      shape: [
        [0, 1, 1],
        [1, 1, 0],
      ],
      color: "#00E500",
    },
    Z: {
      shape: [
        [1, 1, 0],
        [0, 1, 1],
      ],
      color: "#FF3333",
    },
    J: {
      shape: [
        [1, 0, 0],
        [1, 1, 1],
      ],
      color: "#3366FF",
    },
    L: {
      shape: [
        [0, 0, 1],
        [1, 1, 1],
      ],
      color: "#FF9933",
    },
  };

const GridBackground = () => {
  const gridLines = [];
  const rows = 30;
  const cols = 15;

  for (let i = 0; i <= rows; i++) {
    gridLines.push(
      <View
        key={`h-${i}`}
        style={[
          styles.gridLine,
          styles.horizontalLine,
          { top: `${(i / rows) * 100}%` },
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
          { left: `${(i / cols) * 100}%` },
        ]}
      />,
    );
  }

  return <View style={styles.gridContainer}>{gridLines}</View>;
};

const StarParticles = () => {
  const stars = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    size: Math.random() * 2 + 1,
    opacity: Math.random() * 0.6 + 0.2,
  }));

  return (
    <View style={styles.starsContainer}>
      {stars.map((star) => (
        <View
          key={star.id}
          style={[
            styles.star,
            {
              left: `${star.left}%`,
              top: `${star.top}%`,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
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

  const bagRef = useRef<TetrominoType[]>([]);
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const overlayScale = useRef(new Animated.Value(1)).current;
  const scoreGlow = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scoreRef = useRef(0);
  const bestScoreRef = useRef(0);
  const boardRef = useRef(board);
  const gameStateRef = useRef<GameState>(gameState);

  const updateBoard = (newBoard: (string | null)[][]) => {
    boardRef.current = newBoard;
    setBoard(newBoard);
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
    loadBestScore();
    const newBag = generateBag();
    const initialQueue: TetrominoType[] = [];
    for (let i = 0; i < 4; i++) {
      initialQueue.push(newBag.shift()!);
    }
    bagRef.current = newBag;
    setNextQueue(initialQueue);
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
    setTimeLeft(60);
    setScore(0);
    setIsNewRecord(false);

    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Clear board for fresh start
    setBoard(
      Array(BOARD_HEIGHT)
        .fill(null)
        .map(() => Array(BOARD_WIDTH).fill(null)),
    );
    setScore(0);
    setGameoverReason(null);

    if (dropTimerRef.current) clearInterval(dropTimerRef.current);
    dropTimerRef.current = setInterval(() => {
      setCurrentPiece((prev) => {
        if (!prev) return prev;
        const shape = getRotatedShape(prev.type, prev.rotation);
        if (!checkCollision(prev.x, prev.y + 1, shape, boardRef.current)) {
          return { ...prev, y: prev.y + 1 };
        } else {
          // Lock piece immediately and prevent further moves in this tick
          setTimeout(() => lockPieceInternal(prev, boardRef.current), 0);
          return null; // Remove current piece during locking to prevent race conditions
        }
      });
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
    if (!currentPiece || gameState !== "playing") return;
    const shape = getRotatedShape(currentPiece.type, currentPiece.rotation);
    if (!checkCollision(currentPiece.x - 1, currentPiece.y, shape, board)) {
      setCurrentPiece({ ...currentPiece, x: currentPiece.x - 1 });
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const moveRight = () => {
    if (!currentPiece || gameState !== "playing") return;
    const shape = getRotatedShape(currentPiece.type, currentPiece.rotation);
    if (!checkCollision(currentPiece.x + 1, currentPiece.y, shape, board)) {
      setCurrentPiece({ ...currentPiece, x: currentPiece.x + 1 });
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const movePieceDown = () => {
    if (!currentPiece || gameState !== "playing") return;
    const shape = getRotatedShape(currentPiece.type, currentPiece.rotation);
    if (!checkCollision(currentPiece.x, currentPiece.y + 1, shape, board)) {
      setCurrentPiece({ ...currentPiece, y: currentPiece.y + 1 });
    } else {
      lockPieceInternal(currentPiece, board);
    }
  };

  const rotate = () => {
    if (!currentPiece || gameState !== "playing") return;
    const newRotation = (currentPiece.rotation + 1) % 4;
    const shape = getRotatedShape(currentPiece.type, newRotation);
    if (!checkCollision(currentPiece.x, currentPiece.y, shape, board)) {
      setCurrentPiece({ ...currentPiece, rotation: newRotation });
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  };

  const hardDrop = () => {
    if (!currentPiece || gameState !== "playing") return;
    let dropY = currentPiece.y;
    const shape = getRotatedShape(currentPiece.type, currentPiece.rotation);
    while (!checkCollision(currentPiece.x, dropY + 1, shape, board)) {
      dropY++;
    }
    setCurrentPiece({ ...currentPiece, y: dropY });
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    setTimeout(() => {
      lockPieceInternal({ ...currentPiece, y: dropY }, board);
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

        const lineScores = [0, 100, 300, 500, 800];
        const points = lineScores[fullLines.length] || 0;
        setScore((prev) => prev + points);
      }, 150);
    }
  };

  const spawnNextPiece = (currentBoard: (string | null)[][]) => {
    setNextQueue((prevQueue) => {
      if (prevQueue.length === 0) {
        console.error("Next queue is empty!");
        return prevQueue;
      }
      const [next, ...rest] = prevQueue;
      if (!next) {
        console.error("Next piece is undefined!");
        return prevQueue;
      }

      const newPiece = getNextPieceFromBag();
      setTimeout(() => spawnPiece(next, currentBoard), 0);

      return [...rest, newPiece];
    });
  };

  const handleTapToStart = () => {
    if (gameState === "attract") {
      startGame();
    } else if (gameState === "gameover") {
      restartGame();
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => gameState === "playing",
      onMoveShouldSetPanResponder: () => gameState === "playing",
      onPanResponderRelease: (_, gestureState) => {
        if (gameState !== "playing") return;

        const { dx, dy } = gestureState;

        if (Math.abs(dy) > Math.abs(dx) && dy < -50) {
          hardDrop();
        } else if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > 30) {
            moveRight();
          } else if (dx < -30) {
            moveLeft();
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
                        shadowOpacity: 0.5,
                        shadowRadius: 3,
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
            shadowOpacity: 0.6,
            shadowRadius: 4,
          },
        isGhost && {
          backgroundColor: color ?? undefined,
          opacity: 0.25,
          borderRadius: 3,
        },
        isFlashing && { backgroundColor: "#ffffff" },
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
        colors={["#0a1628", "#162850", "#1a3566", "#162850", "#0a1628"]}
        locations={[0, 0.3, 0.5, 0.7, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <GridBackground />
      <StarParticles />

      <Animated.View
        style={[styles.content, { transform: [{ translateX: shakeAnim }] }]}
      >
        <StatusBar style="light" translucent />

        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <View style={styles.headerLeft}>
            <Text style={styles.bestLabel}>BEST:</Text>
            <Text style={styles.bestScore}>{bestScore}</Text>
          </View>
          <Pressable
            style={styles.trophyButton}
            onPress={() => setShowLeaderboard(true)}
          >
            <Trophy color="#C9A227" size={26} />
          </Pressable>
        </View>

        <View style={styles.timerScoreRow}>
          <Animated.Text
            style={[
              styles.scoreText,
              { textShadowColor: glowColor, textShadowRadius: 15 },
            ]}
          >
            SCORE: {score}
          </Animated.Text>
          <Text
            style={[
              styles.timer,
              timeLeft < 10 && gameState === "playing" && styles.timerWarning,
            ]}
          >
            {timeLeft.toFixed(1)}
          </Text>
        </View>

        <View style={styles.nextContainer}>
          <Text style={styles.nextTitle}>NEXT</Text>
          <View style={styles.nextQueue}>
            {nextQueue.slice(0, 3).map((piece, index) => (
              <View key={`next-${index}`} style={styles.nextPiecePreview}>
                {renderMiniPiece(piece, CELL_SIZE * 0.55)}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.gameContainer}>
          <View
            {...panResponder.panHandlers}
            style={[styles.centerArea, { paddingVertical: 10 }]}
          >
            <Pressable onPress={handleTapToStart} style={styles.boardWrapper}>
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
                  {gameState === "attract" && (
                    <View style={styles.attractContent}>
                      <Text style={styles.overlayTitle}>
                        TAP ANYWHERE{"\n"}TO PLAY
                      </Text>
                      <Text style={styles.overlaySubtitle}>
                        60-SECOND CHALLENGE
                      </Text>
                    </View>
                  )}
                  {gameState === "gameover" && (
                    <View style={styles.gameOverContainer}>
                      <Text style={styles.gameOverTitle}>
                        {gameoverReason === "time" ? "TIME UP!" : "GAME OVER"}
                      </Text>
                      <Text style={styles.finalScoreLabel}>YOUR SCORE</Text>
                      <Text style={styles.finalScore}>
                        {score.toLocaleString()}
                      </Text>
                      {isNewRecord && (
                        <Text style={styles.newRecord}>NEW PERSONAL BEST!</Text>
                      )}
                      <Text style={styles.tapToRestart}>TAP TO PLAY AGAIN</Text>
                    </View>
                  )}
                </Animated.View>
              )}
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.controls,
            {
              paddingBottom: Math.max(insets.bottom, 24),
              marginBottom: 16,
            },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.controlButton,
              pressed && styles.controlButtonPressed,
            ]}
            onPress={moveLeft}
          >
            <ChevronLeft color="#4A9FFF" size={32} strokeWidth={2.5} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.controlButton,
              pressed && styles.controlButtonPressed,
            ]}
            onPress={hardDrop}
          >
            <ChevronsDown color="#4A9FFF" size={32} strokeWidth={2.5} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.controlButton,
              pressed && styles.controlButtonPressed,
            ]}
            onPress={movePieceDown}
          >
            <ChevronDown color="#4A9FFF" size={32} strokeWidth={2.5} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.controlButton,
              pressed && styles.controlButtonPressed,
            ]}
            onPress={rotate}
          >
            <RotateCw color="#4A9FFF" size={28} strokeWidth={2.5} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.controlButton,
              pressed && styles.controlButtonPressed,
            ]}
            onPress={moveRight}
          >
            <ChevronRight color="#4A9FFF" size={32} strokeWidth={2.5} />
          </Pressable>
        </View>
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
    backgroundColor: "#0a1628",
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
    backgroundColor: "rgba(100, 150, 255, 0.08)",
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 0, // Handled by insets
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bestLabel: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#ffffff",
    letterSpacing: 1,
  },
  bestScore: {
    fontSize: 18,
    fontWeight: "800" as const,
    color: "#ffffff",
  },
  trophyButton: {
    padding: 8,
  },
  timerScoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  scoreText: {
    fontSize: 22,
    fontWeight: "800" as const,
    color: "#ffffff",
    letterSpacing: 1,
  },
  timer: {
    fontSize: 28,
    fontWeight: "800" as const,
    color: "#ffffff",
  },
  timerWarning: {
    color: "#ff4444",
  },
  gameContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    fontSize: 14,
    fontWeight: "700" as const,
    color: "rgba(255, 255, 255, 0.6)",
    letterSpacing: 1,
  },
  nextQueue: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  nextPiecePreview: {
    minHeight: CELL_SIZE * 1.6,
    minWidth: CELL_SIZE * 1.6,
    justifyContent: "center",
    alignItems: "center",
    padding: 6,
    backgroundColor: "rgba(30, 60, 100, 0.4)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(100, 150, 255, 0.2)",
  },
  centerArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  boardWrapper: {
    position: "relative",
  },
  boardContainer: {
    backgroundColor: "rgba(10, 20, 40, 0.8)",
    padding: 2,
    borderRadius: 4,
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "rgba(100, 150, 255, 0.15)",
  },
  row: {
    flexDirection: "row",
  },
  cell: {
    margin: 1,
    backgroundColor: "rgba(30, 60, 100, 0.3)",
    borderRadius: 2,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 22, 40, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    borderRadius: 4,
  },
  attractContent: {
    alignItems: "center",
    gap: 16,
  },
  overlayTitle: {
    fontSize: 28,
    fontWeight: "900" as const,
    color: "#ffffff",
    textAlign: "center",
    letterSpacing: 2,
    textShadowColor: "rgba(74, 159, 255, 0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  overlaySubtitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    letterSpacing: 2,
  },
  gameOverContainer: {
    alignItems: "center",
    gap: 12,
  },
  gameOverTitle: {
    fontSize: 38,
    fontWeight: "900" as const,
    color: "#FF5555",
    textShadowColor: "rgba(255, 85, 85, 0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    letterSpacing: 2,
  },
  finalScoreLabel: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
    marginTop: 12,
    letterSpacing: 2,
  },
  finalScore: {
    fontSize: 44,
    fontWeight: "900" as const,
    color: "#ffffff",
  },
  newRecord: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFD700",
    marginTop: 8,
    letterSpacing: 1,
  },
  tapToRestart: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: 20,
    letterSpacing: 1,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 0, // Handled by insets
    paddingTop: 12,
  },
  controlButton: {
    backgroundColor: "rgba(20, 40, 80, 0.7)",
    borderRadius: 16,
    padding: 14,
    width: 62,
    height: 62,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(74, 159, 255, 0.5)",
  },
  controlButtonPressed: {
    backgroundColor: "rgba(74, 159, 255, 0.3)",
    borderColor: "#4A9FFF",
  },
});

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Animated,
  Dimensions,
  Platform,
  PanResponder,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft, ChevronRight, ChevronDown, RotateCw, Trophy, ArrowUp } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 16;
const CELL_SIZE = (SCREEN_WIDTH - 32) / BOARD_WIDTH;

type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
type GameState = 'attract' | 'playing' | 'gameover';

const TETROMINOS: Record<TetrominoType, { shape: number[][]; color: string }> = {
  I: { shape: [[1, 1, 1, 1]], color: '#00F0F0' },
  O: { shape: [[1, 1], [1, 1]], color: '#F0F000' },
  T: { shape: [[0, 1, 0], [1, 1, 1]], color: '#A000F0' },
  S: { shape: [[0, 1, 1], [1, 1, 0]], color: '#00F000' },
  Z: { shape: [[1, 1, 0], [0, 1, 1]], color: '#F00000' },
  J: { shape: [[1, 0, 0], [1, 1, 1]], color: '#0000F0' },
  L: { shape: [[0, 0, 1], [1, 1, 1]], color: '#F0A000' },
};

export default function TetrisGame() {
  const [gameState, setGameState] = useState<GameState>('attract');
  const [board, setBoard] = useState<(string | null)[][]>(() =>
    Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(null))
  );
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [currentPiece, setCurrentPiece] = useState<{ type: TetrominoType; x: number; y: number; rotation: number } | null>(null);
  const [nextQueue, setNextQueue] = useState<TetrominoType[]>([]);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [lineFlashRows, setLineFlashRows] = useState<number[]>([]);

  const bagRef = useRef<TetrominoType[]>([]);
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const overlayScale = useRef(new Animated.Value(1)).current;
  const scoreGlow = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadBestScore();
    const newBag = generateBag();
    const initialQueue: TetrominoType[] = [];
    for (let i = 0; i < 4; i++) {
      initialQueue.push(newBag.shift()!);
    }
    bagRef.current = newBag;
    setNextQueue(initialQueue);
    spawnPiece(initialQueue[0], Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(null)));
    startAttractMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBestScore = async () => {
    try {
      const stored = await AsyncStorage.getItem('tetris_best_score');
      if (stored) setBestScore(parseInt(stored, 10));
    } catch (error) {
      console.log('Failed to load best score:', error);
    }
  };

  const saveBestScore = async (newScore: number) => {
    try {
      await AsyncStorage.setItem('tetris_best_score', newScore.toString());
      setBestScore(newScore);
    } catch (error) {
      console.log('Failed to save best score:', error);
    }
  };

  const generateBag = (): TetrominoType[] => {
    const pieces: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
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

  const spawnPiece = (type: TetrominoType, currentBoard: (string | null)[][]) => {
    const shape = TETROMINOS[type].shape;
    const startX = Math.floor((BOARD_WIDTH - shape[0].length) / 2);
    const newPiece = { type, x: startX, y: 0, rotation: 0 };
    
    if (checkCollision(startX, 0, shape, currentBoard)) {
      if (gameState === 'playing') {
        endGame();
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
      ])
    ).start();

    if (dropTimerRef.current) clearInterval(dropTimerRef.current);
    dropTimerRef.current = setInterval(() => {
      setCurrentPiece((prev) => {
        if (!prev) return prev;
        const shape = getRotatedShape(prev.type, prev.rotation);
        if (!checkCollision(prev.x, prev.y + 1, shape, board)) {
          return { ...prev, y: prev.y + 1 };
        } else {
          lockPieceInternal(prev, board);
          return prev;
        }
      });
    }, 2000);
  };

  const startGame = () => {
    setGameState('playing');
    setTimeLeft(60);
    setIsNewRecord(false);

    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    if (dropTimerRef.current) clearInterval(dropTimerRef.current);
    dropTimerRef.current = setInterval(() => {
      setCurrentPiece((prev) => {
        if (!prev) return prev;
        const shape = getRotatedShape(prev.type, prev.rotation);
        if (!checkCollision(prev.x, prev.y + 1, shape, board)) {
          return { ...prev, y: prev.y + 1 };
        } else {
          setTimeout(() => lockPieceInternal(prev, board), 0);
          return prev;
        }
      });
    }, 800);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0.1) {
          setTimeout(() => endGame(), 0);
          return 0;
        }
        return Math.max(0, prev - 0.1);
      });
    }, 100);
  };

  const endGame = () => {
    if (dropTimerRef.current) clearInterval(dropTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    setGameState('gameover');

    if (score > bestScore) {
      setIsNewRecord(true);
      saveBestScore(score);
    }
  };

  const restartGame = () => {
    const newBag = generateBag();
    const initialQueue: TetrominoType[] = [];
    for (let i = 0; i < 4; i++) {
      initialQueue.push(newBag.shift()!);
    }
    const emptyBoard = Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(null));
    
    bagRef.current = newBag;
    setNextQueue(initialQueue);
    setBoard(emptyBoard);
    setScore(0);
    setGameState('attract');
    setTimeLeft(60);
    setLineFlashRows([]);
    
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
        shape.map(row => row[colIndex]).reverse()
      );
    }
    return shape;
  };

  const checkCollision = (x: number, y: number, shape: number[][], currentBoard: (string | null)[][]) => {
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
    if (!currentPiece || gameState !== 'playing') return;
    const shape = getRotatedShape(currentPiece.type, currentPiece.rotation);
    if (!checkCollision(currentPiece.x - 1, currentPiece.y, shape, board)) {
      setCurrentPiece({ ...currentPiece, x: currentPiece.x - 1 });
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const moveRight = () => {
    if (!currentPiece || gameState !== 'playing') return;
    const shape = getRotatedShape(currentPiece.type, currentPiece.rotation);
    if (!checkCollision(currentPiece.x + 1, currentPiece.y, shape, board)) {
      setCurrentPiece({ ...currentPiece, x: currentPiece.x + 1 });
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const movePieceDown = () => {
    if (!currentPiece || gameState !== 'playing') return;
    const shape = getRotatedShape(currentPiece.type, currentPiece.rotation);
    if (!checkCollision(currentPiece.x, currentPiece.y + 1, shape, board)) {
      setCurrentPiece({ ...currentPiece, y: currentPiece.y + 1 });
    } else {
      lockPieceInternal(currentPiece, board);
    }
  };

  const rotate = () => {
    if (!currentPiece || gameState !== 'playing') return;
    const newRotation = (currentPiece.rotation + 1) % 4;
    const shape = getRotatedShape(currentPiece.type, newRotation);
    if (!checkCollision(currentPiece.x, currentPiece.y, shape, board)) {
      setCurrentPiece({ ...currentPiece, rotation: newRotation });
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  };



  const hardDrop = () => {
    if (!currentPiece || gameState !== 'playing') return;
    let dropY = currentPiece.y;
    const shape = getRotatedShape(currentPiece.type, currentPiece.rotation);
    while (!checkCollision(currentPiece.x, dropY + 1, shape, board)) {
      dropY++;
    }
    setCurrentPiece({ ...currentPiece, y: dropY });
    if (Platform.OS !== 'web') {
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

  const lockPieceInternal = (piece: { type: TetrominoType; x: number; y: number; rotation: number }, currentBoard: (string | null)[][]) => {
    const shape = getRotatedShape(piece.type, piece.rotation);
    const color = TETROMINOS[piece.type].color;
    const newBoard = currentBoard.map(row => [...row]);

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

    setBoard(newBoard);
    checkLines(newBoard);
    spawnNextPiece(newBoard);
  };

  const checkLines = (currentBoard: (string | null)[][]) => {
    const fullLines: number[] = [];
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      if (currentBoard[y].every(cell => cell !== null)) {
        fullLines.push(y);
      }
    }

    if (fullLines.length > 0) {
      setLineFlashRows(fullLines);
      
      if (Platform.OS !== 'web') {
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
        const newBoard = currentBoard.filter((_, index) => !fullLines.includes(index));
        while (newBoard.length < BOARD_HEIGHT) {
          newBoard.unshift(Array(BOARD_WIDTH).fill(null));
        }
        setBoard(newBoard);
        setLineFlashRows([]);

        const lineScores = [0, 100, 300, 500, 800];
        const points = lineScores[fullLines.length] || 0;
        setScore(prev => prev + points);
      }, 150);
    }
  };

  const spawnNextPiece = (currentBoard: (string | null)[][]) => {
    setNextQueue((prevQueue) => {
      if (prevQueue.length === 0) {
        console.error('Next queue is empty!');
        return prevQueue;
      }
      const [next, ...rest] = prevQueue;
      if (!next) {
        console.error('Next piece is undefined!');
        return prevQueue;
      }
      
      const newPiece = getNextPieceFromBag();
      setTimeout(() => spawnPiece(next, currentBoard), 0);
      
      return [...rest, newPiece];
    });
  };

  const handleTapToStart = () => {
    if (gameState === 'attract') {
      startGame();
    } else if (gameState === 'gameover') {
      restartGame();
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => gameState === 'playing',
      onMoveShouldSetPanResponder: () => gameState === 'playing',
      onPanResponderRelease: (_, gestureState) => {
        if (gameState !== 'playing') return;
        
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
    })
  ).current;

  const renderMiniPiece = (type: TetrominoType, size: number) => {
    const shape = TETROMINOS[type].shape;
    const color = TETROMINOS[type].color;
    
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {shape.map((row, rowIndex) => (
          <View key={`mini-row-${rowIndex}`} style={{ flexDirection: 'row' }}>
            {row.map((cell, colIndex) => (
              <View
                key={`mini-cell-${rowIndex}-${colIndex}`}
                style={[
                  { width: size, height: size },
                  cell ? { backgroundColor: color, borderWidth: 0.5, borderColor: '#fff' } : {},
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    );
  };

  const renderCell = (color: string | null, key: string, isFlashing: boolean, isGhost: boolean) => (
    <View
      key={key}
      style={[
        styles.cell,
        { width: CELL_SIZE, height: CELL_SIZE },
        color && !isGhost && { backgroundColor: color, borderColor: '#fff', borderWidth: 1 },
        isGhost && { backgroundColor: color, opacity: 0.3, borderWidth: 1, borderColor: '#fff' },
        isFlashing && { backgroundColor: '#ffffff' },
      ]}
    />
  );

  const renderBoard = () => {
    const displayBoard = board.map(row => [...row]);
    const ghostY = getGhostY();

    if (currentPiece && ghostY !== currentPiece.y && ghostY >= 0) {
      const shape = getRotatedShape(currentPiece.type, currentPiece.rotation);
      const color = TETROMINOS[currentPiece.type].color;

      for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
          if (shape[row][col]) {
            const y = ghostY + row;
            const x = currentPiece.x + col;
            if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH && !displayBoard[y][x]) {
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
            const isGhost = typeof cell === 'string' && cell.startsWith('ghost-');
            const color = isGhost ? cell.replace('ghost-', '') : cell;
            return renderCell(color, `cell-${rowIndex}-${colIndex}`, isFlashing, isGhost);
          })}
        </View>
      );
    });
  };

  const glowColor = scoreGlow.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255, 255, 255, 0)', 'rgba(255, 215, 0, 1)'],
  });

  return (
    <Animated.View style={[styles.container, { transform: [{ translateX: shakeAnim }] }]}>
      <StatusBar hidden />

      <View style={styles.header}>
        <Text style={styles.bestScore}>BEST: {bestScore}</Text>
        <Animated.Text style={[styles.scoreText, { textShadowColor: glowColor, textShadowRadius: 10 }]}>
          {score}
        </Animated.Text>
        <View style={styles.timerContainer}>
          <Text style={[styles.timer, timeLeft < 10 && gameState === 'playing' && styles.timerWarning]}>
            {timeLeft.toFixed(1)}s
          </Text>
          <Pressable style={styles.trophyButton}>
            <Trophy color="#FFD700" size={24} />
          </Pressable>
        </View>
      </View>

      <View style={styles.nextContainer}>
        <Text style={styles.nextTitle}>NEXT</Text>
        <View style={styles.nextQueue}>
          {nextQueue.slice(0, 3).map((piece, index) => (
            <View key={`next-${index}`} style={styles.nextPiecePreview}>
              {renderMiniPiece(piece, CELL_SIZE * 0.65)}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.gameContainer}>
        <View {...panResponder.panHandlers} style={styles.centerArea}>
          <Pressable onPress={handleTapToStart} style={styles.boardWrapper}>
            <View style={styles.boardContainer}>
              {renderBoard()}
            </View>

            {(gameState === 'attract' || gameState === 'gameover') && (
              <Animated.View
                style={[
                  styles.overlay,
                  {
                    opacity: gameState === 'attract' ? overlayOpacity : 1,
                    transform: [{ scale: gameState === 'attract' ? overlayScale : 1 }],
                  },
                ]}
              >
                {gameState === 'attract' && (
                  <Text style={styles.overlayText}>TAP ANYWHERE TO PLAY{'\n'}60-SECOND CHALLENGE</Text>
                )}
                {gameState === 'gameover' && (
                  <View style={styles.gameOverContainer}>
                    <Text style={styles.gameOverTitle}>TIME UP!</Text>
                    <Text style={styles.finalScoreLabel}>YOUR SCORE</Text>
                    <Text style={styles.finalScore}>{score.toLocaleString()}</Text>
                    {isNewRecord && <Text style={styles.newRecord}>NEW PERSONAL BEST! 🔥</Text>}
                    <Text style={styles.tapToRestart}>TAP TO PLAY AGAIN</Text>
                  </View>
                )}
              </Animated.View>
            )}
          </Pressable>
        </View>
      </View>

      {gameState === 'playing' && (
        <View style={styles.controls}>
          <Pressable style={styles.controlButton} onPress={moveLeft}>
            <ChevronLeft color="#fff" size={28} />
          </Pressable>
          <Pressable style={styles.controlButton} onPress={moveRight}>
            <ChevronRight color="#fff" size={28} />
          </Pressable>
          <Pressable style={styles.controlButton} onPress={movePieceDown}>
            <ChevronDown color="#fff" size={28} />
          </Pressable>
          <Pressable style={styles.controlButton} onPress={rotate}>
            <RotateCw color="#fff" size={28} />
          </Pressable>
          <Pressable style={[styles.controlButton, styles.hardDropButton]} onPress={hardDrop}>
            <ArrowUp color="#fff" size={28} />
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 10,
  },
  bestScore: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  scoreText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-end',
  },
  timer: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  timerWarning: {
    color: '#ff4444',
  },
  trophyButton: {
    padding: 4,
  },
  gameContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  nextContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  nextTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  nextQueue: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextPiecePreview: {
    minHeight: CELL_SIZE * 1.8,
    minWidth: CELL_SIZE * 1.8,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
    backgroundColor: 'rgba(42, 42, 62, 0.5)',
    borderRadius: 8,
  },
  centerArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardWrapper: {
    position: 'relative',
  },
  boardContainer: {
    backgroundColor: '#0f0f1e',
    padding: 4,
    borderRadius: 8,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    borderWidth: 0.5,
    borderColor: '#2a2a3e',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    borderRadius: 8,
  },
  overlayText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  gameOverContainer: {
    alignItems: 'center',
    gap: 12,
  },
  gameOverTitle: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#ff4444',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  finalScoreLabel: {
    fontSize: 18,
    color: '#aaa',
    marginTop: 16,
  },
  finalScore: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  newRecord: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    marginTop: 6,
  },
  tapToRestart: {
    fontSize: 16,
    color: '#fff',
    marginTop: 24,
    opacity: 0.8,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    paddingTop: 8,
  },
  controlButton: {
    backgroundColor: '#2a2a3e',
    borderRadius: 12,
    padding: 12,
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hardDropButton: {
    backgroundColor: '#ff6b6b',
  },
});

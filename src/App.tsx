/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Settings, Pause, Play, User as UserIcon, Trophy, Maximize, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { Background3D } from './components/Background3D';

// --- Constants & Types ---
const PLAYER_SPEED_BASE = 4;
const BULLET_SPEED = 10;
const ENEMY_SPEED_BASE = 2;

type Entity = {
  x: number;
  y: number;
  width: number;
  height: number;
  type?: string;
};

type Bullet = Entity & { dx: number; dy: number; color: string; owner: 'player' | 'enemy' };
type Enemy = Entity & { hp: number; lastShot: number; shootInterval: number };
type Particle = { x: number; y: number; dx: number; dy: number; life: number; color: string; size?: number };
type Debris = { 
  x: number; 
  y: number; 
  dx: number; 
  dy: number; 
  dz: number; 
  rotX: number; 
  rotY: number; 
  rotZ: number; 
  rotSpeedX: number; 
  rotSpeedY: number; 
  rotSpeedZ: number; 
  life: number; 
  color: string; 
  size: number;
};
type ScorePopup = {
  x: number;
  y: number;
  score: number;
  life: number;
  color: string;
  vx: number;
  vy: number;
};
type Asteroid = Entity & { 
  hp: number; 
  rot: number; 
  rotSpeed: number; 
  scale: number; 
  speed: number; 
  vx: number;
  vy: number;
  splitCount: number;
  isGiant?: boolean 
};

const POWERUP_STEPS = ['SPEED', 'MISSILE', 'DOUBLE', 'LASER', 'OPTION'];

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isTogglingRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [score, setScore] = useState(0);
  const [hiScore, setHiScore] = useState(0);
  const [hiScoreName, setHiScoreName] = useState('Anonymous');
  const [playerName, setPlayerName] = useState('PILOT_01');
  const [playerStats, setPlayerStats] = useState({
    speed: 0,
    hasMissile: false,
    hasDouble: false,
    hasLaser: false,
    options: 0,
    shield: 0
  });
  const [isPaused, setIsPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [isVictory, setIsVictory] = useState(false);
  const [gamePhase, setGamePhase] = useState<'READY' | 'GO' | 'PLAYING'>('READY');
  const [dimensions, setDimensions] = useState({ width: 1000, height: 600 });
  const [globalHiScore, setGlobalHiScore] = useState(0);
  const [globalHiScoreName, setGlobalHiScoreName] = useState('Anonymous');
  const [user, setUser] = useState<any>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showJoystick, setShowJoystick] = useState(false);
  const [debugMode, setDebugMode] = useState(true);
  const [godMode, setGodMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [isLandscape, setIsLandscape] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const gameProgressRef = useRef(0);
  const lastTimeRef = useRef<number>(0);
  const playerPosRef = useRef({ nx: 0.1, ny: 0.5, tilt: 0, isExploding: false });

  // Game State Refs (to avoid re-renders during loop)
  const gameState = useRef({
    player: { 
      x: 100, 
      y: 300, 
      width: 40, 
      height: 20, 
      speed: PLAYER_SPEED_BASE, 
      shield: 0, 
      options: 0,
      hasMissile: false,
      hasLaser: false,
      hasDouble: false,
      history: [] as { x: number; y: number }[],
      isExploding: false,
      explosionTimer: 0,
      tilt: 0,
      targetTilt: 0
    },
    bullets: [] as Bullet[],
    enemies: [] as Enemy[],
    particles: [] as Particle[],
    debris: [] as Debris[],
    scorePopups: [] as ScorePopup[],
    asteroids: [] as Asteroid[],
    shieldItems: [] as Entity[],
    lastMilestone: 0,
    waveCooldown: 120,
    keys: {} as Record<string, boolean>,
    joystick: { x: 0, y: 0, active: false },
    frame: 0,
    difficulty: 1,
    score: 0,
    godMode: false,
    trailSizeMultiplier: 0.05,
    boss: {
      active: false,
      hp: 800,
      maxHp: 800,
      x: 0,
      y: 0,
      width: 180,
      height: 120,
      dir: 1,
      lastShot: 0,
      lastLaser: 0,
      isExploding: false,
      explosionTimer: 0
    },
  });

  // Handle High Score Persistence & Real-time Updates
  useEffect(() => {
    const savedScore = localStorage.getItem('vic-viper-highscore');
    const savedName = localStorage.getItem('vic-viper-highscore-name');
    const savedPlayerName = localStorage.getItem('vic-viper-player-name');
    
    if (savedScore) setHiScore(parseInt(savedScore, 10));
    if (savedName) setHiScoreName(savedName);
    if (savedPlayerName) setPlayerName(savedPlayerName);

    // Listen for Auth State
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user && user.displayName) {
        setPlayerName(user.displayName.toUpperCase().slice(0, 10));
      }
    });

    // Listen for global high score
    const hiScoreDoc = doc(db, 'scores', 'global_record');
    const unsubScore = onSnapshot(hiScoreDoc, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGlobalHiScore(data.score || 0);
        setGlobalHiScoreName(data.userName || 'Anonymous');
      }
    }, (err) => {
      console.warn('Firestore listen failed (likely permissions):', err.message);
    });

    // Mobile detection
    const checkMobile = () => {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const landscape = window.innerWidth > window.innerHeight;
      
      setIsMobile(isTouch);
      setIsLandscape(landscape);
      
      // Auto-show joystick on touch devices
      if (isTouch) {
        setShowJoystick(true);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    window.addEventListener('orientationchange', checkMobile);

    // Handle fullscreen change events (e.g. ESC key)
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      unsubAuth();
      unsubScore();
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('orientationchange', checkMobile);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = React.useCallback(async (e?: React.MouseEvent | React.PointerEvent | React.TouchEvent) => {
    if (e) {
      if ('preventDefault' in e) e.preventDefault();
      if ('stopPropagation' in e) e.stopPropagation();
    }

    if (isTogglingRef.current) return;
    isTogglingRef.current = true;

    try {
      const doc = document as any;
      const root = rootRef.current as any;

      const isCurrentlyFullscreen = !!(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
      );

      if (!isCurrentlyFullscreen) {
        const requestMethod = root?.requestFullscreen || root?.webkitRequestFullscreen || root?.mozRequestFullScreen || root?.msRequestFullscreen;
        if (requestMethod) {
          await requestMethod.call(root);
        }
      } else {
        const exitMethod = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
        if (exitMethod) {
          await exitMethod.call(doc);
        }
      }
    } catch (err) {
      console.error('Error toggling fullscreen:', err);
    } finally {
      // Small delay to prevent rapid toggling
      setTimeout(() => {
        isTogglingRef.current = false;
      }, 300);
    }
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  // Real-time high score update
  useEffect(() => {
    if (score > hiScore) {
      setHiScore(score);
      setHiScoreName(playerName);
      try {
        localStorage.setItem('vic-viper-highscore', score.toString());
        localStorage.setItem('vic-viper-highscore-name', playerName);
      } catch (e) {
        console.warn('LocalStorage save failed:', e);
      }
    }

    // Update global high score if beaten
    if (score > globalHiScore && auth.currentUser) {
      const updateGlobal = async () => {
        try {
          // Add a small delay to avoid spamming Firestore
          await new Promise(r => setTimeout(r, 1000));
          if (score > globalHiScore) {
            await setDoc(doc(db, 'scores', 'global_record'), {
              score: score,
              userName: playerName,
              updatedAt: new Date().toISOString(),
              uid: auth.currentUser?.uid
            });
          }
        } catch (err) {
          console.warn('Failed to update global high score (permissions):', err);
        }
      };
      updateGlobal();
    }
  }, [score, hiScore, playerName, globalHiScore]);

  useEffect(() => {
    if (gamePhase === 'READY') {
      const timer = setTimeout(() => setGamePhase('GO'), 1000);
      return () => clearTimeout(timer);
    } else if (gamePhase === 'GO') {
      const timer = setTimeout(() => setGamePhase('PLAYING'), 1000);
      return () => clearTimeout(timer);
    }
  }, [gamePhase]);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({ width: clientWidth, height: clientHeight });
      }
    };

    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) observer.observe(containerRef.current);
    
    updateDimensions();
    return () => observer.disconnect();
  }, []);

  const resetGame = () => {
    setScore(0);
    setGameOver(false);
    setIsVictory(false);
    setGamePhase('READY');
    gameProgressRef.current = 0; // Reset progress ref
    setPlayerStats({
      speed: 0,
      hasMissile: false,
      hasDouble: false,
      hasLaser: false,
      options: 0,
      shield: 0
    });
    
    gameState.current.player = {
      x: 100,
      y: dimensions.height / 2,
      width: 40,
      height: 20,
      speed: PLAYER_SPEED_BASE,
      shield: 0,
      options: 0,
      hasMissile: false,
      hasLaser: false,
      hasDouble: false,
      history: [],
      isExploding: false,
      explosionTimer: 0,
      tilt: 0,
      targetTilt: 0
    };
    gameState.current.bullets = [];
    gameState.current.enemies = [];
    gameState.current.particles = [];
    gameState.current.debris = [];
    gameState.current.scorePopups = [];
    gameState.current.shieldItems = [];
    gameState.current.lastMilestone = 0;
    gameState.current.waveCooldown = 120;
    gameState.current.frame = 0; // Reset frame for time-based progress
    gameState.current.joystick = { x: 0, y: 0, active: false };
    setJoystickPos({ x: 0, y: 0 });
    gameState.current.difficulty = 1;
    gameState.current.boss = {
      active: false,
      hp: 800,
      maxHp: 800,
      x: 0,
      y: 0,
      width: 180,
      height: 120,
      dir: 1,
      lastShot: 0,
      lastLaser: 0,
      isExploding: false,
      explosionTimer: 0
    };
  };

  useEffect(() => {
    // Force hide cursor on mount to ensure it's gone even without movement
    document.documentElement.style.cursor = 'none';
    document.body.style.cursor = 'none';

    const handleKeyDown = (e: KeyboardEvent) => {
      gameState.current.keys[e.code] = true;
      
      // Hide joystick if any key is pressed (keyboard connected to mobile or desktop)
      setShowJoystick(false);
      
      // Shortcut: Advance 10% progress and enable GOD Mode
      if ((e.code === 'KeyB' || e.key.toLowerCase() === 'b') && !e.repeat) {
        const totalFrames = 180 * 60;
        const jump = totalFrames * 0.10;
        gameState.current.frame = Math.min(totalFrames, gameState.current.frame + jump);
        gameProgressRef.current = gameState.current.frame / totalFrames;
        
        // Enable GOD Mode automatically
        setGodMode(true);
        gameState.current.godMode = true;
      }

      // Debug Mode toggle (Check both code and key for reliability)
      if (e.code === 'KeyI' || e.key.toLowerCase() === 'i') {
        setDebugMode(prev => {
          const next = !prev;
          (window as any).debugMode = next;
          return next;
        });
      }

      // GOD Mode toggle
      if (e.code === 'KeyG' || e.key.toLowerCase() === 'g') {
        setGodMode(prev => {
          const next = !prev;
          gameState.current.godMode = next;
          return next;
        });
      }

      // Pause toggle
      if (e.code === 'KeyP' || e.key.toLowerCase() === 'p') {
        setIsPaused(prev => !prev);
      }
      
      // Allow restart with Enter
      if (gameOver && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
        resetGame();
      }

      // Trail size adjustment
      if (e.code === 'Digit9') {
        gameState.current.trailSizeMultiplier = Math.max(0.01, gameState.current.trailSizeMultiplier - 0.01);
      }
      if (e.code === 'Digit0') {
        gameState.current.trailSizeMultiplier = Math.min(5.0, gameState.current.trailSizeMultiplier + 0.01);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => (gameState.current.keys[e.code] = false);
    
    const handleMouseMove = () => {
      // If mouse moves, it's likely a desktop, hide joystick
      if (!isMobile) setShowJoystick(false);
      window.removeEventListener('mousemove', handleMouseMove);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);

    let animationId: number;
    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = Math.min(2, (timestamp - lastTimeRef.current) / (1000 / 60));
      lastTimeRef.current = timestamp;

      if (!isPaused && !gameOver) {
        update(dt);
      }
      draw();
      
      if ((window as any).debugMode) {
        setDebugInfo((window as any).debugInfo);
      }
      
      animationId = requestAnimationFrame(loop);
    };

    const update = (dt: number) => {
      const state = gameState.current;
      const { width, height } = dimensions;
      state.frame += dt;

      // Journey Progress (3 minutes = 180 seconds)
      const totalFrames = 180 * 60;
      const currentProgress = Math.min(1, state.frame / totalFrames);
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${currentProgress * 100}%`;
      }
      gameProgressRef.current = currentProgress;

      // Boss Activation
      if (currentProgress >= 1 && !state.boss.active && !state.boss.isExploding && state.enemies.length === 0) {
        state.boss.active = true;
        state.boss.hp = state.boss.maxHp;
        state.boss.x = width + 200;
        state.boss.y = height / 2 - state.boss.height / 2;
      }

      // Boss Logic
      if (state.boss.active) {
        // Entrance
        if (state.boss.x > width - 250) {
          state.boss.x -= 2 * dt;
        } else {
          // Laser Cycle Logic
          const laserCycle = (state.frame - state.boss.lastLaser) % 360;
          const isWarning = laserCycle > 200 && laserCycle < 280;
          const isFiring = laserCycle >= 280 && laserCycle < 310;
          const isRecovery = laserCycle >= 310 && laserCycle < 340;

          // Movement (Stops during laser warning/firing/recovery)
          if (!isWarning && !isFiring && !isRecovery) {
            state.boss.y += state.boss.dir * 2 * dt;
            if (state.boss.y < 50 || state.boss.y > height - state.boss.height - 50) {
              state.boss.dir *= -1;
            }
          }

          // Shooting (Normal spread shot - stops during laser)
          if (!isWarning && !isFiring && !isRecovery && state.frame - state.boss.lastShot > 50) {
            // Spread shot
            for (let i = -2; i <= 2; i++) {
              state.bullets.push({
                x: state.boss.x,
                y: state.boss.y + state.boss.height / 2,
                width: 6,
                height: 6,
                dx: -5,
                dy: i * 1.2,
                color: '#ff00ff',
                owner: 'enemy'
              });
            }
            state.boss.lastShot = state.frame;
          }

          // Laser Firing
          if (laserCycle === 280) {
            state.bullets.push({
              x: state.boss.x - width,
              y: state.boss.y + state.boss.height / 2 - 3,
              width: width,
              height: 6,
              dx: 0,
              dy: 0,
              color: '#ff0000',
              owner: 'enemy',
              type: 'boss_laser',
              life: 30
            } as any);
          }
        }
      } else if (state.boss.isExploding) {
        state.boss.explosionTimer -= dt;
        if (Math.floor(state.frame) % 3 === 0) {
          createExplosion(
            state.boss.x + Math.random() * state.boss.width,
            state.boss.y + Math.random() * state.boss.height,
            '#ffaa00'
          );
        }
        if (state.boss.explosionTimer <= 0) {
          state.boss.isExploding = false;
          setIsVictory(true);
          setGameOver(true);
          updateHighScore(score + 5000);
        }
      }

      // Spawn Asteroids
      const baseRate = 10 - Math.floor(state.score / 4000) - Math.floor(state.frame / 6000);
      const spawnRate = Math.max(3, baseRate);
      if (state.frame % spawnRate === 0 && !state.boss.active) {
        const count = Math.random() < 0.4 ? 2 : (Math.random() < 0.1 ? 3 : 1);
        for (let i = 0; i < count; i++) {
          const isGiant = Math.random() < 0.1;
          const speed = (isGiant ? 1 + Math.random() * 2 : 2 + Math.random() * 4) * (1 + state.frame / 20000);
          state.asteroids.push({
            x: width + 100 + (i * 60),
            y: Math.random() * height,
            width: isGiant ? 100 + Math.random() * 50 : 40 + Math.random() * 40,
            height: isGiant ? 100 + Math.random() * 50 : 40 + Math.random() * 40,
            hp: isGiant ? 10 : 3,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.05,
            scale: isGiant ? 3 + Math.random() * 2 : 1 + Math.random() * 2,
            speed: speed,
            vx: -speed,
            vy: 0,
            splitCount: 0,
            isGiant
          });
        }
      }

      // Update Asteroids
      state.asteroids.forEach((a, i) => {
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        a.rot += a.rotSpeed * dt;
        if (a.x < -200 || a.x > width + 200 || a.y < -200 || a.y > height + 200) state.asteroids.splice(i, 1);
      });

      // Spawn "nave-vida" every 10%
      const currentMilestone = Math.floor(currentProgress * 10);
      if (currentMilestone > state.lastMilestone && currentMilestone <= 10 && !state.boss.active) {
        state.lastMilestone = currentMilestone;
        state.enemies.push({
          x: width,
          y: 50 + Math.random() * (height - 100),
          width: 50,
          height: 40,
          hp: 5, // More resistant
          lastShot: 0,
          shootInterval: 60,
          type: 'life',
          milestone: currentMilestone
        } as any);
      }

      // Difficulty increases
      if (Math.floor(state.frame) % 600 === 0) state.difficulty += 0.002 * dt;

      // Player Movement (AWSD + Arrows + Joystick)
      if (!state.player.isExploding) {
        const oldX = state.player.x;
        const oldY = state.player.y;
        let targetTilt = 0;

        // Keyboard
        if ((state.keys['KeyW'] || state.keys['ArrowUp']) && state.player.y > 10) {
          state.player.y -= state.player.speed * dt;
          targetTilt = -0.6;
        }
        if ((state.keys['KeyS'] || state.keys['ArrowDown']) && state.player.y < height - state.player.height - 10) {
          state.player.y += state.player.speed * dt;
          targetTilt = 0.6;
        }
        if ((state.keys['KeyA'] || state.keys['ArrowLeft']) && state.player.x > 10) state.player.x -= state.player.speed * dt;
        if ((state.keys['KeyD'] || state.keys['ArrowRight']) && state.player.x < width - state.player.width - 10) state.player.x += state.player.speed * dt;

        // Joystick
        if (state.joystick.active) {
          state.player.x += state.joystick.x * state.player.speed * dt;
          state.player.y += state.joystick.y * state.player.speed * dt;
          
          // Clamp
          state.player.x = Math.max(10, Math.min(width - state.player.width - 10, state.player.x));
          state.player.y = Math.max(10, Math.min(height - state.player.height - 10, state.player.y));
          
          // Joystick tilt
          targetTilt = state.joystick.y * 0.6;
        }

        // Smooth tilt
        if (state.player.tilt === undefined) state.player.tilt = 0;
        state.player.tilt += (targetTilt - state.player.tilt) * 0.1 * dt;

        // Update ref for 3D background
        playerPosRef.current = {
          nx: (state.player.x + state.player.width / 2) / width,
          ny: (state.player.y + state.player.height / 2) / height,
          tilt: state.player.tilt,
          isExploding: state.player.isExploding
        };

        // Update history for options
        if (state.player.x !== oldX || state.player.y !== oldY) {
          state.player.history.unshift({ x: state.player.x, y: state.player.y });
          if (state.player.history.length > 100) state.player.history.pop();
        }

        // Shooting
        const isShooting = state.keys['Space'] || state.joystick.active;
        if (isShooting && Math.floor(state.frame) % 10 === 0) {
          const shoot = (x: number, y: number, id: string) => {
            if (state.player.hasLaser) {
              // Check if this source already has a laser
              const existingLaser = state.bullets.find(b => (b as any).type === 'laser' && (b as any).sourceId === id);
              if (!existingLaser) {
                state.bullets.push({
                  x: x + state.player.width + 20,
                  y: y + state.player.height / 2 - 0.5,
                  width: 0,
                  height: 1,
                  dx: 0,
                  dy: 0,
                  color: '#00ffff',
                  owner: 'player',
                  type: 'laser',
                  sourceId: id,
                  state: 'GROWING'
                } as any);
              }
            } else {
              state.bullets.push({
                x: x + state.player.width + 20,
                y: y + state.player.height / 2 - 1,
                width: 15,
                height: 2,
                dx: BULLET_SPEED,
                dy: 0,
                color: '#00ffff',
                owner: 'player',
              });
              if (state.player.hasDouble) {
                state.bullets.push({
                  x: x + state.player.width + 20,
                  y: y + state.player.height / 2 - 1,
                  width: 15,
                  height: 2,
                  dx: BULLET_SPEED * 0.8,
                  dy: -BULLET_SPEED * 0.5,
                  color: '#00ffff',
                  owner: 'player',
                });
              }
            }

            if (state.player.hasMissile) {
              const existingMissile = state.bullets.find(b => (b as any).type === 'missile');
              if (!existingMissile) {
                state.bullets.push({
                  x: x + state.player.width / 2,
                  y: y + state.player.height,
                  width: 6,
                  height: 3,
                  dx: 2,
                  dy: 4,
                  color: '#ffff00',
                  owner: 'player',
                  type: 'missile'
                } as any);
              }
            }
          };

          shoot(state.player.x, state.player.y, 'player');

          // Options shooting
          for (let i = 0; i < state.player.options; i++) {
            const pos = state.player.history[Math.min((i + 1) * 20, state.player.history.length - 1)];
            if (pos) shoot(pos.x, pos.y, `option_${i}`);
          }
        }
      } else {
        state.player.explosionTimer--;
        if (state.player.explosionTimer <= 0) {
          setGameOver(true);
          updateHighScore(score);
        }
        // Spawn explosion particles
        if (state.frame % 5 === 0) {
          createExplosion(
            state.player.x + Math.random() * state.player.width,
            state.player.y + Math.random() * state.player.height,
            '#ffffff'
          );
        }
      }

      // Enemies Spawning
      if (state.waveCooldown > 0) {
        state.waveCooldown -= dt;
      } else if (!state.boss.active && currentProgress < 1) {
        // Spawn a wave
        const waveType = Math.floor(Math.random() * 4);
        const shootInterval = 100 + Math.random() * 80;

        switch (waveType) {
          case 0: // Horizontal Line (Same Y, staggered X)
            {
              const y = 50 + Math.random() * (height - 100);
              for (let i = 0; i < 4; i++) {
                state.enemies.push({
                  x: width + i * 60,
                  y,
                  width: 35,
                  height: 25,
                  hp: 1,
                  lastShot: 0,
                  shootInterval,
                });
              }
            }
            break;
          case 1: // Vertical Wall (Same X, different Y)
            {
              const startY = 50 + Math.random() * (height - 250);
              for (let i = 0; i < 4; i++) {
                state.enemies.push({
                  x: width,
                  y: startY + i * 50,
                  width: 35,
                  height: 25,
                  hp: 1,
                  lastShot: 0,
                  shootInterval,
                });
              }
            }
            break;
          case 2: // V-Shape
            {
              const centerY = 100 + Math.random() * (height - 200);
              const offsets = [
                { dx: 0, dy: 0 },
                { dx: 40, dy: -40 },
                { dx: 40, dy: 40 },
                { dx: 80, dy: -80 },
                { dx: 80, dy: 80 },
              ];
              offsets.forEach(off => {
                state.enemies.push({
                  x: width + off.dx,
                  y: centerY + off.dy,
                  width: 35,
                  height: 25,
                  hp: 1,
                  lastShot: 0,
                  shootInterval,
                });
              });
            }
            break;
          case 3: // Parallel Rows
            {
              const y1 = 100 + Math.random() * (height / 2 - 100);
              const y2 = height / 2 + 50 + Math.random() * (height / 2 - 150);
              for (let i = 0; i < 3; i++) {
                state.enemies.push({ x: width + i * 60, y: y1, width: 35, height: 25, hp: 1, lastShot: 0, shootInterval });
                state.enemies.push({ x: width + i * 60, y: y2, width: 35, height: 25, hp: 1, lastShot: 0, shootInterval });
              }
            }
            break;
        }

        // Set cooldown for next wave (2-4 seconds at 60fps)
        state.waveCooldown = 120 + Math.random() * 120;
      }

      // Update Enemies
      state.enemies.forEach((e, i) => {
        e.x -= ENEMY_SPEED_BASE * state.difficulty * dt;
        
        // Enemy Shooting (Aim at player)
        if (state.frame - e.lastShot > e.shootInterval) {
          const angle = Math.atan2(
            state.player.y + state.player.height / 2 - (e.y + e.height / 2),
            state.player.x + state.player.width / 2 - (e.x + e.width / 2)
          );
          state.bullets.push({
            x: e.x,
            y: e.y + e.height / 2,
            width: 6,
            height: 6,
            dx: Math.cos(angle) * BULLET_SPEED * 0.6,
            dy: Math.sin(angle) * BULLET_SPEED * 0.6,
            color: '#ff0000',
            owner: 'enemy',
          });
          e.lastShot = state.frame;
        }

        if (e.x < -50) state.enemies.splice(i, 1);
      });

      // Update Bullets
      state.bullets.forEach((b: any, i) => {
        // Add trail particles - visible but fine (skip for player laser)
        if (b.type !== 'laser') {
          state.particles.push({
            x: b.x + b.width / 2 + (Math.random() - 0.5) * 0.5,
            y: b.y + b.height / 2 + (Math.random() - 0.5) * 0.5,
            dx: -b.dx * 0.01 + (Math.random() - 0.5) * 0.1,
            dy: (Math.random() - 0.5) * 0.1,
            life: 0.8,
            color: b.color,
            size: (3.0 + Math.random() * 3.0) * state.trailSizeMultiplier
          });
        }

        if (b.type === 'boss_laser') {
          // Boss laser trail - more intense
          for (let k = 0; k < 3; k++) {
            state.particles.push({
              x: b.x + Math.random() * b.width,
              y: b.y + Math.random() * b.height,
              dx: (Math.random() - 0.5) * 2,
              dy: (Math.random() - 0.5) * 2,
              life: 0.5 + Math.random() * 0.5,
              color: b.color,
              size: (3.0 + Math.random() * 3.0) * state.trailSizeMultiplier
            });
          }
          b.life -= dt;
          if (b.life <= 0) state.bullets.splice(i, 1);
          return;
        }

        if (b.type === 'laser') {
          const maxLen = width / 2;
          const growSpeed = 20 * dt;
          const moveSpeed = BULLET_SPEED * 1.5 * dt;

          // Find source to stay attached vertically
          let sourceY = -1;
          let sourceX = -1;
          if (b.sourceId === 'player') {
            sourceX = state.player.x;
            sourceY = state.player.y;
          } else if (b.sourceId.startsWith('option_')) {
            const optIdx = parseInt(b.sourceId.split('_')[1]);
            // Only follow if option still exists
            if (optIdx < state.player.options) {
              const pos = state.player.history[Math.min((optIdx + 1) * 10, state.player.history.length - 1)];
              if (pos) {
                sourceX = pos.x;
                sourceY = pos.y;
              }
            }
          }
          
          // If source is lost, remove laser
          if (sourceY === -1) {
            state.bullets.splice(i, 1);
            return;
          }

          // Update Y to follow source
          b.y = sourceY + state.player.height / 2 - 0.5;

          if (b.state === 'GROWING') {
            b.x = sourceX + state.player.width;
            b.width += growSpeed;

            if (b.width >= maxLen) {
              b.state = 'MOVING';
            }
          } else {
            b.x += moveSpeed;
          }

          if (b.x > width + 20) {
            state.bullets.splice(i, 1);
            return;
          }

          // Laser trail
          if (state.frame % 2 === 0) {
            state.particles.push({
              x: b.x + Math.random() * b.width,
              y: b.y + b.height / 2,
              dx: -2,
              dy: (Math.random() - 0.5) * 0.5,
              life: 0.4,
              color: b.color,
              size: (1.0 + Math.random() * 1.0) * state.trailSizeMultiplier
            });
          }
          return;
        }

        if (b.type === 'missile') {
          // Homing logic
          let nearest: any = null;
          let minDist = 1000;
          state.enemies.forEach(e => {
            const d = Math.sqrt((e.x - b.x) ** 2 + (e.y - b.y) ** 2);
            if (d < minDist) {
              minDist = d;
              nearest = e;
            }
          });

          if (nearest) {
            const angle = Math.atan2(nearest.y - b.y, nearest.x - b.x);
            b.dx = Math.cos(angle) * 8 * dt;
            b.dy = Math.sin(angle) * 8 * dt;
          } else {
            b.dx = 8 * dt;
            b.dy = 2 * dt;
          }
        }

        b.x += b.dx;
        b.y += b.dy;
        if (b.x < -20 || b.x > width + 20 || b.y < -20 || b.y > height + 20) state.bullets.splice(i, 1);
      });

      // Update Shield Items
      state.shieldItems.forEach((item: any, i) => {
        item.x -= 0.8 * dt; // Slower
        if (item.x < -50) state.shieldItems.splice(i, 1);

        // Check for player bullet collision to cycle
        state.bullets.forEach((b, bi) => {
          if (b.owner === 'player' && b.x < item.x + item.width && b.x + b.width > item.x && b.y < item.y + item.height && b.y + b.height > item.y) {
            if (item.type === 'cycle') {
              item.cycleIndex = (item.cycleIndex + 1) % POWERUP_STEPS.length;
              item.label = POWERUP_STEPS[item.cycleIndex];
              state.bullets.splice(bi, 1);
            }
          }
        });

        // Collision with player
        if (
          !state.player.isExploding &&
          state.player.x < item.x + item.width &&
          state.player.x + state.player.width > item.x &&
          state.player.y < item.y + item.height &&
          state.player.y + state.player.height > item.y
        ) {
          if (item.type === 'shield') {
            state.player.shield = Math.min(3, state.player.shield + 1);
          } else {
            const pType = POWERUP_STEPS[item.cycleIndex];
            if (pType === 'SPEED') state.player.speed = Math.min(8, state.player.speed + 1);
            if (pType === 'MISSILE') state.player.hasMissile = true;
            if (pType === 'DOUBLE') { state.player.hasDouble = true; state.player.hasLaser = false; }
            if (pType === 'LASER') { state.player.hasLaser = true; state.player.hasDouble = false; }
            if (pType === 'OPTION') state.player.options = Math.min(2, state.player.options + 1);
          }
          
          // Sync stats for HUD - only if changed
          setPlayerStats(prev => {
            const next = {
              speed: state.player.speed - PLAYER_SPEED_BASE,
              hasMissile: state.player.hasMissile,
              hasDouble: state.player.hasDouble,
              hasLaser: state.player.hasLaser,
              options: state.player.options,
              shield: state.player.shield
            };
            if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
            return next;
          });

          state.shieldItems.splice(i, 1);
          createExplosion(item.x + item.width/2, item.y + item.height/2, '#00ffff');
        }
      });

      // Collisions
      state.bullets.forEach((b: any, bi) => {
        if (b.owner === 'player') {
          // Bullets vs Boss
          if (state.boss.active) {
            if (
              b.x < state.boss.x + state.boss.width &&
              b.x + b.width > state.boss.x &&
              b.y < state.boss.y + state.boss.height &&
              b.y + b.height > state.boss.y
            ) {
              if (b.type !== 'laser') state.bullets.splice(bi, 1);
              state.boss.hp -= 2;
              if (state.boss.hp <= 0) {
                state.boss.active = false;
                state.boss.isExploding = true;
                state.boss.explosionTimer = 180;
                createExplosion(state.boss.x + state.boss.width/2, state.boss.y + state.boss.height/2, '#ff00ff', true);
                state.score += 10000;
                setScore(s => s + 10000);
              }
            }
          }

          state.enemies.forEach((e, ei) => {
            if (
              b.x < e.x + e.width &&
              b.x + b.width > e.x &&
              b.y < e.y + e.height &&
              b.y + b.height > e.y
            ) {
              if (b.type !== 'laser') {
                state.bullets.splice(bi, 1);
              }
              e.hp--;
              if (e.hp <= 0) {
                createExplosion(e.x + e.width/2, e.y + e.height/2, e.type === 'life' ? '#ffff00' : '#ff00ff');
                if (e.type === 'life') {
                  const isShield = (e as any).milestone % 3 === 0;
                  state.shieldItems.push({
                    x: e.x,
                    y: e.y,
                    width: 35,
                    height: 35,
                    type: isShield ? 'shield' : 'cycle',
                    cycleIndex: 0,
                    label: isShield ? 'SHIELD' : POWERUP_STEPS[0]
                  } as any);
                }
                state.enemies.splice(ei, 1);
                const points = e.type === 'life' ? 500 : 100;
                state.score += points;
                setScore(s => s + points);
                
                // Score popup
                state.scorePopups.push({
                  x: e.x + e.width / 2,
                  y: e.y + e.height / 2,
                  score: points,
                  life: 1.0,
                  color: '#ffff00',
                  vx: (Math.random() - 0.5) * 2,
                  vy: -2 - Math.random() * 2
                });
              }
            }
          });

          // Bullets vs Asteroids
          state.asteroids.forEach((a, ai) => {
            if (
              b.x < a.x + a.width &&
              b.x + b.width > a.x &&
              b.y < a.y + a.height &&
              b.y + b.height > a.y
            ) {
              if (b.type !== 'laser') state.bullets.splice(bi, 1);
              a.hp--;
              if (a.hp <= 0) {
                createExplosion(a.x + a.width/2, a.y + a.height/2, '#ff4444');
                
                // Score popup
                const points = a.isGiant ? 500 : (a.splitCount === 0 ? 100 : 50);
                state.score += points;
                setScore(s => s + points);
                state.scorePopups.push({
                  x: a.x + a.width / 2,
                  y: a.y + a.height / 2,
                  score: points,
                  life: 1.0,
                  color: '#ffff00',
                  vx: (Math.random() - 0.5) * 2,
                  vy: -2 - Math.random() * 2
                });

                // Splitting logic
                if (a.splitCount < 3) {
                  for (let j = 0; j < 2; j++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = a.speed * 1.2; // Slightly faster when splitting
                    let newHp = 1;
                    if (a.isGiant) {
                      if (a.splitCount === 0) newHp = 5;
                      else if (a.splitCount === 1) newHp = 2;
                      else newHp = 1;
                    } else {
                      if (a.splitCount === 0) newHp = 2;
                      else newHp = 1;
                    }

                    state.asteroids.push({
                      x: a.x + a.width / 4,
                      y: a.y + a.height / 4,
                      width: a.width / 2,
                      height: a.height / 2,
                      hp: newHp,
                      rot: Math.random() * Math.PI * 2,
                      rotSpeed: (Math.random() - 0.5) * 0.1,
                      scale: a.scale / 2,
                      speed: speed,
                      vx: Math.cos(angle) * speed,
                      vy: Math.sin(angle) * speed,
                      splitCount: a.splitCount + 1,
                      isGiant: a.isGiant
                    });
                  }
                }

                if (a.isGiant && Math.random() < 0.5) {
                  state.shieldItems.push({
                    x: a.x,
                    y: a.y,
                    width: 35,
                    height: 35,
                    type: 'cycle',
                    cycleIndex: 0,
                    label: POWERUP_STEPS[0]
                  } as any);
                }
                state.asteroids.splice(ai, 1);
              }
            }
          });
        } else {
          // Enemy bullet hit player
          if (
            b.x < state.player.x + state.player.width &&
            b.x + b.width > state.player.x &&
            b.y < state.player.y + state.player.height &&
            b.y + b.height > state.player.y
          ) {
            if (b.type !== 'boss_laser') state.bullets.splice(bi, 1);
              if (state.player.shield > 0) {
              state.player.shield--;
            } else if (!state.player.isExploding && !state.godMode) {
              state.player.isExploding = true;
              state.player.explosionTimer = 120; // ~2 seconds at 60fps
              createExplosion(state.player.x + state.player.width/2, state.player.y + state.player.height/2, '#ffffff', true);
            }
          }
        }
      });

      // Player vs Enemy collision
      state.enemies.forEach((e, ei) => {
        if (
          !state.player.isExploding &&
          !state.godMode &&
          state.player.x < e.x + e.width &&
          state.player.x + state.player.width > e.x &&
          state.player.y < e.y + e.height &&
          state.player.y + state.player.height > e.y
        ) {
          state.player.isExploding = true;
          state.player.explosionTimer = 120;
          createExplosion(state.player.x + state.player.width/2, state.player.y + state.player.height/2, '#ffffff', true);
        }
      });

      // Player vs Asteroid collision
      state.asteroids.forEach((a, ai) => {
        if (
          !state.player.isExploding &&
          !state.godMode &&
          state.player.x < a.x + a.width &&
          state.player.x + state.player.width > a.x &&
          state.player.y < a.y + a.height &&
          state.player.y + state.player.height > a.y
        ) {
          state.player.isExploding = true;
          state.player.explosionTimer = 120;
          createExplosion(state.player.x + state.player.width/2, state.player.y + state.player.height/2, '#ffffff', true);
        }
      });

      // Player vs Boss collision
      if (state.boss.active && !state.player.isExploding && !state.godMode) {
        if (
          state.player.x < state.boss.x + state.boss.width &&
          state.player.x + state.player.width > state.boss.x &&
          state.player.y < state.boss.y + state.boss.height &&
          state.player.y + state.player.height > state.boss.y
        ) {
          state.player.isExploding = true;
          state.player.explosionTimer = 120;
          createExplosion(state.player.x + state.player.width/2, state.player.y + state.player.height/2, '#ffffff', true);
        }
      }

      // Particles
      state.particles.forEach((p, i) => {
        p.x += p.dx;
        p.y += p.dy;
        p.life -= 0.02;
        if (p.life <= 0) state.particles.splice(i, 1);
      });

      // Debris (Broken pieces)
      state.debris.forEach((d, i) => {
        d.x += d.dx;
        d.y += d.dy;
        d.rotX += d.rotSpeedX;
        d.rotY += d.rotSpeedY;
        d.rotZ += d.rotSpeedZ;
        d.life -= 0.01;
        
        // Spawn trail particles - smaller and more subtle
        if (state.frame % 3 === 0 && d.life > 0.4) {
          state.particles.push({
            x: d.x,
            y: d.y,
            dx: (Math.random() - 0.5) * 0.5,
            dy: (Math.random() - 0.5) * 0.5,
            life: 0.3,
            color: d.color,
            size: 0.02 // Smaller particles
          });
        }

        if (d.life <= 0) state.debris.splice(i, 1);
      });

      // Score Popups
      for (let i = state.scorePopups.length - 1; i >= 0; i--) {
        const sp = state.scorePopups[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.life -= 0.02;
        if (sp.life <= 0) state.scorePopups.splice(i, 1);
      }
    };

    const createExplosion = (x: number, y: number, color: string, isBig = false) => {
      // Particles
      const pCount = isBig ? 40 : 20;
      for (let i = 0; i < pCount; i++) {
        gameState.current.particles.push({
          x,
          y,
          dx: (Math.random() - 0.5) * 14,
          dy: (Math.random() - 0.5) * 14,
          life: 0.7 + Math.random() * 0.5,
          color,
          size: (2.0 + Math.random() * 2.0) * gameState.current.trailSizeMultiplier
        });
      }
      
      // Debris (Broken pieces) - Rigorous mass conservation
      // Volume = Sum(size^3) should be proportional to original object volume
      const dCount = isBig ? 12 : 6;
      const totalVolumeScale = isBig ? 10 : 1; // Boss is larger
      const avgSize = Math.pow(totalVolumeScale / dCount, 1/3) * 0.3; // Even smaller
      
      for (let i = 0; i < dCount; i++) {
        // Randomize size while keeping average roughly consistent
        const sizeVariation = 0.6 + Math.random() * 0.8;
        const size = avgSize * sizeVariation;
        
        gameState.current.debris.push({
          x,
          y,
          dx: (Math.random() - 0.5) * 8,
          dy: (Math.random() - 0.5) * 8,
          dz: (Math.random() - 0.5) * 8,
          rotX: Math.random() * Math.PI * 2,
          rotY: Math.random() * Math.PI * 2,
          rotZ: Math.random() * Math.PI * 2,
          rotSpeedX: (Math.random() - 0.5) * 0.6,
          rotSpeedY: (Math.random() - 0.5) * 0.6,
          rotSpeedZ: (Math.random() - 0.5) * 0.6,
          life: 1.5 + Math.random() * 1.0,
          color,
          size: size
        });
      }
    };

    const draw = () => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;

      const { width, height } = dimensions;

      // Clear
      ctx.clearRect(0, 0, width, height);

      // Player
      const p = gameState.current.player;
      if (p.isExploding) {
        ctx.globalAlpha = Math.max(0, p.explosionTimer / 120);
      }
      // 3D Ship is rendered in Background3D component
      /*
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + p.height / 2);
      ctx.lineTo(p.x + p.width, p.y + p.height / 2);
      ctx.lineTo(p.x + p.width * 0.8, p.y);
      ctx.lineTo(p.x + p.width * 0.2, p.y + p.height * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(p.x + p.width * 0.3, p.y + p.height * 0.4, p.width * 0.4, p.height * 0.2);
      */

      // Shield
      if (p.shield > 0 && !p.isExploding) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.width * 0.8, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Enemies
      /*
      gameState.current.enemies.forEach(e => {
        const p = gameState.current.player;
        const angle = Math.atan2(
          p.y + p.height / 2 - (e.y + e.height / 2),
          p.x + p.width / 2 - (e.x + e.width / 2)
        );

        ctx.save();
        ctx.translate(e.x + e.width / 2, e.y + e.height / 2);
        ctx.rotate(angle);

        ctx.fillStyle = e.type === 'life' ? '#ffff00' : '#ff00ff';
        ctx.beginPath();
        // Nose at right (0 rad)
        ctx.moveTo(e.width / 2, 0);
        ctx.lineTo(-e.width / 2, -e.height / 2);
        ctx.lineTo(-e.width / 2 + e.width * 0.2, 0);
        ctx.lineTo(-e.width / 2, e.height / 2);
        ctx.closePath();
        ctx.fill();
        
        // Eye
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(e.width * 0.1, -2, 4, 4);
        
        ctx.restore();
      });
      */

      // Boss
      /*
      const boss = gameState.current.boss;
      if (boss.active || boss.isExploding) {
        ctx.save();
        if (boss.isExploding) ctx.globalAlpha = boss.explosionTimer / 180;
        
        // Body
        ctx.fillStyle = '#1a1a2e';
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(boss.x, boss.y + boss.height / 2);
        ctx.lineTo(boss.x + 40, boss.y);
        ctx.lineTo(boss.x + boss.width, boss.y + 20);
        ctx.lineTo(boss.x + boss.width, boss.y + boss.height - 20);
        ctx.lineTo(boss.x + 40, boss.y + boss.height);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Core
        const corePulse = Math.sin(gameState.current.frame * 0.1) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255, 0, 255, ${0.3 + corePulse * 0.7})`;
        ctx.beginPath();
        ctx.arc(boss.x + 60, boss.y + boss.height / 2, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff00ff';
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Laser Warning
        const laserCycle = (gameState.current.frame - boss.lastLaser) % 360;
        if (boss.active && laserCycle > 200 && laserCycle < 280) {
          let warningColor = 'rgba(255, 255, 0, 0.8)'; // Yellow
          let areaColor = 'rgba(255, 255, 0, 0.15)';
          
          if (laserCycle > 226 && laserCycle <= 253) {
            warningColor = 'rgba(255, 136, 0, 0.8)'; // Orange
            areaColor = 'rgba(255, 136, 0, 0.15)';
          } else if (laserCycle > 253) {
            warningColor = 'rgba(255, 0, 0, 0.8)'; // Red
            areaColor = 'rgba(255, 0, 0, 0.15)';
          }

          ctx.strokeStyle = warningColor;
          ctx.setLineDash([10, 5]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(boss.x, boss.y + boss.height / 2);
          ctx.lineTo(0, boss.y + boss.height / 2);
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Flickering area
          if (Math.floor(gameState.current.frame / 4) % 2 === 0) {
            ctx.fillStyle = areaColor;
            ctx.fillRect(0, boss.y + boss.height / 2 - 12, boss.x, 24);
          }

          // Charge up at core
          const chargeProgress = (laserCycle - 200) / 80;
          ctx.fillStyle = warningColor;
          ctx.beginPath();
          ctx.arc(boss.x + 60, boss.y + boss.height / 2, 10 + chargeProgress * 20, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 15;
          ctx.shadowColor = warningColor;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // Health Bar
        if (boss.active) {
          const barWidth = 400;
          const barHeight = 10;
          const barX = width / 2 - barWidth / 2;
          const barY = 60;
          
          ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
          ctx.fillRect(barX, barY, barWidth, barHeight);
          
          const healthPercent = boss.hp / boss.maxHp;
          ctx.fillStyle = '#ff0000';
          ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
          
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.strokeRect(barX, barY, barWidth, barHeight);
          
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('MOTHER SHIP CORE', width / 2, barY - 5);
        }
        
        ctx.restore();
      }
      */

      // Shield Items
      /*
      gameState.current.shieldItems.forEach((item: any) => {
        ctx.strokeStyle = item.type === 'shield' ? '#00ffff' : '#ff00ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(item.x + item.width / 2, item.y + item.height / 2, item.width / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = item.type === 'shield' ? 'rgba(0, 255, 255, 0.3)' : 'rgba(255, 0, 255, 0.3)';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.label || 'S', item.x + item.width / 2, item.y + item.height / 2 + 3);
      });
      */

      // Options
      /*
      for (let i = 0; i < p.options; i++) {
        const pos = p.history[Math.min((i + 1) * 20, p.history.length - 1)];
        if (pos) {
          ctx.fillStyle = 'rgba(255, 100, 0, 0.8)';
          ctx.beginPath();
          ctx.arc(pos.x + p.width / 2, pos.y + p.height / 2, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.stroke();
        }
      }
      */

      // Bullets
      /*
      gameState.current.bullets.forEach(b => {
        if (b.type === 'boss_laser') {
          ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
          ctx.fillRect(b.x, b.y, b.width, b.height);
          return;
        }

        if (b.owner === 'player') {
          ctx.fillStyle = b.color;
          ctx.fillRect(b.x, b.y, b.width, b.height);
          // Removed shadowBlur for performance
        } else {
          // Enemy bullet: Hot core + Glow
          const radius = b.width / 2;
          const gradient = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, radius * 1.5);
          gradient.addColorStop(0, '#ffffff'); // Hot core
          gradient.addColorStop(0.3, b.color); // Main color
          gradient.addColorStop(1, 'rgba(255, 0, 0, 0)'); // Fade out glow
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(b.x, b.y, radius * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

      });
      */

      // Particles - Optimized
      /*
      ctx.globalAlpha = 1;
      gameState.current.particles.forEach(p => {
        // Use rgba instead of globalAlpha for better performance
        ctx.fillStyle = p.color.replace(')', `, ${p.life})`).replace('rgb', 'rgba');
        ctx.fillRect(p.x, p.y, 2, 2);
      });
      */

      // Score Popups
      gameState.current.scorePopups.forEach(sp => {
        ctx.save();
        ctx.globalAlpha = Math.min(1, sp.life * 2);
        
        // Arcade style: flashing colors
        const flash = Math.floor(gameState.current.frame / 5) % 2 === 0;
        ctx.fillStyle = flash ? '#ffff00' : '#ff0000';
        ctx.font = 'bold 16px "Courier New", Courier, monospace';
        ctx.textAlign = 'center';
        
        // Shadow for better visibility
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#000';
        
        ctx.fillText(`+${sp.score}`, sp.x, sp.y);
        ctx.restore();
      });
    };

    animationId = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationId);
      document.documentElement.style.cursor = 'auto';
      document.body.style.cursor = 'auto';
    };
  }, [isPaused, gameOver, dimensions]);

  const updateHighScore = (finalScore: number) => {
    // This is now handled in real-time by the useEffect above
    // but we keep it as a final safeguard
    if (finalScore > hiScore) {
      localStorage.setItem('vic-viper-highscore', finalScore.toString());
      localStorage.setItem('vic-viper-highscore-name', playerName);
    }
  };

  const handleNameChange = (name: string) => {
    const newName = name.toUpperCase().slice(0, 10);
    setPlayerName(newName);
    localStorage.setItem('vic-viper-player-name', newName);
  };

  return (
    <div 
      ref={rootRef}
      className="h-screen w-screen bg-black text-white font-mono flex flex-col overflow-hidden cursor-none"
      onTouchStart={() => {
        if (isMobile) setShowJoystick(true);
      }}
    >
      {/* HUD TOP */}
      <div className={`flex-none w-full flex justify-between items-start z-10 bg-black/80 backdrop-blur-sm border-b border-white/5 ${isLandscape ? 'p-1' : 'p-4'}`}>
        <div className={`border-l-4 border-magenta pl-4 ${isLandscape ? 'hidden sm:block' : ''}`}>
          <h1 className={`${isLandscape ? 'text-xs' : 'text-lg md:text-xl'} font-bold tracking-widest text-white uppercase`}>Vic-Viper Command</h1>
          <p className="text-[8px] md:text-[10px] text-magenta/70">SECTOR 7-G // DEEP SPACE TELEMETRY</p>
        </div>
        
        <div className="flex gap-2 md:gap-8 items-center ml-auto">
          <div className="text-right border-l-2 border-magenta pl-4 hidden lg:block">
            <p className="text-[8px] md:text-[10px] text-magenta uppercase flex items-center gap-1 justify-end">
              <Trophy size={10} /> World Record ({globalHiScoreName})
            </p>
            <p className={`${isLandscape ? 'text-sm' : 'text-lg md:text-2xl'} font-bold text-white tracking-tighter`}>{globalHiScore.toString().padStart(8, '0')}</p>
          </div>
          <div className="text-right border-l-2 border-cyan pl-4 hidden sm:block">
            <p className="text-[8px] md:text-[10px] text-cyan/70 uppercase">Personal Best ({hiScoreName})</p>
            <p className={`${isLandscape ? 'text-sm' : 'text-lg md:text-2xl'} font-bold text-white tracking-tighter`}>{hiScore.toString().padStart(8, '0')}</p>
          </div>
          <div className="text-right">
            <p className="text-[8px] md:text-[10px] text-cyan/70 uppercase">Score</p>
            <p className={`${isLandscape ? 'text-sm' : 'text-lg md:text-2xl'} font-bold text-cyan tracking-tighter`}>{score.toString().padStart(8, '0')}</p>
          </div>
          <div className={`flex gap-1 ml-2 md:ml-4 ${isLandscape ? 'scale-75 origin-right' : ''}`}>
            {!user ? (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-3 py-1 bg-magenta/20 border border-magenta/40 rounded text-[10px] font-bold hover:bg-magenta/40 transition-colors"
              >
                <Trophy size={14} className="text-magenta" />
                LOGIN TO SAVE RECORD
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded">
                <UserIcon size={14} className="text-cyan" />
                <input 
                  type="text" 
                  value={playerName} 
                  onChange={(e) => handleNameChange(e.target.value)}
                  className={`bg-transparent border-none outline-none text-[10px] w-20 font-bold ${godMode ? 'text-yellow-400' : 'text-white'}`}
                  placeholder="NAME"
                />
              </div>
            )}
            <button onClick={() => setIsPaused(!isPaused)} className="p-1 md:p-2 hover:bg-white/10 rounded transition-colors">
              {isPaused ? <Play size={isLandscape ? 14 : 18} /> : <Pause size={isLandscape ? 14 : 18} />}
            </button>
            <button 
              onPointerDown={(e) => toggleFullscreen(e)} 
              className="p-1 md:p-2 hover:bg-white/10 rounded transition-colors"
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              <Maximize size={isLandscape ? 14 : 18} />
            </button>
            <button 
              onClick={() => setShowJoystick(!showJoystick)} 
              className={`p-1 md:p-2 rounded transition-colors ${showJoystick ? 'bg-cyan/20 text-cyan' : 'hover:bg-white/10'}`}
              title="Toggle Mobile Controls"
            >
              <Smartphone size={isLandscape ? 14 : 18} />
            </button>
            <button className="p-1 md:p-2 hover:bg-white/10 rounded transition-colors">
              <Settings size={isLandscape ? 14 : 18} />
            </button>
          </div>
        </div>
      </div>

      {/* GAME AREA */}
      <div ref={containerRef} className="flex-1 relative bg-transparent overflow-hidden">
        <Background3D 
          progressRef={gameProgressRef} 
          gameStateRef={gameState}
          isPaused={isPaused} 
          dimensions={dimensions}
        />
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          className="block cursor-none relative z-10"
        />
        
        {gameOver && (
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center z-50">
            <h2 className={`text-4xl md:text-6xl font-black mb-4 animate-pulse ${isVictory ? 'text-cyan' : 'text-magenta'}`}>
              {isVictory ? "MISSION ACCOMPLISHED" : "MISSION FAILED"}
            </h2>
            {isVictory && <p className="text-xl text-white mb-2 tracking-widest italic">CONGRATULATIONS PILOT!</p>}
            <p className="text-cyan mb-8">FINAL SCORE: {score}</p>
            <button 
              onClick={resetGame}
              className="px-8 py-3 border-2 border-cyan text-cyan hover:bg-cyan hover:text-black transition-all font-bold tracking-widest"
            >
              {isVictory ? "NEW MISSION" : "REDEPLOY"}
            </button>
          </div>
        )}

        {/* DEBUG OVERLAY */}
        {debugMode && debugInfo && (
          <div className="absolute top-20 left-4 bg-black/80 p-4 border border-cyan text-cyan font-mono text-[10px] z-50 pointer-events-none min-w-[240px]">
            <h3 className="text-white mb-2 underline font-bold uppercase tracking-wider">Deep Space Telemetry</h3>
            <p className="flex justify-between"><span>MISSION TIME:</span> <span>{(gameState.current.frame / 60).toFixed(1)}s / 180s</span></p>
            <p className="flex justify-between"><span>PROGRESS:</span> <span>{(debugInfo.progress * 100).toFixed(2)}%</span></p>
            
            <div className="mt-3 border-t border-cyan/30 pt-2">
              <p className="text-white text-[9px] mb-1 font-bold">VEHICLE SYSTEMS</p>
              <p className="flex justify-between"><span>SHIP SCALE:</span> <span className="text-white">{debugInfo.shipScale}</span></p>
              <p className="flex justify-between"><span>SHIP Y OFFSET:</span> <span className="text-white">{debugInfo.shipYOffset}</span></p>
              <p className="flex justify-between"><span>SHIP Z OFFSET:</span> <span className="text-white">{debugInfo.shipZOffset}</span></p>
              <p className="flex justify-between"><span>TRAIL SIZE (9/0):</span> <span className="text-white">{debugInfo.trailSizeMultiplier}x</span></p>
              <p className="flex justify-between"><span>CAMERA POS:</span> <span className="text-white">{debugInfo.camera?.pos}</span></p>
            </div>

            <div className="mt-3 border-t border-cyan/30 pt-2">
              <p className="flex justify-between"><span>FRAME ENGINE:</span> <span>{Math.floor(gameState.current.frame)}</span></p>
              <p className="flex justify-between"><span>TARGET X:</span> <span>{debugInfo.targetX?.toFixed(2)}</span></p>
              <p className="flex justify-between"><span>TOTAL DIST:</span> <span>{debugInfo.totalDistance?.toFixed(2)}</span></p>
              <p className="flex justify-between"><span>ASTEROIDS:</span> <span>{debugInfo.asteroids || 0}</span></p>
              <p className="flex justify-between"><span>STATUS:</span> <span className={isPaused ? "text-yellow-400" : "text-green-400"}>{isPaused ? "PAUSED" : "ACTIVE"}</span></p>
              <p className="flex justify-between"><span>GOD MODE:</span> <span className={godMode ? "text-yellow-400" : "text-white"}>{godMode ? "ON" : "OFF"}</span></p>
              <p className="flex justify-between"><span>BG OFFSET:</span> <span className="text-white">{debugInfo.constantOffset}</span></p>
              <p className="flex justify-between"><span>BG HEARTBEAT:</span> <span className="text-white">{debugInfo.frameCount || 0}</span></p>
              <p className="flex justify-between"><span>BG TIME:</span> <span className="text-white">{debugInfo.accumulatedTime || '0.00'}s</span></p>
            </div>
          </div>
        )}

        <AnimatePresence>
          {gamePhase === 'READY' && (
            <motion.div 
              key="ready"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-40"
            >
              <h2 className="text-6xl md:text-8xl font-black text-white italic tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">READY?</h2>
            </motion.div>
          )}
          {gamePhase === 'GO' && (
            <motion.div 
              key="go"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 2 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-40"
            >
              <h2 className="text-7xl md:text-9xl font-black text-cyan italic tracking-tighter drop-shadow-[0_0_30px_rgba(0,255,255,0.5)]">GO!</h2>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MOBILE JOYSTICK */}
        {showJoystick && (
          <div 
            className={`absolute ${isLandscape ? 'bottom-4 left-4 w-24 h-24' : 'bottom-12 left-12 w-32 h-32'} bg-white/10 rounded-full border-2 border-white/20 flex items-center justify-center z-50 touch-none`}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              const rect = e.currentTarget.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const update = (tx: number, ty: number) => {
                const dx = tx - centerX;
                const dy = ty - centerY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const maxDist = rect.width / 2;
                const normalizedDist = Math.min(dist, maxDist) / maxDist;
                const angle = Math.atan2(dy, dx);
                const jx = Math.cos(angle) * normalizedDist;
                const jy = Math.sin(angle) * normalizedDist;
                gameState.current.joystick = { x: jx, y: jy, active: true };
                setJoystickPos({ x: jx * (rect.width / 3), y: jy * (rect.width / 3) });
              };
              update(touch.clientX, touch.clientY);
            }}
            onTouchMove={(e) => {
              const touch = e.touches[0];
              const rect = e.currentTarget.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const dx = touch.clientX - centerX;
              const dy = touch.clientY - centerY;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const maxDist = rect.width / 2;
              const normalizedDist = Math.min(dist, maxDist) / maxDist;
              const angle = Math.atan2(dy, dx);
              const jx = Math.cos(angle) * normalizedDist;
              const jy = Math.sin(angle) * normalizedDist;
              gameState.current.joystick = { x: jx, y: jy, active: true };
              setJoystickPos({ x: jx * (rect.width / 3), y: jy * (rect.width / 3) });
            }}
            onTouchEnd={() => {
              gameState.current.joystick = { x: 0, y: 0, active: false };
              setJoystickPos({ x: 0, y: 0 });
            }}
          >
            <div 
              className={`${isLandscape ? 'w-8 h-8' : 'w-12 h-12'} bg-cyan/50 rounded-full border-2 border-cyan shadow-[0_0_15px_rgba(0,255,255,0.5)] transition-transform duration-75`}
              style={{
                transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)`
              }}
            />
          </div>
        )}

        {/* PROGRESS BAR */}
        <div className="absolute bottom-0 left-0 w-full h-[2px] bg-white/30 z-30">
          <div 
            ref={progressBarRef}
            className="h-[4px] bg-yellow-400 absolute top-[-1px] transition-all duration-100 ease-linear" 
            style={{ width: '0%' }} 
          />
        </div>

        {/* SIDE INFO */}
        <div className="absolute left-4 top-4 flex flex-col gap-4 pointer-events-none z-20">
          <div className="bg-black/60 border border-cyan/30 p-3 backdrop-blur-md">
            <p className="text-[8px] text-cyan uppercase mb-1">Shield Intensity</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={`h-3 w-6 border ${i <= (gameState.current.player.shield + 1) ? 'bg-white border-white' : 'border-white/20'}`}></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* HUD BOTTOM: POWER-UP BAR */}
      <div className={`flex-none w-full bg-black/90 border-t border-white/10 z-10 ${isLandscape ? 'p-1' : 'p-4'}`}>
        <div className="max-w-[1000px] mx-auto flex flex-col items-center gap-1">
          <div className={`flex items-center justify-between w-full ${isLandscape ? 'hidden' : 'flex'}`}>
            <div className="flex items-center gap-4">
              <div className="flex gap-1 bg-white/5 p-1.5 border border-white/10">
                <div className="w-3 h-3 bg-cyan rounded-full shadow-[0_0_10px_#00ffff]"></div>
                <div className="flex gap-0.5">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-3 h-3 bg-white/20 rotate-45"></div>
                  ))}
                </div>
              </div>
              <p className="text-[8px] md:text-[10px] text-cyan font-bold">VIPER-01 STATUS: <span className="text-white">ACTIVE</span></p>
            </div>
            <p className="text-[8px] text-white/30 uppercase tracking-[0.2em] hidden sm:block">Collect Power-Ups to Upgrade Systems</p>
          </div>

          <div className={`flex w-full bg-black border border-white/20 overflow-hidden ${isLandscape ? 'h-6' : 'h-10'}`}>
            {POWERUP_STEPS.map((step, i) => {
              let isActive = false;
              if (step === 'SPEED') isActive = playerStats.speed > 0;
              if (step === 'MISSILE') isActive = playerStats.hasMissile;
              if (step === 'DOUBLE') isActive = playerStats.hasDouble;
              if (step === 'LASER') isActive = playerStats.hasLaser;
              if (step === 'OPTION') isActive = playerStats.options > 0;

              return (
                <div
                  key={step}
                  className={`flex-1 flex items-center justify-center text-[8px] md:text-[10px] font-bold tracking-tighter transition-all duration-300 border-r border-white/10
                    ${isActive ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'text-white/20'}
                  `}
                >
                  {step}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }
        .border-magenta { border-color: #ff00ff; }
        .text-magenta { color: #ff00ff; }
        .border-cyan { border-color: #00ffff; }
        .text-cyan { color: #00ffff; }
        
        /* Global cursor hide with exceptions for UI interaction */
        html, body, * { cursor: none !important; }
        input, button, [role="button"], a { cursor: pointer !important; }
        input[type="text"], textarea { cursor: text !important; }
      `}</style>
    </div>
  );
}

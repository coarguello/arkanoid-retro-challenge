import React, { useRef, useEffect, useCallback, useState } from 'react';
import { GameState, Brick, Ball, Projectile, Collectible, Enemy, EnemyProjectile, Boss, Explosion, Particle, TrailPart, ShipConfig, UserInventory } from '../types';
import { LEVELS, BRICK_MAP } from '../levels';
import { playMenuMusic, playGameMusic, playGameOverMusic, stopMusic, getMute } from '../audioUtils';

interface GameCanvasProps {
  onGameOver: () => void;
  onScoreUpdate: (points: number) => void;
  onLivesUpdate: (lives: number) => void;
  onBossDefeated: () => void;
  isPaused: boolean;
  initialLives: number;
  shipConfig?: ShipConfig;
  inventory?: UserInventory;
  useVirtualControls?: boolean;
}
// Global audio context singleton to prevent browser memory/resource limits from freezing the game
let sharedAudioCtx: AudioContext | null = null;

const playSound = (type: 'paddle' | 'brick' | 'tnt' | 'collect_good' | 'collect_bad' | 'launch' | 'gameover' | 'revert' | 'life_lost' | 'mega_tnt') => {
  if (getMute()) return;
  try {
    if (!sharedAudioCtx) {
      sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = sharedAudioCtx;

    // Resume context if suspended (browser auto-play policy)
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (type) {
      case 'paddle':
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(); osc.stop(now + 0.1);
        break;
      case 'brick':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(); osc.stop(now + 0.05);
        break;
      case 'life_lost':
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.5);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
        osc.start(); osc.stop(now + 0.5);
        break;
      case 'launch':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(); osc.stop(now + 0.1);
        break;
      case 'tnt':
      case 'mega_tnt':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(type === 'mega_tnt' ? 60 : 80, now);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + (type === 'mega_tnt' ? 0.8 : 0.4));
        osc.start(); osc.stop(now + (type === 'mega_tnt' ? 0.8 : 0.4));
        break;
      default:
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(); osc.stop(now + 0.1);
        break;
    }
  } catch (_) { /* Ignore audio errors on mobile */ }
};

const GameCanvas: React.FC<GameCanvasProps> = ({
  onGameOver,
  onScoreUpdate,
  onLivesUpdate,
  onBossDefeated,
  isPaused,
  initialLives,
  shipConfig = { color: '#ef4444', shape: 'classic' },
  inventory,
  useVirtualControls = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number | null>(null);
  const livesRef = useRef(initialLives);

  const onGameOverRef = useRef(onGameOver);
  const onScoreUpdateRef = useRef(onScoreUpdate);
  const onLivesUpdateRef = useRef(onLivesUpdate);
  const onBossDefeatedRef = useRef(onBossDefeated);

  useEffect(() => {
    onGameOverRef.current = onGameOver;
    onScoreUpdateRef.current = onScoreUpdate;
    onLivesUpdateRef.current = onLivesUpdate;
    onBossDefeatedRef.current = onBossDefeated;
  }, [onGameOver, onScoreUpdate, onLivesUpdate, onBossDefeated]);

  // --- Game dimensions (logical, fixed) ---
  const GAME_W = 600;
  const GAME_H = 400;

  const paddleRef = useRef({ x: 250, y: 370, width: 100, height: 14, flash: 0, targetWidth: 100 });
  const paddleEffectTimeoutRef = useRef<number | null>(null);
  const ballsRef = useRef<(Ball & { trail: TrailPart[] })[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const collectiblesRef = useRef<Collectible[]>([]);
  const bricksRef = useRef<Brick[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const bossRef = useRef<Boss | null>(null);
  const enemyProjectilesRef = useRef<EnemyProjectile[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<{ x: number, y: number, size: number, speed: number, alpha: number }[]>([]);
  const barrierRef = useRef<boolean>(false);
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  // Separate touch state to avoid conflicts with keyboard
  const touchState = useRef({ left: false, right: false, action: false });
  const shakeRef = useRef({ intensity: 0, duration: 0 });
  const ammoRef = useRef(0);
  const currentSpeedRef = useRef(5.5);
  const levelRef = useRef(1); // Track current level
  const comboRef = useRef(0); // Multiplier combo for continuous brick hits
  const feedbackTextsRef = useRef<{ text: string, x: number, y: number, life: number, color: string }[]>([]);
  const transitionTimerRef = useRef(0);

  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [joyPos, setJoyPos] = useState({ x: 0, y: 0 });

  const fireProjectile = useCallback(() => {
    if (ammoRef.current > 0) {
      projectilesRef.current.push({ x: paddleRef.current.x + 10, y: paddleRef.current.y, dy: -8, active: true });
      projectilesRef.current.push({ x: paddleRef.current.x + paddleRef.current.width - 10, y: paddleRef.current.y, dy: -8, active: true });
      ammoRef.current--;
      playSound('launch');
    }
  }, []);
  const paddleVelocityRef = useRef(0);
  const inventoryRef = useRef(inventory); // How many lines have dropped so far

  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

  const EFFECT_DURATION = 10000;

  const normalizeBallVelocity = (ball: Ball) => {
    const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
    if (currentSpeed > 0) {
      ball.dx = (ball.dx / currentSpeed) * currentSpeedRef.current;
      ball.dy = (ball.dy / currentSpeed) * currentSpeedRef.current;
    }
  };

  const addFeedbackText = (text: string, x: number, y: number, color: string = 'white') => {
    feedbackTextsRef.current.push({ text, x, y, life: 60, color });
  };

  const createParticles = (x: number, y: number, color: string, count: number = 8, asDebris: boolean = false) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x, y,
        vx: asDebris ? (Math.random() - 0.5) * 8 : (Math.random() - 0.5) * 6,
        vy: asDebris ? (Math.random() - 0.5) * 8 : (Math.random() - 0.5) * 6,
        size: asDebris ? Math.random() * 5 + 3 : Math.random() * 2 + 1,
        color, life: 1.0,
        isDebris: asDebris,
        rotation: asDebris ? Math.random() * Math.PI * 2 : 0,
        vRot: asDebris ? (Math.random() - 0.5) * 0.4 : 0
      });
    }
  };

  const clearPaddleEffect = () => {
    if (paddleEffectTimeoutRef.current) {
      clearTimeout(paddleEffectTimeoutRef.current);
      paddleEffectTimeoutRef.current = null;
    }
  };

  const spawnCollectible = (x: number, y: number) => {
    const type = 'random';
    collectiblesRef.current.push({ x, y, width: 14, height: 14, active: true, type });
  };

  const handleExplosion = useCallback((brick: Brick, isMega: boolean = false) => {
    const radius = isMega ? 200 : 100;
    const score = isMega ? 1000 : 300;

    playSound(isMega ? 'mega_tnt' : 'tnt');
    shakeRef.current = { intensity: isMega ? 20 : 10, duration: isMega ? 30 : 15 };

    explosionsRef.current.push({
      x: brick.x + brick.width / 2,
      y: brick.y + brick.height / 2,
      radius: 0, maxRadius: radius, alpha: 1.0
    });

    createParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, isMega ? '#ea580c' : '#f97316', isMega ? 50 : 20);
    onScoreUpdateRef.current(score);
    addFeedbackText(`+ ${score} `, brick.x + brick.width / 2, brick.y, isMega ? '#fbbf24' : '#fcd34d');

    const pendingBonuses: { x: number, y: number }[] = [];

    bricksRef.current.forEach(other => {
      // Don't blow up already dead bricks, and don't blow up the brick that originated the explosion 
      if (other.active && other !== brick) {
        const dist = Math.sqrt(
          Math.pow(other.x + other.width / 2 - (brick.x + brick.width / 2), 2) +
          Math.pow(other.y + other.height / 2 - (brick.y + brick.height / 2), 2)
        );
        if (dist < radius) {
          if (other.type === 'BONUS') {
            // Queue bonus for after the loop to prevent recursive explosion loops
            other.active = false;
            pendingBonuses.push({ x: other.x + other.width / 2, y: other.y + other.height / 2 });
          } else if (other.type === 'TNT' || other.type === 'LARGE_TNT') {
            // If TNT is caught in explosion and not already triggered, trigger it immediately
            if (other.triggerTimer === undefined) {
              other.triggerTimer = 5; // Fast chain reaction
            }
          } else if (other.type === 'SILVER') {
            if (other.hp !== undefined) {
              other.hp = 0; // Destroy silver bricks instantly
              other.active = false;
              onScoreUpdateRef.current(150);
              addFeedbackText('+150', other.x + other.width / 2, other.y, '#9ca3af');
              createParticles(other.x + other.width / 2, other.y + other.height / 2, '#9ca3af', 6);
            }
          } else if (other.type !== 'GOLD') { // Gold bricks are indestructible
            // Normal blocks just die
            other.active = false;
            onScoreUpdateRef.current(50);
            addFeedbackText('+50', other.x + other.width / 2, other.y, '#9ca3af');
            createParticles(other.x + other.width / 2, other.y + other.height / 2, '#ef4444', 6);
            if (Math.random() < 0.2) spawnCollectible(other.x + other.width / 2, other.y + other.height / 2);
          }
        }
      }
    });

    // Execute pending bonuses safely outside the explosion loop
    pendingBonuses.forEach(b => handleBonusEffect(b.x, b.y));

  }, []);

  const handleBonusEffect = (x: number, y: number) => {
    const rand = Math.random();

    if (rand < 0.2) {
      if (ballsRef.current.length > 0) {
        const b = ballsRef.current[0];
        for (let i = 0; i < 2; i++) {
          const newBall = {
            ...b,
            dx: (Math.random() - 0.5) * 6,
            dy: -Math.abs(b.dy),
            trail: []
          };
          normalizeBallVelocity(newBall);
          ballsRef.current.push(newBall);
        }
        playSound('launch');
        addFeedbackText("¡TRIPLE BOLA!", x, y, "#a855f7");
      }
    } else if (rand < 0.3) {
      ballsRef.current.forEach(b => b.isFireball = true);
      playSound('launch');
      addFeedbackText("¡BOLA DE FUEGO!", x, y, "#ef4444");
      setTimeout(() => {
        ballsRef.current.forEach(b => b.isFireball = false);
      }, EFFECT_DURATION);
    } else if (rand < 0.4) {
      barrierRef.current = true;
      playSound('launch');
      addFeedbackText("¡ESCUDO!", x, y, "#06b6d4");
    } else if (rand < 0.5) {
      ammoRef.current = Math.min(ammoRef.current + 8, 15);
      addFeedbackText("¡LÁSER!", x, y, "#fbbf24");
    } else if (rand < 0.7) {
      const activeNormalBricks = bricksRef.current.filter(b => b.active && b.type === 'NORMAL');
      if (activeNormalBricks.length > 0) {
        const target = activeNormalBricks[Math.floor(Math.random() * activeNormalBricks.length)];
        target.type = 'LARGE_TNT';
        addFeedbackText("¡MEGA TNT!", target.x + target.width / 2, target.y, "#f97316");
        playSound('launch');
      }
    } else if (rand < 0.85) {
      currentSpeedRef.current = 8.5;
      addFeedbackText("¡MÁS RÁPIDO!", x, y, "#ef4444");
      ballsRef.current.forEach(normalizeBallVelocity);
      setTimeout(() => {
        currentSpeedRef.current = 5.5;
        ballsRef.current.forEach(normalizeBallVelocity);
      }, EFFECT_DURATION);
    } else {
      currentSpeedRef.current = 3.5;
      addFeedbackText("¡MÁS LENTO!", x, y, "#4ade80");
      ballsRef.current.forEach(normalizeBallVelocity);
      setTimeout(() => {
        currentSpeedRef.current = 5.5;
        ballsRef.current.forEach(normalizeBallVelocity);
      }, EFFECT_DURATION);
    }
  };

  const initBricks = useCallback(() => {
    const newBricks: Brick[] = [];
    const newEnemies: Enemy[] = [];
    bossRef.current = null;

    const levelIdx = (levelRef.current - 1) % LEVELS.length;
    const levelMap = LEVELS[levelIdx];

    if (levelMap.length === 1 && levelMap[0] === "BOSS") {
      paddleRef.current.width = 50;
      paddleRef.current.targetWidth = 50;

      const isTrueBoss = levelIdx >= 14;
      const baseHp = isTrueBoss ? 20 + ((levelIdx - 14) * 2) : 15; // Scales after level 15 up to 50 HP for level 30

      bossRef.current = {
        x: GAME_W / 2 - 40,
        y: -100, // Starts off-screen for intro animation
        width: 80,
        height: 60,
        dx: 2,
        dy: 0,
        hp: baseHp,
        maxHp: baseHp,
        active: true,
        shootTimer: 180, // Wait before first shot
        phase: 1,
        invulnerableTimer: 0,
        introY: 40 // Target Y coordinate for intro completion
      };
    } else {
      paddleRef.current.width = 100;
      paddleRef.current.targetWidth = 100;
      const rows = levelMap.length;
      const cols = levelMap[0].length;
      const bW = 48; const bH = 22; const pad = 5;
      const offsetLeft = (GAME_W - (cols * (bW + pad))) / 2;
      const offsetTop = 40;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const char = levelMap[r][c];
          if (BRICK_MAP[char]) {
            const type = BRICK_MAP[char];
            newBricks.push({
              x: c * (bW + pad) + offsetLeft,
              y: r * (bH + pad) + offsetTop,
              width: bW, height: bH,
              active: true, type: type, row: r, col: c,
              hp: type === 'SILVER' ? 3 : undefined
            });
          }
        }
      }

      // Spawn Enemies occasionally on upper part
      if (levelRef.current > 1) {
        const numEnemies = Math.min(Math.floor(levelRef.current / 2), cols);
        const availableCols = Array.from({ length: cols }, (_, i) => i);
        for (let i = 0; i < numEnemies; i++) {
          if (availableCols.length === 0) break;
          const idx = Math.floor(Math.random() * availableCols.length);
          const col = availableCols.splice(idx, 1)[0];
          newEnemies.push({
            x: col * (bW + pad) + offsetLeft + (bW - 30) / 2,
            y: 0 * (bH + pad) + offsetTop, // Top row area
            width: 30, height: 22,
            dx: (Math.random() > 0.5 ? 1.5 : -1.5) * (1 + levelRef.current * 0.1),
            active: true,
            shootTimer: 60 + Math.random() * 60
          });
        }
      }
    }

    bricksRef.current = newBricks;
    enemiesRef.current = newEnemies;
  }, []);
  const resetBall = () => {
    ballsRef.current = [{ x: 300, y: 350, dx: 0, dy: 0, radius: 8, launched: false, trail: [] }];
  };

  const resetState = useCallback(() => {
    clearPaddleEffect();
    currentSpeedRef.current = 5.5;
    levelRef.current = 1; // Reset level on game over
    resetBall();
    projectilesRef.current = [];
    collectiblesRef.current = [];
    particlesRef.current = [];
    enemiesRef.current = [];
    bossRef.current = null;
    barrierRef.current = false;
    enemyProjectilesRef.current = [];
    ammoRef.current = 0;
    feedbackTextsRef.current = [];
    paddleRef.current = { x: 250, y: 370, width: 100, height: 14, flash: 0, targetWidth: 100 };

    initBricks();
  }, [initBricks]);

  useEffect(() => {
    // Initialize scrolling stars
    const stars = [];
    for (let i = 0; i < 60; i++) {
      stars.push({
        x: Math.random() * GAME_W,
        y: Math.random() * GAME_H,
        size: Math.random() * 1.5 + 0.5,
        speed: Math.random() * 0.5 + 0.1,
        alpha: Math.random() * 0.5 + 0.1
      });
    }
    starsRef.current = stars;

    resetState();
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysPressed.current[k] = true;
      if (k === 'w' || e.key === 'ArrowUp' || k === ' ') {
        fireProjectile();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => keysPressed.current[e.key.toLowerCase()] = false;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearPaddleEffect();
    };
  }, [resetState]);

  // --- Touch Device Detection and Virtual Controls Logic ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouch = () => {
      setIsTouchDevice(true);
      window.removeEventListener('touchstart', onTouch);
    };
    window.addEventListener('touchstart', onTouch, { once: true });

    // Invisible Zone Touch Handlers (Fallback Mode)
    const getZones = (touches: TouchList) => {
      const rect = canvas.getBoundingClientRect();
      let left = false, right = false, action = false;

      Array.from(touches).forEach(touch => {
        const relX = (touch.clientX - rect.left) / rect.width;
        if (relX < 0.33) left = true;
        else if (relX > 0.67) right = true;
        else action = true;
      });
      return { left, right, action };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (useVirtualControls) return; // Let the custom UI handle it
      e.preventDefault();
      const zones = getZones(e.touches);
      touchState.current = zones;

      if (zones.action) fireProjectile();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (useVirtualControls) return;
      e.preventDefault();
      touchState.current = getZones(e.touches);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (useVirtualControls) return;
      e.preventDefault();
      touchState.current = getZones(e.touches);
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

    return () => {
      window.removeEventListener('touchstart', onTouch);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [useVirtualControls, fireProjectile]);

  const handleJoy = (e: React.TouchEvent<HTMLDivElement>, active: boolean) => {
    // If we're ending the touch or there are no touches, reset joystick
    if (!active || e.touches.length === 0) {
      setJoyPos({ x: 0, y: 0 });
      touchState.current.left = false;
      touchState.current.right = false;
      return;
    }

    // We must find the specific touch that is hitting the joystick container.
    // e.touches contains ALL current touches on the screen.
    const rect = e.currentTarget.getBoundingClientRect();

    // Find the touch that falls inside this element's bounding box
    let activeTouch: React.Touch | undefined = undefined;
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      if (
        t.clientX >= rect.left && t.clientX <= rect.right &&
        t.clientY >= rect.top && t.clientY <= rect.bottom
      ) {
        activeTouch = t;
        break;
      }
    }

    // Fallback just in case (e.g. they dragged slightly outside but still active)
    if (!activeTouch) {
      activeTouch = e.touches[0];
    }

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = activeTouch.clientX - centerX;
    const dy = activeTouch.clientY - centerY;

    const maxR = rect.width / 2 - 32;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxR) {
      setJoyPos({ x: (dx / dist) * maxR, y: (dy / dist) * maxR });
    } else {
      setJoyPos({ x: dx, y: dy });
    }

    // Set movement direction based on dx relative to the center
    const deadzone = 10;
    if (dx < -deadzone) {
      touchState.current.left = true;
      touchState.current.right = false;
    } else if (dx > deadzone) {
      touchState.current.right = true;
      touchState.current.left = false;
    } else {
      touchState.current.left = false;
      touchState.current.right = false;
    }
  };

  const update = () => {
    if (isPaused) return;

    if (Math.abs(paddleRef.current.width - paddleRef.current.targetWidth) > 0.5) {
      const oldW = paddleRef.current.width;
      paddleRef.current.width += (paddleRef.current.targetWidth - oldW) * 0.1;
      paddleRef.current.x -= (paddleRef.current.width - oldW) / 2;
    }

    if (shakeRef.current.duration > 0) shakeRef.current.duration--;
    if (paddleRef.current.flash > 0) paddleRef.current.flash -= 0.05;

    particlesRef.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    feedbackTextsRef.current.forEach(ft => { ft.life--; ft.y -= 0.8; });
    feedbackTextsRef.current = feedbackTextsRef.current.filter(ft => ft.life > 0);
    explosionsRef.current.forEach(exp => { exp.radius += 8; exp.alpha -= 0.04; });
    explosionsRef.current = explosionsRef.current.filter(exp => exp.alpha > 0);

    // Update background stars
    starsRef.current.forEach(star => {
      star.y += star.speed + currentSpeedRef.current * 0.1;
      if (star.y > GAME_H) {
        star.y = 0;
        star.x = Math.random() * GAME_W;
      }
    });

    const left = keysPressed.current['a'] || keysPressed.current['arrowleft'] || touchState.current.left;
    const right = keysPressed.current['d'] || keysPressed.current['arrowright'] || touchState.current.right;
    const launch = keysPressed.current[' '] || keysPressed.current['w'] || keysPressed.current['arrowup'] || touchState.current.action;

    if (left && paddleRef.current.x > 5) paddleRef.current.x -= 8;
    if (right && paddleRef.current.x + paddleRef.current.width < GAME_W - 5) paddleRef.current.x += 8;

    collectiblesRef.current.forEach(c => {
      c.y += 2.5;
      if (c.active && c.y + c.height >= paddleRef.current.y && c.y <= paddleRef.current.y + paddleRef.current.height &&
        c.x + c.width >= paddleRef.current.x && c.x <= paddleRef.current.x + paddleRef.current.width) {
        c.active = false;
        clearPaddleEffect();
        if (Math.random() < 0.5) {
          paddleRef.current.targetWidth = 60;
          addFeedbackText("¡CASTIGO!", paddleRef.current.x + paddleRef.current.width / 2, paddleRef.current.y - 15, "#ef4444");
        } else {
          paddleRef.current.targetWidth = 160;
          addFeedbackText("¡BENDICIÓN!", paddleRef.current.x + paddleRef.current.width / 2, paddleRef.current.y - 15, "#4ade80");
        }
        paddleEffectTimeoutRef.current = window.setTimeout(() => {
          paddleRef.current.targetWidth = 100;
          addFeedbackText("Normal", paddleRef.current.x + paddleRef.current.width / 2, paddleRef.current.y - 15, "#3b82f6");
          playSound('revert' as any);
        }, EFFECT_DURATION);
      }
    });
    collectiblesRef.current = collectiblesRef.current.filter(c => c.active && c.y < GAME_H);

    projectilesRef.current.forEach(p => {
      p.y += p.dy;
      bricksRef.current.forEach(b => {
        if (b.active && p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height) {
          p.active = false;

          if (b.type === 'TNT' || b.type === 'LARGE_TNT') {
            if (b.triggerTimer === undefined) {
              b.triggerTimer = b.type === 'LARGE_TNT' ? 40 : 20; // Start tremble timer
              playSound('paddle'); // tick sound
            }
          } else if (b.type === 'GOLD') {
            // Indestructible
            playSound('paddle'); // Metallic clink
            createParticles(b.x + b.width / 2, b.y + b.height, '#fbbf24', 5);
          } else if (b.type === 'SILVER') {
            if (b.hp !== undefined) {
              b.hp--;
              playSound('brick');
              createParticles(b.x + b.width / 2, b.y + b.height, '#9ca3af', 5, true);
              if (b.hp <= 0) {
                b.active = false;
                onScoreUpdateRef.current(150);
                addFeedbackText('+150', b.x + b.width / 2, b.y, '#9ca3af');
              }
            }
          } else {
            b.active = false;
            onScoreUpdateRef.current(100);
            addFeedbackText('+100', b.x + b.width / 2, b.y, '#60a5fa');

            let debrisColor = '#ef4444';
            if (b.type === 'BONUS') debrisColor = '#3b82f6';

            createParticles(b.x + b.width / 2, b.y + b.height / 2, debrisColor, 10, true);
            playSound('brick');
            if (b.type === 'BONUS') handleBonusEffect(b.x + b.width / 2, b.y + b.height / 2);
            else if (Math.random() < 0.2) spawnCollectible(b.x + b.width / 2, b.y + b.height / 2);
          }
        }
      });

      // Player projectile collision with enemies
      enemiesRef.current.forEach(enemy => {
        if (enemy.active && p.active && p.x > enemy.x && p.x < enemy.x + enemy.width && p.y > enemy.y && p.y < enemy.y + enemy.height) {
          p.active = false;
          enemy.active = false;
          onScoreUpdateRef.current(50);
          addFeedbackText('+50', enemy.x + enemy.width / 2, enemy.y, '#f59e0b');
          createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#f59e0b', 10, true); // Orange sparks
          playSound('brick');
        }
      });
    });
    projectilesRef.current = projectilesRef.current.filter(p => p.active && p.y > 0);

    // --- Enemy Logic ---
    enemiesRef.current.forEach(enemy => {
      // Movement
      enemy.x += enemy.dx;
      
      let collidedWithWall = false;
      if (enemy.x <= 0) {
        enemy.x = 0;
        collidedWithWall = true;
      } else if (enemy.x + enemy.width >= GAME_W) {
        enemy.x = GAME_W - enemy.width;
        collidedWithWall = true;
      } else {
        // Prevent passing through active bricks
        for (const b of bricksRef.current) {
          if (b.active && enemy.x < b.x + b.width && enemy.x + enemy.width > b.x && enemy.y < b.y + b.height && enemy.y + enemy.height > b.y) {
            enemy.x -= enemy.dx; // Revert movement
            collidedWithWall = true;
            break;
          }
        }
      }

      if (collidedWithWall) {
        enemy.dx *= -1;
      }

      // Check if paddle is roughly below the enemy
      const enemyCenter = enemy.x + enemy.width / 2;
      const paddleCenter = paddleRef.current.x + paddleRef.current.width / 2;
      const isPaddleAligned = Math.abs(enemyCenter - paddleCenter) < (paddleRef.current.width / 2 + 40);

      // Check if there are active bricks directly below the enemy
      const hasBrickCover = bricksRef.current.some(b =>
        b.active &&
        b.x < enemy.x + enemy.width &&
        b.x + b.width > enemy.x &&
        b.y > enemy.y
      );

      // Only prepare to shoot if paddle is visible and no bricks block the way
      if (isPaddleAligned && !hasBrickCover) {
        enemy.shootTimer--;

        if (enemy.shootTimer <= 0) {
          enemyProjectilesRef.current.push({
            x: enemy.x + enemy.width / 2 - 4,
            y: enemy.y + enemy.height,
            width: 8, height: 16,
            dy: 4, active: true
          });
          enemy.shootTimer = 30 + Math.random() * 30; // Moderate fire rate
          playSound('launch');
        }
      } else {
        // When not aligned, keep timer decent so their first shot isn't totally instant
        enemy.shootTimer = 30;
      }
    });

    enemyProjectilesRef.current.forEach(ep => {
      ep.y += ep.dy;

      // Check collision with bricks (they act as shields)
      let blocked = false;
      bricksRef.current.forEach(b => {
        if (!blocked && b.active && ep.x < b.x + b.width && ep.x + ep.width > b.x && ep.y < b.y + b.height && ep.y + ep.height > b.y) {
          ep.active = false;
          blocked = true;
          createParticles(ep.x + ep.width / 2, ep.y + ep.height, '#ef4444', 5);
        }
      });

      // Check collision with paddle
      if (!blocked && ep.y + ep.height >= paddleRef.current.y && ep.y <= paddleRef.current.y + paddleRef.current.height &&
        ep.x + ep.width >= paddleRef.current.x && ep.x <= paddleRef.current.x + paddleRef.current.width) {
        ep.active = false;

        // Take a life!
        livesRef.current--;
        onLivesUpdateRef.current(livesRef.current);
        playSound('life_lost');
        paddleRef.current.flash = 1.0;
        shakeRef.current = { intensity: 15, duration: 20 };

        if (livesRef.current > 0) {
          resetBall();
        } else {
          onGameOverRef.current();
        }
      }
    });

    enemiesRef.current = enemiesRef.current.filter(e => e.active);
    enemyProjectilesRef.current = enemyProjectilesRef.current.filter(ep => ep.active && ep.y < GAME_H);
    // --- End Enemy Logic ---

    // --- Boss Logic ---
    if (bossRef.current && bossRef.current.active) {
      const boss = bossRef.current;

      if (boss.explodingTimer !== undefined && boss.explodingTimer > 0) {
        // Dramatic death sequence
        boss.explodingTimer--;

        // Random chain explosions over its body
        if (boss.explodingTimer % 15 === 0) {
          const ex = boss.x + Math.random() * boss.width;
          const ey = boss.y + Math.random() * boss.height;
          createParticles(ex, ey, '#f97316', 20);
          playSound('tnt');
        }

        if (boss.explodingTimer <= 0) {
          boss.active = false; // Finally destroy it
          onScoreUpdateRef.current(5000);
          addFeedbackText('¡JEFE DESTRUIDO!', boss.x + boss.width / 2, boss.y, '#facc15');
          handleExplosion({ x: boss.x - 20, y: boss.y - 20, width: boss.width + 40, height: boss.height + 40, active: false, type: 'NORMAL' }, true); // Mega explosion
          onBossDefeatedRef.current();
        }
      } else {
        // Normal Boss Execution (only happens if not dying)
        if (boss.invulnerableTimer > 0) boss.invulnerableTimer--;

        if (boss.introY !== undefined) {
          // Dramatic Intro animation
          boss.y += 1; // Slow descent
          if (boss.y >= boss.introY) {
            boss.y = boss.introY;
            boss.introY = undefined; // Finished intro, start fighting
          }
        } else {
          // Normal movement
          boss.x += boss.dx;
          if (boss.x <= 0 || boss.x + boss.width >= GAME_W) {
            boss.dx *= -1;
          }
          // Boss shooting logic with paddle tracking
          const bossCenter = boss.x + boss.width / 2;
          const paddleCenter = paddleRef.current.x + paddleRef.current.width / 2;
          const isPaddleAligned = Math.abs(bossCenter - paddleCenter) < (paddleRef.current.width / 2 + 80);

          boss.shootTimer--;
          if (boss.shootTimer <= 0) {
            // Multi-shot possibility for boss
            enemyProjectilesRef.current.push({
              x: boss.x + boss.width / 2 - 4,
              y: boss.y + boss.height,
              width: 8, height: 16,
              dy: 5, active: true
            });

            if (isPaddleAligned) {
              boss.shootTimer = 10 + Math.random() * 10; // Extreme rapid fire when aligned
            } else {
              boss.shootTimer = 40 + Math.random() * 30; // Casual fire when not aligned
            }
            playSound('launch');
          }
        }
      }
    }
    // --- End Boss Logic ---

    ballsRef.current.forEach(ball => {
      if (!ball.launched) {
        ball.x = paddleRef.current.x + paddleRef.current.width / 2;
        ball.y = paddleRef.current.y - ball.radius - 2;
        if (launch) {
          ball.launched = true;
          ball.dx = (Math.random() - 0.5) * 4;
          ball.dy = -currentSpeedRef.current;
          normalizeBallVelocity(ball);
          playSound('launch');
        }
        return;
      }

      // Barrier collision for dropped balls
      if (ball.y + ball.radius > GAME_H) {
        if (barrierRef.current) {
          barrierRef.current = false;
          ball.dy *= -1;
          ball.y = GAME_H - ball.radius - 1;
          createParticles(ball.x, GAME_H, '#06b6d4', 20); // Cyan sparks
          playSound('paddle');
        }
      }

      // Update trail
      if (!ball.trail) ball.trail = [];
      ball.trail.unshift({ x: ball.x, y: ball.y, alpha: 1.0 });
      if (ball.trail.length > 8) ball.trail.pop();

      ball.x += ball.dx; ball.y += ball.dy;

      if (ball.x + ball.radius > GAME_W || ball.x - ball.radius < 0) {
        ball.x = ball.x < GAME_W / 2 ? ball.radius : GAME_W - ball.radius; // Push out of wall
        ball.dx *= -1;
        playSound('paddle');
        createParticles(ball.x, ball.y, '#ffffff', 5);
        normalizeBallVelocity(ball);
      }
      if (ball.y - ball.radius < 0) {
        ball.y = ball.radius; // Push out of ceiling
        ball.dy *= -1;
        playSound('paddle');
        createParticles(ball.x, ball.y, '#ffffff', 5);
        normalizeBallVelocity(ball);
      }

      // Paddle Collision
      if (ball.y + ball.radius >= paddleRef.current.y && ball.y - ball.radius <= paddleRef.current.y + paddleRef.current.height &&
          ball.x + ball.radius >= paddleRef.current.x && ball.x - ball.radius <= paddleRef.current.x + paddleRef.current.width) {
        
        const overlapTop = (ball.y + ball.radius) - paddleRef.current.y;
        const overlapLeft = (ball.x + ball.radius) - paddleRef.current.x;
        const overlapRight = (paddleRef.current.x + paddleRef.current.width) - (ball.x - ball.radius);
        
        // Find which face of the paddle we hit
        const minOverlap = Math.min(overlapTop, overlapLeft, overlapRight);

        if (minOverlap === overlapTop && ball.dy > 0) {
          // Hit the top of the paddle
          ball.y = paddleRef.current.y - ball.radius; // Cleanly snaps to top
          comboRef.current = 0; // Reset combo when bouncing on paddle
          const hitPos = (ball.x - (paddleRef.current.x + paddleRef.current.width / 2)) / (paddleRef.current.width / 2);
          const angle = hitPos * (Math.PI / 3);
          ball.dx = Math.sin(angle) * currentSpeedRef.current;
          ball.dy = -Math.cos(angle) * currentSpeedRef.current;
          
          playSound('paddle');
          paddleRef.current.flash = 0.8;

          // Dynamic Hit Sparks based on equipped paddle color
          const equippedPaddle = inventoryRef.current?.equipped.paddle;
          let sparkColor = '#60a5fa'; // Fast default
          if (equippedPaddle === 'paddle_blue') sparkColor = '#93c5fd';
          if (equippedPaddle === 'paddle_toxic') sparkColor = '#6ee7b7';
          if (equippedPaddle === 'paddle_neon') sparkColor = '#f472b6';
          if (equippedPaddle === 'paddle_plasma') sparkColor = '#ffffff';

          createParticles(ball.x, ball.y + ball.radius, sparkColor, 15);
        } else if (minOverlap === overlapLeft) {
          // Bounced off the left side
          ball.x = paddleRef.current.x - ball.radius;
          ball.dx = -Math.abs(ball.dx); // Force leftwards
          
          // CRITICAL: In Arkanoid, saving with the edge should still bounce the ball UP to save the player
          if (ball.dy > 0) {
            ball.dy = -Math.abs(ball.dy);
            comboRef.current = 0;
            paddleRef.current.flash = 0.5;
          }
          playSound('paddle');
        } else if (minOverlap === overlapRight) {
          // Bounced off the right side
          ball.x = paddleRef.current.x + paddleRef.current.width + ball.radius;
          ball.dx = Math.abs(ball.dx); // Force rightwards
          
          // Send it upwards to save the player
          if (ball.dy > 0) {
            ball.dy = -Math.abs(ball.dy);
            comboRef.current = 0;
            paddleRef.current.flash = 0.5;
          }
          playSound('paddle');
        }
      }



      bricksRef.current.forEach(b => {
        if (!b.active) return;
        if (ball.x + ball.radius > b.x && ball.x - ball.radius < b.x + b.width && ball.y + ball.radius > b.y && ball.y - ball.radius < b.y + b.height) {

          const isFireballPassThru = ball.isFireball && (b.type === 'NORMAL' || b.type === 'TNT' || b.type === 'LARGE_TNT');

          let shouldBounce = true;
          if (isFireballPassThru) {
            shouldBounce = false;
          }

          if (shouldBounce) {
            const overlapX = Math.min(ball.x + ball.radius - b.x, b.x + b.width - (ball.x - ball.radius));
            const overlapY = Math.min(ball.y + ball.radius - b.y, b.y + b.height - (ball.y - ball.radius));
            if (overlapX < overlapY) ball.dx *= -1; else ball.dy *= -1;
            normalizeBallVelocity(ball);
          }

          if (b.type === 'TNT' || b.type === 'LARGE_TNT') {
            if (b.triggerTimer === undefined) {
              b.triggerTimer = b.type === 'LARGE_TNT' ? 40 : 20; // Start tremble timer
              playSound('paddle');
            }
          } else if (b.type === 'GOLD') {
            if (!b.triggerTimer) { // Cooldown for particle generation to prevent lag when overlapping
              b.triggerTimer = 15;
              playSound('paddle'); // Metallic clink
              createParticles(ball.x, ball.y, '#fbbf24', 5);
            }
          } else if (b.type === 'SILVER') {
            if (b.hp !== undefined && !b.triggerTimer) {
              b.hp--;
              b.triggerTimer = 10; // Prevent instant 3-hit death from overlap
              playSound('brick');
              createParticles(ball.x, ball.y, '#9ca3af', 5, true); // Debris
              if (b.hp <= 0) {
                b.active = false;
                comboRef.current++;
                const mult = Math.min(comboRef.current, 5);
                const score = 150 * mult;
                onScoreUpdateRef.current(score);
                addFeedbackText(`+${score}`, b.x + b.width / 2, b.y, mult > 1 ? '#a855f7' : '#9ca3af');
                if (mult > 1) addFeedbackText(`Combo x${mult}!`, b.x + b.width / 2, b.y - 15, '#facc15');
              }
            }
          } else {
            b.active = false;
            comboRef.current++;
            const mult = Math.min(comboRef.current, 5);
            const score = 100 * mult;
            onScoreUpdateRef.current(score);
            addFeedbackText(`+${score}`, b.x + b.width / 2, b.y, mult > 1 ? '#a855f7' : '#60a5fa');
            if (mult > 1) addFeedbackText(`Combo x${mult}!`, b.x + b.width / 2, b.y - 15, '#facc15');

            let debrisColor = '#ef4444';
            if (b.type === 'BONUS') debrisColor = '#3b82f6';

            createParticles(b.x + b.width / 2, b.y + b.height / 2, debrisColor, 10, true);
            playSound('brick');
            if (b.type === 'BONUS') handleBonusEffect(b.x + b.width / 2, b.y + b.height / 2);
            else if (Math.random() < 0.2) spawnCollectible(b.x + b.width / 2, b.y + b.height / 2);
          }
        }
      });

      // Ball collision with Enemies
      enemiesRef.current.forEach(enemy => {
        if (enemy.active && ball.x + ball.radius > enemy.x && ball.x - ball.radius < enemy.x + enemy.width &&
            ball.y + ball.radius > enemy.y && ball.y - ball.radius < enemy.y + enemy.height) {
          
          enemy.active = false;
          
          if (!ball.isFireball) {
            const overlapX = Math.min(ball.x + ball.radius - enemy.x, enemy.x + enemy.width - (ball.x - ball.radius));
            const overlapY = Math.min(ball.y + ball.radius - enemy.y, enemy.y + enemy.height - (ball.y - ball.radius));
            if (overlapX < overlapY) ball.dx *= -1; else ball.dy *= -1;
            normalizeBallVelocity(ball);
          }

          comboRef.current++;
          const mult = Math.min(comboRef.current, 5);
          const score = 50 * mult;
          onScoreUpdateRef.current(score);
          addFeedbackText(`+${score}`, enemy.x + enemy.width / 2, enemy.y, mult > 1 ? '#a855f7' : '#f59e0b');
          if (mult > 1) addFeedbackText(`Combo x${mult}!`, enemy.x + enemy.width / 2, enemy.y - 15, '#facc15');

          createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#f59e0b', 10, true);
          playSound('brick');
        }
      });

      // Ball collision with Boss (only damageable if intro is finished and not already dying)
      if (bossRef.current && bossRef.current.active && bossRef.current.introY === undefined && !bossRef.current.explodingTimer) {
        const boss = bossRef.current;
        if (ball.x + ball.radius > boss.x && ball.x - ball.radius < boss.x + boss.width &&
          ball.y + ball.radius > boss.y && ball.y - ball.radius < boss.y + boss.height) {

          // Measure overlap from edges to determine correct bounce and push-out
          const overlapX = Math.min(ball.x + ball.radius - boss.x, boss.x + boss.width - (ball.x - ball.radius));
          const overlapY = Math.min(ball.y + ball.radius - boss.y, boss.y + boss.height - (ball.y - ball.radius));

          // Clamping and bouncing
          if (overlapX < overlapY) {
            ball.x = ball.x < boss.x + boss.width / 2 ? boss.x - ball.radius : boss.x + boss.width + ball.radius;
            ball.dx *= -1;
          } else {
            ball.y = ball.y < boss.y + boss.height / 2 ? boss.y - ball.radius : boss.y + boss.height + ball.radius;
            ball.dy *= -1;
          }
          normalizeBallVelocity(ball);

          // Apply damage if not currently suffering from I-Frames
          if (boss.invulnerableTimer <= 0) {
            boss.hp--;
            boss.invulnerableTimer = 15; // Brief invulnerability window to prevent instant-death overlaps

            comboRef.current++;
            const mult = Math.min(comboRef.current, 5);
            const score = 200 * mult;
            onScoreUpdateRef.current(score);
            addFeedbackText(`+${score}`, boss.x + boss.width / 2, boss.y, mult > 1 ? '#a855f7' : '#f87171');
            if (mult > 1) addFeedbackText(`Combo x${mult}!`, boss.x + boss.width / 2, boss.y - 15, '#facc15');

            createParticles(ball.x, ball.y, '#f87171', 15);
            playSound('brick'); // Boss hit sound

            if (boss.hp <= 0) {
              boss.explodingTimer = 120; // 2 seconds of explosions (60fps)
              playSound('tnt');
            }
          }
        }
      }
    });

    // Check level completion (ignore GOLD bricks, wait for Boss defeat)
    // Check level completion (ignore GOLD bricks, wait for Boss defeat)
    // ONLY in Campaign Mode
    let allCleared = true;
    if (bossRef.current && bossRef.current.active) allCleared = false;
    else {
      bricksRef.current.forEach(b => {
        if (b.active && b.type !== 'GOLD') allCleared = false;
      });
    }

    // Wait for cinematic explosions and shakes to finish before transitioning
    if (explosionsRef.current.length > 0 || shakeRef.current.duration > 0) {
      allCleared = false;
    }

    if (allCleared && transitionTimerRef.current <= 0) {
      // Start Hyperspace Transition
      transitionTimerRef.current = 180; // 3 seconds at 60fps for the loading bar
      paddleVelocityRef.current = 0;
      playSound('launch'); // Warp sound indicator

      // Stop balls from triggering deaths during hyperspace
      ballsRef.current.forEach(b => {
        b.dy = -Math.abs(b.dy); // Push balls upwards
      });
      // Clear all projectiles to prevent unintended block breaking
      projectilesRef.current = [];
      enemyProjectilesRef.current = [];
      collectiblesRef.current = [];
      enemiesRef.current = [];
    }

    // Check ongoing TNT triggers (Moved outside of the ball loop)
    bricksRef.current.forEach(b => {
      if (b.active && b.triggerTimer !== undefined) {
        b.triggerTimer--;
        if (b.triggerTimer <= 0) {
          if (b.type === 'TNT' || b.type === 'LARGE_TNT') {
            b.active = false;
            handleExplosion(b, b.type === 'LARGE_TNT');
          } else {
            b.triggerTimer = undefined; // Reset cooldown for GOLD/SILVER
          }
        }
      }
    });

    const activeBalls = ballsRef.current.filter(b => b.y < GAME_H + 20);
    if (activeBalls.length === 0) {
      livesRef.current--;
      onLivesUpdateRef.current(livesRef.current);
      playSound('life_lost');
      if (livesRef.current > 0) resetBall();
      else onGameOverRef.current();
    } else {
      ballsRef.current = activeBalls;
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    if (shakeRef.current.duration > 0) {
      ctx.translate((Math.random() - 0.5) * shakeRef.current.intensity, (Math.random() - 0.5) * shakeRef.current.intensity);
    }
    ctx.clearRect(0, 0, GAME_W, GAME_H);

    // Background Rendering
    const equippedBg = inventoryRef.current?.equipped.background;

    // 1. Base color fill
    let bgColor = '#000000';
    if (equippedBg === 'bg_blood') bgColor = '#1c0505';
    if (equippedBg === 'bg_synthwave') bgColor = '#1e1b4b';
    if (equippedBg === 'bg_matrix') bgColor = '#022c22';
    if (equippedBg === 'bg_ocean') bgColor = '#0f172a';
    if (equippedBg === 'bg_blackhole') bgColor = '#000000'; // Pure black for space

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // 2. Stars (only for space-themed backgrounds)
    if (equippedBg !== 'bg_matrix' && equippedBg !== 'bg_ocean') {
      ctx.fillStyle = equippedBg === 'bg_blood' ? '#fca5a5' : equippedBg === 'bg_synthwave' ? '#f472b6' : 'white';
      if (equippedBg === 'bg_blackhole') ctx.fillStyle = '#c4b5fd'; // Light purple stars for blackhole
      starsRef.current.forEach(star => {
        ctx.globalAlpha = star.alpha;
        ctx.fillRect(star.x, star.y, star.size, star.size);
      });
      ctx.globalAlpha = 1.0;
    }

    // 3. Specific Background Effects
    const now = Date.now();

    if (equippedBg === 'bg_synthwave') {
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.15)'; // Hot pink grid
      ctx.lineWidth = 2;
      for (let i = 0; i < GAME_W; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, GAME_H); ctx.stroke(); }
      // Moving horizontal lines for synthwave feel
      const offset = (now / 20) % 40;
      for (let i = 0; i < GAME_H; i += 40) {
        ctx.beginPath();
        const y = i + offset;
        ctx.moveTo(0, y);
        ctx.lineTo(GAME_W, y);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
    else if (equippedBg === 'bg_matrix') {
      // Digital Rain Effect
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)'; // Faint green
      ctx.font = '10px monospace';
      for (let i = 0; i < GAME_W; i += 20) {
        // Pseudo-random falling based on column index and time
        const yOffset = ((now / 15) + (Math.sin(i) * 1000)) % GAME_H;
        // Draw a column of glowing characters
        for (let j = 0; j < 5; j++) {
          ctx.globalAlpha = 1 - (j * 0.2); // fade out tail
          ctx.fillText(String.fromCharCode(0x30A0 + Math.random() * 96), i, (yOffset - (j * 15) + GAME_H) % GAME_H);
        }
      }
      ctx.globalAlpha = 1.0;
    }
    else if (equippedBg === 'bg_ocean') {
      // Deep underwater waves effect
      ctx.fillStyle = 'rgba(30, 58, 138, 0.1)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
      for (let j = 0; j < 4; j++) {
        ctx.beginPath();
        ctx.moveTo(0, GAME_H);
        for (let i = 0; i <= GAME_W; i += 20) {
          const waveY = Math.sin((i / 50) + (now / (1000 + j * 200))) * (20 + j * 10);
          const baseY = (GAME_H * 0.4) + (j * 80);
          ctx.lineTo(i, baseY + waveY);
        }
        ctx.lineTo(GAME_W, GAME_H);
        ctx.fill();
        ctx.stroke();
      }
    }
    else if (equippedBg === 'bg_blackhole') {
      // Rotating Event Horizon at the center
      ctx.save();
      ctx.translate(GAME_W / 2, GAME_H / 2);
      ctx.rotate(now / 1000); // slow spin

      // Accretion disk glow
      const bhGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 150);
      bhGrad.addColorStop(0, 'rgba(0,0,0,1)'); // pure black core
      bhGrad.addColorStop(0.2, 'rgba(0,0,0,1)');
      bhGrad.addColorStop(0.3, 'rgba(147, 51, 234, 0.8)'); // intense purple event horizon
      bhGrad.addColorStop(0.8, 'rgba(139, 92, 246, 0.1)'); // fading purple space dust
      bhGrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = bhGrad;
      ctx.fillRect(-200, -200, 400, 400);

      // Swirling matter lines
      ctx.strokeStyle = 'rgba(196, 181, 253, 0.2)';
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.rotate(Math.PI / 4);
        ctx.moveTo(35, 0); // start outside the black core
        ctx.bezierCurveTo(80, 50, 120, -50, 200, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
    else {
      // Default / Blood grid
      ctx.strokeStyle = equippedBg === 'bg_blood' ? 'rgba(220, 38, 38, 0.05)' : 'rgba(255, 255, 255, 0.03)';
      for (let i = 0; i < GAME_W; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, GAME_H); ctx.stroke(); }
      for (let i = 0; i < GAME_H; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(GAME_W, i); ctx.stroke(); }
    }

    // Touch zones indicator (only when playing, subtle)
    ctx.fillStyle = 'rgba(255,255,255,0.015)';
    ctx.fillRect(0, 0, GAME_W * 0.33, GAME_H);
    ctx.fillRect(GAME_W * 0.67, 0, GAME_W * 0.33, GAME_H);

    particlesRef.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      if (p.isDebris && p.rotation !== undefined) {
        ctx.save();
        ctx.translate(p.x + p.size / 2, p.y + p.size / 2);
        ctx.rotate(p.rotation);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else {
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    });
    ctx.globalAlpha = 1.0;

    // Paddle
    const equippedPaddle = inventoryRef.current?.equipped.paddle;
    let effectType = 'none';
    let pColorPrimary = shipConfig.color;
    let pColorSecondary = undefined;

    if (equippedPaddle === 'paddle_blue') pColorPrimary = '#3b82f6';
    if (equippedPaddle === 'paddle_toxic') { pColorPrimary = '#10b981'; effectType = 'glow'; }
    if (equippedPaddle === 'paddle_neon') { pColorPrimary = '#ec4899'; pColorSecondary = '#06b6d4'; effectType = 'synthwave'; }
    if (equippedPaddle === 'paddle_plasma') { pColorPrimary = '#cbd5e1'; effectType = 'glow'; }

    // Set shadows
    ctx.shadowColor = effectType === 'glow' ? pColorPrimary : effectType === 'synthwave' ? pColorPrimary : 'transparent';
    ctx.shadowBlur = (effectType === 'glow' || effectType === 'synthwave') ? 15 : 0;

    // Fill style (gradient or solid)
    if (effectType === 'synthwave' && pColorSecondary) {
      const grad = ctx.createLinearGradient(paddleRef.current.x, paddleRef.current.y, paddleRef.current.x + paddleRef.current.width, paddleRef.current.y);
      grad.addColorStop(0, pColorPrimary);
      grad.addColorStop(1, pColorSecondary);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = ammoRef.current > 0 ? '#fbbf24' : pColorPrimary; // ammo override
    }

    ctx.fillRect(paddleRef.current.x, paddleRef.current.y, paddleRef.current.width, paddleRef.current.height);

    ctx.shadowBlur = 0; // reset
    if (paddleRef.current.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${paddleRef.current.flash})`;
      ctx.fillRect(paddleRef.current.x, paddleRef.current.y, paddleRef.current.width, paddleRef.current.height);
    }

    // Balls & Trails
    const equippedBall = inventoryRef.current?.equipped.ball;
    ballsRef.current.forEach(ball => {
      // Trail
      if (ball.trail) {
        ball.trail.forEach((t, i) => {
          const ratio = 1 - (i / ball.trail.length);
          ctx.beginPath();
          ctx.arc(t.x, t.y, ball.radius * ratio, 0, Math.PI * 2);

          if (equippedBall === 'ball_rainbow' && !ball.isFireball) {
            const hue = (Date.now() / 5 + i * 20) % 360;
            ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${ratio * 0.8})`;
          } else if (equippedBall === 'ball_fire' || ball.isFireball) {
            ctx.fillStyle = `rgba(249, 115, 22, ${ratio * 0.8})`; // Orange/Red trail
          } else if (equippedBall === 'ball_void') {
            ctx.fillStyle = `rgba(0, 0, 0, ${ratio * 0.9})`; // Dark matter trail
          } else {
            ctx.fillStyle = `rgba(255, 255, 255, ${ratio * 0.5})`; // White trail for default
          }

          ctx.fill();

          if (equippedBall === 'ball_void') {
            ctx.strokeStyle = `rgba(255, 255, 255, ${ratio * 0.3})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          ctx.closePath();
        });
      }

      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);

      let bColor = '#ffffff';
      let shadowColor = 'transparent';
      let blurAmount = 0;

      if (ball.isFireball || equippedBall === 'ball_fire') {
        bColor = '#f97316'; // Orange core
        shadowColor = '#ea580c'; // Darker orange aura
        blurAmount = 20;
      } else if (equippedBall === 'ball_rainbow') {
        bColor = '#ffffff';
        shadowColor = `hsl(${(Date.now() / 5) % 360}, 100%, 60%)`;
        blurAmount = 15;
      } else if (equippedBall === 'ball_void') {
        bColor = '#000000'; // Black hole core
        shadowColor = '#ffffff'; // White event horizon glow
        blurAmount = 15;
      } else {
        bColor = '#ffffff'; // Plasma base
        shadowColor = '#93c5fd';
        blurAmount = 5; // Slight glow for default
      }

      ctx.fillStyle = bColor;
      ctx.shadowColor = shadowColor;
      ctx.shadowBlur = blurAmount;
      ctx.fill();

      if (equippedBall === 'ball_void') {
        ctx.strokeStyle = '#ffffff'; // thin white edge to define the black void sphere
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.closePath();
    });

    // Bricks
    bricksRef.current.forEach(b => {
      if (!b.active) return;

      let bx = b.x;
      let by = b.y;

      // Tremble effect if triggered
      if (b.triggerTimer !== undefined) {
        bx += (Math.random() - 0.5) * 4;
        by += (Math.random() - 0.5) * 4;
      }

      let color = '#ef4444';
      let text = '';
      if (b.type === 'TNT') { color = '#f97316'; text = 'TNT'; }
      if (b.type === 'LARGE_TNT') { color = '#ea580c'; text = 'MEGA'; }
      if (b.type === 'BONUS') { color = '#a855f7'; text = '?'; }
      if (b.type === 'GOLD') { color = '#facc15'; text = '---'; }
      if (b.type === 'SILVER') {
        color = b.hp === 3 ? '#e5e7eb' : b.hp === 2 ? '#9ca3af' : '#4b5563';
      }

      ctx.fillStyle = color;
      ctx.fillRect(bx, by, b.width, b.height);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeRect(bx, by, b.width, b.height);

      // Cracks for silver
      if (b.type === 'SILVER' && b.hp && b.hp < 3) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.moveTo(bx + b.width * 0.2, by); ctx.lineTo(bx + b.width * 0.5, by + b.height * 0.6);
        if (b.hp < 2) { ctx.lineTo(bx + b.width * 0.8, by + b.height); }
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(bx, by, b.width, 3);

      if (text) {
        ctx.fillStyle = 'white';
        ctx.font = text === 'MEGA' ? '7px "Press Start 2P"' : '8px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText(text, bx + b.width / 2, by + b.height / 2 + 4);
      }
    });

    // Projectiles
    projectilesRef.current.forEach(p => { ctx.fillStyle = '#fbbf24'; ctx.fillRect(p.x - 2, p.y, 4, 12); });

    // Enemy Projectiles
    enemyProjectilesRef.current.forEach(ep => {
      const cx = ep.x + ep.width / 2;
      const cy = ep.y + ep.height / 2;

      // Outer glow
      ctx.beginPath();
      ctx.arc(cx, cy, ep.width, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.fill();

      // Motion trail
      ctx.beginPath();
      ctx.moveTo(cx - ep.width / 2, cy);
      ctx.lineTo(cx, cy - ep.height * 1.5);
      ctx.lineTo(cx + ep.width / 2, cy);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.fill();

      // Inner core
      ctx.beginPath();
      ctx.arc(cx, cy, ep.width / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    });

    // Default now used across the draw tick is declared above

    // Boss
    if (bossRef.current && bossRef.current.active) {
      const b = bossRef.current;
      const wiggle1 = Math.sin(now / 150) * 8;
      const wiggle2 = Math.cos(now / 150) * 8;
      const hoverY = Math.sin(now / 200) * 5;
      const ey = b.y + hoverY;

      // Boss color based on level (every 5 levels)
      const bossColors = ['#10b981', '#3b82f6', '#ec4899', '#eab308', '#ef4444', '#a855f7']; // Green, Blue, Pink, Yellow, Red, Purple
      const bossColorIndex = Math.max(0, Math.min(Math.floor((levelRef.current - 1) / 5), bossColors.length - 1));
      const currentBossColor = bossColors[bossColorIndex];

      // Flash white when receiving damage (invulnerable) or randomly red if exploding
      const isExploding = b.explodingTimer !== undefined && b.explodingTimer > 0;
      if (b.invulnerableTimer > 0) {
        ctx.fillStyle = '#ffffff';
      } else if (isExploding && Math.random() > 0.5) {
        ctx.fillStyle = '#ef4444'; // Flashes red during death
      } else {
        ctx.fillStyle = '#000000'; // Dark/Black base color as requested
      }

      ctx.beginPath();
      // Dome head
      ctx.moveTo(b.x, ey + b.height * 0.6);
      ctx.bezierCurveTo(b.x, ey - b.height * 0.2, b.x + b.width, ey - b.height * 0.2, b.x + b.width, ey + b.height * 0.6);

      // Tentacles
      ctx.quadraticCurveTo(b.x + b.width * 0.875 + wiggle1, ey + b.height * 1.25, b.x + b.width * 0.75, ey + b.height * 0.6);
      ctx.quadraticCurveTo(b.x + b.width * 0.625 + wiggle2, ey + b.height * 1.35, b.x + b.width * 0.5, ey + b.height * 0.6);
      ctx.quadraticCurveTo(b.x + b.width * 0.375 - wiggle1, ey + b.height * 1.35, b.x + b.width * 0.25, ey + b.height * 0.6);
      ctx.quadraticCurveTo(b.x + b.width * 0.125 - wiggle2, ey + b.height * 1.25, b.x, ey + b.height * 0.6);

      ctx.fill();

      // Outline to give it a robotic look
      ctx.strokeStyle = currentBossColor;
      ctx.lineWidth = 3; // Make the border slightly thicker for emphasis
      ctx.stroke();

      // Eyes
      if (isExploding) {
        ctx.fillStyle = '#000000'; // Eyes go completely black and dead when dying
        ctx.strokeStyle = currentBossColor;
        ctx.lineWidth = 1;
      } else {
        ctx.fillStyle = currentBossColor; // Eyes match border color
      }
      ctx.beginPath();
      ctx.arc(b.x + b.width * 0.35, ey + b.height * 0.45, 8, 0, Math.PI * 2);
      ctx.arc(b.x + b.width * 0.65, ey + b.height * 0.45, 8, 0, Math.PI * 2);
      ctx.fill();
      if (isExploding) ctx.stroke(); // Draw glowing socket edge when dead

      if (b.introY !== undefined) {
        // Dynamic Boss Names based on level
        const bossNames = ['MÁQUINA CLÁSICA', 'GUARDIÁN VANGUARDIA', 'MÁQUINA DE GUERRA', 'TITÁN DORADO', 'CLON DE SANGRE', 'DIOS DE LA DESTRUCCIÓN'];
        const currentBossName = bossNames[bossColorIndex] || 'ENTE DESCONOCIDO';

        // Render Intro Dramatic Text
        ctx.fillStyle = '#facc15';
        ctx.font = '10px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText(currentBossName, GAME_W / 2, b.y - 15);
        ctx.fillStyle = '#ef4444';
        ctx.font = '7px "Press Start 2P"';
        ctx.fillText('¡PELIGRO EXTREMO!', GAME_W / 2, b.y + b.height + 25);
      } else if (!isExploding) {
        // Health Bar (only show during fight, hide when dying)
        const hpRatio = b.hp / b.maxHp;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(b.x, ey - 10, b.width, 4);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(b.x, ey - 10, b.width * Math.max(0, hpRatio), 4);
        ctx.strokeStyle = '#7f1d1d';
        ctx.strokeRect(b.x, ey - 10, b.width, 4);
      }
    }

    // Bottom Barrier
    if (barrierRef.current) {
      ctx.save();
      const barrierAlpha = 0.5 + Math.sin(now / 100) * 0.2; // Pulsing effect
      ctx.fillStyle = `rgba(6, 182, 212, ${barrierAlpha})`; // Cyan
      ctx.fillRect(0, GAME_H - 4, GAME_W, 4);
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 15;
      ctx.fillRect(0, GAME_H - 2, GAME_W, 2); // Glow line
      ctx.restore();
    }

    // Enemies (Red Octopuses)
    enemiesRef.current.forEach((e, i) => {
      // Animation parameters
      const wiggle1 = Math.sin(now / 150 + i) * 4;
      const wiggle2 = Math.cos(now / 150 + i) * 4;
      const hoverY = Math.sin(now / 200 + i) * 2.5;

      const ey = e.y + hoverY;

      ctx.fillStyle = '#ef4444'; // Red body
      ctx.beginPath();
      // Dome head
      ctx.moveTo(e.x, ey + e.height * 0.6);
      ctx.bezierCurveTo(e.x, ey - e.height * 0.2, e.x + e.width, ey - e.height * 0.2, e.x + e.width, ey + e.height * 0.6);

      // Tentacles (drawing right to left back to start)
      // T4 (Rightmost)
      ctx.quadraticCurveTo(e.x + e.width * 0.875 + wiggle1, ey + e.height * 1.25, e.x + e.width * 0.75, ey + e.height * 0.6);
      // T3
      ctx.quadraticCurveTo(e.x + e.width * 0.625 + wiggle2, ey + e.height * 1.35, e.x + e.width * 0.5, ey + e.height * 0.6);
      // T2
      ctx.quadraticCurveTo(e.x + e.width * 0.375 - wiggle1, ey + e.height * 1.35, e.x + e.width * 0.25, ey + e.height * 0.6);
      // T1 (Leftmost)
      ctx.quadraticCurveTo(e.x + e.width * 0.125 - wiggle2, ey + e.height * 1.25, e.x, ey + e.height * 0.6);

      ctx.fill();

      // Texture spots on the head
      ctx.fillStyle = '#b91c1c'; // Darker red
      ctx.beginPath();
      ctx.arc(e.x + e.width * 0.2, ey + e.height * 0.2, 1.5, 0, Math.PI * 2);
      ctx.arc(e.x + e.width * 0.8, ey + e.height * 0.25, 1, 0, Math.PI * 2);
      ctx.arc(e.x + e.width * 0.5, ey + e.height * 0.1, 2, 0, Math.PI * 2);
      ctx.fill();

      // Eyes
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(e.x + e.width * 0.35, ey + e.height * 0.45, 3.5, 0, Math.PI * 2);
      ctx.arc(e.x + e.width * 0.65, ey + e.height * 0.45, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Pupils looking at the paddle
      const lookDir = paddleRef.current.x + paddleRef.current.width / 2 > e.x + e.width / 2 ? 1 : -1;
      ctx.fillStyle = 'black';
      ctx.beginPath();
      ctx.arc(e.x + e.width * 0.35 + lookDir, ey + e.height * 0.45, 1.5, 0, Math.PI * 2);
      ctx.arc(e.x + e.width * 0.65 + lookDir, ey + e.height * 0.45, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Angry eyebrows
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(e.x + e.width * 0.25, ey + e.height * 0.3);
      ctx.lineTo(e.x + e.width * 0.45, ey + e.height * 0.35);
      ctx.moveTo(e.x + e.width * 0.75, ey + e.height * 0.3);
      ctx.lineTo(e.x + e.width * 0.55, ey + e.height * 0.35);
      ctx.stroke();
    });

    // Collectibles
    collectiblesRef.current.forEach(c => {
      const pulse = 1 + Math.sin(now / 150) * 0.15;
      const cw = c.width * pulse;
      const ch = c.height * pulse;
      const cx = c.x + c.width / 2 - cw / 2;
      const cy = c.y + c.height / 2 - ch / 2;

      ctx.shadowBlur = 10;
      ctx.fillStyle = '#a855f7'; // Purple Random Buff
      ctx.shadowColor = '#a855f7';
      ctx.fillRect(cx, cy, cw, ch);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('?', c.x + c.width / 2, c.y + c.height / 2 + 4);
    });

    // Feedback texts
    feedbackTextsRef.current.forEach(ft => {
      ctx.fillStyle = ft.color; ctx.globalAlpha = ft.life / 60;
      ctx.font = '8px "Press Start 2P"'; ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
    });

    // Explosions
    explosionsRef.current.forEach(e => {
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(249, 115, 22, ${e.alpha})`; ctx.lineWidth = 4; ctx.stroke();
    });

    ctx.restore();
  };

  const animate = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        if (!isPaused && transitionTimerRef.current <= 0) {
          update();
        }

        if (transitionTimerRef.current > 0) {
          transitionTimerRef.current--;

          // Trigger level change when timer finishes
          if (transitionTimerRef.current <= 0) {
            levelRef.current++;
            if (livesRef.current < initialLives) {
              livesRef.current++;
              onLivesUpdateRef.current(livesRef.current);
            }
            initBricks();
            resetBall();
            paddleRef.current.y = 370; // Reset just in case
            paddleVelocityRef.current = 0;
            if (livesRef.current < initialLives) {
              addFeedbackText(`LEVEL ${levelRef.current} READY`, GAME_W / 2, GAME_H / 2, '#4ade80');
            } else {
              addFeedbackText(`LEVEL ${levelRef.current} READY - +1 💖`, GAME_W / 2, GAME_H / 2, '#ec4899');
            }
            playSound('launch'); // level up sound substitute
          }
        }

        draw(ctx);

        // Draw PREPARATE NIVEL and Loading Bar on top
        if (transitionTimerRef.current > 0) {
          const nextLevel = levelRef.current + 1;
          const progress = 1 - (transitionTimerRef.current / 180); // 0 to 1

          // Solid Black Background
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, GAME_W, GAME_H);

          ctx.save();

          // --- Retro Arcade Scanlines Effect ---
          ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
          for (let y = 0; y < GAME_H; y += 4) {
            ctx.fillRect(0, y, GAME_W, 2);
          }

          // Pulsing Glow Effect
          const pulse = Math.abs(Math.sin(Date.now() / 200));
          const scale = 1 + (progress * 0.1); // Slowly zoom in up to 10%

          ctx.translate(GAME_W / 2, GAME_H / 2 - 40);
          ctx.scale(scale, scale);

          // Main Text "PREPARATE"
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 15 + pulse * 10;
          ctx.fillStyle = '#fde68a';
          ctx.textAlign = 'center';
          ctx.font = '24px "Press Start 2P"';
          ctx.fillText('PREPARATE', 0, 0);

          // Subtext "NIVEL X"
          ctx.shadowColor = '#e879f9'; // Pinkish-purple glow
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#f0abfc';
          ctx.font = '16px "Press Start 2P"';
          ctx.fillText(`NIVEL ${nextLevel}`, 0, 40);

          ctx.restore();
          ctx.save();

          // Loading Bar Container
          const barW = 240;
          const barH = 16;
          const barX = GAME_W / 2 - barW / 2;
          const barY = GAME_H / 2 + 30;

          ctx.shadowBlur = 0; // Turn off shadow for the container border
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 2;
          ctx.strokeRect(barX, barY, barW, barH);

          // Segmented Loading Fill (Retro Arcade Style)
          const segmentCount = 20;
          const segmentWidth = (barW - 4) / segmentCount;

          ctx.shadowColor = '#2dd4bf'; // Cyan glow
          ctx.shadowBlur = 12;

          for (let i = 0; i < segmentCount; i++) {
            const segmentProgress = (i + 0.5) / segmentCount; // Use middle of segment for threshold
            if (progress >= segmentProgress) {
              const isLeading = progress < (i + 1.5) / segmentCount;
              ctx.fillStyle = isLeading && Math.random() > 0.5 ? '#ffffff' : '#5eead4'; // Bright Cyan
              ctx.fillRect(
                barX + 2 + i * segmentWidth,
                barY + 2,
                segmentWidth - 2, // 2px gap between segments
                barH - 4
              );
            }
          }

          // Percentage Text
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.font = '8px "Press Start 2P"';
          ctx.textAlign = 'center';
          ctx.fillText(`CARGANDO... ${Math.floor(progress * 100)}%`, GAME_W / 2, barY + 30);

          ctx.restore();
        }
      }
    }
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [isPaused]);

  return (
    <div ref={containerRef} className="absolute inset-0 flex items-center justify-center bg-black">
      <canvas
        ref={canvasRef}
        width={GAME_W}
        height={GAME_H}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          touchAction: 'none',
        }}
      />

      {/* Virtual Controls for Touch Devices */}
      {isTouchDevice && !isPaused && useVirtualControls && (
        <div className="absolute inset-0 pointer-events-none z-50 flex justify-between items-end pb-8 px-8">
          {/* Left Virtual Joystick */}
          <div
            className="w-48 h-48 rounded-full border-2 border-white/20 bg-white/10 pointer-events-auto relative touch-none"
            onTouchStart={(e) => handleJoy(e, true)}
            onTouchMove={(e) => handleJoy(e, true)}
            onTouchEnd={(e) => handleJoy(e, false)}
            onTouchCancel={(e) => handleJoy(e, false)}
          >
            {/* Inner knob */}
            <div className="absolute w-16 h-16 rounded-full bg-white/40 left-1/2 top-1/2 shadow-lg"
              style={{ transform: `translate(calc(-50% + ${joyPos.x}px), calc(-50% + ${joyPos.y}px))` }}
            />
          </div>

          {/* Right Action Button */}
          <div
            className="w-24 h-24 rounded-full border-2 border-red-500/50 bg-red-500/30 flex items-center justify-center pointer-events-auto touch-none shadow-[0_0_15px_rgba(239,68,68,0.3)] active:bg-red-500/50 transition-colors"
            onTouchStart={(e) => {
              // Prevent default to avoid simulating mouse clicks
              e.preventDefault();
              touchState.current.action = true;
              fireProjectile();
            }}
            onTouchEnd={(e) => { e.preventDefault(); touchState.current.action = false; }}
            onTouchCancel={(e) => { e.preventDefault(); touchState.current.action = false; }}
          >
            <span className="text-white/70 font-bold tracking-widest text-sm select-none">FIRE</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameCanvas;

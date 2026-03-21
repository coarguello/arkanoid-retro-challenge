import React, { useState, useEffect } from 'react';
import { GameState, LeaderboardEntry, ShipConfig, UserInventory, ShopItem, ShopCategory } from './types';
import GameCanvas from './components/GameCanvas';
import { playMenuMusic, playGameMusic, playGameOverMusic, stopMusic, toggleMute as audioToggleMute } from './audioUtils';

// --- Firebase Imports ---
import { auth, db } from './services/firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [authModal, setAuthModal] = useState<'login' | 'register' | 'reset' | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Now tracks the Firebase User UID
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(() => localStorage.getItem('arkanoid_username'));
  const [gameKey, setGameKey] = useState(0);
  const [personalScore, setPersonalScore] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [lives, setLives] = useState(3);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => {
    const saved = localStorage.getItem('arkanoid_leaderboard');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [];
  });

  const [shipConfig, setShipConfig] = useState<ShipConfig>(() => {
    const saved = localStorage.getItem('arkanoid_ship_config');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { }
    }
    return { color: '#ef4444', shape: 'classic' }; // Default red
  });

  const [inventory, setInventory] = useState<UserInventory>(() => {
    const saved = localStorage.getItem('arkanoid_inventory');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { }
    }
    return {
      coins: 0,
      totalPoints: 0,
      unlockedIds: ['paddle_default', 'ball_default', 'bg_default'],
      isBossDefeated: false,
      equipped: { paddle: 'paddle_default', ball: 'ball_default', background: 'bg_default' }
    };
  });

  const [showShop, setShowShop] = useState(false);
  const [shopTab, setShopTab] = useState<'paddle' | 'ball' | 'background' | 'exchange' | 'gacha'>('paddle');
  const [isMuted, setIsMuted] = useState(false);
  const [useVirtualControls, setUseVirtualControls] = useState(() => {
    return localStorage.getItem('arkanoid_virtual_controls') === 'true';
  });

  const toggleVirtualControls = () => {
    setUseVirtualControls(prev => {
      const next = !prev;
      localStorage.setItem('arkanoid_virtual_controls', next.toString());
      return next;
    });
  };

  const [discountedItemId, setDiscountedItemId] = useState<string | null>(null);
  const [gachaReward, setGachaReward] = useState<ShopItem | null>(null);
  const [isGachaDuplicate, setIsGachaDuplicate] = useState(false);
  const [isGachaRolling, setIsGachaRolling] = useState(false);

  useEffect(() => {
    if (isMuted) { stopMusic(); return; }
    if (gameState === GameState.MENU) playMenuMusic();
    else if (gameState === GameState.PLAYING) playGameMusic();
    else if (gameState === GameState.GAME_OVER) playGameOverMusic();
    return () => stopMusic();
  }, [gameState, isMuted]);

  const handleToggleMute = () => setIsMuted(audioToggleMute());

  // Track if game is over to update leaderboard, points, and trigger a random store discount
  useEffect(() => {
    if (gameState === GameState.GAME_OVER) {
      if (score > 0 && currentUser && currentUsername) {

        // 1. Save to Local Leaderboard
        setLeaderboard(prev => {
          const newEntry = { name: currentUsername, score };
          const updated = [...prev, newEntry].sort((a, b) => b.score - a.score);
          const top50 = updated.slice(0, 50);
          localStorage.setItem('arkanoid_leaderboard', JSON.stringify(top50));
          return top50;
        });

        // 2. Push high score to Firestore Database (Only if it's their best)
        const saveScoreToCloud = async () => {
          try {
            const userScoreRef = doc(db, 'leaderboards', currentUser);
            const userScoreSnap = await getDoc(userScoreRef);

            if (!userScoreSnap.exists() || score > userScoreSnap.data().score) {
              await setDoc(userScoreRef, {
                uid: currentUser,
                username: currentUsername,
                score: score,
                timestamp: serverTimestamp()
              });
              setPersonalScore(score); // Update local state for personal best
            }
          } catch (e) {
            console.error("Error saving score to Firebase:", e);
          }
        };
        saveScoreToCloud();

        // 3. Give points to user for the shop
        setInventory(prev => {
          const newInv = { ...prev, totalPoints: prev.totalPoints + score };
          localStorage.setItem('arkanoid_inventory', JSON.stringify(newInv));
          // Async update user doc points in DB
          if (currentUser) {
            setDoc(doc(db, 'users', currentUser), { inventory: newInv }, { merge: true })
              .catch(e => console.error("Error updating user points:", e));
          }
          return newInv;
        });
      }

      // Roll a random daily discount item
      // (Uses the global SHOP_ITEMS defined further down. For initial mount logic, we can leave as is)
    }
  }, [gameState, score, currentUser, currentUsername]);

  // Fetch Global Leaderboard when returning to Menu
  useEffect(() => {
    if (gameState === GameState.MENU) {
      const fetchLeaderboard = async () => {
        try {
          const q = query(collection(db, 'leaderboards'), orderBy('score', 'desc'), limit(50));
          const querySnapshot = await getDocs(q);
          const topScores: LeaderboardEntry[] = [];
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            topScores.push({ name: data.username || 'Anónimo', score: data.score });
          });
          // Deduplicate by username to keep only their highest score
          const uniqueScores = Array.from(new Map(topScores.map(item => [item.name, item])).values());
          uniqueScores.sort((a, b) => b.score - a.score);

          setLeaderboard(uniqueScores.slice(0, 50));
          localStorage.setItem('arkanoid_leaderboard', JSON.stringify(uniqueScores.slice(0, 50)));
        } catch (e) {
          console.error("Error fetching leaderboard: ", e);
        }
      };
      fetchLeaderboard();
    }
  }, [gameState]);

  // Auto-pause when window loses focus or becomes hidden
  useEffect(() => {
    const handlePauseEvent = () => {
      // Only pause if the game is actively being played
      setGameState(currentState => {
        if (currentState === GameState.PLAYING) {
          return GameState.PAUSED;
        }
        return currentState;
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) handlePauseEvent();
    };

    window.addEventListener('blur', handlePauseEvent);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handlePauseEvent);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleBossDefeated = () => {
    setInventory(prev => {
      if (!prev.isBossDefeated) {
        const newInv = { ...prev, isBossDefeated: true };
        localStorage.setItem('arkanoid_inventory', JSON.stringify(newInv));
        return newInv;
      }
      return prev;
    });
  };

  const startGame = () => {
    setScore(0);
    setLives(3);
    setGameKey(prev => prev + 1);
    setGameState(GameState.PLAYING);
  };

  const handleGameOver = () => {
    setGameState(GameState.GAME_OVER);
  };

  const updateScore = (points: number) => {
    setScore(prev => prev + points);
  };

  const updateLives = (newLives: number) => {
    setLives(newLives);
    if (newLives <= 0) {
      setGameState(GameState.GAME_OVER);
    }
  };

  const [tempShipColor, setTempShipColor] = useState<string>('#ef4444');

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user.uid);
        setCurrentUsername(user.displayName || 'Piloto Anónimo');
        localStorage.setItem('arkanoid_user', user.uid);

        // Fetch User Inventory from Firestore
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const cloudInv = userSnap.data().inventory;
            setInventory(cloudInv);
            localStorage.setItem('arkanoid_inventory', JSON.stringify(cloudInv));
          } else {
            // Create default document if it doesn't exist (clean slate for new users)
            const defaultInventory: UserInventory = {
              coins: 0,
              totalPoints: 0,
              unlockedIds: ['paddle_default', 'ball_default', 'bg_default'],
              equipped: { paddle: 'paddle_default', ball: 'ball_default', background: 'bg_default' },
              isBossDefeated: false
            };
            await setDoc(userRef, {
              username: user.displayName || 'Piloto Anónimo',
              inventory: defaultInventory,
              lastActive: new Date().toISOString()
            });
            setInventory(defaultInventory);
            localStorage.setItem('arkanoid_inventory', JSON.stringify(defaultInventory));
          }
        } catch (e) {
          console.error("Error fetching user data:", e);
        }

        // Fetch Personal Best Score from Leaderboards
        try {
          const userScoreRef = doc(db, 'leaderboards', user.uid);
          const userScoreSnap = await getDoc(userScoreRef);
          if (userScoreSnap.exists()) {
            setPersonalScore(userScoreSnap.data().score);
          } else {
            setPersonalScore(0);
          }
        } catch (e) {
          console.error("Error fetching personal score:", e);
        }

      } else {
        setCurrentUser(null);
        setCurrentUsername(null);
        setPersonalScore(0);
        localStorage.removeItem('arkanoid_user');
      }
    });

    return () => unsubscribe();
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setIsAuthLoading(true);

    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const isLogin = authModal === 'login';
    const isReset = authModal === 'reset';

    try {
      if (isReset) {
        await sendPasswordResetEmail(auth, email);
        setAuthSuccess('¡Enlace enviado! Revisa tu bandeja de entrada o spam.');
        setAuthModal('login');
      } else if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Set display name right after registration
        await updateProfile(userCredential.user, { displayName: username });
        setCurrentUsername(username);

        // Force explicitly creating the user doc cleanly here to avoid auth listener race conditions
        const defaultInventory: UserInventory = {
          coins: 0,
          totalPoints: 0,
          unlockedIds: ['paddle_default', 'ball_default', 'bg_default'],
          equipped: { paddle: 'paddle_default', ball: 'ball_default', background: 'bg_default' },
          isBossDefeated: false
        };
        const userRef = doc(db, 'users', userCredential.user.uid);
        // Do not block the UI on setDoc, Firebase will handle the write in the background
        setDoc(userRef, {
          username: username,
          inventory: defaultInventory,
          lastActive: new Date().toISOString()
        }).catch(e => console.error("Error in background setDoc:", e));

        setInventory(defaultInventory);
        localStorage.setItem('arkanoid_inventory', JSON.stringify(defaultInventory));

        // Save initial ship config
        const newConfig: ShipConfig = { color: tempShipColor, shape: 'classic' };
        setShipConfig(newConfig);
        localStorage.setItem('arkanoid_ship_config', JSON.stringify(newConfig));
      }
      setAuthModal(null);
    } catch (error: any) {
      console.error("Authentication error:", error);
      if (error.code === 'auth/email-already-in-use') {
        setAuthError('Este email ya está en uso.');
      } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        setAuthError('Credenciales incorrectas.');
      } else if (error.code === 'auth/user-not-found') {
        setAuthError('No se encontró cuenta con ese email.');
      } else if (error.code === 'auth/weak-password') {
        setAuthError('La contraseña debe tener al menos 6 caracteres.');
      } else {
        setAuthError('Ocurrió un error. Intenta nuevamente.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('arkanoid_user');
      localStorage.removeItem('arkanoid_inventory');
      const defaultInventory: UserInventory = {
        coins: 0,
        totalPoints: 0,
        unlockedIds: ['paddle_default', 'ball_default', 'bg_default'],
        equipped: { paddle: 'paddle_default', ball: 'ball_default', background: 'bg_default' },
        isBossDefeated: false
      };
      setInventory(defaultInventory);
    } catch (e) {
      console.error("Error logging out:", e);
    }
  };

  const renderAuthModal = () => {
    if (!authModal) return null;
    const isLogin = authModal === 'login';
    const isReset = authModal === 'reset';

    const SHIP_COLORS = [
      { id: '#ef4444', name: 'Rojo Militar' },
      { id: '#3b82f6', name: 'Azul Clásico' },
      { id: '#10b981', name: 'Verde Táctico' },
      { id: '#8b5cf6', name: 'Morado Neón' }
    ];

    return (
      <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="min-h-full flex items-center justify-center p-2 sm:p-4">
          <div className="bg-zinc-950 border-2 border-blue-900/50 rounded-2xl p-4 sm:p-6 w-full max-w-sm shadow-[0_0_50px_rgba(37,99,235,0.15)] relative">
            {/* Decorative neon accents */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent"></div>

            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h2 className="text-xl font-bold tracking-tighter text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]">
                {isReset ? 'RECUPERAR ACCESO' : isLogin ? 'ACCESO AL SISTEMA' : 'NUEVO JUGADOR'}
              </h2>
              <button
                onClick={() => setAuthModal(null)}
                className="text-zinc-500 hover:text-white transition-colors text-xl p-2"
              >
                ×
              </button>
            </div>

            <form className="flex flex-col gap-3 sm:gap-4 font-sans" onSubmit={handleAuthSubmit}>
              {authError && (
                <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-3 rounded-lg text-xs text-center">
                  {authError}
                </div>
              )}
              {authSuccess && (
                <div className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 p-3 rounded-lg text-xs text-center">
                  {authSuccess}
                </div>
              )}

              {!isLogin && !isReset && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase text-zinc-400 tracking-wider font-['Press_Start_2P']">Piloto (Usuario)</label>
                  <input
                    type="text"
                    name="username"
                    required={!isLogin}
                    className="bg-zinc-900/50 border border-zinc-800 focus:border-blue-500 rounded-lg px-4 py-3 text-white outline-none transition-colors"
                    placeholder="ej. JosiElPro"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase text-zinc-400 tracking-wider font-['Press_Start_2P']">Frecuencia (Email)</label>
                <input
                  type="email"
                  name="email"
                  required
                  className="bg-zinc-900/50 border border-zinc-800 focus:border-blue-500 rounded-lg px-4 py-3 text-white outline-none transition-colors"
                  placeholder="piloto@arcade.com"
                />
              </div>

              {!isReset && (
                <div className="flex flex-col gap-1.5 relative">
                  <label className="text-[10px] uppercase text-zinc-400 tracking-wider font-['Press_Start_2P']">Código Secreto</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      required
                      autoComplete="current-password"
                      className="w-full bg-zinc-900/50 border border-zinc-800 focus:border-blue-500 rounded-lg pl-4 pr-12 py-3 text-white outline-none transition-colors"
                      placeholder={showPassword ? "contraseña" : "••••••••"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-blue-400 transition-colors"
                      aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                    >
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {!isLogin && !isReset && (
                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-[8px] uppercase text-zinc-400 tracking-wider font-['Press_Start_2P']">Pintura de Nave</label>
                  <div className="flex gap-2">
                    {SHIP_COLORS.map(color => (
                      <button
                        key={color.id}
                        type="button"
                        onClick={() => setTempShipColor(color.id)}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${tempShipColor === color.id ? 'border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'border-zinc-800 hover:border-zinc-500'}`}
                        style={{ backgroundColor: color.id }}
                        title={color.name}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1">
                    {SHIP_COLORS.find(c => c.id === tempShipColor)?.name}
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={isAuthLoading}
                className={`mt-4 w-full bg-gradient-to-r ${isAuthLoading ? 'from-zinc-600 to-zinc-700 cursor-not-allowed' : 'from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'} text-white font-['Press_Start_2P'] py-4 rounded-lg tracking-tighter text-sm shadow-[0_0_20px_rgba(37,99,235,0.4)] active:scale-95 transition-all`}
              >
                {isAuthLoading ? 'PROCESANDO...' : (isReset ? 'ENVIAR CORREO' : isLogin ? 'INICIAR MISIÓN' : 'REGISTRARSE')}
              </button>
            </form>

            <div className="mt-6 flex flex-col gap-2 text-center">
              {/* Temporarily disabled by user request
              {!isReset && (
                <button
                  onClick={() => setAuthModal('reset')}
                  className="text-xs font-sans text-zinc-500 hover:text-blue-400 transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              )}
              */}
              <button
                onClick={() => setAuthModal(isLogin ? 'register' : 'login')}
                className="text-xs font-sans text-zinc-500 hover:text-blue-400 transition-colors"
              >
                {isReset ? 'Volver al inicio de sesión' : isLogin ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Ingresar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // --- SHOP UI LOGIC ---
  const SHOP_ITEMS: ShopItem[] = [
    { id: 'paddle_default', type: 'paddle', name: 'Original', description: 'La barra con la que naciste', price: 0, colorPrimary: '#ef4444' },
    { id: 'paddle_blue', type: 'paddle', name: 'Zafiro', description: 'Azul cristalino', price: 50, colorPrimary: '#3b82f6' },
    { id: 'paddle_toxic', type: 'paddle', name: 'Tóxica', description: 'Emitiendo radiación gamma', price: 150, colorPrimary: '#10b981', effectType: 'glow' },
    { id: 'paddle_neon', type: 'paddle', name: 'Cyberpunk', description: 'Directo del 2077', price: 300, colorPrimary: '#ec4899', colorSecondary: '#06b6d4', effectType: 'synthwave' },
    { id: 'paddle_gold', type: 'paddle', name: 'Oro Puro', description: 'Forjada en oro macizo', price: 800, colorPrimary: '#fbbf24', effectType: 'glow' },
    { id: 'paddle_lava', type: 'paddle', name: 'Río de Magma', description: 'Cuidado que quema', price: 1200, colorPrimary: '#ea580c', colorSecondary: '#dc2626', effectType: 'synthwave' },
    { id: 'paddle_rainbow', type: 'paddle', name: 'Nyan', description: 'Energía cromática', price: 1500, colorPrimary: '#ffffff', effectType: 'rainbow' },
    { id: 'paddle_plasma', type: 'paddle', name: 'Plasma de la Máquina', description: 'Fabricada con restos del Jefe', price: 2000, colorPrimary: '#cbd5e1', effectType: 'glow', unlockCondition: 'boss_kill' },
    { id: 'paddle_ghost', type: 'paddle', name: 'Espectro', description: 'Atraviesa dimensiones', price: 2500, colorPrimary: '#9ca3af', effectType: 'ghost' },

    { id: 'ball_default', type: 'ball', name: 'Plasma Base', description: 'Núcleo de plasma inestable', price: 0, colorPrimary: '#ffffff' },
    { id: 'ball_fire', type: 'ball', name: 'Meteorito', description: 'Dejando un rastro de llamas', price: 200, colorPrimary: '#f97316', effectType: 'fire' },
    { id: 'ball_ice', type: 'ball', name: 'Cometa de Hielo', description: 'Congela el espacio vacío', price: 400, colorPrimary: '#38bdf8', effectType: 'ice' },
    { id: 'ball_rainbow', type: 'ball', name: 'Prisma Arcoíris', description: 'Dibuja con luces prismáticas', price: 800, colorPrimary: '#ffffff', effectType: 'rainbow' },
    { id: 'ball_gold', type: 'ball', name: 'Esfera Dorada', description: 'Oro macizo pesado', price: 1000, colorPrimary: '#facc15' },
    { id: 'ball_ghost', type: 'ball', name: 'Alma Perdida', description: 'Translúcida e indetectable', price: 1500, colorPrimary: '#e5e7eb', effectType: 'ghost' },
    { id: 'ball_void', type: 'ball', name: 'Esfera del Vacío', description: 'Absorbe la luz absoluta', price: 3000, colorPrimary: '#000000', effectType: 'glow', unlockCondition: 'boss_kill' },

    { id: 'bg_default', type: 'background', name: 'Grid Espacial', description: 'Clásico vacío holográfico', price: 0, colorPrimary: '#000000' },
    { id: 'bg_deepspace', type: 'background', name: 'Espacio Profundo', description: 'Silencio y polvo estelar', price: 300, colorPrimary: '#020617' },
    { id: 'bg_blood', type: 'background', name: 'Nebulosa Roja', description: 'Peligro en la constelación', price: 1000, colorPrimary: '#450a0a' },
    { id: 'bg_matrix', type: 'background', name: 'Sistema Matrix', description: 'Flujo de datos de la red', price: 2500, colorPrimary: '#064e3b', effectType: 'matrix' },
    { id: 'bg_ocean', type: 'background', name: 'Océano Profundo', description: 'Mareas cósmicas celestiales', price: 4000, colorPrimary: '#1e3a8a', effectType: 'ocean' },
    { id: 'bg_pixel', type: 'background', name: 'Carrera Glitch', description: 'Volando por túneles de 8-bits', price: 5000, colorPrimary: '#000000', effectType: 'pixel' },
    { id: 'bg_blackhole', type: 'background', name: 'Horizonte de Eventos', description: 'El núcleo de la Creación', price: 6500, colorPrimary: '#2e1065', effectType: 'blackhole', unlockCondition: 'boss_kill' },
    { id: 'bg_hyperdrive', type: 'background', name: 'Salto Hiperespacial', description: 'Estrellas a la velocidad de la luz', price: 8000, colorPrimary: '#000000', effectType: 'hyperdrive' },
    { id: 'bg_synthwave', type: 'background', name: 'NEON SYNTHWAVE', description: 'El paisaje retro supremo', price: 10000, colorPrimary: '#1e1b4b', effectType: 'synthwave' },
  ];

  const getPrice = (item: ShopItem) => {
    if (discountedItemId === item.id) return Math.floor(item.price * 0.7); // 30% discount
    return item.price;
  };

  const handleBuy = (item: ShopItem) => {
    const finalPrice = getPrice(item);
    setInventory(prev => {
      if (prev.coins >= finalPrice && !prev.unlockedIds.includes(item.id)) {
        const newInv = {
          ...prev,
          coins: prev.coins - finalPrice,
          unlockedIds: [...prev.unlockedIds, item.id]
        };
        localStorage.setItem('arkanoid_inventory', JSON.stringify(newInv));
        return newInv;
      }
      return prev;
    });
  };

  const handleEquip = (item: ShopItem) => {
    if (inventory.unlockedIds.includes(item.id)) {
      setInventory(prev => {
        const newInv = {
          ...prev,
          equipped: { ...prev.equipped, [item.type]: item.id }
        };
        localStorage.setItem('arkanoid_inventory', JSON.stringify(newInv));
        return newInv;
      });
    }
  };

  const handleExchange = (amountType: '1' | '10' | 'MAX') => {
    // Exchange rate: 100 points = 1 coin
    setInventory(prev => {
      let pointsToDeduct = 0;
      let coinsToGive = 0;

      if (amountType === '1' && prev.totalPoints >= 100) {
        pointsToDeduct = 100;
        coinsToGive = 1;
      } else if (amountType === '10' && prev.totalPoints >= 1000) {
        pointsToDeduct = 1000;
        coinsToGive = 10;
      } else if (amountType === 'MAX' && prev.totalPoints >= 100) {
        const chunks = Math.floor(prev.totalPoints / 100);
        coinsToGive = chunks * 1;
        pointsToDeduct = chunks * 100;
      }

      if (coinsToGive > 0) {
        const newInv = {
          ...prev,
          coins: prev.coins + coinsToGive,
          totalPoints: prev.totalPoints - pointsToDeduct
        };
        localStorage.setItem('arkanoid_inventory', JSON.stringify(newInv));
        return newInv;
      }
      return prev;
    });
  };

  const handleGachaRoll = () => {
    if (isGachaRolling) return;

    setInventory(currentInv => {
      if (currentInv.coins < 500) return currentInv;

      // Filter available items (allow duplicates, but respect boss requirement)
      const availableItems = SHOP_ITEMS.filter(it =>
        it.unlockCondition !== 'boss_kill' || currentInv.isBossDefeated
      );

      if (availableItems.length === 0) return currentInv;

      setIsGachaRolling(true);
      setGachaReward(null);
      setIsGachaDuplicate(false);

      // Take coins immediately
      const newInv = { ...currentInv, coins: currentInv.coins - 500 };
      localStorage.setItem('arkanoid_inventory', JSON.stringify(newInv));

      // Simulate roulette delay
      setTimeout(() => {
        // Weighted random drop table
        const weightedItems = availableItems.map(it => ({
          item: it,
          weight: Math.max(1, 10000 / (it.price + 100))
        }));
        
        const totalWeight = weightedItems.reduce((acc, curr) => acc + curr.weight, 0);
        let randomNum = Math.random() * totalWeight;
        
        let randomReward = availableItems[0];
        for (const wItem of weightedItems) {
            randomNum -= wItem.weight;
            if (randomNum <= 0) {
                randomReward = wItem.item;
                break;
            }
        }

        setGachaReward(randomReward);
        setIsGachaRolling(false);

        setInventory(latestInv => {
          const isDuplicate = latestInv.unlockedIds.includes(randomReward.id);
          setIsGachaDuplicate(isDuplicate);

          if (!isDuplicate) {
            const finalInv = { ...latestInv, unlockedIds: [...latestInv.unlockedIds, randomReward.id] };
            localStorage.setItem('arkanoid_inventory', JSON.stringify(finalInv));
            return finalInv;
          } else {
            // Give a 100 coin consolation refund for duplicates
            const refundInv = { ...latestInv, coins: latestInv.coins + 100 };
            localStorage.setItem('arkanoid_inventory', JSON.stringify(refundInv));
            return refundInv;
          }
        });
      }, 2000);

      return newInv;
    });
  };

  const renderShopModal = () => {
    if (!showShop) return null;

    const filteredItems = SHOP_ITEMS.filter(it => it.type === shopTab);

    return (
      <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in duration-200 font-sans">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden relative">

          {/* Shop Header */}
          <div className="flex justify-between items-center p-6 border-b border-zinc-900 bg-zinc-900/40 relative overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.03)_50%,transparent_75%,transparent_100%)] bg-[length:20px_20px] animate-[slide_20s_linear_infinite] pointer-events-none"></div>

            <div className="flex items-center gap-4 relative z-10">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)] border border-indigo-400/30">
                <span className="text-2xl animate-pulse">🌌</span>
              </div>
              <div>
                <h2 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 drop-shadow-[0_2px_10px_rgba(56,189,248,0.5)]">
                  TIENDA ALIENÍGENA
                </h2>
                <p className="text-[9px] text-cyan-500/80 uppercase tracking-[0.3em] font-['Press_Start_2P'] mt-1">Suministros Intergalácticos</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-['Press_Start_2P']">Mis Monedas</span>
                <span className="text-xl font-bold text-yellow-400">🪙 {inventory.coins}</span>
              </div>
              <button onClick={() => setShowShop(false)} className="w-10 h-10 rounded-full bg-zinc-900 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors flex items-center justify-center text-xl">
                ✕
              </button>
            </div>
          </div>

          <div className="flex h-full overflow-hidden">
            {/* Sidebar Tabs */}
            <div className="w-48 border-r border-zinc-900 bg-zinc-950/50 p-4 flex flex-col gap-2">
              {[
                { id: 'paddle', label: 'BARRAS', icon: '▬' },
                { id: 'ball', label: 'PELOTAS', icon: '●' },
                { id: 'background', label: 'FONDOS', icon: '🌌' },
                { id: 'exchange', label: 'CANJEAR', icon: '⚖️' },
                { id: 'gacha', label: 'MISTERIO', icon: '🎁' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setShopTab(tab.id as any)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg font-bold tracking-wide transition-all ${shopTab === tab.id ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'} ${tab.id === 'gacha' && shopTab !== 'gacha' ? 'animate-pulse text-purple-400' : ''}`}
                >
                  <span className="text-lg">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-zinc-950/20 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.02)_0%,_transparent_100%)]">

              {shopTab === 'gacha' ? (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto">
                  <div className="bg-zinc-900/80 p-8 rounded-2xl border border-purple-900/50 w-full backdrop-blur shadow-[0_0_40px_rgba(168,85,247,0.1)] relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.15)_0%,_transparent_70%)] pointer-events-none"></div>

                    <h3 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-2 drop-shadow-lg">CAJA MISTERIOSA</h3>
                    <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
                      ¿Te sientes con suerte? Invierte 500 monedas y obtén un objeto aleatorio que NO poseas.<br />
                      <span className="text-purple-400 font-bold block mt-2">¡Incluso podrías ganar los objetos más caros!</span>
                    </p>

                    {gachaReward && !isGachaRolling && (
                      <div className={`mb-8 p-6 bg-zinc-950/80 border rounded-xl animate-in zoom-in duration-500 shadow-[0_0_30px_rgba(16,185,129,0.2)] ${isGachaDuplicate ? 'border-yellow-500/30 shadow-[0_0_30px_rgba(234,179,8,0.2)]' : 'border-emerald-500/30'}`}>
                        <span className={`text-xs uppercase tracking-widest block mb-2 font-black animate-pulse ${isGachaDuplicate ? 'text-yellow-500' : 'text-emerald-400'}`}>
                          {isGachaDuplicate ? '¡OBJETO DUPLICADO!' : '¡HAS OBTENIDO!'}
                        </span>
                        <h4 className="text-2xl font-black text-white">{gachaReward.name}</h4>
                        <p className="text-zinc-500 text-xs mt-1">({gachaReward.type}) Valor original: {gachaReward.price} 🪙</p>
                        {isGachaDuplicate && (
                           <p className="text-yellow-400 text-sm mt-3 font-bold bg-yellow-900/40 py-1 px-3 rounded inline-block border border-yellow-700">Reembolso compensatorio: +100 🪙</p>
                        )}
                      </div>
                    )}

                    <button
                      onClick={handleGachaRoll}
                      disabled={inventory.coins < 500 || isGachaRolling}
                      className={`w-full py-5 rounded-xl font-black tracking-widest text-lg transition-all relative overflow-hidden
                        ${inventory.coins < 500 ? 'bg-zinc-800 text-zinc-600 opacity-50 cursor-not-allowed'
                          : isGachaRolling ? 'bg-purple-900 text-white animate-pulse'
                            : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-[0_0_30px_rgba(168,85,247,0.4)] hover:scale-[1.02] active:scale-95 border-b-4 border-purple-900 active:border-b-0 active:translate-y-1'}`}
                    >
                      {isGachaRolling ? 'ABRIENDO...' : 'COMPRAR CAJA (500 🪙)'}
                    </button>
                  </div>
                </div>
              ) : shopTab === 'exchange' ? (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto">
                  <div className="bg-zinc-900/50 p-8 rounded-2xl border border-zinc-800 w-full backdrop-blur">
                    <h3 className="text-3xl font-bold text-white mb-2">MERCADO NEGRO</h3>
                    <p className="text-zinc-400 text-sm mb-8">Convierte la puntuación que has obtenido jugando en Monedas para gastar en la tienda.</p>

                    <div className="flex justify-between items-center bg-black/50 p-6 rounded-xl border border-zinc-800/50 mb-8">
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-xs text-zinc-500 uppercase tracking-widest font-['Press_Start_2P']">Tus Puntos</span>
                        <span className="text-3xl font-black text-cyan-400">{inventory.totalPoints}</span>
                      </div>

                      <div className="text-zinc-600 text-2xl animate-pulse">→</div>

                      <div className="flex flex-col items-center gap-2">
                        <span className="text-xs text-zinc-500 uppercase tracking-widest font-['Press_Start_2P']">Tus Monedas</span>
                        <span className="text-3xl font-black text-yellow-400">{inventory.coins}</span>
                      </div>
                    </div>

                    <div className="text-sm font-medium text-blue-400 mb-4 bg-blue-900/20 inline-block px-4 py-2 rounded-full border border-blue-900/50">
                      Tasa de Cambio: 100 Puntos = 1 Moneda
                    </div>

                    <div className="flex flex-col gap-3 w-full max-w-sm mt-4 mx-auto">
                      <button
                        onClick={() => handleExchange('1')}
                        disabled={inventory.totalPoints < 100}
                        className="w-full py-3 rounded-xl font-bold tracking-widest text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-800 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 hover:border-zinc-500 flex justify-between px-6 items-center"
                      >
                        <span>1 MONEDA</span>
                        <span className="text-cyan-400 text-xs">-100 pts</span>
                      </button>
                      <button
                        onClick={() => handleExchange('10')}
                        disabled={inventory.totalPoints < 1000}
                        className="w-full py-3 rounded-xl font-bold tracking-widest text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-800 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 hover:border-zinc-500 flex justify-between px-6 items-center"
                      >
                        <span>10 MONEDAS</span>
                        <span className="text-cyan-400 text-xs">-1000 pts</span>
                      </button>
                      <button
                        onClick={() => handleExchange('MAX')}
                        disabled={inventory.totalPoints < 100}
                        className="w-full py-4 mt-2 rounded-xl font-black tracking-widest text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-zinc-800 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black shadow-[0_0_30px_rgba(234,179,8,0.3)] hover:scale-[1.02] active:scale-95 border border-yellow-300"
                      >
                        CANJEAR TODO
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredItems.map(item => {
                    const isUnlocked = inventory.unlockedIds.includes(item.id);
                    const isEquipped = inventory.equipped[item.type] === item.id;
                    const finalPrice = getPrice(item);
                    const canAfford = inventory.coins >= finalPrice;
                    const isDiscounted = discountedItemId === item.id && !isUnlocked;
                    const isBossLocked = item.unlockCondition === 'boss_kill' && !inventory.isBossDefeated && !isUnlocked;

                    return (
                      <div key={item.id} className={`group relative bg-zinc-900/80 rounded-2xl border transition-all overflow-hidden flex flex-col ${isEquipped ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'border-zinc-800 hover:border-zinc-600'}`}>
                        {/* Item Preview Strip */}
                        <div className="h-24 w-full flex items-center justify-center relative overflow-hidden" style={{ background: item.type === 'background' ? item.colorPrimary : '#111' }}>
                          {item.type === 'paddle' && (
                            <div className="w-16 h-4 rounded-sm shadow-lg" style={{ background: item.effectType === 'synthwave' ? `linear-gradient(90deg, ${item.colorPrimary}, ${item.colorSecondary})` : item.colorPrimary }}></div>
                          )}
                          {item.type === 'ball' && (
                            <div className="w-6 h-6 rounded-full shadow-xl" style={{ background: item.colorPrimary, boxShadow: item.effectType === 'fire' ? '0 0 20px #f97316' : item.effectType === 'rainbow' ? '0 0 15px #fff' : 'none' }}></div>
                          )}
                          {isEquipped && (
                            <div className="absolute top-2 right-2 bg-blue-600 text-[9px] uppercase font-['Press_Start_2P'] px-2 py-1 rounded text-white shadow-md">
                              Activo
                            </div>
                          )}
                          {isDiscounted && (
                            <div className="absolute top-2 left-2 bg-rose-600 text-[9px] uppercase font-['Press_Start_2P'] px-2 py-1 rounded text-white shadow-md animate-pulse">
                              -30% OFERTA
                            </div>
                          )}
                        </div>

                        {/* Details */}
                        <div className="p-5 flex-1 flex flex-col">
                          <h3 className="text-xl font-black text-white mb-1 tracking-tight flex items-center gap-2">
                            {item.name}
                            {isBossLocked && <span title="Derrota a la Máquina de Guerra" className="text-red-500 text-sm">🔒</span>}
                          </h3>
                          <p className="text-sm text-zinc-400 leading-snug flex-1">{item.description}</p>

                          <div className="mt-6 pt-4 border-t border-zinc-800/50 flex justify-between items-center">
                            {!isUnlocked ? (
                              isBossLocked ? (
                                <span className="font-bold text-xs text-red-400 uppercase tracking-widest text-center w-full">Derrotar Jefe</span>
                              ) : (
                                <span className={`font-black text-lg flex items-center gap-2 ${canAfford ? 'text-yellow-400' : 'text-red-400'}`}>
                                  {isDiscounted && <span className="text-xs text-zinc-500 line-through">{item.price}</span>}
                                  {finalPrice} 🪙
                                </span>
                              )
                            ) : (
                              <span className="text-emerald-400 font-bold uppercase tracking-wider text-sm flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></svg>
                                Obtenido
                              </span>
                            )}

                            {!isUnlocked ? (
                              !isBossLocked && (
                                <button
                                  onClick={() => handleBuy(item)}
                                  disabled={!canAfford}
                                  className={`px-4 py-2 rounded-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 ${isDiscounted ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-zinc-800 hover:bg-yellow-500 hover:text-black text-white'}`}
                                >
                                  COMPRAR
                                </button>
                              )
                            ) : (
                              <button
                                onClick={() => handleEquip(item)}
                                disabled={isEquipped}
                                className={`px-4 py-2 rounded-lg font-bold transition-all active:scale-95 ${isEquipped ? 'bg-blue-900/40 text-blue-300 cursor-default' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'}`}
                              >
                                {isEquipped ? 'EQUIPADO' : 'EQUIPAR'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div translate="no" className="relative w-screen h-screen bg-zinc-950 text-white overflow-hidden select-none font-['Press_Start_2P']">

      {/* Game Canvas fills the full screen */}
      <GameCanvas
        key={gameKey}
        onGameOver={handleGameOver}
        onScoreUpdate={updateScore}
        onLivesUpdate={updateLives}
        onBossDefeated={handleBossDefeated}
        isPaused={gameState !== GameState.PLAYING}
        initialLives={lives}
        shipConfig={shipConfig}
        inventory={inventory} // Pass down inventory for custom drawing
        useVirtualControls={useVirtualControls}
      />

      {/* HUD overlaid on top of canvas */}
      <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-4 z-[60] bg-gradient-to-b from-black/90 to-transparent pointer-events-none">

        {/* Left Side */}
        <div className="flex flex-col gap-0.5 flex-1 items-start">
          {gameState === GameState.PLAYING || gameState === GameState.PAUSED ? (
            <>
              <span className="text-[7px] text-zinc-500 uppercase">Récord</span>
              <span className="text-[10px] text-yellow-500">{personalScore.toString().padStart(6, '0')}</span>
            </>
          ) : (
            <>
              <span className="text-[7px] text-zinc-500 uppercase">Monedas</span>
              <span className="text-[10px] text-yellow-400">🪙 {inventory.coins}</span>
            </>
          )}
        </div>

        {/* Center */}
        <div className="flex flex-col items-center gap-0.5 flex-1 mt-2">
          {gameState === GameState.PLAYING || gameState === GameState.PAUSED ? (
            <>
              <span className="text-[7px] text-zinc-500 uppercase">Vidas</span>
              <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <span key={i} className={`text-[10px] ${i < lives ? 'text-red-500' : 'text-zinc-800'}`}>♥</span>
                ))}
              </div>
            </>
          ) : (
            currentUser && (
              <div className="flex items-center gap-2 bg-zinc-900/80 border border-blue-900/50 px-4 py-1.5 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.2)] animate-in fade-in duration-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_8px_theme(colors.emerald.500)]"></span>
                <span className="text-[9px] text-blue-300 tracking-widest pl-1 truncate max-w-[100px]">{currentUsername || currentUser}</span>
              </div>
            )
          )}
        </div>

        {/* Right Side */}
        <div className="flex flex-col items-end gap-0.5 flex-1">
          {gameState === GameState.PLAYING || gameState === GameState.PAUSED ? (
            <>
              <span className="text-[7px] text-zinc-500 uppercase">Puntos Nivel</span>
              <span className="text-[10px] text-cyan-400">{score.toString().padStart(6, '0')}</span>
            </>
          ) : (
            <>
              <span className="text-[7px] text-zinc-500 uppercase">Puntos Totales</span>
              <span className="text-[10px] text-cyan-400">{inventory.totalPoints.toString().padStart(6, '0')}</span>
            </>
          )}
        </div>

        {/* Buttons (Pause & Mute) removed to be merged below */}

        {/* Top Right System Toggles */}
        <div className="absolute top-16 right-4 z-50 flex items-center gap-2 pointer-events-auto">
          {/* Virtual Controls Toggle Button */}
          <button
            onClick={toggleVirtualControls}
            className={`p-2 bg-black/50 border rounded-lg transition-colors ${useVirtualControls ? 'border-blue-500 text-blue-400' : 'border-zinc-800 text-zinc-500 hover:text-white'}`}
            title={useVirtualControls ? "Usando controles virtuales" : "Usar controles virtuales (Joysticks en pantalla)"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-1.017c.055-1.612.083-3.245.083-4.897 0-1.645-.028-3.284-.083-4.896a48.11 48.11 0 0 0-5.427-1.017c-.333-.018-.61.247-.61.58v0c0 .355.186.676.401.959.221.29.349.634.349 1.003 0 1.035-1.008 1.875-2.25 1.875-1.243 0-2.25-.84-2.25-1.875 0-.369.128-.713.349-1.003.215-.283.401-.604.401-.959v0c0-.31-.245-.566-.554-.543a48.038 48.038 0 0 0-4.043.208A.656.656 0 0 1 14.25 6.087Z" />
            </svg>
          </button>

          <button
            onClick={handleToggleMute}
            className={`p-2 bg-black/50 border rounded-lg transition-colors ${isMuted ? 'border-red-900/50 text-red-500' : 'border-zinc-800 text-zinc-500 hover:text-white'}`}
            title={isMuted ? "Activar Sonido" : "Silenciar Música"}
          >
            {isMuted ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V19.69a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.395C2.806 8.757 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            )}
          </button>

          {/* Pause Button */}
          {gameState === GameState.PLAYING && (
            <button
              onClick={() => setGameState(GameState.PAUSED)}
              className="p-2 bg-black/50 border border-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"
              title="Pausar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Pause Menu Overlay */}
      {gameState === GameState.PAUSED && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-zinc-950/90 border border-zinc-800 rounded-2xl p-8 w-full max-w-xs flex flex-col gap-4 shadow-2xl items-center">
            <h2 className="text-xl font-bold tracking-widest text-white mb-4">PAUSA</h2>

            <button
              onClick={() => setGameState(GameState.PLAYING)}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg tracking-tighter transition-colors"
            >
              CONTINUAR
            </button>
            <button
              onClick={startGame} // startGame resets score/lives/gameKey to restart
              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs tracking-tighter transition-colors"
            >
              REINICIAR NIVEL
            </button>

            <button
              onClick={toggleVirtualControls}
              className={`w-full py-3 border rounded-lg text-xs tracking-tighter transition-colors mt-2 ${useVirtualControls ? 'border-blue-900/50 bg-blue-900/20 text-blue-400' : 'border-zinc-800 hover:bg-zinc-800/50 text-zinc-400'}`}
            >
              {useVirtualControls ? 'USANDO JOYSTICK VIRTUAL' : 'USAR ZONAS TÁCTILES'}
            </button>
            <button
              onClick={() => setGameState(GameState.MENU)}
              className="w-full py-3 border border-red-900/50 hover:bg-red-900/20 text-red-400 rounded-lg text-xs tracking-tighter transition-colors mt-4"
            >
              ABANDONAR
            </button>
          </div>
        </div>
      )
      }

      {/* Menu Screen */}
      {
        gameState === GameState.MENU && (
          <div className="absolute inset-0 z-50 flex flex-col items-center bg-black overflow-y-auto text-center" style={{ paddingLeft: 'calc(100vw - 100%)' }}>

            {/* Top User Badge Moved to HUD to prevent cutoff */}

            <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(circle_at_center,_#3b82f6_0%,_transparent_70%)]"></div>

            <div className="flex flex-col items-center justify-start w-full min-h-screen pt-32 pb-8 z-10 mx-auto">
              <h1 className="text-4xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-blue-400 to-blue-700 mb-1 tracking-tighter drop-shadow-2xl">
                ARKANOID
              </h1>
              <p className="text-[8px] text-blue-400/50 mb-10 tracking-[0.3em] whitespace-nowrap">BATTLE ARCADE SYSTEM</p>

              <div className="flex flex-col gap-2 w-full max-w-xs">
                <div className="flex items-center gap-4 w-full justify-center mb-2">
                  <svg width="40" height="40" viewBox="0 0 40 40" className="animate-bounce shrink-0 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]">
                    <rect x="8" y="28" width="24" height="4" rx="2" fill="#18181b" />
                    <rect x="8" y="24" width="24" height="6" rx="2" fill="#3f3f46" />
                    <rect x="10" y="25" width="20" height="2" fill="#52525b" />
                    <path d="M18 14 h4 l1 10 h-6 z" fill="#a1a1aa" />
                    <path d="M19 14 h2 l0.5 10 h-3 z" fill="#e4e4e7" />
                    <circle cx="20" cy="10" r="6" fill="#ef4444" />
                    <circle cx="18" cy="8" r="2" fill="#fca5a5" opacity="0.6" />
                    <circle cx="28" cy="24" r="2" fill="#ef4444" />
                  </svg>
                  <button
                    onClick={startGame}
                    className="group relative flex-1 px-4 py-5 bg-blue-600 hover:bg-blue-500 text-white border-b-8 border-blue-900 active:border-b-0 active:translate-y-2 transition-all rounded-lg overflow-hidden flex items-center justify-center"
                  >
                    <span className="relative z-10 text-xl drop-shadow-md text-center">JUGAR</span>
                    <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform"></div>
                  </button>
                  <svg width="40" height="40" viewBox="0 0 40 40" className="animate-bounce shrink-0 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]" style={{ animationDelay: '0.2s' }}>
                    <rect x="8" y="28" width="24" height="4" rx="2" fill="#18181b" />
                    <rect x="8" y="24" width="24" height="6" rx="2" fill="#3f3f46" />
                    <rect x="10" y="25" width="20" height="2" fill="#52525b" />
                    <path d="M18 14 h4 l1 10 h-6 z" fill="#a1a1aa" />
                    <path d="M19 14 h2 l0.5 10 h-3 z" fill="#e4e4e7" />
                    <circle cx="20" cy="10" r="6" fill="#ef4444" />
                    <circle cx="18" cy="8" r="2" fill="#fca5a5" opacity="0.6" />
                    <circle cx="28" cy="24" r="2" fill="#ef4444" />
                  </svg>
                </div>

                {currentUser && (
                  <button
                    onClick={() => setShowShop(true)}
                    className="w-full px-4 py-4 bg-zinc-900 hover:bg-zinc-800 text-yellow-500 font-bold border-2 border-yellow-900/50 hover:border-yellow-500 rounded-lg text-sm tracking-widest transition-all mt-1 flex justify-center items-center gap-3 shadow-[0_0_15px_rgba(234,179,8,0.1)] hover:shadow-[0_0_20px_rgba(234,179,8,0.3)]"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400">
                      <circle cx="9" cy="21" r="1"></circle>
                      <circle cx="20" cy="21" r="1"></circle>
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    TIENDA
                  </button>
                )}

              {currentUser ? (
                <button
                  onClick={logout}
                  className="mt-2 w-full px-4 py-3 bg-zinc-950 hover:bg-zinc-900 text-red-500/80 hover:text-red-500 border border-zinc-900 hover:border-red-900/50 rounded-lg text-[10px] tracking-tighter transition-all"
                >
                  CERRAR SESIÓN
                </button>
              ) : (
                <div className="flex gap-4 w-full">
                  <button
                    onClick={() => setAuthModal('register')}
                    className="flex-1 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 text-blue-400 border border-zinc-800 hover:border-blue-500/50 rounded-lg text-xs tracking-tighter transition-all"
                  >
                    Crear Cuenta
                  </button>
                  <button
                    onClick={() => setAuthModal('login')}
                    className="flex-1 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border border-zinc-800 hover:border-emerald-500/50 rounded-lg text-xs tracking-tighter transition-all"
                  >
                    Ingresar
                  </button>
                </div>
              )}

              {/* Top 50 Leaderboard */}
              {leaderboard.length > 0 && (
                <div className="mt-8 bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 w-full">
                  <h3 className="text-[10px] text-zinc-400 text-center uppercase tracking-widest mb-4">Top 50 - Salón de la Fama</h3>
                  <div className="flex flex-col gap-3 max-h-[140px] overflow-y-auto pr-2 
                  [&::-webkit-scrollbar]:w-1.5
                  [&::-webkit-scrollbar-track]:bg-zinc-950/50 
                  [&::-webkit-scrollbar-track]:rounded-full
                  [&::-webkit-scrollbar-thumb]:bg-zinc-700 
                  [&::-webkit-scrollbar-thumb]:rounded-full 
                  hover:[&::-webkit-scrollbar-thumb]:bg-zinc-500"
                  >
                    {leaderboard.map((entry, index) => (
                      <div key={index} className="flex justify-between items-center text-xs">
                        <div className="flex gap-3">
                          <span className={index === 0 ? "text-yellow-500" : index === 1 ? "text-zinc-300" : index === 2 ? "text-amber-600" : "text-zinc-600"}>
                            #{index + 1}
                          </span>
                          <span className="text-white uppercase truncate max-w-[120px]">{entry.name}</span>
                        </div>
                        <span className="text-cyan-400">{entry.score.toString().padStart(6, '0')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-12 flex gap-8 text-[7px] text-zinc-600 uppercase">
              <div className="text-center">
                <p className="text-blue-500 mb-1">Mover</p>
                <p>◀ ▶ Lados</p>
              </div>
              <div className="text-center">
                <p className="text-blue-500 mb-1">Lanzar</p>
                <p>Centro</p>
              </div>
            </div>

            <div className="absolute bottom-4 right-4 text-[7px] text-zinc-700">
              por <span className="text-blue-600">JosiElPro</span>
            </div>

            {renderAuthModal()}
            </div>
          </div>
        )
      }

      {/* Game Over Screen */}
      {
        gameState === GameState.GAME_OVER && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-lg p-4 text-center">
            <div className="w-full flex flex-col items-center justify-center">
              <h1 className="text-4xl md:text-7xl font-bold text-red-600 mb-4 drop-shadow-[0_0_20px_rgba(220,38,38,0.5)]">
                FIN DEL JUEGO
              </h1>
              <p className="text-lg text-white mb-8 uppercase tracking-widest">
                Puntos: <span className="text-cyan-400 font-bold">{score}</span>
              </p>

              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={startGame}
                  className="px-10 py-5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-lg border-b-8 border-red-900 active:border-b-0 active:translate-y-2 transition-all shadow-xl"
                >
                  REINTENTAR
                </button>
                <button
                  onClick={() => setGameState(GameState.MENU)}
                  className="px-8 py-3 text-zinc-500 hover:text-white transition-colors text-sm uppercase tracking-tighter"
                >
                  Menú
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Overlays */}
      {renderShopModal()}
    </div >
  );
};

export default App;

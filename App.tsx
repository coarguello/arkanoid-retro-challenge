import React, { useState, useEffect } from 'react';
import { GameState, LeaderboardEntry, ShipConfig, UserInventory, ShopItem, ShopCategory, AdminUserData } from './types';
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
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp, query, orderBy, limit, getDocs, deleteDoc } from 'firebase/firestore';
import { Network } from '@capacitor/network';
import { SHOP_ITEMS } from './shopData';

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
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineNotice, setShowOfflineNotice] = useState(false);
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
  const [shopTab, setShopTab] = useState<'paddle' | 'ball' | 'background' | 'block' | 'exchange' | 'gacha'>('paddle');
  const [isMuted, setIsMuted] = useState(false);
  const [useGyroscope, setUseGyroscope] = useState(() => {
    return localStorage.getItem('arkanoid_use_gyroscope') !== 'false';
  });

  const handleSetGyroscope = (val: boolean) => {
    setUseGyroscope(val);
    localStorage.setItem('arkanoid_use_gyroscope', val.toString());
  };

  const [discountedItemId, setDiscountedItemId] = useState<string | null>(null);
  const [gachaReward, setGachaReward] = useState<ShopItem | null>(null);
  const [isGachaDuplicate, setIsGachaDuplicate] = useState(false);
  const [isGachaRolling, setIsGachaRolling] = useState(false);

  // --- Admin Panel State ---
  const ADMIN_EMAIL = 'arguellomolina.josias@gmail.com';
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUserData[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminConfirm, setAdminConfirm] = useState<{ type: string; uid: string; username: string; itemId?: string } | null>(null);
  const [adminItemTarget, setAdminItemTarget] = useState<string | null>(null); // uid of user whose items are being managed

  // --- Bug Reporter State ---
  const [showBugReporter, setShowBugReporter] = useState(false);
  const [bugReportText, setBugReportText] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [bugReportStatus, setBugReportStatus] = useState<{type: 'success'|'error', text: string} | null>(null);

  useEffect(() => {
    if (isMuted) { stopMusic(); return; }
    if (gameState === GameState.MENU) playMenuMusic();
    else if (gameState === GameState.PLAYING) playGameMusic();
    else if (gameState === GameState.GAME_OVER) playGameOverMusic();
    return () => stopMusic();
  }, [gameState, isMuted]);

  const handleToggleMute = () => setIsMuted(audioToggleMute());

  const syncInventory = (newInv: UserInventory) => {
    localStorage.setItem('arkanoid_inventory', JSON.stringify(newInv));
    if (currentUser && isOnline) {
      setDoc(doc(db, 'users', currentUser), { inventory: newInv }, { merge: true })
        .catch(e => console.error("Error syncing inventory:", e));
    }
  };

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

        // 2. Push high score to Firestore Database (Only if it's their best and online)
        const saveScoreToCloud = async () => {
          if (!isOnline) return;
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
          syncInventory(newInv);
          return newInv;
        });
      }

      // Roll a random daily discount item
      // (Uses the global SHOP_ITEMS defined further down. For initial mount logic, we can leave as is)
    }
  }, [gameState, score, currentUser, currentUsername]);

  // Fetch Global Leaderboard when returning to Menu (Only if online)
  useEffect(() => {
    if (gameState === GameState.MENU && isOnline) {
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

          // Filter out banned users
          const filteredScores: LeaderboardEntry[] = [];
          for (const entry of uniqueScores) {
            const uid = querySnapshot.docs.find(d => d.data().username === entry.name)?.id;
            if (uid) {
              try {
                const userSnap = await getDoc(doc(db, 'users', uid));
                if (userSnap.exists() && userSnap.data().isBanned) continue;
              } catch { /* if we can't read, include them */ }
            }
            filteredScores.push(entry);
          }

          setLeaderboard(filteredScores.slice(0, 50));
          localStorage.setItem('arkanoid_leaderboard', JSON.stringify(filteredScores.slice(0, 50)));
        } catch (e) {
          console.error("Error fetching leaderboard: ", e);
        }
      };
      fetchLeaderboard();
    }
  }, [gameState, isOnline]);

  // Offline detection and persistence (Native via Capacitor Network)
  useEffect(() => {
    // Initial fetch
    Network.getStatus().then(status => {
      setIsOnline(status.connected);
    });

    const handleNetworkChange = async (status: any) => {
      setIsOnline(status.connected);
    };

    Network.addListener('networkStatusChange', handleNetworkChange);

    return () => {
      Network.removeAllListeners();
    };
  }, []);

  const triggerOfflineNotice = () => {
    setShowOfflineNotice(true);
    setTimeout(() => setShowOfflineNotice(false), 3000);
  };

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
        syncInventory(newInv);
        return newInv;
      }
      return prev;
    });
  };

  const sendBugReportToDiscord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugReportText.trim()) return;

    setIsSubmittingReport(true);
    setBugReportStatus(null);
    
    try {
      // Simple Profanity Filter (Blocking)
      const badWords = /put[oa]s?|mierda|carajo|pendej[oa]s?|cabr[oó]n|huev[oó]n|pelotud[oa]s?|bolud[oa]s?|concha|cul[oa]s?|verga|pija|chot[oa]s?|soretes?|cag[oó]n/gi;
      if (badWords.test(bugReportText)) {
        setIsSubmittingReport(false);
        setBugReportStatus({ type: 'error', text: 'El mensaje contiene lenguaje inapropiado.' });
        return;
      }

      const webhookUrl = import.meta.env.VITE_DISCORD_WEBHOOK_URL;
      if (!webhookUrl) throw new Error("Webhook no configurado");

      const payload = {
        content: `**⚠️ Nuevo Reporte de Bug en Core Breaker**\n**Piloto:** ${currentUsername || 'Anónimo'} (${currentUser || 'No registrado'})\n**Mensaje:**\n${bugReportText}`,
      };

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      setBugReportStatus({ type: 'success', text: '¡Reporte enviado exitosamente!' });
      setBugReportText('');
      setTimeout(() => {
        setShowBugReporter(false);
        setBugReportStatus(null);
      }, 2000);
    } catch (e) {
      console.error(e);
      setBugReportStatus({ type: 'error', text: 'Error al enviar reporte. Intenta más tarde.' });
    } finally {
      setIsSubmittingReport(false);
    }
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

  // Listen to Firebase Auth state (Sync data only if online)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && isOnline) {
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
              unlockedIds: ['paddle_default', 'ball_default', 'bg_default', 'block_default'],
              equipped: { paddle: 'paddle_default', ball: 'ball_default', background: 'bg_default', block: 'block_default' },
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
        // Either the user is truly logged out, or they lost internet connection
        // Force the app to treat them as unauthenticated and give offline defaults.
        setCurrentUser(null);
        setCurrentUsername(null);
        setPersonalScore(0);
        localStorage.removeItem('arkanoid_user');

        const defaultInventory: UserInventory = {
          coins: 0,
          totalPoints: 0,
          unlockedIds: ['paddle_default', 'ball_default', 'bg_default', 'block_default'],
          equipped: { paddle: 'paddle_default', ball: 'ball_default', background: 'bg_default', block: 'block_default' },
          isBossDefeated: false
        };
        setInventory(defaultInventory);
      }
    });

    return () => unsubscribe();
  }, [isOnline]); // Trigger whenever connection changes


  // ===== ADMIN PANEL FUNCTIONS =====

  const loadAllUsers = async () => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const users: AdminUserData[] = [];
      snap.forEach(d => {
        const data = d.data();
        const inv = data.inventory || {};
        users.push({
          uid: d.id,
          username: data.username || 'Desconocido',
          coins: inv.coins ?? 0,
          lastActive: data.lastActive || '',
          isBanned: data.isBanned || false,
          equipped: inv.equipped || { paddle: '-', ball: '-', background: '-', block: '-' },
          unlockedIds: inv.unlockedIds || [],
        });
      });
      // sort by lastActive descending
      users.sort((a, b) => b.lastActive.localeCompare(a.lastActive));
      setAdminUsers(users);
    } catch (e) {
      setAdminError('Error cargando usuarios. Verifica tu conexión.');
    } finally {
      setAdminLoading(false);
    }
  };

  const adminDeleteUser = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      await deleteDoc(doc(db, 'leaderboards', uid));
      setAdminUsers(prev => prev.filter(u => u.uid !== uid));
    } catch (e) {
      setAdminError('Error al borrar el usuario.');
    }
  };

  const adminResetScore = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'leaderboards', uid));
      setAdminUsers(prev => prev); // just re-render, score is external
    } catch (e) {
      setAdminError('Error al resetear el puntaje.');
    }
  };

  const adminBanFromRanking = async (uid: string, isBanned: boolean) => {
    try {
      const userRef = doc(db, 'users', uid);
      await setDoc(userRef, { isBanned: !isBanned }, { merge: true });
      setAdminUsers(prev => prev.map(u => u.uid === uid ? { ...u, isBanned: !isBanned } : u));
    } catch (e) {
      setAdminError('Error al modificar el ban.');
    }
  };

  const adminRemoveCoins = async (uid: string) => {
    try {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const inv = snap.data().inventory || {};
        const newInv = { ...inv, coins: 0 };
        await setDoc(userRef, { inventory: newInv }, { merge: true });
        setAdminUsers(prev => prev.map(u => u.uid === uid ? { ...u, coins: 0 } : u));
      }
    } catch (e) {
      setAdminError('Error al quitar monedas.');
    }
  };

  const adminRemoveItem = async (uid: string, itemId: string) => {
    try {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const inv = snap.data().inventory || {};
        const newUnlocked = (inv.unlockedIds || []).filter((id: string) => id !== itemId);
        // If item was equipped, reset to default
        const newEquipped = { ...inv.equipped };
        if (newEquipped.paddle === itemId) newEquipped.paddle = 'paddle_default';
        if (newEquipped.ball === itemId) newEquipped.ball = 'ball_default';
        if (newEquipped.background === itemId) newEquipped.background = 'bg_default';
        if (newEquipped.block === itemId) newEquipped.block = 'block_default';
        const newInv = { ...inv, unlockedIds: newUnlocked, equipped: newEquipped };
        await setDoc(userRef, { inventory: newInv }, { merge: true });
        setAdminUsers(prev => prev.map(u => u.uid === uid
          ? { ...u, unlockedIds: newUnlocked, equipped: newEquipped }
          : u));
      }
    } catch (e) {
      setAdminError('Error al quitar el ítem.');
    }
  };

  const formatLastActive = (iso: string): string => {
    if (!iso) return 'Nunca';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora mismo';
    if (mins < 60) return `Hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Hace ${hrs} h`;
    const days = Math.floor(hrs / 24);
    return `Hace ${days} día${days > 1 ? 's' : ''}`;
  };

  const handleAdminConfirm = async () => {
    if (!adminConfirm) return;
    const { type, uid, itemId } = adminConfirm;
    if (type === 'delete') await adminDeleteUser(uid);
    else if (type === 'reset') await adminResetScore(uid);
    else if (type === 'coins') await adminRemoveCoins(uid);
    else if (type === 'item' && itemId) await adminRemoveItem(uid, itemId);
    setAdminConfirm(null);
    setAdminItemTarget(null);
  };

  // ===== END ADMIN PANEL FUNCTIONS =====

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
          unlockedIds: ['paddle_default', 'ball_default', 'bg_default', 'block_default'],
          equipped: { paddle: 'paddle_default', ball: 'ball_default', background: 'bg_default', block: 'block_default' },
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
      } else if (error.code === 'auth/too-many-requests') {
        setAuthError('Demasiados intentos. Intenta más tarde.');
      } else if (error.code === 'auth/weak-password') {
        setAuthError('La contraseña debe tener al menos 6 caracteres.');
      } else {
        setAuthError(`Error de sistema: ${error.code || 'Desconocido'}. Intenta nuevamente.`);
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
        unlockedIds: ['paddle_default', 'ball_default', 'bg_default', 'block_default'],
        equipped: { paddle: 'paddle_default', ball: 'ball_default', background: 'bg_default', block: 'block_default' },
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
              {!isReset && (
                <button
                  onClick={() => setAuthModal('reset')}
                  className="text-xs font-sans text-zinc-500 hover:text-blue-400 transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              )}
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
        syncInventory(newInv);
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
        syncInventory(newInv);
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
        syncInventory(newInv);
        return newInv;
      }
      return prev;
    });
  };

  const handleGachaRoll = () => {
    if (isGachaRolling) return;

    setInventory(currentInv => {
      if (currentInv.coins < 500) return currentInv;

      // All items are in the pool for the Mystery Box, including boss items
      const availableItems = SHOP_ITEMS;

      if (availableItems.length === 0) return currentInv;

      setIsGachaRolling(true);
      setGachaReward(null);
      setIsGachaDuplicate(false);

      // Take coins immediately
      const newInv = { ...currentInv, coins: currentInv.coins - 500 };
      syncInventory(newInv);

      // Simulate roulette delay
      setTimeout(() => {
        // Weighted random drop table
        const weightedItems = availableItems.map(it => {
          let weight = Math.max(1, 10000 / (it.price + 100));
          if (it.unlockCondition === 'boss_kill') {
            // Extremely rare chance for boss items (approx 0.00006% drop rate)
            weight = 0.00036;
          }
          return { item: it, weight };
        });
        
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
            syncInventory(finalInv);
            return finalInv;
          } else {
            // Give a 100 coin consolation refund for duplicates
            const refundInv = { ...latestInv, coins: latestInv.coins + 100 };
            syncInventory(refundInv);
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
                { id: 'block', label: 'BLOQUES', icon: '🧱' },
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
                      ¿Te sientes con suerte? Invierte 500 monedas y obtén un objeto aleatorio. Si sale repetido, te devolvemos 100 monedas.<br />
                      <span className="text-purple-400 font-bold block mt-2">¡Incluso podrías ganar los objetos más caros!</span>
                    </p>

                    {gachaReward && !isGachaRolling && (
                      <div className={`mb-8 p-6 bg-zinc-950/80 border rounded-xl animate-in zoom-in duration-500 shadow-[0_0_30px_rgba(16,185,129,0.2)] ${isGachaDuplicate ? 'border-yellow-500/30 shadow-[0_0_30px_rgba(234,179,8,0.2)]' : 'border-emerald-500/30'}`}>
                        <span className={`text-xs uppercase tracking-widest block mb-2 font-black animate-pulse ${isGachaDuplicate ? 'text-yellow-500' : 'text-emerald-400'}`}>
                          {isGachaDuplicate ? '¡OBJETO DUPLICADO!' : '¡HAS OBTENIDO!'}
                        </span>
                        <h4 className="text-2xl font-black text-white">{gachaReward.name}</h4>
                        <p className="text-zinc-500 text-xs mt-1">({gachaReward.type === 'paddle' ? 'barra' : gachaReward.type === 'ball' ? 'pelota' : 'fondo'}) Valor original: {gachaReward.price} 🪙</p>
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
                            <div className="w-16 h-4 rounded-sm shadow-lg" style={{ 
                              background: item.effectType === 'neon_hollow' ? 'rgba(0,0,0,0.6)' : item.effectType === 'synthwave' ? `linear-gradient(90deg, ${item.colorPrimary}, ${item.colorSecondary})` : item.colorPrimary,
                              border: item.effectType === 'neon_hollow' ? '1px solid #fff' : 'none',
                              boxShadow: item.effectType === 'neon_hollow' ? `0 0 8px 2px ${item.colorPrimary}, inset 0 0 4px ${item.colorPrimary}` : 'none'
                             }}></div>
                          )}
                          {item.type === 'ball' && (
                            <div className="w-6 h-6 rounded-full shadow-xl" style={{ 
                              background: item.effectType === 'neon_hollow' ? 'rgba(0,0,0,0.6)' : item.colorPrimary, 
                              border: item.effectType === 'neon_hollow' ? '1px solid #fff' : 'none',
                              boxShadow: item.effectType === 'neon_hollow' ? `0 0 8px 2px ${item.colorPrimary}, inset 0 0 4px ${item.colorPrimary}` : item.effectType === 'fire' ? '0 0 20px #f97316' : item.effectType === 'rainbow' ? '0 0 15px #fff' : 'none' 
                             }}></div>
                          )}
                          {item.type === 'block' && (
                            <div className="flex flex-col gap-1 items-center z-10 p-2 relative">
                              <div className="w-12 h-4 rounded-sm" style={{ 
                                background: (item.effectType === 'neon_hollow' || item.effectType === 'neon_hollow_interleaved') ? 'rgba(0,0,0,0.6)' 
                                          : (item.colorSecondary && !item.effectType) ? `linear-gradient(180deg, ${item.colorPrimary}, ${item.colorSecondary})` : item.colorPrimary,
                                border: (item.effectType === 'neon_hollow' || item.effectType === 'neon_hollow_interleaved') ? `1px solid #fff` : item.effectType === 'synthwave' ? `2px solid ${item.colorSecondary}` : '1px solid rgba(0,0,0,0.5)',
                                boxShadow: (item.effectType === 'neon_hollow' || item.effectType === 'neon_hollow_interleaved') ? `0 0 8px 2px ${item.colorPrimary}, inset 0 0 4px ${item.colorPrimary}` 
                                           : item.effectType === 'ghost' ? `0 0 10px ${item.colorPrimary}` : 'none',
                                opacity: item.effectType === 'ice' || item.effectType === 'ghost' ? 0.6 : 1
                              }}></div>
                              {item.effectType === 'neon_hollow_interleaved' && (
                                <div className="w-12 h-4 rounded-sm" style={{ 
                                  background: 'rgba(0,0,0,0.6)',
                                  border: `1px solid #fff`,
                                  boxShadow: `0 0 8px 2px ${item.colorSecondary || item.colorPrimary}, inset 0 0 4px ${item.colorSecondary || item.colorPrimary}`
                                }}></div>
                              )}
                            </div>
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
        useGyroscope={useGyroscope}
      />

      {/* HUD overlaid on top of canvas */}
      <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-4 z-[60] bg-gradient-to-b from-black/90 to-transparent pointer-events-none">

        {/* Left Side */}
        <div className="flex flex-col gap-0.5 flex-1 items-start">
          {gameState === GameState.PLAYING || gameState === GameState.PAUSED ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-[7px] text-zinc-500 uppercase">Récord</span>
                {!isOnline && <span className="text-[6px] bg-red-600 text-white px-1 rounded animate-pulse">SIN RED</span>}
              </div>
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
          {(!gameState || true) /* Ensure it renders */ && typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && (
             <div className="flex gap-1 bg-black/50 border border-zinc-800 rounded-lg p-1">
                <button
                  onClick={() => handleSetGyroscope(true)}
                  title="Activar Giratorio"
                  className={`p-1.5 rounded transition-colors ${useGyroscope ? 'bg-emerald-900/50 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <div className="relative flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="10" x="4" y="7" rx="2" ry="2"/><line x1="20" x2="20" y1="12" y2="12"/></svg>
                    <span className="absolute -left-2 text-[10px] animate-pulse">⤾</span>
                    <span className="absolute -right-2 text-[10px] animate-pulse">⤿</span>
                  </div>
                </button>
                <button
                  onClick={() => handleSetGyroscope(false)}
                  title="Activar No Giratorio"
                  className={`p-1.5 rounded transition-colors ${!useGyroscope ? 'bg-red-900/50 text-red-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="10" x="4" y="7" rx="2" ry="2"/><line x1="20" x2="20" y1="12" y2="12"/></svg>
                </button>
             </div>
          )}
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

          {/* Bug Reporter Button HUD */}
          {gameState === GameState.PLAYING && (
            <button
              onClick={() => setShowBugReporter(true)}
              className="p-2 bg-black/50 border border-amber-900/50 rounded-lg text-amber-500 hover:bg-amber-900/20 hover:text-amber-400 transition-colors"
              title="Reportar Error"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
            </button>
          )}

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

            <div className="grid grid-cols-2 gap-2 w-full mt-2">
              <button
                onClick={() => handleSetGyroscope(true)}
                className={`p-3 border rounded-lg flex flex-col items-center justify-center gap-2 transition-all ${useGyroscope ? 'border-emerald-500 bg-emerald-900/20 text-emerald-400' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
              >
                <div className="relative flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="10" x="4" y="7" rx="2" ry="2"/><line x1="20" x2="20" y1="12" y2="12"/></svg>
                  <span className="absolute -left-4 text-[12px] animate-pulse">⤾</span>
                  <span className="absolute -right-4 text-[12px] animate-pulse">⤿</span>
                </div>
                <span className="text-[7px] tracking-widest uppercase text-center mt-1">Giratorio</span>
              </button>
              
              <button
                onClick={() => handleSetGyroscope(false)}
                className={`p-3 border rounded-lg flex flex-col items-center justify-center gap-2 transition-all ${!useGyroscope ? 'border-red-500 bg-red-900/20 text-red-400' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="10" x="4" y="7" rx="2" ry="2"/><line x1="20" x2="20" y1="12" y2="12"/></svg>
                <span className="text-[7px] tracking-widest uppercase text-center mt-1">No Giratorio</span>
              </button>
            </div>
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

            <div className="flex flex-col items-center justify-start w-full min-h-[100dvh] pt-8 md:pt-16 pb-4 sm:pb-8 z-10 mx-auto overflow-y-auto">
              <h1 className="flex flex-row items-center justify-center gap-3 sm:gap-4 text-4xl sm:text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-blue-400 to-blue-700 mb-2 tracking-tight drop-shadow-2xl text-center">
                <span>CORE</span>
                <span>BREAKER</span>
              </h1>
              <p className="text-[8px] text-blue-400/50 mb-4 sm:mb-8 md:mb-10 tracking-[0.3em] whitespace-nowrap">BATTLE ARCADE SYSTEM</p>

              <div className="flex flex-col gap-2 w-full max-w-xs">
                <div className="flex items-center gap-2 sm:gap-4 w-full justify-center mb-2">
                  <svg width="40" height="40" viewBox="0 0 40 40" className="animate-bounce shrink-0 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)] scale-75 sm:scale-100">
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
                    className="group relative flex-1 px-4 py-3 sm:py-5 bg-blue-600 hover:bg-blue-500 text-white border-b-8 border-blue-900 active:border-b-0 active:translate-y-2 transition-all rounded-lg overflow-hidden flex items-center justify-center"
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
                    onClick={() => isOnline ? setShowShop(true) : triggerOfflineNotice()}
                    className={`w-full px-4 py-4 bg-zinc-900 text-yellow-500 font-bold border-2 rounded-lg text-sm tracking-widest transition-all mt-1 flex justify-center items-center gap-3 shadow-[0_0_15px_rgba(234,179,8,0.1)] ${isOnline ? 'hover:bg-zinc-800 border-yellow-900/50 hover:border-yellow-500 hover:shadow-[0_0_20px_rgba(234,179,8,0.3)]' : 'opacity-70 border-zinc-800'}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isOnline ? "text-yellow-400" : "text-zinc-600"}>
                      <circle cx="9" cy="21" r="1"></circle>
                      <circle cx="20" cy="21" r="1"></circle>
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    TIENDA
                  </button>
                )}

              {currentUser ? (
                <>
                  {/* ADMIN BUTTON - Only visible for JosiElPro */}
                  {auth.currentUser?.email === ADMIN_EMAIL && (
                    <button
                      onClick={() => { setShowAdminPanel(true); loadAllUsers(); }}
                      className="mt-2 w-full px-4 py-3 bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 hover:text-purple-100 border border-purple-900/50 hover:border-purple-500/50 rounded-lg text-[10px] tracking-tighter transition-all flex items-center justify-center gap-2"
                    >
                      🔐 PANEL ADMIN
                    </button>
                  )}
                  <button
                    onClick={logout}
                    className="mt-2 w-full px-4 py-3 bg-zinc-950 hover:bg-zinc-900 text-red-500/80 hover:text-red-500 border border-zinc-900 hover:border-red-900/50 rounded-lg text-[10px] tracking-tighter transition-all"
                  >
                    CERRAR SESIÓN
                  </button>
                </>
               ) : (
                <div className="flex gap-4 w-full">
                  <button
                    onClick={() => isOnline ? setAuthModal('register') : triggerOfflineNotice()}
                    className={`flex-1 px-4 py-3 bg-zinc-900 text-blue-400 border rounded-lg text-xs tracking-tighter transition-all ${isOnline ? 'hover:bg-zinc-800 border-zinc-800 hover:border-blue-500/50' : 'opacity-50 border-zinc-900'}`}
                  >
                    Crear Cuenta
                  </button>
                  <button
                    onClick={() => isOnline ? setAuthModal('login') : triggerOfflineNotice()}
                    className={`flex-1 px-4 py-3 bg-zinc-900 text-emerald-400 border rounded-lg text-xs tracking-tighter transition-all ${isOnline ? 'hover:bg-zinc-800 border-zinc-800 hover:border-emerald-500/50' : 'opacity-50 border-zinc-900'}`}
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

            <div className="mt-4 md:mt-12 hidden sm:flex gap-8 text-[7px] text-zinc-600 uppercase">
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
              <h1 className="text-xl sm:text-3xl md:text-6xl font-black text-red-600 mb-2 sm:mb-4 drop-shadow-[0_0_20px_rgba(220,38,38,0.5)] whitespace-nowrap">
                FIN DEL JUEGO
              </h1>
              <p className="text-sm sm:text-lg text-white mb-4 sm:mb-8 uppercase tracking-widest">
                Puntos: <span className="text-cyan-400 font-bold">{score}</span>
              </p>

              <div className="flex flex-col gap-2 sm:gap-3 w-full max-w-[250px] sm:max-w-xs">
                <button
                  onClick={startGame}
                  className="px-8 py-3 sm:px-10 sm:py-5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-base sm:text-lg border-b-4 sm:border-b-8 border-red-900 active:border-b-0 active:translate-y-1 sm:active:translate-y-2 transition-all shadow-xl"
                >
                  REINTENTAR
                </button>
                <button
                  onClick={() => setGameState(GameState.MENU)}
                  className="px-6 py-2 sm:px-8 sm:py-3 text-zinc-500 hover:text-white transition-colors text-xs sm:text-sm uppercase tracking-tighter"
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

      {/* ADMIN PANEL MODAL */}
      {showAdminPanel && (
        <div className="absolute inset-0 z-[150] bg-black/90 backdrop-blur-sm flex flex-col overflow-hidden">
          <div className="flex flex-col h-full max-w-2xl mx-auto w-full p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h2 className="text-purple-300 font-bold text-lg">🔐 PANEL ADMIN</h2>
                <p className="text-zinc-500 text-xs">{adminLoading ? 'Cargando...' : `${adminUsers.length} pilotos registrados`}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={loadAllUsers} className="text-xs text-zinc-400 hover:text-white border border-zinc-700 px-3 py-1 rounded-lg transition-colors">↺ Actualizar</button>
                <button onClick={() => { setShowAdminPanel(false); setAdminUsers([]); setAdminItemTarget(null); setAdminError(null); }} className="text-zinc-500 hover:text-white text-xl px-2">✕</button>
              </div>
            </div>

            {adminError && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-300 text-xs p-3 rounded-lg mb-3 shrink-0">{adminError}</div>
            )}

            {/* User List */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
              {adminLoading && (
                <div className="text-center text-zinc-500 py-10">Cargando pilotos...</div>
              )}
              {!adminLoading && adminUsers.map(u => {
                const paddleName = SHOP_ITEMS.find(i => i.id === u.equipped?.paddle)?.name || u.equipped?.paddle;
                const ballName = SHOP_ITEMS.find(i => i.id === u.equipped?.ball)?.name || u.equipped?.ball;
                const isShowingItems = adminItemTarget === u.uid;
                const purchasedItems = SHOP_ITEMS.filter(i => (u.unlockedIds || []).includes(i.id) && i.id !== 'paddle_default' && i.id !== 'ball_default' && i.id !== 'bg_default' && i.id !== 'block_default');

                return (
                  <div key={u.uid} className={`bg-zinc-900/80 border rounded-xl p-3 transition-colors ${u.isBanned ? 'border-red-900/50' : 'border-zinc-800'}`}>
                    {/* Row header */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-bold truncate">
                          {u.isBanned && <span className="text-red-500 mr-1">🔇</span>}{u.username}
                        </p>
                        <p className="text-zinc-500 text-[10px]">💰 {u.coins} monedas  ·  🕐 {formatLastActive(u.lastActive)}</p>
                        <p className="text-zinc-600 text-[10px] truncate">🏓 {paddleName}  ·  ⚽ {ballName}</p>
                      </div>
                      {/* Action buttons */}
                      <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                        <button onClick={() => setAdminConfirm({ type: 'reset', uid: u.uid, username: u.username })} className="text-[9px] px-2 py-1 bg-blue-900/40 text-blue-300 hover:bg-blue-800/60 border border-blue-900/50 rounded transition-colors">↺ SCORE</button>
                        <button onClick={() => adminBanFromRanking(u.uid, !!u.isBanned)} className={`text-[9px] px-2 py-1 border rounded transition-colors ${u.isBanned ? 'bg-green-900/40 text-green-300 border-green-900/50 hover:bg-green-800/60' : 'bg-orange-900/40 text-orange-300 border-orange-900/50 hover:bg-orange-800/60'}`}>{u.isBanned ? '✓ DESBANEAR' : '🔇 BANEAR'}</button>
                        <button onClick={() => setAdminConfirm({ type: 'coins', uid: u.uid, username: u.username })} className="text-[9px] px-2 py-1 bg-yellow-900/40 text-yellow-300 hover:bg-yellow-800/60 border border-yellow-900/50 rounded transition-colors">💸 MONEDAS</button>
                        <button onClick={() => setAdminItemTarget(isShowingItems ? null : u.uid)} className="text-[9px] px-2 py-1 bg-indigo-900/40 text-indigo-300 hover:bg-indigo-800/60 border border-indigo-900/50 rounded transition-colors">🎮 ÍTEMS</button>
                        <button onClick={() => setAdminConfirm({ type: 'delete', uid: u.uid, username: u.username })} className="text-[9px] px-2 py-1 bg-red-900/40 text-red-400 hover:bg-red-800/60 border border-red-900/50 rounded transition-colors">🗑️ BORRAR</button>
                      </div>
                    </div>

                    {/* Item list (expandable) */}
                    {isShowingItems && (
                      <div className="mt-2 border-t border-zinc-700 pt-2">
                        <p className="text-[9px] text-zinc-500 mb-1">Ítems comprados ({purchasedItems.length}):</p>
                        {purchasedItems.length === 0 && <p className="text-[9px] text-zinc-600">Sin ítems extra.</p>}
                        <div className="flex flex-wrap gap-1">
                          {purchasedItems.map(item => (
                            <button key={item.id} onClick={() => setAdminConfirm({ type: 'item', uid: u.uid, username: u.username, itemId: item.id })} className="text-[9px] px-2 py-0.5 bg-zinc-800 hover:bg-red-900/40 text-zinc-300 hover:text-red-300 border border-zinc-700 hover:border-red-700 rounded transition-colors">
                              {item.name} ✕
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ADMIN CONFIRM DIALOG */}
      {adminConfirm && (
        <div className="absolute inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-950 border-2 border-red-900/50 rounded-2xl p-6 w-full max-w-xs text-center shadow-[0_0_50px_rgba(239,68,68,0.2)]">
            <p className="text-red-400 text-2xl mb-2">
              {adminConfirm.type === 'delete' ? '🗑️' : adminConfirm.type === 'reset' ? '↺' : adminConfirm.type === 'coins' ? '💸' : '🎮'}
            </p>
            <p className="text-white font-bold text-sm mb-1">
              {adminConfirm.type === 'delete' && '¿Borrar todos los datos de esta cuenta?'}
              {adminConfirm.type === 'reset' && '¿Resetear el puntaje de este jugador?'}
              {adminConfirm.type === 'coins' && '¿Quitar todas las monedas?'}
              {adminConfirm.type === 'item' && `¿Quitar ítem: ${SHOP_ITEMS.find(i => i.id === adminConfirm.itemId)?.name}?`}
            </p>
            <p className="text-purple-300 text-sm mb-4 font-semibold">{adminConfirm.username}</p>
            <div className="flex gap-3">
              <button onClick={() => setAdminConfirm(null)} className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs transition-colors">CANCELAR</button>
              <button onClick={handleAdminConfirm} className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-xs transition-colors font-bold">CONFIRMAR</button>
            </div>
          </div>
        </div>
      )}

      {/* Offline Notice Bar */}
      <div className={`absolute bottom-0 left-0 right-0 z-[200] bg-red-600 text-white py-4 transition-all duration-500 transform ${showOfflineNotice ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex items-center justify-center gap-4 text-center">
            <span className="animate-pulse">⚠️</span>
            <span className="text-[10px] tracking-[0.2em] font-bold">FUNCIÓN NO DISPONIBLE SIN CONEXIÓN</span>
        </div>
      </div>

      {/* Bug Reporter Modal Overlay */}
      {showBugReporter && (
        <div className="absolute inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 w-full max-w-xs shadow-2xl relative">
            <h2 className="text-amber-500 font-bold mb-4 tracking-widest text-center flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
              REPORTAR BUG
            </h2>
            <form onSubmit={sendBugReportToDiscord}>
              <textarea
                value={bugReportText}
                onChange={e => setBugReportText(e.target.value)}
                placeholder="Describe el error en detalle..."
                className="w-full h-24 bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-white text-xs mb-4 focus:outline-none focus:border-amber-500/50 resize-none font-sans"
                disabled={isSubmittingReport}
                required
              />
              {bugReportStatus && (
                <div className={`text-[10px] p-2 rounded mb-4 text-center ${bugReportStatus.type === 'error' ? 'bg-red-900/40 border border-red-900/50 text-red-400' : 'bg-green-900/40 border border-green-900/50 text-green-400'}`}>
                  {bugReportStatus.text}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowBugReporter(false)} className="flex-1 py-3 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-zinc-700" disabled={isSubmittingReport}>CANCELAR</button>
                <button type="submit" className="flex-1 py-3 text-xs bg-amber-700 hover:bg-amber-600 text-white font-bold rounded-lg transition-colors border border-amber-600 disabled:opacity-50" disabled={isSubmittingReport}>
                  {isSubmittingReport ? 'ENVIANDO...' : 'ENVIAR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div >
  );
};

export default App;

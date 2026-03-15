export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER'
}

export interface ShipConfig {
  color: string;
  shape: 'classic' | 'sleek' | 'blocky';
}

export interface LeaderboardEntry {
  name: string;
  score: number;
}

export type BrickType = 'NORMAL' | 'TNT' | 'BONUS' | 'LARGE_TNT' | 'SILVER' | 'GOLD';

export interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
  type: BrickType;
  row: number;
  col: number;
  hp?: number; // Used for multi-hit bricks like SILVER
  triggerTimer?: number; // Added for TNT delay
}

export interface TrailPart {
  x: number;
  y: number;
  alpha: number;
}

export interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
  launched: boolean;
  trail?: TrailPart[];
  isFireball?: boolean; // Temporary buff
  styleId?: string; // Equipped style ID
  combo?: number; // Per-ball combo tracker
}

export interface Projectile {
  x: number;
  y: number;
  dy: number;
  active: boolean;
}

export interface Collectible {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
}

export interface Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  dx: number;
  active: boolean;
  shootTimer: number;
}

export interface Explosion {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
}

export interface Boss {
  x: number;
  y: number;
  width: number;
  height: number;
  dx: number;
  dy: number;
  hp: number;
  maxHp: number;
  active: boolean;
  shootTimer: number;
  phase: number;
  invulnerableTimer: number;
  introY?: number;
  explodingTimer?: number;
}

export interface EnemyProjectile {
  x: number;
  y: number;
  dy: number;
  width: number;
  height: number;
  active: boolean;
}

export interface GameDimensions {
  width: number;
  height: number;
}

// --- Shop & Inventory System Interfaces ---

export type ShopCategory = 'paddle' | 'ball' | 'background';

export interface ShopItem {
  id: string;
  type: ShopCategory;
  name: string;
  description: string;
  price: number;
  colorPrimary: string;
  colorSecondary?: string;
  effectType?: 'none' | 'glow' | 'pulse' | 'fire' | 'rainbow' | 'synthwave' | 'matrix' | 'ocean' | 'blackhole';
  unlockCondition?: 'boss_kill';
}

export interface UserInventory {
  coins: number;
  totalPoints: number;
  unlockedIds: string[];
  isBossDefeated: boolean;
  equipped: {
    paddle: string;
    ball: string;
    background: string;
  };
}

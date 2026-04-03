import { ShopItem } from './types';

export const SHOP_ITEMS: ShopItem[] = [
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

    { id: 'block_default', type: 'block', name: 'Rojo Clásico', description: 'El estilo original', price: 0, colorPrimary: '#ef4444' },
    { id: 'block_blue', type: 'block', name: 'Azul Sólido', description: 'Color limpio', price: 100, colorPrimary: '#3b82f6' },
    { id: 'block_green', type: 'block', name: 'Verde Sólido', description: 'Color táctico', price: 100, colorPrimary: '#10b981' },
    { id: 'block_yellow', type: 'block', name: 'Amarillo Sólido', description: 'Color ámbar', price: 100, colorPrimary: '#eab308' },
    { id: 'block_pink', type: 'block', name: 'Rosa Sólido', description: 'Chicle visual', price: 100, colorPrimary: '#ec4899' },
    { id: 'block_purple', type: 'block', name: 'Morado Sólido', description: 'Real y profundo', price: 100, colorPrimary: '#8b5cf6' },
    { id: 'block_white', type: 'block', name: 'Blanco Puro', description: 'Ausencia de oscuridad', price: 150, colorPrimary: '#ffffff' },

    { id: 'block_red_blue', type: 'block', name: 'Rojo-Azul', description: 'Combinación Dual', price: 300, colorPrimary: '#ef4444', colorSecondary: '#3b82f6' },
    { id: 'block_green_yellow', type: 'block', name: 'Verde-Amarillo', description: 'Combinación Dual', price: 300, colorPrimary: '#10b981', colorSecondary: '#eab308' },
    { id: 'block_pink_cyan', type: 'block', name: 'Rosa-Celeste', description: 'Combinación Dual', price: 300, colorPrimary: '#ec4899', colorSecondary: '#06b6d4' },
    { id: 'block_orange_purple', type: 'block', name: 'Naranja-Morado', description: 'Combinación Dual', price: 300, colorPrimary: '#f97316', colorSecondary: '#8b5cf6' },

    { id: 'block_neon', type: 'block', name: 'Bloque Neón', description: 'Brillo intenso Cyberpunk', price: 800, colorPrimary: '#06b6d4', colorSecondary: '#ec4899', effectType: 'synthwave' },
    { id: 'block_glass', type: 'block', name: 'Bloque Cristal', description: 'Reflejos fríos de vidrio', price: 1200, colorPrimary: '#93c5fd', effectType: 'ice' },
    { id: 'block_ghost', type: 'block', name: 'Bloque Espectral', description: 'Semitransparente con borde brillante', price: 1500, colorPrimary: '#e5e7eb', effectType: 'ghost' },
];

export const getPrice = (item: ShopItem) => {
    let price = item.price;
    // apply any discount logic here if needed
    return price;
};

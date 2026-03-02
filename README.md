# Arkanoid Retro Challenge 🕹️

Un tributo moderno al clásico juego arcade **Arkanoid**, construido completamente desde cero utilizando **React**, **TypeScript** y renderizado nativo en **HTML5 Canvas**. 

Este proyecto expande la fórmula clásica con sistemas de progresión, personalización en el juego, físicas mejoradas y mecánicas para plataformas móviles táctiles (Android), gracias a **Capacitor**.

## 🚀 Características Principales

- **Físicas y Destrucción Dinámica:** Los bloques (bricks) no solo desaparecen; al ser destruidos se fragmentan en partículas y escombros afectados por un sistema de gravedad integrado.
- **Tienda en el Juego (Shop):** Los puntos obtenidos al destruir bloques y ganar niveles se pueden canjear por Monedas. Usa las monedas para desbloquear nuevos aspectos de barras (paddles), efectos de pelota y fondos premium.
- **Modos de Control Dual:** 
  - Soporte completo para Mouse y Teclado para entorno Desktop.
  - **HUD Táctil Adaptativo:** Detección automática de dispositivos móviles mostrando controles invisibles de toques en zonas por defecto, y opción para activar **Controles Virtuales** (Joystick Analógico + Botón de Disparo) en cualquier momento.
- **Jefes de Fin de Nivel:** Enfrentamientos dinámicos con jefes (Bosses) que poseen barras de vida, distintas fases de ataque, patrones de movimiento evasivo e invulnerabilidad temporal.
- **Power-Ups Avanzados:** Incluye la clásica pelota de fuego, rayos láser para la barra, bombas expansivas, multiplicadores de puntos, y la nueva **Pelota Pesada** (capaz de perforar múltiples bloques en línea recta).
- **Tablas de Clasificación (Leaderboard):** Sistema de top 50 local integrado en la pantalla principal.

## 🛠️ Tecnologías Utilizadas

- **Frontend Core:** [React 18](https://reactjs.org/) & [TypeScript](https://www.typescriptlang.org/)
- **Renderizado:** HTML5 `<canvas>` ejecutando un bucle de animación optimizado a través de `requestAnimationFrame` (`~60 FPS`).
- **Estilos:** [Tailwind CSS](https://tailwindcss.com/)
- **Estructura del Proyecto:** [Vite](https://vitejs.dev/)
- **Exportación a Android:** [Capacitor](https://capacitorjs.com/)

## 📦 Instalación y Desarrollo Local

Clona este repositorio y abre la carpeta localmente:

```bash
git clone https://github.com/Coarguello/arkanoid-retro-challenge.git
cd arkanoid-retro-challenge
```

Instala las dependencias necesarias de Node:

```bash
npm install
```

Ejecuta el servidor de desarrollo de Vite (usualmente en `http://localhost:5173`):

```bash
npm run dev
```

## 📱 Compilación para Android (Capacitor)

El proyecto incluye la base para construirse de forma nativa como una aplicación Android a través de Capacitor. Asegúrate de tener Android Studio instalado y configurado correctamente.

1. Construye los estáticos de producción:
```bash
npm run build
```

2. Sincroniza la compilación con las carpetas de Android:
```bash
npx cap sync android
```

3. Abre el proyecto en Android Studio:
```bash
npx cap open android
```

## 🎮 Controles

### Escritorio (Teclado)
- **A / D** o **Flechas Izquierda / Derecha** = Mover la barra.
- **W / Espacio / Flecha Arriba** = Disparar armas (si se recogió el powerup láser).

### Dispositivos Táctiles
- **Toques Invisibles (Por Defecto):** Toca la zona izquierda de la pantalla para moverte a la izquierda, la derecha para la derecha. Toca en el medio para disparar.
- **Controles Virtuales (Opcional):** Activable desde el Menú Principal o el Menú de Pausa (icono de "dedo"). Muestra un *Analógico* a la izquierda y un *Botón de Disparo* a la derecha.

---

> Creado por [Coarguello](https://github.com/Coarguello)

export const MAX_P = 8;

export const DEFAULTS = Object.freeze({
  viewDefault: 520,
  dotsPerParticle: 5000,
  epochRate: 120,
  pointSize: 2.0,

  centerUpdate: true,
  centerAlpha: 1.0,

  showLinks: true,
  linksMode: "all", // "ab" | "all" | "none"

  showGrid: true,
  gridStep: 10,

  running: true,
  ringTol: 1.25,

  // camera zoom clamp
  minViewH: 60,
  maxViewH: 50000,

  // drag thresholds
  centerHitPx: 28,

  // renderer
  dotAlpha: 0.84,
});

export const PALETTE = Object.freeze([
  { start: "#0b6623", end: "#ffd60a" }, // A: dark green → yellow
  { start: "#2d004b", end: "#d7301f" }, // B: dark purple → red
  { start: "#062a5e", end: "#55c3ff" },
  { start: "#3b0a45", end: "#ff7ad9" },
  { start: "#202124", end: "#9aa0a6" },
  { start: "#0a3b2d", end: "#64ffda" },
]);

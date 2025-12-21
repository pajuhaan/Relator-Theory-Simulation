import { clamp } from "./utils.js";

export function createCamera({ glCanvas, viewH }) {
  return {
    camX: 0,
    camY: 0,
    viewH: viewH,
    minViewH: 60,
    maxViewH: 50000,
    setClamp(minH, maxH){ this.minViewH = minH; this.maxViewH = maxH; },
    setViewH(h){ this.viewH = clamp(h, this.minViewH, this.maxViewH); },
  };
}

export function aspect(glCanvas){
  return glCanvas.width / Math.max(1, glCanvas.height);
}

export function viewW(camera, glCanvas){
  return camera.viewH * aspect(glCanvas);
}

export function worldToScreen(camera, glCanvas, wx, wy){
  const vw = viewW(camera, glCanvas);

  // Match the shader convention:
  // nx = (x - camX) / (viewW/2)
  // ny = - (y - camY) / (viewH/2)
  const nx = (wx - camera.camX) / (vw * 0.5);
  const ny = - (wy - camera.camY) / (camera.viewH * 0.5);

  // NDC -> screen pixels
  const sx = (nx * 0.5 + 0.5) * glCanvas.width;
  const sy = (1.0 - (ny * 0.5 + 0.5)) * glCanvas.height;
  return [sx, sy];
}

export function screenToWorld(camera, glCanvas, sx, sy){
  // screen pixels -> NDC
  const nx = (sx / glCanvas.width) * 2.0 - 1.0;

  // ndc_y = 1 - 2*(sy/height)
  const ny = -((sy / glCanvas.height) * 2.0 - 1.0);

  const vw = viewW(camera, glCanvas);

  // Inverse of nx mapping
  const wx = camera.camX + nx * (vw * 0.5);

  // IMPORTANT FIX
  // Inverse of: ny = -(wy - camY)/(viewH/2)  =>  wy = camY - ny*(viewH/2)
  const wy = camera.camY - ny * (camera.viewH * 0.5);

  return [wx, wy];
}

export function recenterCameraToParticles(camera, particles){
  if(!particles.length) return;
  let sx=0, sy=0;
  for(const p of particles){ sx += p.cx; sy += p.cy; }
  camera.camX = sx / particles.length;
  camera.camY = sy / particles.length;
}

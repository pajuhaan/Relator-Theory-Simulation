import { screenToWorld, worldToScreen } from "./camera.js";
import { clamp } from "./utils.js";

export function bindStageInput(state, dom, actions){
  const uiCanvas = dom.uiCanvas;
  const glCanvas = dom.glCanvas;

  let dragMode = "none";   // "pan" | "center"
  let panStart = null;
  let centerStart = null;

  function pickCenter(screenX, screenY){
    const cam = state.camera;
    for(let i=0;i<state.particles.length;i++){
      const p = state.particles[i];
      const [px, py] = worldToScreen(cam, glCanvas, p.cx, p.cy);
      const d = Math.hypot(screenX - px, screenY - py);
      if(d < state.settings.centerHitPx) return i;
    }
    return -1;
  }

  uiCanvas.addEventListener("pointerdown", (e)=>{
    const rect = uiCanvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio||1);
    const sx = (e.clientX - rect.left) * dpr;
    const sy = (e.clientY - rect.top) * dpr;

    const hit = pickCenter(sx, sy);
    if(hit !== -1){
      dragMode = "center";
      const [wx, wy] = screenToWorld(state.camera, glCanvas, sx, sy);
      centerStart = { id: hit, dx: state.particles[hit].cx - wx, dy: state.particles[hit].cy - wy };
    }else{
      dragMode = "pan";
      panStart = { sx, sy, camX: state.camera.camX, camY: state.camera.camY };
    }

    uiCanvas.setPointerCapture(e.pointerId);
  });

  uiCanvas.addEventListener("pointermove", (e)=>{
    if(dragMode === "none") return;

    const rect = uiCanvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio||1);
    const sx = (e.clientX - rect.left) * dpr;
    const sy = (e.clientY - rect.top) * dpr;

    if(dragMode === "center" && centerStart){
      const [wx, wy] = screenToWorld(state.camera, glCanvas, sx, sy);
      const p = state.particles[centerStart.id];
      p.cx = wx + centerStart.dx;
      p.cy = wy + centerStart.dy;
      actions.onParticleEdited();
    }else if(dragMode === "pan" && panStart){
      const [w0x, w0y] = screenToWorld(state.camera, glCanvas, panStart.sx, panStart.sy);
      const [w1x, w1y] = screenToWorld(state.camera, glCanvas, sx, sy);
      state.camera.camX = panStart.camX + (w0x - w1x);
      state.camera.camY = panStart.camY + (w0y - w1y);
    }
  });

  function endDrag(){
    dragMode = "none";
    panStart = null;
    centerStart = null;
  }
  uiCanvas.addEventListener("pointerup", endDrag);
  uiCanvas.addEventListener("pointercancel", endDrag);

  uiCanvas.addEventListener("wheel", (e)=>{
    e.preventDefault();

    const rect = uiCanvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio||1);
    const sx = (e.clientX - rect.left) * dpr;
    const sy = (e.clientY - rect.top) * dpr;

    const [wx0, wy0] = screenToWorld(state.camera, glCanvas, sx, sy);

    const zoomFactor = e.deltaY > 0 ? 1.10 : 0.90;
    state.camera.viewH = clamp(state.camera.viewH * zoomFactor, state.settings.minViewH, state.settings.maxViewH);

    const [wx1, wy1] = screenToWorld(state.camera, glCanvas, sx, sy);

    // keep world point under cursor fixed
    state.camera.camX += (wx0 - wx1);
    state.camera.camY += (wy0 - wy1);
  }, { passive:false });
}

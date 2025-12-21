import { sigmaFromR } from "./utils.js";
import { worldToScreen, viewW } from "./camera.js";

export function createOverlayRenderer(uiCanvas){
  const ctx = uiCanvas.getContext("2d");
  const fontFamily = getComputedStyle(document.body).fontFamily;

  function drawGrid(state){
    if(!state.settings.showGrid) return;

    const cam = state.camera;
    const vw = viewW(cam, state.dom.glCanvas);

    const minX = cam.camX - vw*0.5, maxX = cam.camX + vw*0.5;
    const minY = cam.camY - cam.viewH*0.5, maxY = cam.camY + cam.viewH*0.5;

    const step = state.settings.gridStep;
    const startX = Math.floor(minX/step)*step;
    const startY = Math.floor(minY/step)*step;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = state.theme.gridStroke;

    for(let gx=startX; gx<=maxX; gx+=step){
      const [sx0, sy0] = worldToScreen(cam, state.dom.glCanvas, gx, minY);
      const [sx1, sy1] = worldToScreen(cam, state.dom.glCanvas, gx, maxY);
      ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx1, sy1); ctx.stroke();
    }
    for(let gy=startY; gy<=maxY; gy+=step){
      const [sx0, sy0] = worldToScreen(cam, state.dom.glCanvas, minX, gy);
      const [sx1, sy1] = worldToScreen(cam, state.dom.glCanvas, maxX, gy);
      ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx1, sy1); ctx.stroke();
    }
    ctx.restore();
  }

  function drawLinks(state){
    if(!state.settings.showLinks) return;
    if(state.settings.linksMode === "none") return;
    if(state.particles.length < 2) return;

    ctx.save();
    ctx.setLineDash([8,6]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = state.theme.linkStroke;

    const pairs = [];
    if(state.settings.linksMode === "ab"){
      pairs.push([0,1]);
    }else if(state.settings.linksMode === "all"){
      for(let i=0;i<state.particles.length;i++){
        for(let j=i+1;j<state.particles.length;j++) pairs.push([i,j]);
      }
    }

    const cam = state.camera;
    for(const [i,j] of pairs){
      const a = state.particles[i], b = state.particles[j];
      const [ax, ay] = worldToScreen(cam, state.dom.glCanvas, a.cx, a.cy);
      const [bx, by] = worldToScreen(cam, state.dom.glCanvas, b.cx, b.cy);
      ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
    }

    ctx.restore();
  }

  function drawCenters(state){
    const cam = state.camera;
    for(let i=0;i<state.particles.length;i++){
      const p = state.particles[i];
      const [px, py] = worldToScreen(cam, state.dom.glCanvas, p.cx, p.cy);

      if(i===0){
        ctx.save();
        ctx.lineWidth = 6;
        ctx.fillStyle = state.theme.markerFill;
        ctx.strokeStyle = state.theme.markerStroke;
        ctx.beginPath();
        ctx.arc(px,py,18,0,Math.PI*2);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }else{
        ctx.save();
        ctx.strokeStyle = state.theme.markerStroke;
        ctx.lineWidth = 6;
        const s = 18;
        ctx.beginPath();
        ctx.moveTo(px-s,py-s); ctx.lineTo(px+s,py+s);
        ctx.moveTo(px-s,py+s); ctx.lineTo(px+s,py-s);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawTopLabel(state){
    if(state.particles.length < 2) return;

    const a = state.particles[0], b = state.particles[1];
    const d = Math.hypot(b.cx-a.cx, b.cy-a.cy);

    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = state.theme.text;
    ctx.font = `700 22px ${fontFamily}`;
    ctx.fillText(`d = ${d.toFixed(2)} world units`, uiCanvas.width*0.5, 34);

    const sigA = sigmaFromR(a.R);
    const sigB = sigmaFromR(b.R);
    ctx.font = `650 14px ${fontFamily}`;
    ctx.fillStyle = state.theme.isDark ? "rgba(241,241,245,.78)" : "rgba(0,0,0,.60)";
    ctx.fillText(`A: R=${a.R.toFixed(1)}, σ=${sigA.toFixed(1)} · B: R=${b.R.toFixed(1)}, σ=${sigB.toFixed(1)}`, uiCanvas.width*0.5, 56);
    ctx.restore();
  }

  function drawBottomInfo(state, fps){
    ctx.save();
    ctx.font = `650 18px ${fontFamily}`;
    ctx.fillStyle = state.theme.text;
    ctx.fillText(
      `epoch ${state.runtime.epoch}   particles ${state.particles.length}   dots ${state.settings.dotsPerParticle}   ${fps.toFixed(0)} fps   viewH ${state.camera.viewH.toFixed(0)}`,
      18,
      uiCanvas.height - 18
    );
    ctx.restore();
  }

  function clear(){
    ctx.clearRect(0,0,uiCanvas.width, uiCanvas.height);
  }

  function draw(state, fps){
    clear();
    drawGrid(state);
    drawLinks(state);
    drawCenters(state);
    drawTopLabel(state);
    drawBottomInfo(state, fps);
  }

  return { draw };
}

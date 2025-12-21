import { DEFAULTS, MAX_P } from "./config.js";
import { createThemeController } from "./theme.js";
import { createCamera } from "./camera.js";
import { createGLRenderer } from "./renderer_gl.js";
import { createOverlayRenderer } from "./renderer_ui.js";
import { initControls } from "./ui_controls.js";
import { bindStageInput } from "./input.js";
import { makeParticle, reseed, stepEpoch, gaussianizeParticle } from "./process.js";

function getDom(){
  return {
    stage: document.getElementById("stage"),
    glCanvas: document.getElementById("gl"),
    uiCanvas: document.getElementById("ui"),
    hud: document.getElementById("hud"),

    btnPlay: document.getElementById("btnPlay"),
    btnReset: document.getElementById("btnReset"),
    btnRandom: document.getElementById("btnRandom"),
    btnAdd: document.getElementById("btnAdd"),
    btnRemove: document.getElementById("btnRemove"),

    viewSize: document.getElementById("viewSize"),
    dotsPer: document.getElementById("dotsPer"),
    epochRate: document.getElementById("epochRate"),
    pointSize: document.getElementById("pointSize"),

    toggleCenters: document.getElementById("toggleCenters"),
    centerAlpha: document.getElementById("centerAlpha"),

    toggleLinks: document.getElementById("toggleLinks"),
    linksMode: document.getElementById("linksMode"),

    toggleGrid: document.getElementById("toggleGrid"),
    gridStep: document.getElementById("gridStep"),

    vView: document.getElementById("vView"),
    vDots: document.getElementById("vDots"),
    vRate: document.getElementById("vRate"),
    vPoint: document.getElementById("vPoint"),
    vAlpha: document.getElementById("vAlpha"),
    vLinks: document.getElementById("vLinks"),
    vStep: document.getElementById("vStep"),

    particlesRoot: document.getElementById("particles"),
    darkToggle: document.getElementById("darkToggle"),
  };
}

function resizeAll(dom, glRenderer){
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = dom.stage.getBoundingClientRect();
  const w = Math.floor(rect.width * dpr);
  const h = Math.floor(rect.height * dpr);

  dom.glCanvas.width = w;
  dom.glCanvas.height = h;
  dom.uiCanvas.width = w;
  dom.uiCanvas.height = h;

  glRenderer.resizeViewport();
}

function createState(dom, theme){
  const settings = { ...DEFAULTS };

  dom.viewSize.value = String(settings.viewDefault);
  dom.dotsPer.value = String(settings.dotsPerParticle);
  dom.epochRate.value = String(settings.epochRate);
  dom.pointSize.value = String(settings.pointSize);

  dom.toggleCenters.checked = settings.centerUpdate;
  dom.centerAlpha.value = String(settings.centerAlpha);

  dom.toggleLinks.checked = settings.showLinks;
  dom.linksMode.value = settings.linksMode;

  dom.toggleGrid.checked = settings.showGrid;
  dom.gridStep.value = String(settings.gridStep);

  const camera = createCamera({ glCanvas: dom.glCanvas, viewH: settings.viewDefault });
  camera.setClamp(settings.minViewH, settings.maxViewH);

  return {
    dom,
    theme,
    settings,
    camera,
    particles: [],
    sim: null,
    runtime: {
      running: settings.running,
      epoch: 0,
      fpsSmooth: 60,
      acc: 0,
      lastT: performance.now(),
    },
  };
}

function bootParticles(state){
  state.particles = [makeParticle(0, state.settings.viewDefault), makeParticle(1, state.settings.viewDefault)];
  state.particles[0].spin = +1;
  state.particles[1].spin = +1;
}

function main(){
  const dom = getDom();

  const themeCtrl = createThemeController({ darkToggleEl: dom.darkToggle });
  themeCtrl.init();

  const glRenderer = createGLRenderer(dom.glCanvas);
  const overlay = createOverlayRenderer(dom.uiCanvas);

  const state = createState(dom, themeCtrl.theme);
  bootParticles(state);

  reseed(state, { recenter: true });
  glRenderer.upload(state);

  function doReseed({ recenter=false } = {}){
    reseed(state, { recenter });
    glRenderer.upload(state);
  }

  const actions = {
    reseed: doReseed,

    gaussianizeParticle(idx){
      gaussianizeParticle(state, idx);
      glRenderer.updatePositions(state);
    },

    addParticle(){
      if(state.particles.length >= MAX_P) return;
      const p = makeParticle(state.particles.length, state.settings.viewDefault);
      p.cx = state.camera.camX + (Math.random()-0.5) * state.settings.viewDefault * 0.35;
      p.cy = state.camera.camY + (Math.random()-0.5) * state.settings.viewDefault * 0.35;
      state.particles.push(p);
    },

    removeParticle(){
      if(state.particles.length <= 1) return;
      state.particles.pop();
    },

    randomizeCenters(){
      for(const p of state.particles){
        p.cx = state.camera.camX + (Math.random()-0.5) * state.settings.viewDefault * 0.9;
        p.cy = state.camera.camY + (Math.random()-0.5) * state.settings.viewDefault * 0.9;
      }
    },

    onParticleEdited(){
      ui.renderParticlesPanel();
    },
  };

  const ui = initControls(state, dom, actions);
  bindStageInput(state, dom, actions);

  function onResize(){
    resizeAll(dom, glRenderer);
  }
  window.addEventListener("resize", onResize);
  onResize();

  function tick(t){
    const dt = Math.min(0.05, (t - state.runtime.lastT) / 1000);
    state.runtime.lastT = t;

    const fps = 1 / Math.max(1e-6, dt);
    state.runtime.fpsSmooth = state.runtime.fpsSmooth*0.9 + fps*0.1;

    if(state.runtime.running){
      state.runtime.acc += dt * state.settings.epochRate;
      let steps = Math.floor(state.runtime.acc);
      state.runtime.acc -= steps;
      steps = Math.min(20, steps);

      for(let k=0;k<steps;k++) stepEpoch(state);
      glRenderer.updatePositions(state);
    }

    glRenderer.draw(state);
    overlay.draw(state, state.runtime.fpsSmooth);

    dom.hud.textContent = `epoch ${state.runtime.epoch} · ${state.runtime.fpsSmooth.toFixed(0)} fps`;
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

main();

import { MAX_P } from "./config.js";
import { rgbToHex, hexToRgb, sigmaFromR } from "./utils.js";

export function initControls(state, dom, actions){
  const vView = dom.vView;
  const vDots = dom.vDots;
  const vRate = dom.vRate;
  const vPoint = dom.vPoint;
  const vAlpha = dom.vAlpha;
  const vLinks = dom.vLinks;
  const vStep = dom.vStep;

  function sync(){
    vView.textContent = state.settings.viewDefault.toFixed(0);
    vDots.textContent = String(state.settings.dotsPerParticle);
    vRate.textContent = String(state.settings.epochRate);
    vPoint.textContent = state.settings.pointSize.toFixed(1);
    vAlpha.textContent = `α ${state.settings.centerAlpha.toFixed(2)}`;
    vLinks.textContent = state.settings.linksMode==="ab" ? "A–B" : (state.settings.linksMode==="all" ? "all" : "none");
    vStep.textContent = `step ${state.settings.gridStep}`;
    dom.btnPlay.textContent = state.runtime.running ? "Pause" : "Play";
  }

  function renderParticlesPanel(){
    const root = dom.particlesRoot;
    root.innerHTML = "";

    state.particles.forEach((p, i)=>{
      const sig = sigmaFromR(p.R);

      const card = document.createElement("div");
      card.className = "pCard";
      card.innerHTML = `
        <div class="pTop">
          <div>
            <div class="pName">Particle ${p.name}</div>
            <div class="pMini">spin ${p.spin===1?"CW":"CCW"} · R ${p.R.toFixed(2)} · σ ${sig.toFixed(2)} · center (${p.cx.toFixed(1)}, ${p.cy.toFixed(1)})</div>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; align-items:flex-end;">
            <label class="toggle">
              <input type="checkbox" ${p.spin===1?"checked":""} data-spin="${i}">
              CW
            </label>
            <div style="display:flex; gap:8px;">
              <button class="btn" style="padding:6px 10px; border-radius:10px; font-size:12px;" data-gauss="${i}">Gaussianize</button>
              <button class="btn" style="padding:6px 10px; border-radius:10px; font-size:12px;" data-collar="${i}">Collar</button>
            </div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr; gap:10px;">
          <div>
            <label class="small">R (Relator scale)</label>
            <input type="number" min="1" step="10" value="${p.R.toFixed(2)}" data-r="${i}">
          </div>

          <div class="pGrid">
            <div>
              <label class="small">Gradient start</label>
              <input type="color" value="${rgbToHex(p.grad0)}" data-c0="${i}">
            </div>
            <div>
              <label class="small">Gradient end</label>
              <input type="color" value="${rgbToHex(p.grad1)}" data-c1="${i}">
            </div>
          </div>

          <div class="small">
            Gaussianize re-projects dots onto the maximum-entropy collar for this particle.
          </div>
        </div>
      `;
      root.appendChild(card);
    });

    root.querySelectorAll('input[data-spin]').forEach(inp=>{
      inp.addEventListener("change", (e)=>{
        const idx = parseInt(e.target.getAttribute("data-spin"), 10);
        state.particles[idx].spin = e.target.checked ? +1 : -1;
        renderParticlesPanel();
      });
    });

    root.querySelectorAll('input[data-r]').forEach(inp=>{
      inp.addEventListener("change", (e)=>{
        const idx = parseInt(e.target.getAttribute("data-r"), 10);
        const v = parseFloat(e.target.value);
        if(!Number.isFinite(v) || v <= 0) return;
        state.particles[idx].R = Math.max(1e-6, v);
        actions.reseed({ recenter:false });
      });
    });

    root.querySelectorAll('input[data-c0]').forEach(inp=>{
      inp.addEventListener("input", (e)=>{
        const idx = parseInt(e.target.getAttribute("data-c0"), 10);
        state.particles[idx].grad0 = hexToRgb(e.target.value);
      });
    });

    root.querySelectorAll('input[data-c1]').forEach(inp=>{
      inp.addEventListener("input", (e)=>{
        const idx = parseInt(e.target.getAttribute("data-c1"), 10);
        state.particles[idx].grad1 = hexToRgb(e.target.value);
      });
    });

    root.querySelectorAll('button[data-gauss]').forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        const idx = parseInt(e.target.getAttribute("data-gauss"), 10);
        actions.gaussianizeParticle(idx);
        renderParticlesPanel();
      });
    });

    root.querySelectorAll('button[data-collar]').forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        const idx = parseInt(e.target.getAttribute("data-collar"), 10);
        actions.collarizeParticle(idx);
        renderParticlesPanel();
      });
    });
  }

  // Global controls
  dom.viewSize.addEventListener("input", ()=>{
    state.settings.viewDefault = parseInt(dom.viewSize.value, 10);
    state.camera.viewH = state.settings.viewDefault;
    actions.reseed({ recenter:false });
    sync();
  });

  dom.dotsPer.addEventListener("input", ()=>{
    state.settings.dotsPerParticle = parseInt(dom.dotsPer.value, 10);
    actions.reseed({ recenter:false });
    sync();
  });

  dom.epochRate.addEventListener("input", ()=>{
    state.settings.epochRate = parseInt(dom.epochRate.value, 10);
    sync();
  });

  dom.pointSize.addEventListener("input", ()=>{
    state.settings.pointSize = parseFloat(dom.pointSize.value);
    sync();
  });

  dom.toggleCenters.addEventListener("change", ()=>{
    state.settings.centerUpdate = dom.toggleCenters.checked;
  });

  dom.centerAlpha.addEventListener("input", ()=>{
    state.settings.centerAlpha = parseFloat(dom.centerAlpha.value);
    sync();
  });

  dom.toggleLinks.addEventListener("change", ()=>{
    state.settings.showLinks = dom.toggleLinks.checked;
  });

  dom.linksMode.addEventListener("change", ()=>{
    state.settings.linksMode = dom.linksMode.value;
    sync();
  });

  dom.toggleGrid.addEventListener("change", ()=>{
    state.settings.showGrid = dom.toggleGrid.checked;
  });

  dom.gridStep.addEventListener("input", ()=>{
    state.settings.gridStep = parseInt(dom.gridStep.value, 10);
    sync();
  });

  dom.btnPlay.addEventListener("click", ()=>{
    state.runtime.running = !state.runtime.running;
    sync();
  });

  dom.btnReset.addEventListener("click", ()=>{
    actions.reseed({ recenter:true });
  });

  dom.btnRandom.addEventListener("click", ()=>{
    actions.randomizeCenters();
    actions.reseed({ recenter:false });
    renderParticlesPanel();
  });

  dom.btnAdd.addEventListener("click", ()=>{
    if(state.particles.length >= MAX_P) return;
    actions.addParticle();
    actions.reseed({ recenter:false });
    renderParticlesPanel();
  });

  dom.btnRemove.addEventListener("click", ()=>{
    if(state.particles.length <= 1) return;
    actions.removeParticle();
    actions.reseed({ recenter:false });
    renderParticlesPanel();
  });

  renderParticlesPanel();
  sync();

  return { sync, renderParticlesPanel };
}

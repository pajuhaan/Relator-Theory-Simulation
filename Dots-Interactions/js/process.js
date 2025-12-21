import { MAX_P, PALETTE } from "./config.js";
import { clamp, lerp, hexToRgb, sigmaFromR, occKey } from "./utils.js";
import { recenterCameraToParticles } from "./camera.js";

/* =========================
   Particles
========================= */
export function makeParticle(index, viewDefault){
  const pal = PALETTE[index % PALETTE.length];
  const d = viewDefault * 0.35;

  const cx = (index===0) ? -d*0.5 : (index===1) ? +d*0.5 : (index-1)*0.45*d;
  const cy = (index%2===0) ? -0.08*d : +0.08*d;

  const R = Math.max(40, d);

  return {
    id: index,
    name: String.fromCharCode(65 + index),
    cx, cy,
    spin: +1,
    R,
    grad0: hexToRgb(pal.start),
    grad1: hexToRgb(pal.end),
  };
}

/* =========================
   Simulation allocation
========================= */
export function allocSim(state){
  const pCount = state.particles.length;
  const dotsPer = state.settings.dotsPerParticle;
  const N = pCount * dotsPer;

  state.sim = {
    N,
    x: new Int32Array(N),
    y: new Int32Array(N),
    pid: new Float32Array(N),    // particle id for GPU attribute
    rDes: new Float32Array(N),
    occ: new Map(),              // Map<string,int>
    posInter: new Float32Array(N*2),
  };
}

function isFree(sim, ix, iy){
  return !sim.occ.has(occKey(ix, iy));
}

function rayleighFromSigmaC(sigmaC){
  // If ρ(z)=1/(πσC²) exp(-|z|²/σC²), then radial pdf is 2r/σC² exp(-r²/σC²)
  // Equivalent to Rayleigh with scale a = σC/√2.
  const a = sigmaC / Math.SQRT2;
  const u = Math.max(1e-12, 1 - Math.random());
  return a * Math.sqrt(-2 * Math.log(u));
}

function placeDot(sim, dotIndex, p){
  const sigmaC = sigmaFromR(p.R);

  for(let k=0;k<200;k++){
    const r = rayleighFromSigmaC(sigmaC);
    const a = Math.random() * Math.PI * 2;

    const xx = Math.round(p.cx + r*Math.cos(a));
    const yy = Math.round(p.cy + r*Math.sin(a));

    if(sim.occ.has(occKey(xx, yy))) continue;

    sim.x[dotIndex] = xx;
    sim.y[dotIndex] = yy;
    sim.pid[dotIndex] = p.id;
    sim.rDes[dotIndex] = r;

    sim.occ.set(occKey(xx, yy), dotIndex);
    return true;
  }
  return false;
}

/* =========================
   Reseed (all particles)
========================= */
export function reseed(state, { recenter=true } = {}){
  if(state.particles.length > MAX_P) state.particles.length = MAX_P;

  allocSim(state);
  const sim = state.sim;

  let k = 0;
  for(const p of state.particles){
    for(let i=0;i<state.settings.dotsPerParticle;i++){
      if(!placeDot(sim, k, p)){
        // deterministic outward search for a free cell
        const baseX = Math.round(p.cx);
        const baseY = Math.round(p.cy);

        let found = false;
        for(let step=1; step<20000 && !found; step++){
          const candidates = [
            [ baseX + step, baseY ],
            [ baseX - step, baseY ],
            [ baseX, baseY + step ],
            [ baseX, baseY - step ],
            [ baseX + step, baseY + step ],
            [ baseX + step, baseY - step ],
            [ baseX - step, baseY + step ],
            [ baseX - step, baseY - step ],
          ];
          for(const [ix, iy] of candidates){
            if(isFree(sim, ix, iy)){
              sim.x[k] = ix;
              sim.y[k] = iy;
              sim.pid[k] = p.id;
              sim.rDes[k] = Math.hypot(ix - p.cx, iy - p.cy);
              sim.occ.set(occKey(ix, iy), k);
              found = true;
              break;
            }
          }
        }
      }
      k++;
    }
  }

  state.runtime.epoch = 0;

  if(recenter){
    recenterCameraToParticles(state.camera, state.particles);
  }
}

/* =========================
   Gaussianize one particle (NEW)
   Max-entropy collar reset for that particle only.
========================= */
function findFreeNear(sim, x0, y0){
  if(!sim.occ.has(occKey(x0,y0))) return [x0,y0];

  // small radial spokes first (fast)
  const dirs = [
    [ 1,0],[-1,0],[0, 1],[0,-1],
    [ 1,1],[ 1,-1],[-1,1],[-1,-1],
    [ 2,1],[ 2,-1],[-2,1],[-2,-1],
    [ 1,2],[ -1,2],[1,-2],[-1,-2],
  ];

  for(let r=1; r<=16; r++){
    for(const [dx,dy] of dirs){
      const nx = x0 + dx*r;
      const ny = y0 + dy*r;
      if(!sim.occ.has(occKey(nx,ny))) return [nx,ny];
    }
  }

  // square spiral perimeter search (guaranteed eventually)
  for(let ring=17; ring<=260; ring++){
    for(let dx=-ring; dx<=ring; dx++){
      let nx = x0 + dx, ny = y0 - ring;
      if(!sim.occ.has(occKey(nx,ny))) return [nx,ny];
      ny = y0 + ring;
      if(!sim.occ.has(occKey(nx,ny))) return [nx,ny];
    }
    for(let dy=-ring+1; dy<=ring-1; dy++){
      let nx = x0 - ring, ny = y0 + dy;
      if(!sim.occ.has(occKey(nx,ny))) return [nx,ny];
      nx = x0 + ring;
      if(!sim.occ.has(occKey(nx,ny))) return [nx,ny];
    }
  }

  // last resort far jump
  return [x0 + 100000, y0 + 100000];
}

export function gaussianizeParticle(state, particleIndex){
  const sim = state.sim;
  const p = state.particles[particleIndex];
  if(!sim || !p) return;

  // collect dot indices belonging to this particle
  const ids = [];
  for(let i=0;i<sim.N;i++){
    const id = (sim.pid[i] + 0.5) | 0;
    if(id === particleIndex) ids.push(i);
  }
  if(!ids.length) return;

  // remove their occupancy
  for(const i of ids){
    sim.occ.delete(occKey(sim.x[i], sim.y[i]));
  }

  // Deterministic-looking Gaussian collar using quantiles + golden angle
  const n = ids.length;
  const sigmaC = sigmaFromR(p.R);
  const a = sigmaC / Math.SQRT2;

  const golden = Math.PI * (3 - Math.sqrt(5));
  const phi0 = Math.random() * Math.PI * 2;

  for(let k=0;k<n;k++){
    const i = ids[k];

    // quantile-based radius for a smooth max-entropy histogram
    const u = (k + 0.5) / n; // in (0,1)
    const r = a * Math.sqrt(-2 * Math.log(Math.max(1e-12, 1 - u)));

    // low-discrepancy angles
    const ang = (phi0 + k * golden) % (Math.PI * 2);

    const x0 = Math.round(p.cx + r * Math.cos(ang));
    const y0 = Math.round(p.cy + r * Math.sin(ang));

    const [nx, ny] = findFreeNear(sim, x0, y0);

    sim.x[i] = nx;
    sim.y[i] = ny;
    sim.rDes[i] = r;

    sim.occ.set(occKey(nx, ny), i);
  }
}

/* =========================
   Epoch update rule
========================= */
function domAxisStep(vx, vy){
  const ax = Math.abs(vx), ay = Math.abs(vy);
  if(ax===0 && ay===0) return [1,0];
  if(ax>=ay) return [vx>0 ? 1 : -1, 0];
  return [0, vy>0 ? 1 : -1];
}

function withinBand(nx, ny, p, r0, tol){
  const dx = nx - p.cx, dy = ny - p.cy;
  const rr = Math.sqrt(dx*dx + dy*dy);
  return (rr >= (r0 - tol)) && (rr <= (r0 + tol));
}

function weightedPick3(w0,w1,w2){
  const s = w0+w1+w2;
  let r = Math.random()*s;
  if(r < w0) return 0;
  r -= w0;
  if(r < w1) return 1;
  return 2;
}

/**
 * Enforces:
 * - No stasis
 * - Exclusion
 * - Unbounded integer lattice
 */
function moveDotGuaranteed(state, i){
  const sim = state.sim;
  const particles = state.particles;
  const ringTol = state.settings.ringTol;

  const xi = sim.x[i], yi = sim.y[i];
  const id = (sim.pid[i] + 0.5) | 0;
  const p = particles[id];

  const r0 = sim.rDes[i];

  const dx = xi - p.cx, dy = yi - p.cy;

  const f = domAxisStep(p.spin * dy, -p.spin * dx);
  const rin = domAxisStep(-dx, -dy);
  const rout = [-rin[0], -rin[1]];

  const dirs = [
    {sx:f[0],   sy:f[1],   w:1.0},
    {sx:rin[0], sy:rin[1], w:1.0},
    {sx:rout[0],sy:rout[1],w:1.0},
  ];

  sim.occ.delete(occKey(xi, yi));

  for(let expand=0; expand<7; expand++){
    const stepMax = Math.min(1 + expand*2, 18);
    const tol = ringTol * (1 + 0.35*expand);

    for(let attempt=0; attempt<9; attempt++){
      const pick = weightedPick3(dirs[0].w, dirs[1].w, dirs[2].w);
      const d = dirs[pick];

      for(let s=1; s<=stepMax; s++){
        const nx = xi + d.sx*s;
        const ny = yi + d.sy*s;

        if(nx===xi && ny===yi) continue;
        if(!withinBand(nx, ny, p, r0, tol)) continue;

        const key = occKey(nx, ny);
        if(sim.occ.has(key)) continue;

        sim.x[i] = nx;
        sim.y[i] = ny;
        sim.occ.set(key, i);
        return;
      }

      dirs[pick].w *= 0.7;
    }
  }

  // deterministic escape
  const nx = xi + 100000 + ((i*13) % 97);
  const ny = yi + 100000 + ((i*17) % 89);
  sim.x[i]=nx; sim.y[i]=ny;
  sim.occ.set(occKey(nx, ny), i);
}

function updateCenters(state){
  if(!state.settings.centerUpdate) return;

  const sim = state.sim;
  const P = state.particles.length;

  const sx = new Float64Array(P);
  const sy = new Float64Array(P);
  const sc = new Int32Array(P);

  for(let i=0;i<sim.N;i++){
    const id = (sim.pid[i] + 0.5)|0;
    sx[id] += sim.x[i];
    sy[id] += sim.y[i];
    sc[id] += 1;
  }

  const a = state.settings.centerAlpha;
  for(const p of state.particles){
    const id = p.id;
    const cx = sc[id] ? sx[id]/sc[id] : p.cx;
    const cy = sc[id] ? sy[id]/sc[id] : p.cy;
    p.cx = lerp(p.cx, cx, a);
    p.cy = lerp(p.cy, cy, a);
  }
}

export function stepEpoch(state){
  const sim = state.sim;
  const N = sim.N;

  const stride = 97;
  const start = (state.runtime.epoch * stride) % N;

  for(let k=0;k<N;k++){
    const i = (start + k) % N;
    moveDotGuaranteed(state, i);
  }

  updateCenters(state);
  state.runtime.epoch++;
}

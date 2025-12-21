import { MAX_P, PALETTE } from "./config.js";
import { clamp, lerp, hexToRgb, sigmaFromR, occKey } from "./utils.js";
import { recenterCameraToParticles } from "./camera.js";

/* =========================
   Particles
========================= */
export function makeParticle(index, viewDefault){
  const pal = PALETTE[index % PALETTE.length];
  const d = viewDefault * 0.35;

  const cx = (index === 0)
    ? -d * 0.5
    : (index === 1)
      ? +d * 0.5
      : (index - 1) * 0.45 * d;

  const cy = (index % 2 === 0) ? -0.08 * d : +0.08 * d;

  const R = Math.max(40, d);

  return {
    id: index,
    name: String.fromCharCode(65 + index),
    cx,
    cy,
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
    pid: new Float32Array(N),
    rDes: new Float32Array(N),
    occ: new Map(),
    posInter: new Float32Array(N * 2),
  };
}

function isFree(sim, ix, iy){
  return !sim.occ.has(occKey(ix, iy));
}

/*
If ρ(z)=1/(πσ_C²) exp(-|z|²/σ_C²), then the radial pdf is
f(r) = (2r/σ_C²) exp(-r²/σ_C²).
This is Rayleigh with scale a = σ_C/√2.
*/
function rayleighFromSigmaC(sigmaC){
  const a = sigmaC / Math.SQRT2;
  const u = Math.max(1e-12, 1 - Math.random());
  return a * Math.sqrt(-2 * Math.log(u));
}

function normal01(){
  // Box–Muller
  let u = 0;
  let v = 0;
  while(u === 0) u = Math.random();
  while(v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function wrapAngle(theta){
  const twopi = Math.PI * 2;
  theta = theta % twopi;
  if(theta < 0) theta += twopi;
  return theta;
}

function placeDot(sim, dotIndex, p){
  const sigmaC = sigmaFromR(p.R);

  for(let k = 0; k < 200; k++){
    const r = rayleighFromSigmaC(sigmaC);
    const a = Math.random() * Math.PI * 2;

    const xx = Math.round(p.cx + r * Math.cos(a));
    const yy = Math.round(p.cy + r * Math.sin(a));

    const key = occKey(xx, yy);
    if(sim.occ.has(key)) continue;

    sim.x[dotIndex] = xx;
    sim.y[dotIndex] = yy;
    sim.pid[dotIndex] = p.id;
    sim.rDes[dotIndex] = r;

    sim.occ.set(key, dotIndex);
    return true;
  }
  return false;
}

/* =========================
   Reseed (all particles)
========================= */
export function reseed(state, { recenter = true } = {}){
  if(state.particles.length > MAX_P) state.particles.length = MAX_P;

  allocSim(state);
  const sim = state.sim;

  let k = 0;
  for(const p of state.particles){
    for(let i = 0; i < state.settings.dotsPerParticle; i++){
      if(!placeDot(sim, k, p)){
        // deterministic outward search for a free cell
        const baseX = Math.round(p.cx);
        const baseY = Math.round(p.cy);

        let found = false;
        for(let step = 1; step < 20000 && !found; step++){
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
   Helpers: select dot indices by particle
========================= */
function collectParticleDotIndices(sim, particleIndex){
  const ids = [];
  for(let i = 0; i < sim.N; i++){
    const id = (sim.pid[i] + 0.5) | 0;
    if(id === particleIndex) ids.push(i);
  }
  return ids;
}

function removeOccupancyForDots(sim, ids){
  for(const i of ids){
    sim.occ.delete(occKey(sim.x[i], sim.y[i]));
  }
}

/* =========================
   Collision helpers (avoid huge teleports)
========================= */
function findFreeNear(sim, x0, y0){
  // Fast local search.
  if(!sim.occ.has(occKey(x0, y0))) return [x0, y0];

  const dirs = [
    [ 1,0],[-1,0],[0, 1],[0,-1],
    [ 1,1],[ 1,-1],[-1,1],[-1,-1],
    [ 2,1],[ 2,-1],[-2,1],[-2,-1],
    [ 1,2],[ -1,2],[1,-2],[-1,-2],
  ];

  for(let r = 1; r <= 24; r++){
    for(const [dx, dy] of dirs){
      const nx = x0 + dx * r;
      const ny = y0 + dy * r;
      if(!sim.occ.has(occKey(nx, ny))) return [nx, ny];
    }
  }

  // Broader perimeter search.
  for(let ring = 25; ring <= 1200; ring++){
    for(let dx = -ring; dx <= ring; dx++){
      const a1 = [x0 + dx, y0 - ring];
      const a2 = [x0 + dx, y0 + ring];
      if(!sim.occ.has(occKey(a1[0], a1[1]))) return a1;
      if(!sim.occ.has(occKey(a2[0], a2[1]))) return a2;
    }
    for(let dy = -ring + 1; dy <= ring - 1; dy++){
      const b1 = [x0 - ring, y0 + dy];
      const b2 = [x0 + ring, y0 + dy];
      if(!sim.occ.has(occKey(b1[0], b1[1]))) return b1;
      if(!sim.occ.has(occKey(b2[0], b2[1]))) return b2;
    }
  }

  // Guaranteed eventual fallback (still finite, not a huge teleport).
  for(let step = 1201; step < 20000; step++){
    const nx = x0 + step;
    const ny = y0;
    if(!sim.occ.has(occKey(nx, ny))) return [nx, ny];
  }

  return [x0 + 20001, y0];
}

function findFreeOnBand(sim, p, rTarget, x0, y0, tol){
  // Search locally around (x0,y0) but constrain to |r - rTarget| <= tol.
  for(let ring = 0; ring <= 36; ring++){
    for(let dx = -ring; dx <= ring; dx++){
      const candidates = [
        [x0 + dx, y0 - ring],
        [x0 + dx, y0 + ring],
      ];
      for(const [nx, ny] of candidates){
        const rr = Math.hypot(nx - p.cx, ny - p.cy);
        if(Math.abs(rr - rTarget) > tol) continue;
        const key = occKey(nx, ny);
        if(!sim.occ.has(key)) return [nx, ny];
      }
    }
    for(let dy = -ring + 1; dy <= ring - 1; dy++){
      const candidates = [
        [x0 - ring, y0 + dy],
        [x0 + ring, y0 + dy],
      ];
      for(const [nx, ny] of candidates){
        const rr = Math.hypot(nx - p.cx, ny - p.cy);
        if(Math.abs(rr - rTarget) > tol) continue;
        const key = occKey(nx, ny);
        if(!sim.occ.has(key)) return [nx, ny];
      }
    }
  }

  // If local band is dense, scan along the ring by angle increments.
  const dTheta = 1 / Math.max(1, rTarget);
  const theta0 = Math.atan2(y0 - p.cy, x0 - p.cx);

  for(let m = 0; m < 600; m++){
    const j = (m === 0) ? 0 : Math.ceil(m / 2) * (m % 2 === 0 ? +1 : -1);
    const th = theta0 + j * dTheta;
    const nx = Math.round(p.cx + rTarget * Math.cos(th));
    const ny = Math.round(p.cy + rTarget * Math.sin(th));

    const rr = Math.hypot(nx - p.cx, ny - p.cy);
    if(Math.abs(rr - rTarget) > tol * 2) continue;

    const key = occKey(nx, ny);
    if(!sim.occ.has(key)) return [nx, ny];
  }

  // As a last resort, slightly widen the band.
  return findFreeNear(sim, x0, y0);
}

/* =========================
   Gaussianize one particle
========================= */
export function gaussianizeParticle(state, particleIndex){
  const sim = state.sim;
  const p = state.particles[particleIndex];
  if(!sim || !p) return;

  const ids = collectParticleDotIndices(sim, particleIndex);
  if(!ids.length) return;

  removeOccupancyForDots(sim, ids);

  const n = ids.length;
  const sigmaC = sigmaFromR(p.R);
  const a = sigmaC / Math.SQRT2;

  const golden = Math.PI * (3 - Math.sqrt(5));
  const phi0 = Math.random() * Math.PI * 2;

  for(let k = 0; k < n; k++){
    const i = ids[k];

    const u = (k + 0.5) / n;
    const r = a * Math.sqrt(-2 * Math.log(Math.max(1e-12, 1 - u)));
    const ang = (phi0 + k * golden) % (Math.PI * 2);

    const x0 = Math.round(p.cx + r * Math.cos(ang));
    const y0 = Math.round(p.cy + r * Math.sin(ang));

    const [nx, ny] = findFreeOnBand(sim, p, r, x0, y0, 1.6);

    sim.x[i] = nx;
    sim.y[i] = ny;
    sim.rDes[i] = r;
    sim.occ.set(occKey(nx, ny), i);
  }
}

/* =========================
   Collarize one particle

   - Random peak angle for ring 1
   - θ-Gaussian peak on each ring
   - Ring-to-ring phase shift:
     Δθ(r) = spin × phaseScale × (Δr / r)
========================= */
export function collarizeParticle(state, particleIndex){
  const sim = state.sim;
  const p = state.particles[particleIndex];
  if(!sim || !p) return;

  const ids = collectParticleDotIndices(sim, particleIndex);
  if(!ids.length) return;

  removeOccupancyForDots(sim, ids);

  const sigmaC = sigmaFromR(p.R);
  const dr = 1.0;
  const rMax = Math.max(4, Math.round(p.R));
  const K = Math.max(1, Math.floor(rMax / dr));

  const thetaSigma = 0.38;
  const phaseScale = 1.0;
  const maxDeltaTheta = 0.95;

  const spin = (p.spin === -1) ? -1 : +1;

  const baseTheta = Math.random() * Math.PI * 2;
  let thetaCenter = baseTheta;

  const radii = new Float64Array(K);
  for(let k = 0; k < K; k++){
    radii[k] = (k + 0.5) * dr;
  }

  // radial Gaussian weights: r exp(-r^2/σ^2)
  const weights = new Float64Array(K);
  let wsum = 0;
  for(let k = 0; k < K; k++){
    const r = radii[k];
    const w = r * Math.exp(-(r * r) / (sigmaC * sigmaC));
    weights[k] = w;
    wsum += w;
  }
  if(wsum <= 0) wsum = 1;

  const n = ids.length;
  const counts = new Int32Array(K);
  const frac = new Float64Array(K);

  let baseSum = 0;
  for(let k = 0; k < K; k++){
    const raw = (weights[k] / wsum) * n;
    const c = Math.floor(raw);
    counts[k] = c;
    frac[k] = raw - c;
    baseSum += c;
  }

  let rem = n - baseSum;
  if(rem > 0){
    const idx = [...Array(K).keys()];
    idx.sort((a, b) => frac[b] - frac[a]);
    for(let t = 0; t < rem; t++) counts[idx[t % K]] += 1;
  }

  function deltaThetaForRadius(r){
    const rr = Math.max(dr * 0.5, r);
    const dth = spin * phaseScale * (dr / rr);
    return clamp(dth, -maxDeltaTheta, +maxDeltaTheta);
  }

  let cursor = 0;
  for(let k = 0; k < K; k++){
    const nk = counts[k];
    const r = radii[k];

    for(let t = 0; t < nk; t++){
      const i = ids[cursor++];

      const theta = wrapAngle(thetaCenter + thetaSigma * normal01());
      const x0 = Math.round(p.cx + r * Math.cos(theta));
      const y0 = Math.round(p.cy + r * Math.sin(theta));

      const [nx, ny] = findFreeOnBand(sim, p, r, x0, y0, 1.6);

      sim.x[i] = nx;
      sim.y[i] = ny;
      sim.rDes[i] = r;
      sim.occ.set(occKey(nx, ny), i);
    }

    thetaCenter = wrapAngle(thetaCenter + deltaThetaForRadius(r));
  }
}

/* =========================
   Epoch update rule
========================= */
function domAxisStep(vx, vy){
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  if(ax === 0.0 && ay === 0.0) return [1, 0];
  if(ax >= ay) return [vx > 0 ? 1 : -1, 0];
  return [0, vy > 0 ? 1 : -1];
}

function withinBand(nx, ny, p, r0, tol){
  const dx = nx - p.cx;
  const dy = ny - p.cy;
  const rr = Math.sqrt(dx * dx + dy * dy);
  return (rr >= (r0 - tol)) && (rr <= (r0 + tol));
}

function weightedPick3(w0, w1, w2){
  const s = w0 + w1 + w2;
  let r = Math.random() * s;
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
 *
 * BUG FIX:
 * - Removed huge teleports
 * - Added safe fallback scans (stay near the collar band)
 */
function moveDotGuaranteed(state, i){
  const sim = state.sim;
  const ringTol = state.settings.ringTol;

  const xi = sim.x[i];
  const yi = sim.y[i];
  const id = (sim.pid[i] + 0.5) | 0;
  const p = state.particles[id];

  const r0 = sim.rDes[i];

  const dx = xi - p.cx;
  const dy = yi - p.cy;

  const f = domAxisStep(p.spin * dy, -p.spin * dx);
  const rin = domAxisStep(-dx, -dy);
  const rout = [-rin[0], -rin[1]];

  const dirs = [
    { sx: f[0],   sy: f[1],   w: 1.0 },
    { sx: rin[0], sy: rin[1], w: 1.0 },
    { sx: rout[0],sy: rout[1],w: 1.0 },
  ];

  sim.occ.delete(occKey(xi, yi));

  for(let expand = 0; expand < 7; expand++){
    const stepMax = Math.min(1 + expand * 3, 60);
    const tol = ringTol * (1 + 0.35 * expand);

    for(let attempt = 0; attempt < 10; attempt++){
      const pick = weightedPick3(dirs[0].w, dirs[1].w, dirs[2].w);
      const d = dirs[pick];

      for(let s = 1; s <= stepMax; s++){
        const nx = xi + d.sx * s;
        const ny = yi + d.sy * s;
        if(nx === xi && ny === yi) continue;

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

  const tolMax = ringTol * 10;
  const hardDirs = [f, rin, rout];

  for(let s = 1; s <= 4096; s++){
    for(const [sx, sy] of hardDirs){
      const nx = xi + sx * s;
      const ny = yi + sy * s;
      if(nx === xi && ny === yi) continue;

      if(!withinBand(nx, ny, p, r0, tolMax)) continue;

      const key = occKey(nx, ny);
      if(sim.occ.has(key)) continue;

      sim.x[i] = nx;
      sim.y[i] = ny;
      sim.occ.set(key, i);
      return;
    }
  }

  const theta0 = Math.atan2(yi - p.cy, xi - p.cx);
  const dTheta = 1 / Math.max(1, r0);

  for(let m = 0; m < 6000; m++){
    const j = (m === 0) ? 0 : Math.ceil(m / 2) * (m % 2 === 0 ? +1 : -1);
    const th = theta0 + j * dTheta;
    const nx = Math.round(p.cx + r0 * Math.cos(th));
    const ny = Math.round(p.cy + r0 * Math.sin(th));

    if(nx === xi && ny === yi) continue;
    const key = occKey(nx, ny);
    if(sim.occ.has(key)) continue;

    sim.x[i] = nx;
    sim.y[i] = ny;
    sim.occ.set(key, i);
    return;
  }

  const [nx, ny] = findFreeNear(sim, xi + 1, yi);
  sim.x[i] = nx;
  sim.y[i] = ny;
  sim.occ.set(occKey(nx, ny), i);
}

function updateCenters(state){
  if(!state.settings.centerUpdate) return;

  const sim = state.sim;
  const P = state.particles.length;

  const sx = new Float64Array(P);
  const sy = new Float64Array(P);
  const sc = new Int32Array(P);

  for(let i = 0; i < sim.N; i++){
    const id = (sim.pid[i] + 0.5) | 0;
    sx[id] += sim.x[i];
    sy[id] += sim.y[i];
    sc[id] += 1;
  }

  const a = state.settings.centerAlpha;
  for(const p of state.particles){
    const id = p.id;
    const cx = sc[id] ? sx[id] / sc[id] : p.cx;
    const cy = sc[id] ? sy[id] / sc[id] : p.cy;
    p.cx = lerp(p.cx, cx, a);
    p.cy = lerp(p.cy, cy, a);
  }
}

export function stepEpoch(state){
  const sim = state.sim;
  const N = sim.N;

  const stride = 97;
  const start = (state.runtime.epoch * stride) % N;

  for(let k = 0; k < N; k++){
    const i = (start + k) % N;
    moveDotGuaranteed(state, i);
  }

  updateCenters(state);
  state.runtime.epoch++;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp  = (a, b, t) => a + (b - a) * t;

export function hexToRgb(hex){
  const h = hex.replace("#","").trim();
  const full = h.length === 3 ? h.split("").map(c => c+c).join("") : h;
  const n = parseInt(full, 16);
  return [(n>>16)&255, (n>>8)&255, (n)&255].map(x => x/255);
}
export function rgbToHex(rgb){
  const c = rgb.map(x => clamp(Math.round(x*255),0,255).toString(16).padStart(2,"0"));
  return "#"+c.join("");
}

// Relator rule used in your UI note: σ = R / √π
export function sigmaFromR(R){
  return R / Math.sqrt(Math.PI);
}

// Unbounded occupancy key (no wrap)
export function occKey(ix, iy){
  return `${ix},${iy}`;
}

// Rayleigh sampling: r = σ * sqrt(-2 ln(1-u))
export function rayleigh(sigma){
  const u = Math.max(1e-12, 1 - Math.random());
  return sigma * Math.sqrt(-2 * Math.log(u));
}

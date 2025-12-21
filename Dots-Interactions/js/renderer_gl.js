import { MAX_P } from "./config.js";
import { aspect, viewW } from "./camera.js";

function compileShader(gl, type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(log);
  }
  return s;
}

export function createGLRenderer(glCanvas){
  const gl = glCanvas.getContext("webgl2", { antialias:false, preserveDrawingBuffer:false });
  if(!gl) throw new Error("WebGL2 not available");

  const VS = `#version 300 es
precision highp float;
precision highp int;

in vec2 aPos;
in float aPid;

uniform vec2 uCam;
uniform vec2 uView;

uniform vec2 uCenter[${MAX_P}];
uniform vec3 uGrad0[${MAX_P}];
uniform vec3 uGrad1[${MAX_P}];
uniform float uR[${MAX_P}];

uniform float uPointSize;

out vec4 vColor;

void main(){
  int pid = int(aPid + 0.5);
  vec2 c = uCenter[pid];
  float r = length(aPos - c);

  float R = max(1e-6, uR[pid]);
  float t = clamp(r / R, 0.0, 1.0);

  vec3 col = mix(uGrad0[pid], uGrad1[pid], t);
  vColor = vec4(col, 1.0);

  float nx = (aPos.x - uCam.x) / (uView.x * 0.5);
  float ny = - (aPos.y - uCam.y) / (uView.y * 0.5);
  gl_Position = vec4(nx, ny, 0.0, 1.0);

  gl_PointSize = uPointSize;
}
`;

  const FS = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 outColor;
uniform float uAlpha;

void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p,p);
  if(d > 1.0) discard;
  float a = smoothstep(1.0, 0.75, d) * uAlpha;
  outColor = vec4(vColor.rgb, a);
}
`;

  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog, gl.LINK_STATUS)){
    throw new Error(gl.getProgramInfoLog(prog));
  }
  gl.useProgram(prog);

  const loc = {
    aPos: gl.getAttribLocation(prog, "aPos"),
    aPid: gl.getAttribLocation(prog, "aPid"),
    uCam: gl.getUniformLocation(prog, "uCam"),
    uView: gl.getUniformLocation(prog, "uView"),
    uPointSize: gl.getUniformLocation(prog, "uPointSize"),
    uAlpha: gl.getUniformLocation(prog, "uAlpha"),

    uCenter0: gl.getUniformLocation(prog, "uCenter[0]"),
    uGrad00: gl.getUniformLocation(prog, "uGrad0[0]"),
    uGrad10: gl.getUniformLocation(prog, "uGrad1[0]"),
    uR0:     gl.getUniformLocation(prog, "uR[0]"),
  };

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer();
  const pidBuf = gl.createBuffer();

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function upload(state){
    const sim = state.sim;

    // build interleaved positions
    for(let i=0;i<sim.N;i++){
      sim.posInter[i*2] = sim.x[i];
      sim.posInter[i*2+1] = sim.y[i];
    }

    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, sim.posInter, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, pidBuf);
    gl.bufferData(gl.ARRAY_BUFFER, sim.pid, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc.aPid);
    gl.vertexAttribPointer(loc.aPid, 1, gl.FLOAT, false, 0, 0);
  }

  function updatePositions(state){
    const sim = state.sim;
    for(let i=0;i<sim.N;i++){
      sim.posInter[i*2] = sim.x[i];
      sim.posInter[i*2+1] = sim.y[i];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, sim.posInter);
  }

  function draw(state){
    const theme = state.theme;
    gl.clearColor(theme.glClear[0], theme.glClear[1], theme.glClear[2], theme.glClear[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(prog);

    const cam = state.camera;
    const vw = viewW(cam, glCanvas);

    gl.uniform2f(loc.uCam, cam.camX, cam.camY);
    gl.uniform2f(loc.uView, vw, cam.viewH);

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    gl.uniform1f(loc.uPointSize, state.settings.pointSize * dpr);
    gl.uniform1f(loc.uAlpha, state.settings.dotAlpha);

    // pack uniforms into flat arrays
    const centers = new Float32Array(MAX_P*2);
    const g0 = new Float32Array(MAX_P*3);
    const g1 = new Float32Array(MAX_P*3);
    const R  = new Float32Array(MAX_P);

    for(let i=0;i<MAX_P;i++){
      const p = state.particles[i];
      if(p){
        centers[i*2]   = p.cx;
        centers[i*2+1] = p.cy;
        g0.set(p.grad0, i*3);
        g1.set(p.grad1, i*3);
        R[i] = Math.max(1e-6, p.R);
      }else{
        centers[i*2] = 0; centers[i*2+1] = 0;
        g0.set([0,0,0], i*3);
        g1.set([0,0,0], i*3);
        R[i] = 1;
      }
    }

    gl.uniform2fv(loc.uCenter0, centers);
    gl.uniform3fv(loc.uGrad00, g0);
    gl.uniform3fv(loc.uGrad10, g1);
    gl.uniform1fv(loc.uR0, R);

    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, state.sim.N);
  }

  function resizeViewport(){
    gl.viewport(0,0,glCanvas.width, glCanvas.height);
  }

  return { gl, upload, updatePositions, draw, resizeViewport };
}

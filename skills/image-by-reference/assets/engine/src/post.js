// WebGL finishing pass at output resolution. Every effect is optional and must come from the
// style bible: grade (contrast/saturation/tint), vignette, grain, chromatic aberration, and
// paletteLock (snap to the picture's inks, optionally dithered: pixel art, limited-ink prints).
const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;
const FS = `precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 res;
uniform float vig, grain, grainSize, seed, contrast, saturation, tintAmt, ca, lockAmt, dither;
uniform vec3 tint;
uniform vec3 pal[16];
uniform int palN;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + seed) * 43758.5453); }
void main(){
  vec2 st = vec2(uv.x, 1.0 - uv.y);
  vec3 col;
  if (ca > 0.0) {
    vec2 d = (uv - 0.5) * ca / res * 2.0; d.y = -d.y;
    col = vec3(texture2D(tex, st + d).r, texture2D(tex, st).g, texture2D(tex, st - d).b);
  } else col = texture2D(tex, st).rgb;
  if (lockAmt > 0.0 && palN > 0) {
    vec3 q = col;
    if (dither > 0.0) {
      float ign = fract(52.9829189 * fract(0.06711056 * gl_FragCoord.x + 0.00583715 * gl_FragCoord.y));
      q += (ign - 0.5) * dither;
    }
    vec3 best = pal[0]; float bd = 1e9;
    for (int i = 0; i < 16; i++) {
      if (i >= palN) break;
      vec3 e = (q - pal[i]) * vec3(0.30, 0.59, 0.11);
      float dd = dot(e, e);
      if (dd < bd) { bd = dd; best = pal[i]; }
    }
    col = mix(col, best, lockAmt);
  }
  col = (col - 0.5) * contrast + 0.5;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, saturation);
  col = mix(col, col * tint * 1.6, tintAmt);
  vec2 c = uv - 0.5; c.x *= res.x / res.y;
  float maxr2 = 0.25 * (res.x / res.y) * (res.x / res.y) + 0.25;
  col *= 1.0 - vig * smoothstep(0.25, 1.05, dot(c, c) / maxr2 * 1.15);
  col += (h(floor(gl_FragCoord.xy / max(grainSize, 1.0))) - 0.5) * grain;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class Post {
  constructor(w, h, { nearest = false } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    const gl = this.gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL unavailable');
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    const f = nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.u = n => gl.getUniformLocation(pr, n);
  }
  // grainSize in px; palette: [[r,g,b] 0..1] up to 16 (see palette.lockList)
  run(src, { vig = 0, grain = 0, grainSize = 1, seed = 0, contrast = 1, saturation = 1, tint = [1, 1, 1], tintAmt = 0, ca = 0, palette = [], lock = 0, dither = 0 } = {}) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const f = (n, v) => gl.uniform1f(this.u(n), v);
    f('vig', vig); f('grain', grain); f('grainSize', grainSize); f('seed', seed); f('contrast', contrast);
    f('saturation', saturation); f('tintAmt', tintAmt); f('ca', ca); f('lockAmt', palette.length ? lock : 0); f('dither', dither);
    gl.uniform2f(this.u('res'), this.canvas.width, this.canvas.height);
    gl.uniform3fv(this.u('tint'), tint);
    const pal = new Float32Array(48);
    palette.slice(0, 16).forEach((c, i) => pal.set(c, i * 3));
    gl.uniform3fv(this.u('pal'), pal);
    gl.uniform1i(this.u('palN'), Math.min(16, palette.length));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

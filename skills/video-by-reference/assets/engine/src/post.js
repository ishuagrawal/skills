// WebGL post pass. Every effect is optional and should come from the style bible:
// barrel lens (k), vignette, grain (held on twos by the caller's seed), grade
// (contrast / saturation / tint), chromatic aberration (ca, px), and flash frames.
const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;
const FS = `precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 res;
uniform float k, aspect, vig, grain, seed, flash, contrast, saturation, tintAmt, ca;
uniform vec3 flashCol, tint;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + seed) * 43758.5453); }
vec2 lens(vec2 u){
  vec2 c = u - 0.5; c.x *= aspect;
  float r2 = dot(c,c), maxr2 = 0.25*aspect*aspect + 0.25;
  c *= (1.0 + k*r2) / (1.0 + k*maxr2*0.92);
  c.x /= aspect;
  vec2 st = c + 0.5;
  return vec2(st.x, 1.0 - st.y);
}
void main(){
  vec2 st = lens(uv);
  vec3 col;
  if (ca > 0.0) {
    vec2 d = (uv - 0.5) * ca / res * 2.0;
    col = vec3(texture2D(tex, lens(uv + d)).r, texture2D(tex, st).g, texture2D(tex, lens(uv - d)).b);
  } else col = texture2D(tex, st).rgb;
  // grade
  col = (col - 0.5) * contrast + 0.5;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, saturation);
  col = mix(col, col * tint * 1.6, tintAmt);
  // vignette
  vec2 c = uv - 0.5; c.x *= aspect;
  float maxr2 = 0.25*aspect*aspect + 0.25;
  col *= 1.0 - vig * smoothstep(0.25, 1.05, dot(c,c) / maxr2 * 1.15);
  col += (h(floor(gl_FragCoord.xy*0.5)) - 0.5) * grain;
  col = mix(col, flashCol, flash);
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
    const pr = this.pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    gl.useProgram(pr);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    const f = nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.u = n => gl.getUniformLocation(pr, n);
  }
  run(src, {
    k = 0, vig = 0.25, grain = 0.03, seed = 0, flash = 0, flashCol = [1, 1, 1],
    contrast = 1, saturation = 1, tint = [1, 1, 1], tintAmt = 0, ca = 0,
  } = {}) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const f = (n, v) => gl.uniform1f(this.u(n), v);
    f('k', k); f('aspect', this.canvas.width / this.canvas.height); f('vig', vig); f('grain', grain);
    f('seed', seed); f('flash', flash); f('contrast', contrast); f('saturation', saturation);
    f('tintAmt', tintAmt); f('ca', ca);
    gl.uniform2f(this.u('res'), this.canvas.width, this.canvas.height);
    gl.uniform3fv(this.u('flashCol'), flashCol);
    gl.uniform3fv(this.u('tint'), tint);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

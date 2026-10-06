uniform vec3 uColor;
uniform vec3 uLine;
uniform float uFogDensity;
varying vec3 vWorld;
varying float vDepth;
void main() {
  vec2 g = vWorld.xz * 0.5;
  vec2 grid = abs(fract(g - 0.5) - 0.5) / fwidth(g);
  float line = 1.0 - min(min(grid.x, grid.y), 1.0);
  float fog = exp(-pow(uFogDensity * vDepth, 2.0));
  float near = smoothstep(0.0, 4.0, vDepth);
  vec3 color = uColor + uLine * line * 0.05 * near;
  gl_FragColor = vec4(mix(uColor, color, fog), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}

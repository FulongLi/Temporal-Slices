// Temporal slice: a thin membrane that reacts to being observed.
// Deformation happens here rather than with a skeleton, so all slices share
// one geometry and one program, and each costs only a handful of uniforms.

uniform float uTime;
uniform float uSeed;
uniform vec2 uSize;     // world width / height of the surface
uniform float uBend;    // spring-driven bow; >0 bulges toward the observer
uniform float uDrag;    // bend induced by travelling through time
uniform float uRipple;  // concentric disturbance from the centre

varying vec2 vUv;
varying vec3 vWorld;
varying float vDepth;

void main() {
  vUv = uv;
  vec3 p = position;
  float u = uv.x * 2.0 - 1.0;
  float v = uv.y * 2.0 - 1.0;
  float across = 1.0 - u * u;

  float bow = uBend * across * (1.0 - 0.3 * v * v) * 0.24;
  float drag = uDrag * across * (0.8 + 0.2 * v) * 0.22;
  float r = length(vec2(u * uSize.x / uSize.y, v));
  float ripple = uRipple * sin(r * 7.0 - uTime * 2.6) * exp(-r * 0.8) * 0.07;
  float breathe = sin(uTime * 0.55 + uSeed * 6.2831 + u * 1.7 + v * 0.9) * 0.008;
  p.z += bow + drag + ripple + breathe;

  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vec4 view = viewMatrix * world;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}

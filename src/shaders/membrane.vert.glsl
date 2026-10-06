// The membrane between the volume and a moment: the entered slice again,
// in the moment's own space. It bows and ripples as the camera meets it.

uniform float uTime;
uniform vec2 uSize;
uniform float uBend;
uniform float uRipple;

out vec2 vUv;

void main() {
  vUv = uv;
  vec3 p = position;
  vec2 q = uv * 2.0 - 1.0;
  float across = 1.0 - q.x * q.x;
  float r = length(vec2(q.x * uSize.x / uSize.y, q.y));
  p.z += uBend * across * (1.0 - 0.35 * q.y * q.y) * 0.08;
  p.z += uRipple * sin(r * 7.0 - uTime * 2.6) * exp(-r * 0.8) * 0.07;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}

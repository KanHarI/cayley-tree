// GLSL for the three instanced primitives. Each instance is drawn as a quad around its shape and
// shaded by its signed distance, which gives exact round caps and one device pixel of antialiasing.
//
// Shared uniforms:
//   u_view  = (origin x, origin y, px per unit, device pixel ratio), origin and sizes in CSS px
//   u_res   = canvas size in CSS px
//   u_xform = (scale, offset x, offset y): the piece's similarity, in units

const header = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 u_view;
uniform vec2 u_res;
uniform vec3 u_xform;
vec2 toPx(vec2 p) { return u_view.xy + u_view.z * (u_xform.yz + u_xform.x * p); }
vec4 toClip(vec2 px) { return vec4(px.x / u_res.x * 2.0 - 1.0, 1.0 - px.y / u_res.y * 2.0, 0.0, 1.0); }
// Coverage of a pixel by a shape at signed distance d (CSS px; negative inside).
float coverage(float d) { return clamp(0.5 - d * u_view.w, 0.0, 1.0); }
`;

/** Edges: capsules whose width follows their drawn length. */
export const segmentVS = header + /* glsl */ `
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_seg;
layout(location = 2) in float a_gen;
uniform float u_widthLen;   // > 0: as wide as an edge this many px long (the bridge keeps its width as it stretches)
uniform vec2 u_widen;       // width -> width * x + y (the geodesic glow is a wider stroke)
out vec2 v_local;
out float v_len;
out float v_half;
out float v_fade;
flat out float v_gen;
void main() {
  vec2 p0 = toPx(a_seg.xy), p1 = toPx(a_seg.zw);
  vec2 d = p1 - p0;
  float len = length(d);
  vec2 along = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 across = vec2(-along.y, along.x);
  float wl = u_widthLen > 0.0 ? u_widthLen : len;
  float w = clamp(wl * 0.016, 0.55, 3.2) * u_widen.x + u_widen.y;
  float pad = 0.5 * w + 1.0 / u_view.w;
  float s = mix(-pad, len + pad, 0.5 + 0.5 * a_corner.x);
  float t = a_corner.y * pad;
  v_local = vec2(s, t);
  v_len = len;
  v_half = 0.5 * w;
  v_fade = smoothstep(0.6, 1.2, len);   // edges under a pixel long fade out rather than pop
  v_gen = a_gen;
  gl_Position = toClip(p0 + along * s + across * t);
}`;

export const segmentFS = header + /* glsl */ `
in vec2 v_local;
in float v_len;
in float v_half;
in float v_fade;
flat in float v_gen;
uniform vec3 u_colA;
uniform vec3 u_colB;
uniform vec3 u_colFixed;
uniform float u_useFixed;
uniform float u_opacity;
out vec4 outColor;
void main() {
  float x = clamp(v_local.x, 0.0, v_len);
  float a = coverage(length(vec2(v_local.x - x, v_local.y)) - v_half) * v_fade * u_opacity;
  if (a <= 0.0) discard;
  vec3 c = u_useFixed > 0.5 ? u_colFixed : (v_gen > 0.5 ? u_colB : u_colA);
  outColor = vec4(c * a, a);
}`;

/** Junction dots, sized by the junction. */
export const dotVS = header + /* glsl */ `
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec3 a_node;
out vec2 v_local;
out float v_rad;
out float v_fade;
void main() {
  float sz = a_node.z * u_xform.x * u_view.z;
  v_rad = clamp(sz * 0.03, 0.9, 5.5);
  v_fade = smoothstep(1.3, 1.9, sz);
  v_local = a_corner * (v_rad + 1.0 / u_view.w);
  gl_Position = toClip(toPx(a_node.xy) + v_local);
}`;

export const dotFS = header + /* glsl */ `
in vec2 v_local;
in float v_rad;
in float v_fade;
uniform vec3 u_color;
out vec4 outColor;
void main() {
  float a = coverage(length(v_local) - v_rad) * v_fade;
  if (a <= 0.0) discard;
  outColor = vec4(u_color * a, a);
}`;

/** Orientation chevrons at edge midpoints: a-edges point right, b-edges point up. */
export const arrowVS = header + /* glsl */ `
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_seg;
layout(location = 2) in float a_gen;
out vec2 v_local;
out float v_h;
out float v_fade;
flat out float v_gen;
void main() {
  vec2 p0 = toPx(a_seg.xy), p1 = toPx(a_seg.zw);
  float len = distance(p0, p1);
  v_fade = clamp((len - 28.0) / 12.0, 0.0, 1.0);
  if (v_fade <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // too short for a chevron
  v_h = min(7.0, len * 0.07);
  v_gen = a_gen;
  v_local = a_corner * (v_h * 1.3 + 1.0 + 1.0 / u_view.w);
  gl_Position = toClip(0.5 * (p0 + p1) + v_local);
}`;

export const arrowFS = header + /* glsl */ `
in vec2 v_local;
in float v_h;
in float v_fade;
flat in float v_gen;
uniform vec3 u_colA;
uniform vec3 u_colB;
out vec4 outColor;
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
void main() {
  float h = v_h;
  vec2 A, B, C;
  if (v_gen < 0.5) { A = vec2(-0.6 * h, -h); B = vec2(0.6 * h, 0.0); C = vec2(-0.6 * h, h); }
  else { A = vec2(-h, 0.6 * h); B = vec2(0.0, -0.6 * h); C = vec2(h, 0.6 * h); }
  float stroke = max(1.0, h * 0.28);
  float a = coverage(min(segDist(v_local, A, B), segDist(v_local, B, C)) - 0.5 * stroke) * v_fade;
  if (a <= 0.0) discard;
  outColor = vec4((v_gen > 0.5 ? u_colB : u_colA) * a, a);
}`;

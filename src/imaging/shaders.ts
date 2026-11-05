/**
 * SkSL runtime shaders of the page pipeline. The maths mirrors
 * tools/prototype/enhance_prototype.py (enhance) and filters.ts
 * (enhancePixelReference). Coordinates: `p` is the output pixel centre.
 */

/** Perspective warp only (used for the small background-estimation copy). */
export const WARP_SKSL = `
uniform shader src;
uniform float3 h0;
uniform float3 h1;
uniform float3 h2;
uniform float2 srcSize;

half4 main(float2 p) {
  float3 hp = float3(p, 1.0);
  float w = dot(h2, hp);
  float2 s = float2(dot(h0, hp), dot(h1, hp)) / w;
  if (s.x < 0.0 || s.y < 0.0 || s.x > srcSize.x || s.y > srcSize.y) {
    return half4(1.0, 1.0, 1.0, 1.0);
  }
  return half4(src.eval(s).rgb, 1.0);
}
`;

/** Warp + illumination normalization + levels/colour + unsharp + cleanup. */
export const ENHANCE_SKSL = `
uniform shader src;
uniform shader bg;
uniform shader borderMask;
uniform float3 h0;
uniform float3 h1;
uniform float3 h2;
uniform float2 srcSize;
uniform float2 outSize;
uniform float2 bgSize;
uniform float tap;
uniform float normalizeAmt;
uniform float blackPt;
uniform float whitePt;
uniform float gammaV;
uniform float saturation;
uniform float sharpenAmt;
uniform float mode;
uniform float bwThreshold;
uniform float bwSoftness;
uniform float brightness;
uniform float contrast;
uniform float denoise;
uniform float clean;
uniform float edgeBand;

const float3 LUMA = float3(0.2126, 0.7152, 0.0722);

float3 fetch(float2 p) {
  float3 hp = float3(p, 1.0);
  float w = dot(h2, hp);
  float2 s = float2(dot(h0, hp), dot(h1, hp)) / w;
  if (s.x < 0.0 || s.y < 0.0 || s.x > srcSize.x || s.y > srcSize.y) {
    return float3(1.0);
  }
  return float3(src.eval(s).rgb);
}

half4 main(float2 p) {
  float3 c0 = fetch(p);
  float3 e = fetch(p + float2(tap, 0.0)) + fetch(p - float2(tap, 0.0)) +
             fetch(p + float2(0.0, tap)) + fetch(p - float2(0.0, tap));
  float3 d = fetch(p + float2(tap, tap)) + fetch(p + float2(-tap, tap)) +
             fetch(p + float2(tap, -tap)) + fetch(p - float2(tap, tap));
  float3 blur = (c0 * 4.0 + e * 2.0 + d) / 16.0;

  float3 c = c0;
  if (denoise > 0.5) {
    float dl = abs(dot(c0 - blur, LUMA));
    float wgt = 1.0 - smoothstep(0.02, 0.08, dl);
    c = mix(c0, blur, wgt);
  }

  float2 bp = p * bgSize / outSize;
  float3 b = max(float3(bg.eval(bp).rgb), float3(0.04));
  float3 n = mix(c, c / b, normalizeAmt);
  float3 nb = mix(blur, blur / b, normalizeAmt);
  n = n + sharpenAmt * (n - nb);

  if (mode > 0.5) {
    n = float3(dot(n, LUMA));
  }
  n = pow(clamp((n - blackPt) / (whitePt - blackPt), 0.0, 1.0), float3(gammaV));
  if (mode < 0.5) {
    float l = dot(n, LUMA);
    n = float3(l) + (n - float3(l)) * saturation;
  }
  if (mode > 1.5) {
    float v = smoothstep(bwThreshold - bwSoftness, bwThreshold + bwSoftness, n.r);
    n = float3(v);
  }
  n = (n - 0.5) * contrast + 0.5 + brightness;

  if (clean > 0.5) {
    float m = float(borderMask.eval(bp).r);
    float2 ed = min(p, outSize - p);
    if (min(ed.x, ed.y) < edgeBand) {
      m = 1.0;
    }
    n = mix(n, float3(1.0), m);
  }
  n = clamp(n, 0.0, 1.0);
  return half4(half3(n), 1.0);
}
`;

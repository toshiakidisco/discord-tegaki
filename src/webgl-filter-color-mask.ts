/*
 * 指定色を非表示にするマスク作成フィルタ
 * maskColor: vec3 マスクする色
 */
import WebGLFilterBase from "./webgl-filter-base";

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform sampler2D texture;
uniform float texWidth;
uniform float texHeight;

uniform vec3 maskColor;
uniform float tolerance;

void main(void){
  vec2 tFrag = vec2(1.0 / texWidth, 1.0 / texHeight);
  vec2 st = gl_FragCoord.st * tFrag;
  vec4 texColor = texture2D(texture, st);
  vec3 d = (maskColor/255.0 - texColor.rgb);
  vec3 d2 = d * d;
  const float L = 255.0*255.0;
  float a = L*(d2.r + d2.g + d2.b - 3.0*tolerance) - 3.0;

  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}
`;

let _singleton: FilterColorMask | undefined;
export class FilterColorMask extends WebGLFilterBase {
  constructor() {
    super(FRAGMENT_SHADER_SOURCE, [
      {name: "maskColor", type: "vec3"},
      {name: "tolerance", type: "float"},
    ]);
  }

  static get singleton(): FilterColorMask {
    if (typeof _singleton === "undefined") {
      _singleton = new FilterColorMask();
    }
    return _singleton;
  }
}

export default FilterColorMask;

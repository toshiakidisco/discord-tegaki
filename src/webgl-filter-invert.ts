import WebGLFilterBase from "./webgl-filter-base";

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform sampler2D texture;
uniform float texWidth;
uniform float texHeight;

void main(void){
  vec2 tFrag = vec2(1.0 / texWidth, 1.0 / texHeight);
  vec2 st = gl_FragCoord.st * tFrag;
  float a = texture2D(texture, st).a;
  gl_FragColor  = vec4(0.0, 0.0, 0.0, 1.0 - a);
}
`;

let _singleton: FilterInvert | undefined;
export class FilterInvert extends WebGLFilterBase {
  constructor() {
    super(FRAGMENT_SHADER_SOURCE, []);
  }

  static get singleton(): FilterInvert {
    if (typeof _singleton === "undefined") {
      _singleton = new FilterInvert();
    }
    return _singleton;
  }
}

export default FilterInvert;

import WebGLFilterBase from "./webgl-filter-base";

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform sampler2D texture;
uniform float texWidth;
uniform float texHeight;

void main(void){
  vec2 tFrag = vec2(1.0 / texWidth, 1.0 / texHeight);
  vec2 st = gl_FragCoord.st * tFrag;
  vec4 texColor = texture2D(texture, st);
  gl_FragColor  = texColor;
}
`;

let _singleton: FilterIdentity | undefined;
export class FilterIdentity extends WebGLFilterBase {
  constructor() {
    super(FRAGMENT_SHADER_SOURCE, []);
  }

  static get singleton(): FilterIdentity {
    if (typeof _singleton === "undefined") {
      _singleton = new FilterIdentity();
    }
    return _singleton;
  }
}

export default FilterIdentity;

import WebGLFilterBase from "./webgl-filter-base";

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform sampler2D texture;
uniform float texWidth;
uniform float texHeight;

uniform vec3 paintColor;

void main(void){
  vec2 tFrag = vec2(1.0 / texWidth, 1.0 / texHeight);
  vec2 st = gl_FragCoord.st * tFrag;
  float a = texture2D(texture, st).a;

  gl_FragColor = vec4(paintColor/255.0, a);
}
`;

let _singleton: FilterPaint | undefined;
export class FilterPaint extends WebGLFilterBase {
  constructor() {
    super(FRAGMENT_SHADER_SOURCE, [
      {name: "paintColor", type: "vec3"},
    ]);
  }

  static get singleton(): FilterPaint {
    if (typeof _singleton === "undefined") {
      _singleton = new FilterPaint();
    }
    return _singleton;
  }
}

export default FilterPaint;

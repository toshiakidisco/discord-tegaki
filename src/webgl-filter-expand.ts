/*
 * マスク領域の拡張フィルタ
 * 表示領域の方が拡大される
 * 最大5pxなので、それ以上拡張する場合は繰り返し適応する
 * size: float 拡大量(px)
 */
import WebGLFilterBase from "./webgl-filter-base";

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform sampler2D texture;
uniform float texWidth;
uniform float texHeight;

uniform float size;

void main(void){
  vec2 tFrag = vec2(1.0 / texWidth, 1.0 / texHeight);
  float a = 0.0;
  float lower = -floor(size);
  float upper = ceil(size);
  for (float y = -5.0; y <= 5.0; y++) {
    for (float x = -5.0; x <= 5.0; x++) {
      a += (lower <= y && y <= upper && lower <= x && x <= upper) ? texture2D(texture, (gl_FragCoord.st + vec2(x, y)) * tFrag).a : 0.0;
    }
  }
  gl_FragColor  = vec4(0.0, 0.0, 0.0, a);
}
`;

let _singleton: FilterExpand | undefined;
export class FilterExpand extends WebGLFilterBase {
  constructor() {
    super(FRAGMENT_SHADER_SOURCE, [
      {name: "size", type: "float"}
    ]);
  }

  static get singleton(): FilterExpand {
    if (typeof _singleton === "undefined") {
      _singleton = new FilterExpand();
    }
    return _singleton;
  }
}

export default FilterExpand;

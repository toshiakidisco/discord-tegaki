import WebGLFilter from "./webgl-filter";

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform sampler2D texture;
uniform float texWidth;
uniform float texHeight;

void main(void){
  vec2 tFrag = vec2(1.0 / texWidth, 1.0 / texHeight);
  vec4 texColor = texture2D(texture, gl_FragCoord.st * tFrag);
  gl_FragColor  = texColor;
}
`;

export class FilterIdentity extends WebGLFilter {
  constructor() {
    super(FRAGMENT_SHADER_SOURCE, []);
  }
}

export default FilterIdentity;

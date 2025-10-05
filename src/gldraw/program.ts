import gl from "./gl";
import Shader from "./shader";

type GLSLTypeValue = {
  "int": number,
  "float": number,
  "vec2": [number, number,],
  "vec3": [number, number, number],
  "vec4": [number, number, number, number],
};

type GLSLType = keyof GLSLTypeValue;

let _currentProgram: Program | null = null;

export class Program {
  readonly program: WebGLProgram;
  readonly vertexShader: Shader;
  readonly fragmentShader: Shader;

  constructor(vertexShader: Shader, fragmentShader: Shader) {
    const program = gl.createProgram();

    if (program == null) {
      throw new Error("Failed to create program.");
    }
    gl.attachShader(program, vertexShader.shader);
    gl.attachShader(program, fragmentShader.shader);
    gl.linkProgram(program);
    if (! gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Failed to link program. " + gl.getProgramInfoLog(program));
    }

    this.program = program;
    this.vertexShader = vertexShader;
    this.fragmentShader = fragmentShader;
  }

  use() {
    if (_currentProgram !== null) {
      _currentProgram.vertexShader.endUse(_currentProgram.program);
    }
    this.vertexShader.onUse(this.program);
    _currentProgram = this;
  }
}

export default Program;

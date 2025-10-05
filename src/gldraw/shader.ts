import gl from "./gl";

export class Shader {
  readonly shader: WebGLShader;
  readonly type: number;

  constructor(type: number, code: string) {
    const shader = gl.createShader(type);
    if (shader == null) {
      throw new Error("Failed to create a shader.");
    }

    gl.shaderSource(shader, code);
    gl.compileShader(shader);
    if (! gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error("Failed to compile shader." + gl.getShaderInfoLog(shader));
    }

    this.type = type;
    this.shader = shader;
  }

  onUse(program: WebGLProgram) {}

  endUse(program: WebGLProgram) {}
  
  onLinkedToProgram(program: WebGLProgram) {
  }
}

export default Shader;

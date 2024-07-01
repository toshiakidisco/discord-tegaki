import Manager, { Uniform, UniformType } from "./webgl-filter-manager";

export class WebGLFilterBase {
  readonly program: WebGLProgram;
  readonly uniforms: {[name: string]: Uniform};

  constructor(source: string, uniforms: {name: string; type: UniformType;}[]) {
    const result = Manager.singleton.compile(source, uniforms);
    this.program = result.program;
    this.uniforms = result.uniforms;
  }

  setUniform(name: string, value: any) {
    const uniform = this.uniforms[name];
    if (typeof uniform === "undefined" || uniform.location == null) {
      return;
    }
    const gl = Manager.singleton.gl;
    switch (uniform.type) {
      case "vec4": {
        gl.uniform4fv(uniform.location, value);
        break;
      }
      case "vec3": {
        gl.uniform3fv(uniform.location, value);
        break;
      }
      case "float": {
        gl.uniform1f(uniform.location, value);
        break;
      }
      case "int": {
        gl.uniform1i(uniform.location, value);
        break;
      }
    }
  }
}




export default WebGLFilterBase;
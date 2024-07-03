import gl from "./gl";
import Program from "./program";

class Context {
  #program: Program | null = null;

  useProgram(program: Program | null) {
    if (this.#program !== null) {
      this.#program.vertexShader.endUse(this.#program.program);
      this.#program.fragmentShader.endUse(this.#program.program);
    }
    this.#program = program;
    if (program !== null) {
      program.vertexShader.endUse(program.program);
      program.fragmentShader.endUse(program.program);
    }
  }
}

export const context = new Context();
export default context;

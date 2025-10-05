import gl from "./gl";
import Shader from "./shader";

const VERTEX_SHADER_SOURCE = `
attribute vec2 aPosition;
attribute vec2 aDistance;

varying vec2 distance;

uniform vec2 resolution;

void main(void) {
  distance = aDistance;
  gl_Position = vec4(
    2.0*(aPosition.x)/(resolution.x) - 1.0,
    2.0*(aPosition.y)/(resolution.y) - 1.0,
    0, 1.0
  );
}
`

const BUFFER_STRUCTURE = [
  {
    name: "aPosition",
    size: 2
  },
  {
    name: "aDistance",
    size: 2
  },
] as const;
const VERTEX_STRIDE = (()=>{
  let value = 0;
  for (let attr of BUFFER_STRUCTURE) {
    value += attr.size;
  }
  return value;
})();

const BUFFER_PLANE_MAX = 1024;
const BUFFER_SIZE = Float32Array.BYTES_PER_ELEMENT * 2 * BUFFER_PLANE_MAX;

export class ShaderPlanes extends Shader {
  #buffer = new Float32Array(BUFFER_SIZE);
  #vbo: WebGLBuffer | null = null;
  #vao: WebGLVertexArrayObject | null = null;
  #planeCount: number = 0;

  constructor() {
    super(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  }

  override onUse(program: WebGLProgram) {
    gl.bindVertexArray(this.#vao);
  }

  override endUse(program: WebGLProgram) {
    this.flushBuffer();
    gl.bindVertexArray(null);
  }

  override onLinkedToProgram(program: WebGLProgram) {
    // Create VAO
    const vao = gl.createVertexArray();
    if (vao == null) {
      throw new Error("Failed to create VAO");
    }
    gl.bindVertexArray(vao);
  
    // Create VBO
    const vbo = gl.createBuffer();
    if (vbo == null) {
      throw new Error("Failed to create VBO");
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        this.#buffer.length * Float32Array.BYTES_PER_ELEMENT,
        gl.DYNAMIC_DRAW
    );
    let offset = 0;
    for (let attr of BUFFER_STRUCTURE) {
      const glAttr = gl.getAttribLocation(program, attr.name);
      gl.enableVertexAttribArray(glAttr);
      gl.vertexAttribPointer(
          glAttr, attr.size, gl.FLOAT, false,
          VERTEX_STRIDE * Float32Array.BYTES_PER_ELEMENT,
          offset * Float32Array.BYTES_PER_ELEMENT);
      offset += attr.size;
    }
    
    // Create IBO
    const ibo = gl.createBuffer();
    if (ibo == null) {
      throw new Error("Failed to create IBO");
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    const indexBuffer = new Int16Array(BUFFER_PLANE_MAX * 6);
    for (let i = 0; i < BUFFER_PLANE_MAX; i++) {
      indexBuffer[i*6    ] = i*4;
      indexBuffer[i*6 + 1] = i*4 + 1;
      indexBuffer[i*6 + 2] = i*4 + 2;
      indexBuffer[i*6 + 3] = i*4 + 2;
      indexBuffer[i*6 + 4] = i*4 + 1;
      indexBuffer[i*6 + 5] = i*4 + 3;
    }
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBuffer, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    this.#vao = vao;
    this.#vbo = vbo;
  }

  flushBuffer() {
    if (this.#planeCount == 0) {
      return;
    }

    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0, this.#buffer, 0, this.#planeCount * VERTEX_STRIDE * Float32Array.BYTES_PER_ELEMENT
    );
    gl.drawElements(gl.TRIANGLES, 6 * this.#planeCount, gl.UNSIGNED_SHORT, 0);
    this.#planeCount = 0;
  }

  addPlane16f(
    x0: number, y0: number, dx0: number, dy0: number,
    x1: number, y1: number, dx1: number, dy1: number,
    x2: number, y2: number, dx2: number, dy2: number,
    x3: number, y3: number, dx3: number, dy3: number
  ) {
    if (this.#planeCount == BUFFER_PLANE_MAX) {
      this.flushBuffer();
    }
    const b = this.#buffer;
    let p = this.#planeCount * VERTEX_STRIDE;
    b[p++] = x0;
    b[p++] = y0;
    b[p++] = dx0;
    b[p++] = dy0;
    b[p++] = x1;
    b[p++] = y1;
    b[p++] = dx1;
    b[p++] = dy1;
    b[p++] = x2;
    b[p++] = y2;
    b[p++] = dx2;
    b[p++] = dy2;
    b[p++] = x3;
    b[p++] = y3;
    b[p++] = dx3;
    b[p] = dy3;
    this.#planeCount++;
  }
}

export default ShaderPlanes;

import Framebuffer from "./webgl-filter-framebuffer";

export type UniformType = "int" | "float" | "vec3" | "vec4";
export type Uniform = {
  type: UniformType;
  name: string;
  location: WebGLUniformLocation | null;
};

const VERTEX_SHADER_SOURCE = `
attribute vec2 aPosition;
void main(void) {
  gl_Position = vec4(aPosition.x, aPosition.y, 0, 1.0);
}
`;

let _instance: Manager;

const BUFFER_STRUCTURE = [
  {
    name: "aPosition",
    size: 2
  },
];

export class Manager {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly vertexShader: WebGLShader;

  #dstBuffer: Framebuffer;
  #srcBuffer: Framebuffer;

  constructor() {
    _instance = this;
    
    this.canvas = document.createElement("canvas");
    const gl = this.canvas.getContext("webgl2");
    if (gl === null) {
      throw new Error("Failed to get WebGL2RenderingContext");
    }
    this.gl = gl;

    // Compile Vertex Shader
    const vertextShader = gl.createShader(gl.VERTEX_SHADER);
    if (vertextShader == null) {
      throw new Error("Failed to create vertex shader.");
    }
    gl.shaderSource(vertextShader, VERTEX_SHADER_SOURCE);
    gl.compileShader(vertextShader);
    if (! gl.getShaderParameter(vertextShader, gl.COMPILE_STATUS)) {
      throw new Error("Failed to compile vertex shader." + gl.getShaderInfoLog(vertextShader));
    }
    this.vertexShader = vertextShader;
    
    // Create VBO and enable attributes
    const vbo = gl.createBuffer();
    if (vbo == null) {
      throw new Error("Failed to create VBO");
    }
    const positions = new Float32Array([
      -1.0,  1.0,
       1.0,  1.0,
      -1.0, -1.0,
       1.0, -1.0,
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Create IBO
    const ibo = gl.createBuffer();
    if (ibo == null) {
      throw new Error("Failed to create IBO");
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    const indexBuffer = new Int16Array([0, 1, 2, 3, 2, 1]);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBuffer, gl.STATIC_DRAW);

    // Initialize
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    this.#dstBuffer = new Framebuffer();
    this.#srcBuffer = new Framebuffer();
  }

  static get singleton() {
    if (typeof _instance === "undefined") {
      _instance = new Manager();
    }
    return _instance;
  }

  get dstBuffer() {
    return this.#dstBuffer;
  }
  get srcBuffer() {
    return this.#srcBuffer;
  }
  swapBuffer() {
    const tmp = this.#srcBuffer;
    this.#srcBuffer = this.#dstBuffer;
    this.#dstBuffer = tmp;
  }

  compile(
    fragmentShaderSource: string,
    uniforms?: {
      name: string;
      type: UniformType;
    }[]
  ) {
    const gl = this.gl;
    // Compile fragment shader
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (fragmentShader == null) {
      throw new Error("Failed to create fragment shader.");
    }
    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);
    if (! gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      throw new Error("Failed to compile fragment shader." + gl.getShaderInfoLog(fragmentShader));
    }

    // Create Program
    const program = gl.createProgram();
    if (program == null) {
      throw new Error("Failed to create program.");
    }
    gl.attachShader(program, this.vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (! gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Failed to link program. " + gl.getProgramInfoLog(program));
    }

    // Enable Attributes
    const glAttr = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(glAttr);
    gl.vertexAttribPointer(
        glAttr, 2, gl.FLOAT, false,
        2 * Float32Array.BYTES_PER_ELEMENT,
        0
    );

    // Get uniforms
    const uniformsDict: {[name: string]: Uniform} = {};
    
    if (! uniforms) {
      uniforms = [];
    }
    uniforms.push(
      {name: "texture", type: "int"},
      {name: "texWidth", type: "float"},
      {name: "texHeight", type: "float"},
    );
    for (let u of uniforms) {
      let loc = gl.getUniformLocation(program, u.name);
      if (loc == null) {
        //throw new Error(`Uniform ${name} is not found in the shader.`);
      }
      uniformsDict[u.name] = {
        name: u.name,
        type: u.type,
        location: loc,
      };
    }

    return {program: program, uniforms: uniformsDict};
  }
}

export default Manager;

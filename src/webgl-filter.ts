export type UniformType = "float" | "vec4";

const VERTEX_SHADER_SOURCE = `
attribute vec2 aPosition;
void main(void) {
  gl_Position = vec4(aPosition.x, aPosition.y, 0, 1.0);
}
`;

let _manager: Manager | null = null;
function manager(): Manager {
  if (_manager === null) {
    _manager = new Manager();
  }
  return _manager;
}

const BUFFER_STRUCTURE = [
  {
    name: "aPosition",
    size: 2
  },
];

class Manager {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly vertexShader: WebGLShader;

  constructor() {
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

    // Clear
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
  }

  compile(fragmentShaderSource: string, uniforms: string[]) {
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
    const uniformsDict: {[name: string]: WebGLUniformLocation} = {};
    
    for (let name of ["texture", "texWidth", "texHeight"].concat(uniforms)) {
      let loc = gl.getUniformLocation(program, name);
      if (loc == null) {
        throw new Error(`Uniform ${name} is not found in the shader.`);
      }
      uniformsDict[name] = loc;
    }

    return {program: program, uniforms: uniformsDict};
  }
}

class FrameBuffer {
  #width: number;
  #height: number;
  #buffer: WebGLFramebuffer;
  #texture: WebGLTexture;

  constructor(width: number = 128, height  =128) {
    this.#width = width;
    this.#height = height;
    
    const gl = manager().gl;
    
    var buffer = gl.createFramebuffer();
    if (buffer == null) {
      throw new Error("Failed to createFramebuffer");
    } 
    this.#buffer = buffer;

    var texture = gl.createTexture();
    if (texture == null) {
      throw new Error("Failed to createTexture");
    } 
    this.#texture = texture;

    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  get buffer(): WebGLFramebuffer {
    return this.#buffer;
  }

  get texture(): WebGLTexture {
    return this.#texture;
  }

  get width(): number {
    return this.#width;
  }
  get height(): number {
    return this.#height;
  }

  setSize(width: number, height: number) {
    const gl = manager().gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.#width = width;
    this.#height = height;
  }
}

export class WebGLFilter {
  readonly program: WebGLProgram;
  readonly uniforms: {[name: string]: WebGLUniformLocation};

  constructor(source: string, uniforms: string[]) {
    const result = manager().compile(source, uniforms);
    this.program = result.program;
    this.uniforms = result.uniforms;
  }

  static init() {
    manager();
  }

  static apply(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  }
}


export default WebGLFilter;
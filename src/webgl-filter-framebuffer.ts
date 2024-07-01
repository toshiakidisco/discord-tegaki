import Manager from "./webgl-filter-manager";

export type ImageSource = ImageBitmap | ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | OffscreenCanvas;

export class Framebuffer {
  #width: number;
  #height: number;
  #buffer: WebGLFramebuffer;
  #texture: WebGLTexture;

  constructor(width: number = 128, height  =128) {
    this.#width = width;
    this.#height = height;
    
    const gl = Manager.singleton.gl;
    
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

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
    const gl = Manager.singleton.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.#width = width;
    this.#height = height;
  }

  setImage(image: ImageSource) {
    const gl = Manager.singleton.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.#width = image.width;
    this.#height = image.height;
  }
}

export default Framebuffer;

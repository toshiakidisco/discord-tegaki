import Rect from "../foudantion/rect";
import { gl } from "./gl";

export type ImageSource = ImageBitmap | ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | OffscreenCanvas;

const imageFinalizationRegistry = new FinalizationRegistry((heldValue: {buffer: WebGLFramebuffer; texture: WebGLTexture}) => {
  gl.deleteFramebuffer(heldValue.buffer);
  gl.deleteTexture(heldValue.texture);
});

export class Image {
  #width: number;
  #height: number;
  #buffer: WebGLFramebuffer;
  #texture: WebGLTexture;

  constructor(width: number = 128, height  =128) {
    this.#width = width;
    this.#height = height;
    
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

    imageFinalizationRegistry.register(this, {buffer, texture});
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
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.#width = width;
    this.#height = height;
  }

  setImage(image: ImageSource) {
    const width = image.width, height = image.height;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (this.width == width && this.height == height) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }
    else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      this.#width = image.width;
      this.#height = image.height;
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  clear() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#buffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  clearRect(rect: Rect.Immutable) {
    this.clearRect4f(rect.x, rect.y, rect.width, rect.height);
  }
  clearRect4f(x: number, y: number, width: number, height: number) {
  }
  
  fillRect(rect: Rect.Immutable) {
    this.fillRect4f(rect.x, rect.y, rect.width, rect.height);
  }
  fillRect4f(x: number, y: number, width: number, height: number) {
  }

  drawImage(image: Image, dx: number, dy: number) {
    this.drawImageRectToRect(image, 0, 0, image.width, image.height, dx, dy, image.width, image.height);
  }
  drawImageRect(
    image: Image,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number
  ) {
    this.drawImageRectToRect(image, sx, sy, sw, sh, dx, dy, image.width, image.height);
  }
  drawImageToRect(
    image: Image,
    dx: number, dy: number, dw: number, dh: number
  ) {
    this.drawImageRectToRect(image, 0, 0, image.width, image.height, dx, dy, dw, dh);
  }
  drawImageRectToRect(
    image: Image,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number
  ) {
  }

  exportToCavnas2D(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) {
    const width = this.width;
    const height = this.height;
    const srcCanvas = gl.canvas;
    srcCanvas.width = width;
    srcCanvas.height = height;
    gl.viewport(0, 0, width, height);
    
    const dstCanvas = context.canvas;
    dstCanvas.width = width;
    dstCanvas.height = height;
    context.save();
    context.scale(1, -1);
    context.drawImage(srcCanvas, 0, height);
    context.restore();
  }
}

export default Image;

import WebGLFilterBase from "./webgl-filter-base";
import FilterColorMask from "./webgl-filter-color-mask";
import FilterExpand from "./webgl-filter-expand";
import { ImageSource } from "./webgl-filter-framebuffer";
import FilterIdentity from "./webgl-filter-identity";
import FilterInvert from "./webgl-filter-invert";
import Manager from "./webgl-filter-manager";
import FilterPaint from "./webgl-filter-paint";

const filterSet = {
  "identity": FilterIdentity,
  "invert": FilterInvert,
  "color-mask": FilterColorMask,
  "expand": FilterExpand,
  "paint": FilterPaint,
} as const;

type FilterName = keyof typeof filterSet;


export namespace WebGLFilter {

  export function init() {
    Manager.singleton;
  }

  /**
   * WebGLフィルタを適応して画像をCanvas2D上に描画する
   * @param context 
   * @param image 
   * @param filters 
   */
  export function drawImageWithFilters(
    context: CanvasRenderingContext2D, image: ImageSource,
    filters:{filter: FilterName, uniforms?: {[name: string]: any}}[]
  ) {
    const m = Manager.singleton;
    const gl = m.gl;

    const width = image.width;
    const height = image.height;
    m.canvas.width = width;
    m.canvas.height = height;

    m.srcBuffer.setImage(image);
    m.dstBuffer.setSize(width, height);

    for (let i = 0; i < filters.length; i++) {
      const f = filters[i];
      const filter = filterSet[f.filter].singleton;
      gl.useProgram(filter.program);
      if (i == filters.length - 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.dstBuffer.buffer);
      }
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      filter.setUniform("texWidth", width);
      filter.setUniform("texHeight", height);
      if (f.uniforms) {
        for (const name in f.uniforms) {
          filter.setUniform(name, f.uniforms[name]);
        }
      }
      gl.bindTexture(gl.TEXTURE_2D, m.srcBuffer.texture);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

      m.swapBuffer();
    }
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.finish();

    // 結果は上下反転されてるので、元に戻して描画
    context.save();
    context.scale(1, -1);
    context.drawImage(m.canvas, 0, -height);
    context.restore();
  }
}

export default WebGLFilter;

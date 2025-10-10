import Rect from "./foudantion/rect";
import TegakiCanvas from "./tegaki-canvas";

export class CanvasRegion {
  #offsetX = 0;
  #offsetY = 0;

  #rect: Rect = new Rect();
  
  get offsetX() {
    return this.#offsetX;
  }
  get offsetY() {
    return this.#offsetY;
  }
  set offsetX(value: number) {
    this.#offsetX = value;
  }
  set offsetY(value: number) {
    this.#offsetY = value;
  }
  offset(x: number, y: number) {
    this.#offsetX += x;
    this.#offsetY += y;
  }

  get isEmpty() {
    return this.#rect.isEmpty();
  }

  normalize(): this {
    this.#rect.offset(this.#offsetX, this.#offsetY);
    this.#offsetX = 0;
    this.#offsetY = 0;
    return this;
  }

  set(region: CanvasRegion): this {
    this.#rect.set(region.boudingRect());
    this.#offsetX = region.#offsetX;
    this.#offsetY = region.#offsetY;
    return this;
  }

  setRect(r: Rect): this {
    this.#rect.set(r);
    this.#offsetX = 0;
    this.#offsetY = 0;
    return this;
  }

  boudingRect(): Rect.Immutable {
    return this.#rect.copy().offset(this.#offsetX, this.#offsetY);
  }

  drawTo(canvas: TegakiCanvas, context: CanvasRenderingContext2D) {
    const rect = this.#rect.copy().offset(this.#offsetX, this.#offsetY)
                .scale(canvas.scale)
                .intersection(new Rect(1, 1, canvas.documentWidth*canvas.scale - 2, canvas.documentHeight*canvas.scale - 2  ))
                .floor();
    const docTopLeft = canvas.getDocumentTopLeft();

    context.save();
    context.translate(docTopLeft.left, docTopLeft.top);
    context.lineWidth = 1;
    context.strokeStyle = "black";
    context.lineDashOffset = rect.x + rect.y;
    context.setLineDash([5]);
    context.strokeRect(
      rect.x - 0.5,
      rect.y - 0.5,
      rect.width + 1,
      rect.height + 1, 
    );
    context.strokeStyle = "white";
    context.lineDashOffset = 5 + rect.x + rect.y;
    context.strokeRect(
      rect.x - 0.5,
      rect.y - 0.5,
      rect.width + 1,
      rect.height + 1, 
    );
    context.restore();
  }

  isPointIn(x: number, y: number) {
    return this.boudingRect().isPointIn2f(x, y);
  }

  clipBegin(context: CanvasRenderingContext2D) {
    context.save();
    const path = new Path2D();
    const rect = this.boudingRect();
    path.rect(rect.x, rect.y, rect.width, rect.height);
    context.clip(path);
  }
  clipEnd(context: CanvasRenderingContext2D) {
    context.restore();
  }
}

export default CanvasRegion;

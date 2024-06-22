import { off } from "process";

export class Offscreen {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;

  constructor(width: number = 100, height: number = 100) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;

    const ctx = this.canvas.getContext("2d");
    if (ctx == null) {
      throw new Error("Failed to get OffscreenCanvasRenderingContext2D");
    }
    this.context = ctx;
    this.context.lineCap = "round";
    this.context.lineJoin = "round";
  }

  copy() {
    const copy = new Offscreen(this.width, this.height);
    copy.context.drawImage(this.canvas, 0, 0);
    return copy;
  }

  set(offscreen: Offscreen) {
    this.canvas.width = offscreen.width;
    this.canvas.height = offscreen.height;
    this.context.drawImage(offscreen.canvas, 0, 0);
    return this;
  }

  get width() {
    return this.canvas.width;
  }
  set width(value: number) {
    this.canvas.width = value;
  }

  get height() {
    return this.canvas.height;
  }
  set height(value: number) {
    this.canvas.height = value;
  }

  clear() {
    this.context.clearRect(0, 0, this.width, this.height);
  }
}

export default Offscreen;
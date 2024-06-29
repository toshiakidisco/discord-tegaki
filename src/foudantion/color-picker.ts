import { parseHtml } from "../dom";
import { clamp } from "../funcs";
import Color from "./color";
import { ObservableColor, ObservableValue } from "./observable-value";
import View from "./view";

export class ViewColorPicker extends View {
  #element: HTMLCanvasElement;
  #context: CanvasRenderingContext2D;
  #hue: number;
  #height: number;
  #width: number;
  #x: number = 0;
  #y: number = 0;

  constructor() {
    super();
    this.#hue = 0;
    this.#width = 100;
    this.#height = 100;

    this.#element = parseHtml(`<canvas class="colorbar" width="${this.#width}" height="${this.#height}">`) as HTMLCanvasElement;
    const ctx = this.#element.getContext("2d");
    if (ctx == null) 
      throw new Error("Failed to create RenderingContext2D");
    this.#context = ctx;

    this.#init();
    this.render();
  }

  get element() {
    return this.#element;
  }

  get width() {
    return this.#width;
  }
  get height() {
    return this.#height;
  }
  setSize(width: number, height: number) {
    this.#width = width;
    this.#height = height;
    this.#element.width = width;
    this.#element.height = height;
    this.render();
  }

  get hue() {
    return this.#hue;
  }
  set hue(value: number) {
    if (this.#hue == value) {
      return;
    }
    this.#hue = clamp(value, 0, 360);
    this.render();
  }

  #init() {
  }

  render() {
    const ctx = this.#context;
    const width = this.width;
    const height = this.height;
    const hcolor = Color.fromHsv(this.#hue, 1, 1);
    ctx.fillStyle = "#FFF";
    ctx.fillRect(0, 0, width, height);

    const gh = ctx.createLinearGradient(0, 0, width, 0);
    gh.addColorStop(0, "#FFF");
    gh.addColorStop(1, hcolor.css());
    ctx.fillStyle = gh;
    ctx.fillRect(0, 0, width, height);

    const gv = ctx.createLinearGradient(0, 0, 0, height);
    gv.addColorStop(0, "rgba(0, 0, 0, 0)");
    gv.addColorStop(1, "#000");
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, width, height);
  }

  bind(color: ObservableColor) {
  }

}

export default ViewColorPicker;

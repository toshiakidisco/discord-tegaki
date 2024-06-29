import { parseHtml } from "../dom";
import { clamp } from "../funcs";
import Color from "./color";
import { ObservableColor, ObservableValue } from "./observable-value";
import View from "./view";

export class ViewHuebar extends View {
  #element: HTMLCanvasElement;
  #context: CanvasRenderingContext2D;
  #hue: number;
  #height: number;
  #width: number;
  #bound: ObservableValue<number> | null = null;

  constructor() {
    super();
    this.#hue = 0;
    this.#width = 112;
    this.#height = 112;

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
    this.requestRender();
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
    const canvas = this.#element;

    let _activePointerId: number | null = null;
    canvas.addEventListener("pointerdown", (ev: PointerEvent) => {
      if (! ev.isPrimary) {
        return;
      }
      
      canvas.setPointerCapture(ev.pointerId);

      this.#hue = clamp(360*ev.offsetY/this.#height, 0, 360);
      this.onChange();
      this.requestRender();
    });
    canvas.addEventListener("pointermove", (ev: PointerEvent) => {
      if (! canvas.hasPointerCapture(ev.pointerId)) {
        return;
      }

      this.#hue = clamp(360*ev.offsetY/this.#height, 0, 360);
      this.onChange();
      this.requestRender();
    });
  }

  setRgbColor(color: Color.Immutable) {
    const hsv = color.hsv();
    if (hsv.s != 0) {
      this.#hue = hsv.h;
    }
  }

  #needsRender = false;
  requestRender() {
    if (this.#needsRender) {
      return;
    }
    this.#needsRender = true;
    requestAnimationFrame(this.render.bind(this));
  }

  render() {
    this.#needsRender = false;
    const ctx = this.#context;

    for (let y = 0; y < this.#height; y++) {
      const hue = 360*y/this.#height;
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      ctx.fillRect(0, y, this.#width, y+1);
    }
    const dy = (this.#hue/360 * this.height) | 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "black";
    ctx.strokeRect(0.5, dy - 3.5, this.width - 1, 7);
    ctx.strokeStyle = "white";
    ctx.strokeRect(1.5, dy - 2.5, this.width - 3, 5);
  }

  bind(bindable: ObservableValue<number> | null) {
    if (this.#bound != null) {
      this.#bound.removeObserver(this);
    }

    this.#bound = bindable;

    if (bindable != null) {
      bindable.addObserver(this, "change", value => {
        if (this.#hue == value) {
          return;
        }
        this.#hue = value;
        this.requestRender();
      });
      this.#hue = bindable.value;
    }
  }

  onChange() {
    if (this.#bound != null) {
      this.#bound.value = this.#hue;
    }
    this.notify("change", this.hue);
  }

}

export default ViewHuebar;

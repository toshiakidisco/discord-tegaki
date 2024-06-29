import { parseHtml } from "../dom";
import { clamp } from "../funcs";
import Color from "./color";
import { ObservableColor, ObservableValue } from "./observable-value";
import View from "./view";

export class ViewColorPicker extends View {
  #element: HTMLCanvasElement;
  #context: CanvasRenderingContext2D;
  #color: Color = new Color(255, 0, 0);
  #height: number;
  #width: number;
  #x: number = 0;
  #y: number = 0;
  #bound: ObservableColor | null = null;

  readonly observable: {
    hue: ObservableValue<number>;
  }; 

  constructor() {
    super();
    this.observable = {
      hue: new ObservableValue<number>(0),
    }
    this.#width = 112;
    this.#height = 112;

    this.#element = parseHtml(`<canvas class="color-picker-area" width="${this.#width}" height="${this.#height}">`) as HTMLCanvasElement;
    const ctx = this.#element.getContext("2d");
    if (ctx == null) 
      throw new Error("Failed to create RenderingContext2D");
    this.#context = ctx;

    this.#init();
    this.render();
  }

  get hue() {
    return this.observable.hue.value;
  }
  set hue(value: number) {
    if (this.hue == value) {
      return;
    }
    value = clamp(value, 0, 360);
    this.observable.hue.value = value;
  }
  
  get saturation() {
    return this.#x;
  }

  get value() {
    return this.#y;
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

  #init() {
    const canvas = this.#element;

    let _activePointerId: number | null = null;
    canvas.addEventListener("pointerdown", (ev: PointerEvent) => {
      if (! ev.isPrimary) {
        return;
      }
      
      canvas.setPointerCapture(ev.pointerId);

      this.#x = clamp(ev.offsetX/this.width, 0, 1);
      this.#y = clamp(1 - ev.offsetY/this.#height, 0, 1);
      this.onChange();
      this.requestRender();
    });
    canvas.addEventListener("pointermove", (ev: PointerEvent) => {
      if (! canvas.hasPointerCapture(ev.pointerId)) {
        return;
      }

      this.#x = clamp(ev.offsetX/this.width, 0, 1);
      this.#y = clamp(1 - ev.offsetY/this.#height, 0, 1);
      this.onChange();
      this.requestRender();
    });
    
    this.observable.hue.addObserver(this, "change", value => {
      this.requestRender();
    });
  }

  setRgbColor(color: Color.Immutable) {
    this.#color.set(color);
    const hsv = this.#color.hsv();
    if (hsv.s != 0) {
      this.hue = hsv.h;
    }
    this.#x = hsv.s;
    this.#y = hsv.v;
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

    const hsv = this.#color.hsv();

    const ctx = this.#context;
    const width = this.width;
    const height = this.height;
    const hcolor = Color.fromHsv(this.hue, 1, 1);
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

    const dx = this.width * this.#x;
    const dy = this.height * (1 - this.#y);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#000"
    ctx.beginPath();
    ctx.arc(dx, dy, 3.5, 0, Math.PI*2);
    ctx.stroke();
    ctx.strokeStyle = "#FFF"
    ctx.beginPath();
    ctx.arc(dx, dy, 2.5, 0, Math.PI*2);
    ctx.stroke();
  }

  bind(bindable: ObservableColor | null) {
    if (this.#bound != null) {
      this.#bound.removeObserver(this);
    }

    this.#bound = bindable;

    if (bindable != null) {
      bindable.addObserver(this, "change", color => {
        if (color.equals(this.#color)) {
          return;
        }
        this.setRgbColor(color);
        this.requestRender();
      });
      this.setRgbColor(bindable.value);
    }
  }

  onChange() {
    this.#color.setHsv(this.hue, this.#x, this.#y);
    if (this.#bound != null) {
      this.#bound.value = this.#color;
    }
    this.notify("change", this.#color);
  }

}

export default ViewColorPicker;

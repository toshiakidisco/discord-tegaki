import { Outlets, adjustPosition, parseHtml } from "../dom";
import { clamp } from "../funcs";
import { ObservableValue } from "../foudantion/observable-value";
import Panel from "./panel";


type BindMode = "readwrite" | "read";

export class PanelSlider extends Panel {
  readonly contents: HTMLElement;
  #outlets: Outlets;
  #value: number;
  #min: number = 0;
  #step: number = 1;
  #max: number = 100;
  #scale: number = 1;

  #bindedValue: ObservableValue<number> | null = null;
  #bindMode: BindMode = "readwrite";

  constructor(root: HTMLElement, value: number = 0) {
    super(root, "dt_r_panel-slider");
    this.#value = value;
    this.#outlets = {};
    this.contents = parseHtml(`
      <ul>
        <li><span name="caption"></span><input type="range" name="slider" step="${this.#step*this.#scale}" min="${this.#min*this.#scale}" max="${this.#max*this.#scale}"><input type="number" name="field" step="${this.#step*this.#scale}" min="${this.#min*this.#scale}" max="${this.#max*this.#scale}"></li>
      </ul>
    `, this, this.#outlets);
    this.setContents(this.contents);

    this.hasTitleBar = false;
    this.hasCloseButton = false;
    this.autoClose = true;

    this.init();
    this.render();
  }

  render() {
    const slider = this.#outlets["slider"] as HTMLInputElement;
    const field = this.#outlets["field"] as HTMLInputElement;
    const value = (this.#value * this.#scale | 0).toString();
    slider.value = value;
    field.value = value;
  }

  init() {
    for (const type of ["slider", "field"]) {
      const elem = this.#outlets[type] as HTMLInputElement;
      
      elem.addEventListener("input", (ev) => {
        this.#value = parseInt(elem.value)/this.scale;
        this.#value = clamp(this.#value, this.#min, this.#max);
        this.render();
      });
      elem.addEventListener("wheel", (ev: WheelEvent) => {            
        ev.preventDefault();
        const newValue = this.#value + this.#step*(ev.deltaY > 0 ? -1 : 1); 
        this.#changeValue(newValue);
      }, { passive: false });
      elem.addEventListener("change", (ev) => {
        this.#changeValue(parseInt(elem.value)/this.scale);
      });
    }
  }

  #changeValue(value: number) {
    value = clamp(value, this.#min, this.#max);
    this.#value = value;
    this.render();
    this.notify("change", value);

    if (this.#bindedValue != null && this.#bindMode == "readwrite") {
      this.#bindedValue.value = this.#value;
    }
  }

  bind(observableValue: ObservableValue<number> | null, bindMode: BindMode = "readwrite") {
    if (this.#bindedValue != null) {
      this.#bindedValue.removeObserver(this);
    }
    this.#bindedValue = observableValue;
    this.#bindMode = bindMode;
    if (observableValue) {
      observableValue.addObserver(this, "change", (value) => {
        this.value = value;
      });
      this.value = observableValue.value;
    }
  }

  set value(value: number) {
    if (this.#value == value) {
      return;
    }
    this.#value = value;
    this.render();
  }
  get value(): number {
    return this.#value;
  }

  set scale(value: number) {
    if (this.#scale == value) {
      return;
    }
    this.#scale = value;
    for (const type of ["slider", "field"]) {
      const elem = this.#outlets[type] as HTMLInputElement;
      elem.setAttribute("step", (this.#step*this.#scale).toString());
      elem.setAttribute("min", (this.#min*this.#scale).toString());
      elem.setAttribute("max", (this.#max*this.#scale).toString());
    }
    this.render();
  }
  get scale(): number {
    return this.#scale;
  }

  get step(): number {
    return this.#step;
  }
  set step(value: number) {
    this.#step = value;
    const elemStep = (value*this.#scale).toString();
    this.#outlets["slider"].setAttribute("step", elemStep);
    this.#outlets["field"].setAttribute("step", elemStep);
  }

  get min(): number {
    return this.#min;
  }
  set min(value: number) {
    this.#min = value;
    const elemValue = (value*this.#scale).toString();
    this.#outlets["slider"].setAttribute("min", elemValue);
    this.#outlets["field"].setAttribute("min", elemValue);
  }

  get max(): number {
    return this.#max;
  }
  set max(value: number) {
    this.#max = value;
    const elemValue = (value*this.#scale).toString();
    this.#outlets["slider"].setAttribute("max", elemValue);
    this.#outlets["field"].setAttribute("max", elemValue);
  }

  setRange(min: number, max: number) {
    this.min = min;
    this.max = max;
  }
}

export default PanelSlider;

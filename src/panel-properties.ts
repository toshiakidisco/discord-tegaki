import { EventEmitter } from "stream";
import { Outlets, adjustPosition, parseHtml } from "./dom";
import { clamp } from "./funcs";
import { ObservableValue } from "./observable-value";
import Panel from "./panel";
import Subject from "./subject";

type BindMode = "readwrite" | "read";

export class PanelPropertiesItem<T> extends Subject {
  readonly element: HTMLElement;
  #bindMode: BindMode = "read";
  #binded: ObservableValue<any> | null = null;

  #value: T;

  constructor(name: string, init: T) {
    super();
    this.element = document.createElement("li");
    this.#value = init;
  }

  bind(observable: ObservableValue<T>, bindMode: BindMode = "readwrite") {
    if (this.#binded) {
      this.#binded.removeObserver(this);
    }
    this.#binded = observable;
    this.#bindMode = bindMode;
    if (this.#binded == null) {
      return this;
    }
    observable.addObserver(this, "change", this.onReceiveValue);
    this.value = observable.value;

    return this;
  }

  get value(): T {
    return this.#value;
  }
  set value(value: T) {
    if (this.#value == value) {
      return;
    }
    this.#value = value;
    if (this.#binded != null && this.#bindMode == "readwrite") {
      this.#binded.value = value;
    }
    this.notify("change", value);
  }

  onReceiveValue(value: T) {}

  onChange() {
    this.notify
  }
}

export class PanelPropertiesItemNumber extends PanelPropertiesItem<number> {
  #contents: HTMLElement;
  #outlets: Outlets = {};
  #min: number;
  #max: number;
  #step: number;

  #dispayValue: number;

  constructor(name: string, value: number, min: number, max: number, step: number = 1) {
    super(name, value);
    this.#min = min;
    this.#max = max;
    this.#step = step;
    this.#dispayValue = value;

    this.#contents = parseHtml(`
      <div class="item-number">
        <span name="caption">${name}</span>
        <div>
          <input type="range" name="slider" step="${step}" min="${min}" max="${max}">
          <input type="number" name="field" step="${step}" min="${min}" max="${max}">
        </div>
      </div>
    `, this, this.#outlets);
    this.element.appendChild(this.#contents);

    this.#init();
    this.render();
  }

  render() {
    const slider = this.#outlets["slider"] as HTMLInputElement;
    const field = this.#outlets["field"] as HTMLInputElement;
    const value = (this.#dispayValue | 0).toString();
    slider.value = value;
    field.value = value;
  }

  #init() {
    const slider = this.#outlets["slider"] as HTMLInputElement;
    const field = this.#outlets["field"] as HTMLInputElement;
  
    for (let elem of [slider, field]) {
      elem.addEventListener("input", (ev: Event) => {
        const newValue = parseInt(elem.value);
        this.#dispayValue = clamp(newValue, this.#min, this.#max);
        this.render();
      });
      elem.addEventListener("wheel", (ev: WheelEvent) => {            
        ev.preventDefault();
        let newValue = this.value + this.#step*(ev.deltaY > 0 ? -1 : 1); 
        this.value = clamp(newValue, this.#min, this.#max);
      }, { passive: false });
      elem.addEventListener("change", (ev) => {
        let newValue = parseInt(elem.value);
        this.value = clamp(newValue, this.#min, this.#max);
      });
    }

    this.addObserver(this, "change", (value: number) => {
      this.#dispayValue = value;
      this.render();
    });
  }

}

export class PanelProperties extends Panel {
  readonly contents: HTMLElement;
  #outlets: Outlets;

  constructor(root: HTMLElement, value: number = 0) {
    super(root, "panel-properties");
    this.#outlets = {};
    this.contents = parseHtml(`
      <ul>
        <li class="preview"></li>
      </ul>
    `, this, this.#outlets);
    this.setContents(this.contents);

    this.hasTitleBar = false;
    this.hasCloseButton = false;
    this.autoClose = true;
  }

  addItem(item: PanelPropertiesItem<any>) {
    this.contents.appendChild(item.element);
  }
}

export default PanelProperties;

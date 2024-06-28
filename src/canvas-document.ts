import Layer from "./canvas-layer";
import Color from "./color";

export class TegakiCanvasDocument {
  #width: number;
  #height: number
  readonly #layers: Layer[] = [];
  readonly #backgroundColor: Color = Color.white.copy();

  constructor(width: number, height: number, layers: Layer[], backgroundColor?: Color.Immutable) {
    this.#width = width;
    this.#height = height;

    this.#layers.push(...layers);
    if (backgroundColor) {
      this.#backgroundColor.set(backgroundColor);
    }
  }

  get width() {
    return this.#width;
  }

  get height() {
    return this.#height;
  }

  get layers(): Layer[] {
    return this.#layers;
  }

  get backgroundColor(): Color.Immutable {
    return this.#backgroundColor;
  }
}

export interface TegakiCanvasDocument {
  addObserver(observer: Object, name: "update-image", callback:(canvas: this) => void): void;
}

export default TegakiCanvasDocument;

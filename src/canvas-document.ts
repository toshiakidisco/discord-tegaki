import Layer from "./canvas-layer";
import Color from "./foudantion/color";
import { JsonObject, JsonStructure, JsonValue } from "./foudantion/json";
import { ObservableColor, ObservableValue } from "./foudantion/observable-value";
import Subject from "./foudantion/subject";

export class TegakiCanvasDocument extends Subject {
  readonly #layers: Layer[] = [];

  readonly observables: {
    width: ObservableValue<number>;
    height: ObservableValue<number>;
    backgroundColor: ObservableColor;
  };

  constructor(width: number, height: number, layers?: Layer[], backgroundColor?: Color.Immutable) {
    super();
    this.observables = {
      width: new ObservableValue<number>(width),
      height: new ObservableValue<number>(height),
      backgroundColor: new ObservableColor(255, 255, 255),
    };

    if (typeof layers === "undefined" || layers.length == 0) {
      this.#layers.push(new Layer(width, height));
    }
    else {
      this.#layers.push(...layers);
    }
    if (backgroundColor) {
      this.observables.backgroundColor.set(backgroundColor);
    }
  }

  get width() {
    return this.observables.width.value;
  }

  get height() {
    return this.observables.height.value;
  }

  setSize(width: number, height: number) {
    this.observables.width.value = width;
    this.observables.height.value = height;
    this.notify("change-size", this);
  }


  get layers(): Layer[] {
    return this.#layers;
  }

  get backgroundColor(): Color.Immutable {
    return this.observables.backgroundColor.value;
  }
  
  serialize(): JsonValue {
    const data = {
      version: 100,
      title: "",
      width: this.width,
      height: this.height,
      backgroundColor: this.backgroundColor.serialize(),
      layers: [] as JsonValue[],
    };
    for (const layer of this.#layers) {
      data.layers.push(layer.serialize());
    }
    return data;
  }

  static async deserialize(data: JsonObject): Promise<TegakiCanvasDocument> {
    const d = data as TegakiCanvasDocument.Serialized;
    // this.#title = data["title"] as string;
    const width = d.width;
    const height = d.height;
    const backgroundColor = Color.deserialize(d.backgroundColor);
    const layers: Layer[] = [];
    for (const layerData of d.layers) {
      const layer = await Layer.deserialize(layerData);
      layers.push(layer);
    }
    const doc = new TegakiCanvasDocument(width, height, layers, backgroundColor);
    return doc;
  }
}

export namespace TegakiCanvasDocument {
  export type Serialized = {
    "version": number,
    "title": string,
    "width": number,
    "height": number,
    "backgroundColor": Color.Serialized,
    "layers": Layer.Serialized[],
  };

  export const structure: JsonStructure = {
    "version": "number",
    "title": "string",
    "width": "number",
    "height": "number",
    "backgroundColor": Color.structure,
    "layers": [Layer.structure],
  };
}

export interface TegakiCanvasDocument {
  addObserver(observer: Object, name: "update-image", callback:(canvas: this) => void): void;
}

export default TegakiCanvasDocument;

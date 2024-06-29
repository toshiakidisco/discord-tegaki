import TegakiCanvasDocument from "./canvas-document";
import Offscreen from "./canvas-offscreen";
import { clamp } from "./funcs";
import { ObservableValue } from "./observable-value";
import { JsonObject, JsonStructure, JsonValue } from "./foudantion/json";
import Subject, { IFSubject } from "./foudantion/subject";

export class Layer extends Offscreen implements IFSubject {
  #subject: Subject = new Subject();
  #document: TegakiCanvasDocument | null = null;

  readonly observables = {
    opacity: new ObservableValue<number>(1),
    isVisible: new ObservableValue<boolean>(true),
  };

  constructor(width?: number, height?: number) {
    super(width, height);
  }

  get opacity(): number {
    return this.observables.opacity.value;
  }
  set opacity(value: number) {
    value = clamp(value, 0, 1);
    if (this.opacity == value) {
      return;
    }
    this.observables.opacity.value = value;
  }

  get isVisible(): boolean {
    return this.observables.isVisible.value;
  }
  set isVisible(value: boolean) {
    if (this.isVisible == value) {
      return;
    }
    this.observables.isVisible.value = value;
    this.notify("change-visibility", value);
    this.notify(value ? "show" : "hide");
  }

  // Adapter パターンで IFSubjectを実装
  addObserver(observer: Object, name: string, callback: Function): void {
    this.#subject.addObserver(observer, name, callback);
  }
  removeObserver(observer: Object, name?: string | undefined, callback?: Function | undefined): boolean {
    return this.#subject.removeObserver(observer, name, callback);
  }
  notify(name: string, data?: any): void {
    this.#subject.notify(name, data);
  }

  serialize(): JsonValue {
    return {
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      opacity: this.opacity,
      isVisible: this.isVisible,
      data: this.canvas.toDataURL(),
    };
  }
  static deserialize(data: JsonObject): Promise<Layer> {
    const d = data as Layer.Serialized;
    const x = d.x;
    const y = d.y;
    const width = d.width;
    const height = d.height;
    const opacity = d.opacity;
    const isVisible = d.isVisible;
    const layer = new Layer(width, height);
    layer.opacity = opacity;
    layer.isVisible = isVisible;
    const imageData = d.data;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        layer.context.drawImage(img, 0, 0);
        resolve(layer);
      };
      img.onerror = (err) => {
        reject(err);
      };
      img.src = imageData;
    });
  }
}

export namespace Layer {
  export type Serialized = {
    "x": number,
    "y": number,
    "width": number,
    "height": number,
    "opacity": number,
    "isVisible": boolean,
    "data": string,
  };

  export const structure: JsonStructure = {
    "x": "number",
    "y": "number",
    "width": "number",
    "height": "number",
    "opacity": "number",
    "isVisible": "boolean",
    "data": "string",
  };
}

export interface Layer {
  addObserver(observer: Object, name: "change-opacity", callback: (opacity: number) => {}): void;
  addObserver(observer: Object, name: "change-visibility", callback: (isVisible: boolean) => {}): void;
  addObserver(observer: Object, name: "show", callback: () => {}): void;
  addObserver(observer: Object, name: "hide", callback: () => {}): void;
}

export default Layer;

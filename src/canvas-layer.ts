import TegakiCanvasDocument from "./canvas-document";
import Offscreen from "./canvas-offscreen";
import { clamp } from "./funcs";
import { ObservableValue } from "./observable-value";
import Subject, { IFSubject } from "./subject";

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
}

export interface Layer {
  addObserver(observer: Object, name: "change-opacity", callback: (opacity: number) => {}): void;
  addObserver(observer: Object, name: "change-visibility", callback: (isVisible: boolean) => {}): void;
  addObserver(observer: Object, name: "show", callback: () => {}): void;
  addObserver(observer: Object, name: "hide", callback: () => {}): void;
}

export default Layer;

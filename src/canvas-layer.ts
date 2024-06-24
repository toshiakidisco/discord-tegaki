import Offscreen from "./canvas-offscreen";
import Subject, { IFSubject } from "./subject";

export class Layer extends Offscreen implements IFSubject {
  #subject: Subject = new Subject();
  #isVisible: boolean = true;
  constructor(width?: number, height?: number) {
    super(width, height);
  }

  get isVisible(): boolean {
    return this.#isVisible;
  }
  set isVisible(value: boolean) {
    if (this.#isVisible == value) {
      return;
    }
    this.#isVisible = value;

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
  addObserver(observer: Object, name: "change-visibility", callback: (isVisible: boolean) => {}): void;
  addObserver(observer: Object, name: "show", callback: () => {}): void;
  addObserver(observer: Object, name: "hide", callback: () => {}): void;
}

export default Layer;

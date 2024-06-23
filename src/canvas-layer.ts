import Offscreen from "./canvas-offscreen";
import Subject, { IFSubject } from "./subject";

export class Layer extends Offscreen implements IFSubject {
  #subject: Subject = new Subject();

  constructor(width?: number, height?: number) {
    super(width, height);
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

export default Layer;

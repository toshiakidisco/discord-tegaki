export class Selector {
  private _element: HTMLDivElement;

  constructor() {
    this._element = document.createElement("div");
    this._element.className = "dt-selector";
  }

  select(left: number, top: number, right: number, bottom: number) {
    if (this._element.parentElement == null) {
      document.body.appendChild(this._element);
    }
    this._element.style.left = `${left}px`;
    this._element.style.top = `${top}px`;
    this._element.style.width = `${right - left}px`;
    this._element.style.height = `${bottom - top}px`;
  }

  close() {
    this._element.parentElement?.removeChild(this._element);
  }
}

export default Selector;

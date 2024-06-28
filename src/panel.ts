import { Outlets, adjustPosition, isChildOf, parseHtml } from "./dom";
import Subject from "./subject";

export class Panel extends Subject {
  #title: string;
  #element: HTMLDivElement;
  #outlets: Outlets;
  #onFocusOther: (ev: Event) => void;
  #autoClose: boolean;
  #hasCloseButton: boolean;
  #parent: HTMLElement
  #visible: boolean = false;

  #focused: boolean = false;
  constructor(parent?: HTMLElement, cssClass?: string) {
    super();

    if (typeof parent == "undefined") {
      parent = document.body;
    }

    const outlets: Outlets = {};
    const element = parseHtml(`
      <div class="panel" style="display: none;" name="root" tabindex="-1">
        <div name="titlebar" class="titlebar">
          <div name="titlebar-contents" class="area-titlebar-contents"></div>
          <div name="titlebar-title" class="area-title"><span name="title"></span></div>
          <div name="button-close" class="area-button-close"><button data-on-click="onClickClose"><img src="[asset/button-close.png]"></button></div>
        </div>
        <div name="contents" class="contents"></div>
      </div>
    `, this, outlets) as HTMLDivElement;

    if (cssClass) {
      element.classList.add(cssClass);
    }

    const onFocusOther = (ev: Event) => {
      let focused: boolean;
      if (isChildOf(ev.target as Element, this.element)) {
        focused = true;
      }
      else {
        focused = false;
      }
      if (this.#focused == focused) {
        return;
      }
      this.#focused = focused;
      
      if (this.#focused) {
        this.#onFocus(ev);
      }
      else {
        this.#onBlur(ev);
      }
    };

    this.#title = "",
    this.#element = element,
    this.#outlets = outlets,
    this.#onFocusOther = onFocusOther,
    this.#autoClose = false,
    this.#hasCloseButton = true,
    this.#parent = parent;
    this.#parent.appendChild(this.element);

    this.#init();
  }

  get element(): HTMLDivElement {
    return this.#element;
  }

  get title(): string {
    return this.#title;
  }
  set title(value: string) {
    const outlets = this.#outlets;
    const titleElem = outlets["title"];
    titleElem.innerText = value;
    
    this.#title = value;
  }

  get parent() {
    return this.#parent;
  }

  get autoClose(): boolean {
    return this.#autoClose;
  }
  set autoClose(value: boolean) {
    this.#autoClose = value;
  }

  get hasCloseButton(): boolean {
    return this.#hasCloseButton;
  }
  set hasCloseButton(value: boolean) {
    this.#hasCloseButton = value;
    const outlets = this.#outlets;
    const button = outlets["button-close"];
    button.style.display = value ? "block" : "none";
  }

  #hasTitlebar = true;
  get hasTitleBar(): boolean {
    return this.#hasCloseButton;
  }
  set hasTitleBar(value: boolean) {
    this.#hasTitlebar = value;
    const outlets = this.#outlets;
    const titlebar = outlets["titlebar"];
    titlebar.style.display = value ? "block" : "none";
  }

  get visible(): boolean {
    return this.#visible;
  }

  setContents(contents: HTMLElement) {
    const outlets = this.#outlets;
    const contentsWrap = outlets["contents"];
    while (contentsWrap.firstChild != null) {
      contentsWrap.removeChild(contentsWrap.firstChild);
    }
    contentsWrap.appendChild(contents);
  }

  setTitlebarContents(contents: HTMLElement) {
    const outlets = this.#outlets;
    const contentsWrap = outlets["titlebar-contents"];
    while (contentsWrap.firstChild != null) {
      contentsWrap.removeChild(contentsWrap.firstChild);
    }
    contentsWrap.appendChild(contents);
  }

  open(x: number, y: number) {
    const win = this.element;
    if (! this.visible) {
      this.#visible = true;
      window.addEventListener("focusin", this.#onFocusOther);
    }

    win.style.left = `${x}px`;
    win.style.top = `${y}px`;
    win.style.display = "block";
    adjustPosition(win);
    win.focus();

    this.notify("open");
  }

  close() {
    if (! this.visible) {
      return;
    }
    this.#visible = false;
    
    const root = this.element;
    root.style.display = "none";
    window.removeEventListener("focusin", this.#onFocusOther);
    this.#focused = false;
    this.notify("close");
  }

  toggle(x: number, y: number) {
    if (this.visible) {
      this.close();
    }
    else {
      this.open(x, y);
    }
  }

  onBlur(ev: Event) {
    this.notify("blur");
  }

  onClickClose(ev: Event) {
    this.close();
  }

  #init() {
    const outlets = this.#outlets;
    const win = this.element;

    win.addEventListener("focus", (ev: Event) => {
      if (! this.#focused) {
        this.#focused = true;
        this.#onFocus(ev);
      }
    });

    let _activePointer: number | null = null;
    // タイトルバードラッグ処理
    {
      let _dragStartPosition = {x: 0, y: 0};
      let _pointerOffset = {x: 0, y: 0};
      const titlebar = outlets["titlebar-title"];
      titlebar.addEventListener("pointerdown", (ev: PointerEvent) => {
        if (_activePointer != null) {
          return;
        }
        _activePointer = ev.pointerId;
        titlebar.setPointerCapture(_activePointer);

        const rect = win.getBoundingClientRect();
        _dragStartPosition.x = rect.x;
        _dragStartPosition.y = rect.y;
        _pointerOffset.x = ev.clientX - rect.x;
        _pointerOffset.y = ev.clientY - rect.y;
      });
      titlebar.addEventListener("pointermove", (ev: PointerEvent) => {
        if (ev.pointerId != _activePointer) {
          return;
        }
        const newLeft = ev.clientX - _pointerOffset.x;
        const newTop = ev.clientY - _pointerOffset.y;
        win.style.left = `${newLeft}px`;
        win.style.top = `${newTop}px`;
        adjustPosition(win);
      });
      titlebar.addEventListener("pointerup", (ev: PointerEvent) => {
        if (_activePointer == ev.pointerId) {
          titlebar.setPointerCapture(_activePointer);
          _activePointer = null;
        }
      });
      titlebar.addEventListener("pointercancel", (ev: PointerEvent) => {
        if (_activePointer != null) {
          titlebar.setPointerCapture(_activePointer);
          _activePointer = null;
        }
      });
    }

  }

  #onFocus(ev: Event) {
    this.element.setAttribute("data-focused", "");
  }

  #onBlur(ev: Event) {
    this.element.removeAttribute("data-focused");

    this.onBlur(ev);
    if (this.autoClose) {
      this.close();
    }
  }
}

export default Panel;

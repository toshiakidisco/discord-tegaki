type CapturedPointer = {
  id: string;
  target: HTMLElement;
};

type PointerInfo = {
  pointerType: string;
  button: number;
  pointerId: number;
}

type ActivePointer = {
  id: string;
  startTime: number;
  startX: number;
  startY: number;
  startClientX: number;
  startClientY: number;
  currentX: number;
  currentY: number;
  currentClientX: number;
  currentClientY: number;
  alive: boolean;
}

type GestureInfo = {
  pointers: ActivePointer[];
}

type PointerEventListener = (ev: GestureInfo) => boolean | void;

function getPointerId(ev: PointerInfo) {
  if (ev.pointerType == "mouse") {
    return `mouse-${ev.button >= 0 ? ev.button : 0}`;
  }
  return `${ev.pointerType}-${ev.pointerId}`;
}

type Gesture = "drag" | "tap" | "2finger-drag" | "2finger-tap" | "3finger-tap";
type GestureEventType =
  "drag-start" | "drag-move" | "drag-end" | "drag-cancel" |
  "2finger-drag-start" | "2finger-drag-move" | "2finger-drag-end" | "2finger-drag-cancel" |
  "tap" | "2finger-tap" | "3finger-tap"
;

class PointerManager {
  #currentTarget: EventTarget | null = null;
  #gesture: Gesture | null = null;
  #gestureInfo: GestureInfo = {
    pointers: [],
  }
  #activePointers: Map<string, ActivePointer> = new Map;

  #listeners: WeakMap<EventTarget, Map<string, PointerEventListener>> = new WeakMap();

  tapDuration: number = 300;

  get currentTarget() {
    return this.#currentTarget;
  }

  init() {
    /*
    window.addEventListener("pointerdown", (ev) => {
      if (this.#gesture != null ) {
        return;
      }
      if (this.#currentTarget != void(0) && this.#currentTarget != ev.target) {
        return;
      }
      if (ev.target == null) {
        return;
      }
      
      const id = getPointerId(ev);
      this.#currentTarget = ev.target;
      
      if (this.#activePointers.has(id)) {
      }

      const rect = (ev.target as HTMLElement).getBoundingClientRect();
      const x = ev.clientX - rect.x;
      const y = ev.clientY - rect.y;
      const pointer = {
        id,
        startTime: Date.now(),
        startX: x, startY: y,
        startClientX: ev.clientX, startClientY: ev.clientY,
        currentX: x, currentY: y,
        currentClientX: ev.clientX, currentClientY: ev.clientY,
        alive: true,
      };
      this.#gestureInfo.pointers.push(pointer);
      this.#activePointers.set(id, pointer);

      if (ev.pointerType == "mouse" || ev.pointerType == "pen") {
        this.#gesture = "drag";
        this.dispatch("drag-start");
      }
    });
    */

    window.addEventListener("pointermove", (ev) => {
      const id = getPointerId(ev);
      const pointer = this.#activePointers.get(id);
      if (! pointer) {
        return;
      }

      if (this.#gesture == null) {
        const pointerCount = this.#activePointers.size;
        if (pointerCount == 1) {
          this.#gesture = "drag";
          this.dispatch("drag-start");
        }
        else if (pointerCount == 2) {
          this.#gesture = "2finger-drag";
          this.dispatch("2finger-drag-start");
        }
        else {
          this.cancelAllTouches();
          return;
        }
      }

      const rect = (this.#currentTarget as HTMLElement).getBoundingClientRect();
      pointer.currentClientX = ev.clientX;
      pointer.currentClientY = ev.clientY;
      pointer.currentX = ev.clientX - rect.x;
      pointer.currentY = ev.clientY - rect.y;
      this.dispatch(this.#gesture + "-move");
    });

    window.addEventListener("pointerup", (ev) => {

      const id = getPointerId(ev);
      const pointer = this.#activePointers.get(id);
      if (! pointer) {
        return;
      }

      const rect = (this.#currentTarget as HTMLElement).getBoundingClientRect();
      pointer.currentClientX = ev.clientX;
      pointer.currentClientY = ev.clientY;
      pointer.currentX = ev.clientX - rect.x;
      pointer.currentY = ev.clientY - rect.y;
      
      pointer.alive = false;

      // Single Finger
      if (this.#activePointers.size == 1) {
        if (this.#gesture == null) {
          this.dispatch("tap");
        }
        else if (this.#gesture == "drag") {
          this.dispatch("drag-end");
        }
        this.reset();
        return;
      }

      // Double Fingers or Triple Fingers
      let allUp = true;
      const pointers = this.#gestureInfo.pointers;
      for (let i = 0, len = pointers.length; i < len; i++) {
        if (pointers[i].alive) {
          allUp = false;
          break;
        }
      }

      if (! allUp) {
        return;
      }
      
      if (this.#gesture == null) {
        if (this.#activePointers.size == 2) {
          this.dispatch("2finger-tap");
        }
        else if (this.#activePointers.size == 3) {
          this.dispatch("3finger-tap");
        }
      }
      else {
        this.dispatch(this.#gesture + "-end");
      }
      this.reset();
    });
    
  }

  reset() {
    this.#currentTarget = null;
    this.#gestureInfo.pointers = [];
    this.#activePointers.clear();
    this.#gesture = null;
  }

  cancelAllTouches() {
    this.#activePointers.clear;
    this.#gesture = null;
  }

  dispatch(eventname: string) {
    if (this.#currentTarget == null) {
      return;
    }
    const listeners = this.#listeners.get(this.#currentTarget);
    if (! listeners) {
      return;
    }
    const callback = listeners.get(eventname);
    if (! callback) {
      return;
    }
    console.log(eventname);
    callback(this.#gestureInfo);
  }

  listen(target: HTMLElement, event: string, listener: PointerEventListener): void {
    let listeners = this.#register(target);
    listeners.set(event, listener);
  }

  #register(target: HTMLElement): Map<string, PointerEventListener> {
    let listeners = this.#listeners.get(target);
    if (listeners) {
      return listeners;
    }
    listeners = new Map();
    this.#listeners.set(target, listeners);

    target.addEventListener("pointerdown", (ev) => {
      if (this.#gesture != null ) {
        return;
      }
      if (this.#currentTarget != void(0) && this.#currentTarget != target) {
        return;
      }
      
      const id = getPointerId(ev);
      this.#currentTarget = target;
      
      if (this.#activePointers.has(id)) {
      }

      const rect = target.getBoundingClientRect();
      const x = ev.clientX - rect.x;
      const y = ev.clientY - rect.y;
      const pointer = {
        id,
        startTime: Date.now(),
        startX: x, startY: y,
        startClientX: ev.clientX, startClientY: ev.clientY,
        currentX: x, currentY: y,
        currentClientX: ev.clientX, currentClientY: ev.clientY,
        alive: true,
      };
      this.#gestureInfo.pointers.push(pointer);
      this.#activePointers.set(id, pointer);

      if (ev.pointerType == "mouse" || ev.pointerType == "pen") {
        this.#gesture = "drag";
        this.dispatch("drag-start");
      }
    });

    return listeners;
  }
}

interface PointerManager {
  listen(
    target: HTMLElement,
    event: GestureEventType,
    listener: PointerEventListener): void;
}

const pointerManager = new PointerManager();
pointerManager.init();
export default pointerManager;

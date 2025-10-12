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
  type: string;
  /** タッチ開始時刻 */
  startTime: number;
  /** タッチ開始時の target内のX座標 */
  startX: number;
  /** タッチ開始時の target内のY座標 */
  startY: number;
  /** タッチ開始時の クライアントX座標 */
  startClientX: number;
  /** タッチ開始時の クライアントY座標 */
  startClientY: number;
  /** 現在の target内のX座標 */
  x: number;
  /** 現在の target内のY座標 */
  y: number;
  /** 現在の クライアントX座標 */
  clientX: number;
  /** 現在の クライアントY座標 */
  clientY: number;
  /** 有効なタッチか. 既に離されたタッチの場合 false */
  alive: boolean;
  /** ドラッグ移動が開始済みのタッチか */
  dragged: boolean;
}

type GestureInfo = {
  pointers: ActivePointer[];
}

type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object
    ? DeepReadonly<T[K]>
    : T[K];
};

// GestureInfo をイベントパラメータとして送信するためのImmutable型
type GestureEventInfo = {
  readonly pointers: ReadonlyArray<Readonly<ActivePointer>>;
}

type PointerEventListener = (ev: GestureEventInfo) => boolean | void;

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

function distance2(x0: number, y0: number, x1: number, y1: number): number {
  return (x1-x0)*(x1-x0) + (y1-y0)*(y1-y0);
}

class PointerManager {
  #currentTarget: EventTarget | null = null;
  #gesture: Gesture | null = null;
  #gestureInfo: GestureInfo = {
    pointers: [],
  }
  #activePointers: Map<string, ActivePointer> = new Map;

  #listeners: WeakMap<EventTarget, Map<string, PointerEventListener>> = new WeakMap();

  // タッチがタップ操作と認識される間の時間 (ms)
  tapDuration: number = 300;

  // タッチがドラッグ操作と認識されるまでの移動距離 (px)
  dragThreshold: number = 5;

  get currentTarget() {
    return this.#currentTarget;
  }

  init() {
    window.addEventListener("pointermove", (ev) => {
      const id = getPointerId(ev);
      const pointer = this.#activePointers.get(id);
      if (! pointer) {
        return;
      }

      // ポインタ座標更新
      const rect = (this.#currentTarget as HTMLElement).getBoundingClientRect();
      pointer.clientX = ev.clientX;
      pointer.clientY = ev.clientY;
      pointer.x = ev.clientX - rect.x;
      pointer.y = ev.clientY - rect.y;

      const pointers = this.#gestureInfo.pointers;
      if (this.#gesture == null) {
        // 全てのタッチがドラッグの閾値を超えているか
        if (pointer.dragged) {
          return;
        }
        const d2 = distance2(
          pointer.startClientX, pointer.startClientY,
          ev.clientX, ev.clientY
        );
        if (d2 < this.dragThreshold*this.dragThreshold) {
          return;
        }
        pointer.dragged = true;

        let isAllDragged = true;
        for (let i = 0; i < pointers.length; i++) {
          if (! pointers[i].dragged) {
            isAllDragged = false;
            break;
          }
        }
        if (! isAllDragged) {
          return;
        }

        // タッチ数に応じてイベントタイプ決定
        const pointerCount = this.#activePointers.size;
        if (pointerCount == 1) {
          this.#gesture = "drag";
          this.#dispatch("drag-start");
        }
        else if (pointerCount == 2) {
          this.#gesture = "2finger-drag";
          this.#dispatch("2finger-drag-start");
        }
        else {
          this.#reset();
          return;
        }
      }

      // イベントタイプが決定済みの場合に move イベントの呼び出し
      this.#dispatch(this.#gesture + "-move");
    });

    window.addEventListener("pointerup", (ev) => {
      const id = getPointerId(ev);
      const pointer = this.#activePointers.get(id);
      if (! pointer) {
        return;
      }

      const rect = (this.#currentTarget as HTMLElement).getBoundingClientRect();
      pointer.clientX = ev.clientX;
      pointer.clientY = ev.clientY;
      pointer.x = ev.clientX - rect.x;
      pointer.y = ev.clientY - rect.y;
      
      pointer.alive = false;

      const t = Date.now();
      const firstPointer = this.#gestureInfo.pointers[0];

      // Single Finger
      if (this.#activePointers.size == 1) {
        if (this.#gesture == null && t < firstPointer.startTime + this.tapDuration) {
          this.#dispatch("tap");
        }
        else if (this.#gesture == "drag") {
          this.#dispatch("drag-end");
        }
        this.#reset();
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
        if (t < firstPointer.startTime + this.tapDuration) {
          if (this.#activePointers.size == 2) {
            this.#dispatch("2finger-tap");
          }
          else if (this.#activePointers.size == 3) {
            this.#dispatch("3finger-tap");
          }
        }
      }
      else {
        this.#dispatch(this.#gesture + "-end");
      }
      this.#reset();
    });
    
    window.addEventListener("pointercancel", (ev) => {
      const id = getPointerId(ev);
      const pointer = this.#activePointers.get(id);
      if (! pointer) {
        return;
      }

      if (this.#gesture) {
        this.#dispatch(this.#gesture + "-cancel");
        this.#reset();
      }
    });
  }

  /**
   * ポインタ状態のリセット
   */
  #reset() {
    this.#currentTarget = null;
    this.#gestureInfo.pointers = [];
    this.#activePointers.clear();
    this.#gesture = null;
  }

  /**
   * イベント呼び出し
   */
  #dispatch(eventname: string) {
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
    callback(this.#gestureInfo);
  }

  /**
   * ポインタイベント処理の登録
   */
  listen(target: HTMLElement, event: string, listener: PointerEventListener): void {
    let listeners = this.#register(target);
    listeners.set(event, listener);
  }

  /**
   * イベント追跡対象に HTMLElement を追加
   */
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
      if (ev.pointerType == "mouse" && ev.button != 0) {
        return;
      }
      
      const id = getPointerId(ev);
      this.#currentTarget = target;
      
      if (this.#activePointers.has(id)) {
      }

      const rect = target.getBoundingClientRect();
      const x = ev.clientX - rect.x;
      const y = ev.clientY - rect.y;
      const pointer: ActivePointer = {
        id,
        type: ev.pointerType,
        startTime: Date.now(),
        startX: x, startY: y,
        startClientX: ev.clientX, startClientY: ev.clientY,
        x: x, y: y,
        clientX: ev.clientX, clientY: ev.clientY,
        alive: true,
        dragged: false,
      };
      this.#gestureInfo.pointers.push(pointer);
      this.#activePointers.set(id, pointer);

      if (
        this.#gestureInfo.pointers.length == 1 &&
        (ev.pointerType == "mouse" || ev.pointerType == "pen")
      ) {
        this.#gesture = "drag";
        pointer.dragged = true;
        this.#dispatch("drag-start");
      }
    });

    return listeners;
  }

  get centerOfActivePointers() {
    const pointers = this.#gestureInfo.pointers;
    const len = pointers.length;
    if (len == 0) {
      return {x: 0, y: 0};
    }
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < len; i++) {
      cx += pointers[i].clientX;
      cy += pointers[i].clientY;
    }

    return {
      x: cx/len,
      y: cy/len,
    };
  }
}

interface PointerManager {
  /**
   * ポインタイベント処理の登録
   */
  listen(
    target: HTMLElement,
    event: GestureEventType,
    listener: PointerEventListener): void;
}

const pointerManager = new PointerManager();
pointerManager.init();
export default pointerManager;

import Color from "./color";
import { ObservableColor } from "./observable-value";

type PenMode = "pen" | "eraser";

type CursorInfo = {x: number; y: number;};

/**
 * 各ツールのカーソルアイコン情報
 */
const toolCursors: {[tool: string]: CursorInfo} = {
  "spoit": {x: 1, y: 14},
}

export abstract class CanvasTool {
  abstract get name(): string;
  abstract get size(): number;
  abstract set size(value: number);
  get resizeable() {
    return false;
  }
}

class CanvasToolNone extends CanvasTool {
  override get name(): string {
    return "none";
  }
  override get size(): number {
    return 0;
  }
  override set size(value: number) {}
}


export namespace CanvasTool {
  export const none = new CanvasToolNone();

  /**
   * ブラシ系ツール
   */
  export class Blush extends CanvasTool{
    penMode: PenMode;
    readonly obaservables: {
      size: ObservableValue<number>;
      opacity: ObservableValue<number>;
      blur: ObservableValue<number>;
    }

    constructor(penMode: PenMode, size: number) {
      super();
      this.obaservables = {
        size: new ObservableValue<number>(size),
        opacity: new ObservableValue<number>(1),
        blur: new ObservableValue<number>(1),
      };
      this.penMode = penMode;
    }
    
    override get name() {
      return this.penMode;
    }

    override get size(): number {
      return this.obaservables.size.value;
    }
    override set size(value: number) {
      this.obaservables.size.value = value;
    }
    override get resizeable() {
      return true;
    }

    get opacity(): number {
      return this.obaservables.opacity.value;
    }
    set opacity(value: number) {
      this.obaservables.opacity.value = value;
    }

    get blur(): number {
      return this.obaservables.blur.value;
    }
    set blur(value: number) {
      this.obaservables.blur.value = value;
    }

    get composite(): GlobalCompositeOperation {
      if (this.penMode == "pen") {
        return "source-over";
      }
      else {
        return "destination-out";
      }
    }
  }

  /**
   * スポイトツール
   */
  export class Spoit extends CanvasTool{
    override get name() {
      return "spoit";
    }
    override get size(): number {
      return 1;
    }
    override set size(value: number) {}
  }

  /**
   * バケツツール
   */
  export class Bucket extends CanvasTool {
    readonly obaservables: {
      tolerance: ObservableValue<number>;
      closeGap: ObservableValue<number>;
      expand: ObservableValue<number>;
      opacity: ObservableValue<number>;
    };

    constructor() {
      super();
      this.obaservables = {
        tolerance: new ObservableValue<number>(0),
        closeGap: new ObservableValue<number>(0),
        expand: new ObservableValue<number>(1),
        opacity: new ObservableValue<number>(1),
      };
    }

    override get name() {
      return "bucket";
    }
    override get size(): number {
      return 1;
    }
    override set size(value: number) {}
    
    /** 色許容誤差 */
    get tolerance(): number {
      return this.obaservables.tolerance.value;
    }
    set tolerance(value: number) {
      this.obaservables.tolerance.value = value;
    }
    /** 隙間閉じ */
    get closeGap(): number {
      return this.obaservables.closeGap.value;
    }
    set closeGap(value: number) {
      this.obaservables.closeGap.value = value;
    }
    /** 領域拡張 */
    get expand():  number {
      return this.obaservables.expand.value;
    }
    set expand(value: number) {
      this.obaservables.expand.value = value;
    }
    /** 透明度 */
    get opacity():  number {
      return this.obaservables.opacity.value;
    }
    set opacity(value: number) {
      this.obaservables.opacity.value = value;
    }
  }
  export namespace Bucket {
    export const toleranceMax = 50;
  }
}

export default CanvasTool;

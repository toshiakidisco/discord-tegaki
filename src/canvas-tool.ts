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

export class CanvasToolBlush extends CanvasTool{
  readonly color: ObservableColor = new ObservableColor(0, 0, 0);
  penMode: PenMode;
  size: number;

  constructor(penMode: PenMode, color: Color.Immutable, size: number) {
    super();
    this.penMode = penMode;
    this.color.set(color);
    this.size = size;
  }

  override get name() {
    return this.penMode;
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

export class CanvasToolSpoit extends CanvasTool{
  override get name() {
    return "spoit";
  }
  override get size(): number {
    return 1;
  }
  override set size(value: number) {}
}

export class CanvasToolBucket extends CanvasTool {
  override get name() {
    return "bucket";
  }
  override get size(): number {
    return 1;
  }
  override set size(value: number) {}
}

export namespace CanvasTool {
  export const none = new CanvasToolNone();
}

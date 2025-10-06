import { BlushState, drawPath, getPathBoundingRect } from "./canvas-action";
import Layer from "./canvas-layer";
import Offscreen from "./canvas-offscreen";
import CanvasRegion from "./canvas-region";
import Color from "./foudantion/color";
import { ObservableColor, ObservableValue } from "./foudantion/observable-value";
import Rect from "./foudantion/rect";
import TegakiCanvas from "./tegaki-canvas";

type PenMode = "pen" | "eraser";

type CursorInfo = {x: number; y: number;};

/**
 * 各ツールのカーソルアイコン情報
 */
const toolCursors: {[tool: string]: CursorInfo} = {
  "spoit": {x: 1, y: 14},
}

/**
 * ツールの抽象化クラス
 */
export abstract class CanvasTool {
  abstract get name(): string;
  abstract get size(): number;
  abstract set size(value: number);

  cursor(canvas: TegakiCanvas, x: number, y: number): string {
    return "none";
  }

  /** サイズ変更に対応しているか */
  get resizeable(): boolean {
    return false;
  }
  get cancelable(): boolean {
    return true;
  }

  /** 操作中にストロークを記録するか */
  get hasStroke(): boolean {
    return false;
  }

  /** 操作中に描画結果をプレビューするか */
  get hasPreview(): boolean {
    return false;
  }
  /** 操作中のプレビュー描画処理 */
  renderPreview(canvas: TegakiCanvas, layer: Layer, offscreen: Offscreen): void {}
  
  /** 操作中にキャンバスのオーバーレイ部に描画を行うか(e.g. 選択ツールの選択領域) */
  get hasOverlay(): boolean {
    return false;
  }
  /** 操作中のオーバーレイ描画処理 */
  renderOverlay(canvas: TegakiCanvas, context: CanvasRenderingContext2D): void {}

  /** 非表示レイヤーが選択中でも利用可能か */
  get isEnabledForHiddenLayer(): boolean {
    return false;
  }

  // 操作時のイベントハンドラ群
  onDown(canvas: TegakiCanvas, x: number, y: number): void {}
  onDrag(canvas: TegakiCanvas, x: number, y: number): void {}
  onUp(canvas: TegakiCanvas, x: number, y: number): void {}
  onCancel(canvas: TegakiCanvas): void {};

  onKeyDown(ev: KeyboardEvent) {}
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
    cursor(canvas: TegakiCanvas, x: number, y: number): string {
      return "blush";
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
    override get cancelable() {
      return false;
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
    get hasStroke(): boolean {
      return true;
    }
    
    override onUp(canvas: TegakiCanvas, x: number, y: number): void {
      this.finishDraw(canvas);
    }
    override onCancel(canvas: TegakiCanvas): void {
      this.finishDraw(canvas);
    }

    finishDraw(canvas: TegakiCanvas) {
      canvas.drawPath(
        canvas.strokePath,
        new BlushState(this.size, canvas.foreColor, this.composite)
      );
    }

    override get hasPreview(): boolean {
      return true;
    }
    override renderPreview(canvas: TegakiCanvas, layer: Layer, offscreen: Offscreen): void {
      canvas.clipBegin(offscreen.context);
      drawPath(
        offscreen.context, 
        new BlushState(this.size, canvas.foreColor, this.composite),
        canvas.strokePath
      );
      canvas.clipEnd(offscreen.context);
    }
  }

  /**
   * スポイトツール
   */
  export class Spoit extends CanvasTool{
    override get name() {
      return "spoit";
    }
    cursor(canvas: TegakiCanvas, x: number, y: number): string {
      return "spoit";
    }
    override get size(): number {
      return 1;
    }
    override set size(value: number) {}
    override get isEnabledForHiddenLayer(): boolean {
      return true;
    }

    onDown(canvas: TegakiCanvas, x: number, y: number): void {
      canvas.execSpoit(x, y);
    }

    onDrag(canvas: TegakiCanvas, x: number, y: number): void {
      canvas.execSpoit(x, y);
    }
  }

  /**
   * 選択ツール
   */
  export class Select extends CanvasTool{
    #startX: number = 0;
    #startY: number = 0;
    #finishX: number = 0;
    #finishY: number = 0;

    #oldRegion: CanvasRegion | null = null;
    #grabbedImage: Offscreen | null = null;

    /**
     * ツールの状態. none: 未操作, select: 選択中, grab: 画像掴み中
     */
    #mode: "none" | "select" | "grab" = "select";

    override get name() {
      return "select";
    }
    cursor(canvas: TegakiCanvas, x: number, y: number): string {
      if (this.#mode == "select") {
        return "select";
      }
      else if (this.#mode == "grab") {
        return "grab";
      }

      const region = canvas.selectedRegion;
      if (region == null) {
        return "select";
      }
      if (region.isPointIn(x, y)) {
        return "grab";
      }
      return "select";
    }
    override get size(): number {
      return 1;
    }
    override set size(value: number) {}
    override get cancelable() {
      return false;
    }
    get isEnabledForHiddenLayer(): boolean {
      return true;
    }

    override get hasPreview(): boolean {
      return true;
    }
    override renderPreview(canvas: TegakiCanvas, layer: Layer, offscreen: Offscreen): void {
      if (this.#mode == "grab") {
      }
    }

    override get hasOverlay(): boolean {
      return true;
    }
    override renderOverlay(canvas: TegakiCanvas, context: CanvasRenderingContext2D): void {
      if (this.#mode == "select") {
        const rect = new Rect(this.#startX, this.#startY, this.#finishX - this.#startX, this.#finishY - this.#startY).normalize().scale(canvas.scale).floor().expand(0.5);
        
        context.save();
        context.lineWidth = 1;
        context.strokeStyle = "black";
        context.setLineDash([5]);
        context.strokeRect(rect.x, rect.y, rect.width, rect.height);
        context.strokeStyle = "white";
        context.lineDashOffset = 5;
        context.strokeRect(rect.x, rect.y, rect.width, rect.height);
        context.restore();
      }
    }

    override onDown(canvas: TegakiCanvas, x: number, y: number): void {
      const region = canvas.selectedRegion;
      this.#startX = this.#finishX = x | 0;
      this.#startY = this.#finishY = y | 0;
      // Start select
      if (region == null || (! region.isPointIn(x, y))) {
        this.#mode = "select";
        this.#grabbedImage = null;
      }
      // Start gbab
      else {
        this.#mode = "grab";
        canvas.selectGrab();
      }
    }
    override onDrag(canvas: TegakiCanvas, x: number, y: number): void {
      x = x | 0;
      y = y | 0;
      const dx = x - this.#finishX;
      const dy = y - this.#finishY;
      this.#finishX = x;
      this.#finishY = y;

      if (this.#mode == "grab") {
        canvas.selectGrabMove(dx, dy);
      }
    }
    override onUp(canvas: TegakiCanvas, x: number, y: number): void {
      this.#finishX = x | 0;
      this.#finishY = y | 0;
      if (this.#mode == "select") {

        const rect = new Rect(this.#startX, this.#startY, this.#finishX - this.#startX, this.#finishY - this.#startY)
                        .normalize()
                        .intersection(new Rect(0, 0, canvas.width, canvas.height));
        if (rect.isEmpty()) {
          canvas.selectNew(null);
        }
        else {
          const region = new CanvasRegion().setRect(rect);
          canvas.selectNew(region);
        };
      }
      else if (this.#mode == "grab") {
      }
      this.#mode = "none";
    }
    override onCancel(canvas: TegakiCanvas): void {
      if (this.#mode == "grab") {
        canvas.selectGrabFinish();
      }
      this.#mode = "none";
    }
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
    cursor(canvas: TegakiCanvas, x: number, y: number): string {
      return "bucket";
    }
    override get size(): number {
      return 1;
    }
    override set size(value: number) {}
    override get cancelable() {
      return true;
    }
    
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

    onDown(canvas: TegakiCanvas, x: number, y: number): void { 
      canvas.bucketFill(
        canvas.currentLayer, x, y,
        canvas.foreColor, {
          closeGap: this.closeGap,
          expand: this.expand,
          tolerance: this.tolerance,
          opacity: this.opacity,
        }
      );
    }
  }
  export namespace Bucket {
    export const toleranceMax = 200;
  }
}

export default CanvasTool;

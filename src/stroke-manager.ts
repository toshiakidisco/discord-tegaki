import { BrushPath } from "./canvas-action";
import FiniteStack from "./foudantion/finite-stack";
import Subject from "./foudantion/subject";

type Point = {x: number; y: number;};

/**
 * ストロークへの手振れ補正管理
 */
export class StrokeManager extends Subject{
  private _updateTimer: number = 0;
  private _updateCallback = this.update.bind(this);

  // 実際のペンの座標
  private _px: number = 0;
  private _py: number = 0;
  // 補正されたペン(スタビライザ)の座標
  private _sx: number = 0;
  private _sy: number = 0;

  private _samplesNum = 3;
  private _weights: number[];
  private _samples: FiniteStack<Point>;

  /** 補正されたストロークパス */
  private _path: BrushPath = [];

  constructor() {
    super();
    this._samples = new FiniteStack(this._samplesNum);
    this._weights = new Array(this._samplesNum);
    let w = 100;
    for (let i = 0; i < this._samplesNum; i++) {
      this._weights[i] = w;
      w *= 0.85;
    }
  }

  get path() {
    return this._path;
  }

  get isActive() {
    return this._updateTimer != 0;
  }

  start(x: number, y: number) {
    this._px = x;
    this._py = y;
    this._sx = x;
    this._sy = y;
    this._samples.fill({x: x, y: y});
    this._path = [{x: x, y: y, time: Date.now()}];
    this._updateTimer = window.setInterval(this._updateCallback, 1000/60);
  }

  update() {
    if (this._sx == this._px && this._sy == this._py) {
      return;
    }

    this._samples.push({x: this._px, y: this._py});

    let totalWeight = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < this._weights.length; i++) {
      const weight = this._weights[i];
      totalWeight += weight;
      const point = this._samples.peek(i) as Point;
      dx += weight*(point.x - this._sx);
      dy += weight*(point.y - this._sy);
    }
    dx /= totalWeight;
    dy /= totalWeight;
    this._sx += dx;
    this._sy += dy;

    this._path.push({x: this._sx, y: this._sy, time: Date.now()});
    this.notify("update", this);
  }

  move(x: number, y: number) {
    this._px = x;
    this._py = y;
  }

  finish() {
    if (this._sx != this._px || this._sy != this._py) {
      this._path.push({x: this._px, y: this._py, time: Date.now()});
    }
    else {
      this._path[this._path.length - 1].time = Date.now();
    }
    window.clearInterval(this._updateTimer);
    this._updateTimer = 0;
  }
}

function optimizePath(path: BrushPath) {
  const threshold = 5;

}

export default StrokeManager;

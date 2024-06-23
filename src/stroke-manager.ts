import { BlushPath } from "./canvas-action";
import FiniteStack from "./finite-stack";
import Subject from "./subject";

type Point = {x: number; y: number;};

export class StrokeManager extends Subject{
  private _updateTimer: number = 0;
  private _updateCallback = this.update.bind(this);

  // Pointer Position
  private _px: number = 0;
  private _py: number = 0;
  // Stabilizer Position
  private _sx: number = 0;
  private _sy: number = 0;

  private _samplesNum = 3;
  private _weights;
  private _samples:FiniteStack<Point>;

  private _path: BlushPath = [];

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
    this._path = [{x: x, y: y}];
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

    this._path.push({x: this._sx, y: this._sy});
    this.notify("update", this);
  }

  move(x: number, y: number) {
    this._px = x;
    this._py = y;
  }

  finish() {
    console.log(this._samples);
    if (this._sx != this._px || this._sy != this._py) {
      this._path.push({x: this._px, y: this._py});
    }
    window.clearInterval(this._updateTimer);
    this._updateTimer = 0;
  }
}

export default StrokeManager;

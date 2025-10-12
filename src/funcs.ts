import Rect from "./foudantion/rect";

export function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export const isRunnningOnExtension = (function () {
  if (typeof chrome === "undefined") {
    return false;
  }
  if (typeof chrome.runtime === "undefined") {
    return false;
  }
  return true;
}());

export function createCanvas2D(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context == null) {
    throw new Error("Failed to get RenderingContext2D");
  }
  return {canvas, context};
}


export function getConnectedPixels(width: number, height: number, src: Uint8ClampedArray, x: number, y: number): {
  region: Uint8ClampedArray;
  rect: Rect;
} {
  const dst = new Uint8ClampedArray(src.length);
  const seeds: number[] = [];

  let minX = x;
  let maxX = x;
  let minY = y;
  let maxY = y;

  seeds.push(x, y);

  while (seeds.length > 0) {
    const sy = seeds.pop() as number;
    const sx = seeds.pop() as number;
    const sp = (sy*width + sx)*4 + 3;

    if (dst[sp] != 0) {
      continue;
    }

    let dx: number;
    let dp: number;
    // Find left side edge
    for(dx = sx-1, dp = sp-4; dx >= 0; dx--, dp -= 4) {
      if (src[dp] == 0) {
        break;
      }
    }
    const left = dx + 1;
    const lp = dp + 4;

    // Find right side edge
    for(dx = sx+1, dp = sp+4; dx < width; dx++, dp += 4) {
      if (src[dp] == 0) {
        break;
      }
    }
    const right = dx - 1;
    const rp = dp - 4;

    // Fill
    for (dp = lp; dp <= rp; dp += 4) {
      dst[dp] = src[dp];
    }

    if (left < minX) {
      minX = left;
    }
    if (right > maxX) {
      maxX = right;
    }
    // Scan next lines
    if (sy-1 >= 0) {
      if (sy-1 < minY) {
        minY = sy-1;
      }
      _scanLine(width, src, seeds, left, right, sy - 1);
    }
    if (sy+1 < height) {
      if (sy+1 > maxY) {
        maxY = sy+1;
      }
      _scanLine(width, src, seeds, left, right, sy + 1);
    }
  }

  return {
    region: dst,
    rect: new Rect(minX, minY, maxX - minX + 1, maxY - minY + 1),
  };
}

function _scanLine(width: number, src: Uint8ClampedArray, seeds: number[], left: number, right: number, y: number) {

  let dx = left;
  let dp = (y*width + dx)*4 + 3;
  while(dx <= right) {
    for (; dx <= right; dx++, dp+=4) {
      if (src[dp] != 0) {
        seeds.push(dx, y);
        break;
      }
    }
    
    for (; dx <= right; dx++, dp+=4) {
      if (src[dp] == 0) {
        break;
      }
    }
  }
}

export function afterRendering(callback: FrameRequestCallback) {
  requestAnimationFrame(()=>{
    requestAnimationFrame(callback);
  });
}
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
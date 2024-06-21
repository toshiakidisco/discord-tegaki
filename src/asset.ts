const isRunnningOnExtension = typeof chrome.runtime !== "undefined";

export function getAssetUrl(path: string) {
  return isRunnningOnExtension ? chrome.runtime.getURL(path) : path;
}

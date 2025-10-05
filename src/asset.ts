import { isRunnningOnExtension } from "./funcs";

let _assetDirectory = "";

export function setAssetDirectory(path: string) {
  if (! path.endsWith("/")) {
    path = path + "/";
  }
  _assetDirectory = path;
}

export function getAssetUrl(path: string) {
  return isRunnningOnExtension ? chrome.runtime.getURL(path) : _assetDirectory + path;
}

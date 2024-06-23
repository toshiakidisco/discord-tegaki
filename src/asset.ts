import { isRunnningOnExtension } from "./funcs";

export function getAssetUrl(path: string) {
  return isRunnningOnExtension ? chrome.runtime.getURL(path) : path;
}

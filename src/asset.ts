import { isRunnningOnExtension } from "./tools";

export function getAssetUrl(path: string) {
  return isRunnningOnExtension ? chrome.runtime.getURL(path) : path;
}

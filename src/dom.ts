export type Outlets = {
  [name: string]: HTMLElement;
};

/**
 * HTMLコードからHTML要素の作成。以下の処理を伴う。
 * - 要素の name 属性を読み取り、辞書としてまとめる
 * - 要素の data-on-{eventName} 属性を読み取りコールバックを登録する
 * - src属性が [filePath] の形式の時、拡張内のパスに変換する
 * @param html 
 * @param controller コールバックの呼び出し先
 * @param outlets name属性から対応するHTMLElementへの辞書オブジェクト
 * @returns 
 */
export function parseHtml(html: string, controller?: any, outlets?: Outlets) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const child = template.content.firstElementChild;
  if (! (child instanceof HTMLElement)) {
    throw new Error("First element must be HTML element");
  }
  parseElement(child, controller, outlets);
  return child;
}

export function parseSvg(svg: string) {
  const template = document.createElement("template");
  template.innerHTML = svg;
  const child = template.content.firstElementChild;
  if (! (child instanceof SVGElement)) {
    throw new Error("First element must be SVG ELement");
  }
  return child;
}

export function parseElement(element: HTMLElement, controller?: any, outlets?: Outlets): HTMLElement {
  for (let attribute of element.attributes) {
    // Set outlet
    if (typeof outlets !== "undefined" && attribute.name == "name") {
      outlets[attribute.value] = element;
    }
    // Register event
    else if (
      typeof controller !== "undefined" &&
      attribute.name.startsWith("data-on-")
    ) {
      const eventName = attribute.name.substring("data-on-".length);
      const handlerName = attribute.value;
      if (typeof controller[handlerName] !== "function") {
        throw new Error(`[Discord Tegaki]Controller doesn't have ${handlerName} method`);
      }

      element.addEventListener(eventName, function (ev:any) {
        return controller[handlerName](ev);
      });
    }
    // Convert Path
    if (attribute.name == "src" && attribute.value.match(/^\[.+\]$/)) {
      const path = attribute.value.substring(1, attribute.value.length-1);
      attribute.value = chrome.runtime.getURL(path);
    }
  }

  // Parse children
  let children;
  if (element instanceof HTMLTemplateElement) {
    children = element.content.children;
  }
  else {
    children = element.children;
  }
  for (let child of children) {
    if (! (child instanceof HTMLElement)) {
      continue;
    }
    parseElement(child, controller, outlets);
  }
  return element;
}

/**
 * 要素が画面内に収まるように位置を調整する
 */
export function adjustPosition(elem: HTMLElement) {
  const rect = elem.getBoundingClientRect();
  if (rect.x < 0) {
    elem.style.left = "0";
  }
  else if (rect.right > window.innerWidth) {
    elem.style.left = `${window.innerWidth - elem.clientWidth}px`;
  }
  if (rect.y < 0) {
    elem.style.top = "0";
  }
  else if (rect.bottom > window.innerHeight) {
    elem.style.top = `${window.innerHeight - elem.clientHeight}px`;
  }
}


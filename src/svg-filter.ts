import Color from "./color";

type Attributes = {[key: string]: number | string | Color.Immutable | number[]};

export class SvgFilter {
  #code: string = "";

  add(name: string, attributes: Attributes) {
    let attribtesText = "";
    for (const key in attributes) {
      const value = attributes[key];
      let valueText: string;
      if (typeof value === "number") {
        valueText = value.toString();
      }
      else if (typeof value === "string") {
        valueText = value;
      }
      else if (value instanceof Array) {
        valueText = value.join(" ");
      }
      else {
        valueText = value.css();
      }
      attribtesText += `${key}="${valueText}" `;
    }
    this.#code += `<${name} ${attribtesText}/>\n`;
  }

  get code() {
    return this.#code;
  }
}

export default SvgFilter;

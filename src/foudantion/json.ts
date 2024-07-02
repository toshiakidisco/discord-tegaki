type _JsonValue = boolean | number | string | _JsonValue[] | {[key: string]: _JsonValue} | null;
export type JsonArray = _JsonValue[];
export type JsonObject = {[key: string]: _JsonValue};
export type JsonValue = boolean | number | string | JsonArray | JsonObject | null;
export type TypeName = "boolean" | "number" | "string" | "array" | "object" | "null";

type OptionNullable = "?" | "";
type OptionMin = `|>${number}` | "";
type OptionMax = `|<${number}` | "";
type OptionDefaultNumber = `|=${number}` | "";
type JsonStructureNumber = `number${OptionNullable}${OptionMin}${OptionMax}${OptionDefaultNumber}`;

export type JsonStructure = 
  "boolean"
  | `string`
  | JsonStructureNumber
  | "null"
  | [
    item: JsonStructure
  ]
  | {
    [key: string]: JsonStructure;
  }
;

function parseStructureNumber(s: JsonStructureNumber) {
  const nullable = s.indexOf("?") >= 0;
  let min;
  {
    const m = s.match(/\|>([\d\.]+)/);
    min = m ? Number(m[1]) : undefined;
  }
  let max;
  {
    const m = s.match(/\|<([\d\.]+)/);
    max = m ? Number(m[1]) : undefined;
  }
  let init;
  {
    const m = s.match(/\|=([\d\.]+)/);
    init = m ? Number(m[1]) : undefined;
  }
  return {
    nullable, min, max, init
  };
}

export function parse(data: JsonValue, structure: JsonStructure, path: string = "data"): JsonValue {
  const typeName = getTypeName(data);
  
  if (structure instanceof Array) {
    if (typeName !== "array") {
      throw new Error(`${path} must be array`);
    }
    data = data as JsonArray;
    for (let i = 0; i < data.length; i++) {
      const childPath = path+"["+i+"]";
      parse(data[i], structure[0], childPath);
    }
    return data;
  }
  else if (typeof structure == "object") {
    if (typeName !== "object") {
      throw new Error(`${path} must be object`);
    } 
    for (const key in structure) {
      const item = (data as JsonObject)[key];
      const childPath = path+"."+key;
      parse(item, structure[key], childPath);
    }
    return data;
  }
  else if (structure == "null") {
    if (data !== null) {
      throw new Error(`${path} must be null`);
    }
    return data;
  }
  else if (structure.startsWith("number")) {
    const s = parseStructureNumber(structure as JsonStructureNumber);
    if (typeof data === "undefined") {
      if (typeof s.init !== "undefined") {
        return s.init;
      }
      else if (typeof s.nullable) {
        return data;
      }
      else {
        throw new Error(`${path} must be a number`);
      }
    }
    else if (typeof data !== "number") {
      throw new Error(`${path} must be a number`);
    }
    else if (typeof s.min !== "undefined" && data < s.min) {
      return s.min;
    }
    else if (typeof s.max !== "undefined" && data > s.max) {
      return s.max;
    }
    return data;
  }
  else if (structure !== (typeof data)) {
    throw new Error(`${path} must be a ${structure}`);
  }
  return data;
}

export function getTypeName(value: JsonValue): TypeName {
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
  }
  if (value instanceof Array) {
    return "array";
  }
  else if (value == null) {
    return "null";
  }
  return "object";
}


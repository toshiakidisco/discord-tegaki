type _JsonValue = boolean | number | string | _JsonValue[] | {[key: string]: _JsonValue} | null;
export type JsonArray = _JsonValue[];
export type JsonObject = {[key: string]: _JsonValue};
export type JsonValue = boolean | number | string | JsonArray | JsonObject | null;
export type TypeName = "boolean" | "number" | "string" | "array" | "object" | "null";

export type JsonStructure = 
  "boolean"
  | "string"
  | "number"
  | "null"
  | [
    item: JsonStructure
  ]
  | {
    [key: string]: JsonStructure;
  }
;

export function check(data: JsonValue, structure: JsonStructure, path: string = "data"): void {
  const typeName = getTypeName(data);
  
  if (structure instanceof Array) {
    if (typeName !== "array") {
      throw new Error(`${path} must be array`);
    }
    data = data as JsonArray;
    for (let i = 0; i < data.length; i++) {
      const childPath = path+"["+i+"]";
      check(data[i], structure[0], childPath);
    }
    return;
  }
  else if (typeof structure == "object") {
    if (typeName !== "object") {
      throw new Error(`${path} must be object`);
    } 
    for (const key in structure) {
      const item = (data as JsonObject)[key];
      const childPath = path+"."+key;
      check(item, structure[key], childPath);
    }
    return;
  }
  else if (structure == "null") {
    if (data !== null) {
      throw new Error(`${path} must be null`);
    }
    return;
  }
  else if (structure !== (typeof data)) {
    throw new Error(`${path} must be ${structure}`);
  }
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


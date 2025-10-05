const canvas = document.createElement("canvas");
export const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;

export function isAvailable() {
  return gl !== null;
}

export default gl;



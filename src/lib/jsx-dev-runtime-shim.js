import * as runtime from "react/jsx-runtime";

export const Fragment = runtime.Fragment;
export const jsx = runtime.jsx;
export const jsxs = runtime.jsxs;
export const jsxDEV = function (type, props, key, isStaticChildren, source, self) {
  return isStaticChildren
    ? runtime.jsxs(type, props, key)
    : runtime.jsx(type, props, key);
};

export default {
  Fragment,
  jsx,
  jsxs,
  jsxDEV,
};

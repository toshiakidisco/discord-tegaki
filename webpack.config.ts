import { Configuration } from 'webpack';
import path from "node:path";
import CopyPlugin from "copy-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";

import configures from './webpack_cofigures';


const configs:Configuration[] = [];

switch (process.env.NODE_ENV) {
  case "development": {
    configs.push(configures["extension"], configures["pages"]);
    break;
  }
  case "pages": {
    configs.push(configures["pages"]);
    break;
  }
  case "module": {
    configs.push(configures["module"]);
    break;
  }
  default: {
    configs.push(configures["extension"], configures["module"]);
  }
}

export default configs;

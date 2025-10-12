import { Configuration, RuleSetRule } from 'webpack';
import path from "node:path";
import CopyPlugin from "copy-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import { DefinePlugin } from 'webpack';

const isDev = process.env.NODE_ENV === 'development';

type ReplaceDefines = { [key: string]: string };

// 共通設定
function genCommonConfig(defines: ReplaceDefines): Configuration {
  const multiple: {search: string; replace: string; flags?: string;}[] = [];
  
  for (let key in defines) {
    const value = defines[key];
    multiple.push({
      search: key,
      replace: value,
      flags: "g"
    });
  }
  
  const replaceRule = {
    loader: "string-replace-loader",
    options: {
      multiple: multiple
    }
  }

  return {
    mode: isDev ? 'development' : 'production',
    resolve: {
      extensions: ['.js', '.ts', '.json'],
    },
    output: {
      path: __dirname,
      publicPath: './',
      filename: "[name].js"
    },
    module: {
      rules: [
        // TypeScript Code
        {
          test: /\.(ts|mts)$/i,
          exclude: /node_modules/,
          use: [replaceRule, 'ts-loader'],
        },
        // CSS
        {
          test: /\.(scss|sass|css)$/i,
          use: [MiniCssExtractPlugin.loader, 'css-loader', replaceRule, 'sass-loader'],
        },
        {
          test: /\.(html|svg)$/i,
          use: ['raw-loader', replaceRule],
        },
        // Asset to DataURI
        {
          test: /\.(png|jpg|gif)$/i,
          type: 'asset/inline',
        },
      ],
    },
    
    watch: isDev,
    devtool: isDev ? 'source-map' : undefined,
  };
}


const configures: {[name: string]: Configuration} = {};

// Browser Extension
{
  const dstDir = "dist";
  configures["extension"] = {
    ...genCommonConfig({
      __DT_R_PREFIX__: "dt_r_t_ext",
    }),
    
    target: 'web',
    entry: {
      "dist/main": [
        './src/extension.ts',
      ]
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          {
            context: path.resolve(__dirname, "src/icons"),
            from: path.resolve(__dirname, "src/icons"),
            to: path.resolve(__dirname, "dist/icons"),
          },
          {
            from: path.resolve(__dirname, "manifest.json"),
            to: path.resolve(__dirname, "dist/manifest.json"),
          },
        ],
      }),
      new MiniCssExtractPlugin({
        filename: 'dist/style.css',
      }),
    ],
  };
}

// GitHub Pages
{
  const dstDir = "docs";
  configures["pages"] = {
    ...genCommonConfig({
      __DT_R_PREFIX__: "dt_r_t_doc",
    }),
    
    target: 'web',
    entry: {
      "app": [
        './src/module.ts',
      ]
    },
    output: {
      path: path.resolve(__dirname, dstDir),
      publicPath: './',
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          {
            context: path.resolve(__dirname, "src/web-asset"),
            from: path.resolve(__dirname, "src/web-asset"),
            to: path.resolve(__dirname, dstDir, "asset"),
          },
          {
            from: path.resolve(__dirname, "src/index.html"),
            to: path.resolve(__dirname, dstDir, "index.html"),
          },
          {
            from: path.resolve(__dirname, "src/index-sp.html"),
            to: path.resolve(__dirname, dstDir, "index-sp.html"),
          },
        ],
      }),
      new MiniCssExtractPlugin({
        filename: `style.css`,
      }),
    ],
  }
}

// Module
{
  const dstDir = "module";
  configures["module"] = {
    ...genCommonConfig({
      __DT_R_PREFIX__: process.env.__DT_R_PREFIX__ ?? "dt_r_t_mod",
    }),
    
    target: 'web',
    entry: {
      "app": [
        './src/module.ts',
      ]
    },
    output: {
      path: path.resolve(__dirname, dstDir),
      publicPath: './',
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: `style.css`,
      }),
    ],
  }
}

export default configures;

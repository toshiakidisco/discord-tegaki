import { Configuration } from 'webpack';
import path from "node:path";
import CopyPlugin from "copy-webpack-plugin";

const isDev = process.env.NODE_ENV === 'development';

// 共通設定
const config: Configuration = {
  mode: isDev ? 'development' : 'production',
  resolve: {
    extensions: ['.js', '.ts', '.json'],
  },
  output: {
    publicPath: './',
  },
  module: {
    rules: [
      // TypeScript Code
      {
        test: /\.(ts|mts)$/i,
        exclude: /node_modules/,
        loader: 'ts-loader',
      },
      // Raw Loader
      {
        test: /^raw-loader!\*/i,
        loader: 'raw-loader',
      },
    ],
  },
  
  target: 'web',
  entry: {
    main: [
      './src/main.ts',
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          context: path.resolve(__dirname, "src/asset"),
          from: path.resolve(__dirname, "src/asset"),
          to: path.resolve(__dirname, "dist/asset"),
        },
        {
          from: path.resolve(__dirname, "manifest.json"),
          to: path.resolve(__dirname, "dist/manifest.json"),
        },
      ],
    }),
  ],

  watch: isDev,
  devtool: isDev ? 'source-map' : undefined,
};



export default [config];

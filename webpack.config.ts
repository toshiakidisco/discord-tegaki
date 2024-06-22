import { Configuration } from 'webpack';
import path from "node:path";
import CopyPlugin from "copy-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";

const isDev = process.env.NODE_ENV === 'development';

// 共通設定
const common: Configuration = {
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
        loader: 'ts-loader',
      },
      // CSS
      {
        test: /\.(scss|sass|css)$/i,
        use: [ MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
      },
      // Raw Loader
      {
        test: /^raw-loader!\*/i,
        loader: 'raw-loader',
      },
    ],
  },
  
  watch: isDev,
  devtool: isDev ? 'source-map' : undefined,
};

const configs: Configuration[] = [];

// Browser Extension
configs.push({
  ...common,
  
  target: 'web',
  entry: {
    "dist/main": [
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
    new MiniCssExtractPlugin({
      filename: 'dist/style.css',
    }),
  ],
})

// GitHub Pages
{
  const dstDir = isDev ? "docs-dev" : "docs";
  configs.push({
    ...common,
    
    target: 'web',
    entry: {
      "main": [
        './src/main.ts',
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
            context: path.resolve(__dirname, "src/asset"),
            from: path.resolve(__dirname, "src/asset"),
            to: path.resolve(__dirname, dstDir, "asset"),
          },
          {
            from: path.resolve(__dirname, "src/index.html"),
            to: path.resolve(__dirname, dstDir, "index.html"),
          },
        ],
      }),
      new MiniCssExtractPlugin({
        filename: `style.css`,
      }),
    ],
  })
}

export default configs;

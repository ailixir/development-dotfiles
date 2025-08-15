import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import webpack from 'webpack';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { ModuleFederationPlugin } = webpack.container;
const isDevelopment = process.env.NODE_ENV !== 'production';

/** @type {import('webpack').Configuration} */
const config = {
  mode: isDevelopment ? 'development' : 'production',
  entry: path.resolve(process.cwd(), 'src', 'index.tsx'),
  devtool: isDevelopment ? 'eval-source-map' : 'source-map',
  output: {
    path: path.resolve(process.cwd(), 'dist'),
    filename: isDevelopment ? '[name].bundle.js' : '[name].[contenthash].js',
    chunkFilename: isDevelopment ? '[name].chunk.js' : '[name].[contenthash].chunk.js',
    publicPath: 'auto',
    clean: true,
  },
  resolve: {
    extensions: ['.mjs', '.tsx', '.ts', '.jsx', '.js', '.json'],
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      '@components': path.resolve(process.cwd(), 'src/components'),
      '@pages': path.resolve(process.cwd(), 'src/pages'),
      '@hooks': path.resolve(process.cwd(), 'src/hooks'),
      '@services': path.resolve(process.cwd(), 'src/services'),
      '@types': path.resolve(process.cwd(), 'src/types'),
      '@utils': path.resolve(process.cwd(), 'src/utils'),
      '@store': path.resolve(process.cwd(), 'src/store'),
      // Use built output of local linked package to avoid bundling its dev deps
      '@put/core-components': path.resolve(process.cwd(), '../put-core-components/dist'),
      react: path.resolve(process.cwd(), 'node_modules/react'),
      'react-dom': path.resolve(process.cwd(), 'node_modules/react-dom'),
      'process/browser': require.resolve('process/browser'),
      process: require.resolve('process/browser'),
    },
    fallback: {
      process: require.resolve('process/browser'),
      buffer: require.resolve('buffer/'),
      stream: require.resolve('stream-browserify'),
    },
    fullySpecified: false,
    symlinks: false,
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: { jsx: 'react-jsx' },
          },
        },
      },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      { test: /\.(png|jpg|jpeg|gif|svg|ico)$/, type: 'asset/resource' },
      { test: /\.(woff|woff2|eot|ttf|otf)$/, type: 'asset/resource' },
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'checks',
      filename: 'remoteEntry.js',
      exposes: {
        './Module': './src/ChecksModule',
      },
      shared: {
        react: { singleton: true, requiredVersion: false, strictVersion: false },
        'react-dom': { singleton: true, requiredVersion: false, strictVersion: false },
        '@put/core-components': { singleton: true, requiredVersion: false },
        'react-router-dom': { singleton: true, requiredVersion: '^6.21.0' },
        '@mui/material': { singleton: true, requiredVersion: '^5.15.0' },
        '@mui/icons-material': { singleton: true, requiredVersion: '^5.15.0' },
        '@emotion/react': { singleton: true, requiredVersion: '^11.11.0' },
        '@emotion/styled': { singleton: true, requiredVersion: '^11.11.0' },
      },
    }),
    new HtmlWebpackPlugin({
      template: './public/index.html',
      title: 'PUT Checks Module',
      inject: true,
      scriptLoading: 'defer',
    }),
    new webpack.ProvidePlugin({ process: 'process/browser', Buffer: ['buffer', 'Buffer'] }),
    isDevelopment && new ReactRefreshWebpackPlugin(),
  ].filter(Boolean),
  devServer: {
    port: 3002,
    host: 'localhost',
    historyApiFallback: true,
    hot: true,
    compress: true,
    headers: { 'Access-Control-Allow-Origin': '*' },
    static: { directory: path.join(process.cwd(), 'public'), publicPath: '/' },
  },
  optimization: {
    // Module Federation remotes work best without splitChunks to avoid
    // async ordering issues that can cause eager shared consumption errors
    splitChunks: false,
    runtimeChunk: false,
    moduleIds: 'deterministic',
  },
  performance: {
    hints: isDevelopment ? false : 'warning',
    maxEntrypointSize: 512000,
    maxAssetSize: 512000,
  },
};

export default config;



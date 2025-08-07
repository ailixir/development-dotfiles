const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { ModuleFederationPlugin } = require('@module-federation/enhanced');

module.exports = {
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, '../src'),
      '@/components': path.resolve(__dirname, '../src/components'),
      '@/hooks': path.resolve(__dirname, '../src/hooks'),
      '@/services': path.resolve(__dirname, '../src/services'),
      '@/types': path.resolve(__dirname, '../src/types'),
      '@/utils': path.resolve(__dirname, '../src/utils'),
      '@/store': path.resolve(__dirname, '../src/store'),
    },
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.webpack.json'
          }
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|jpe?g|gif|svg|ico)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'checks',
      filename: 'remoteEntry.js',
      runtime: false,
      exposes: {
        './ChecksModule': './src/bootstrap',
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: '^18.2.0',
          eager: true,
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^18.2.0',
          eager: true,
        },
        '@mui/material': {
          singleton: true,
          requiredVersion: '^7.1.1',
          eager: true,
        },
        '@emotion/react': {
          singleton: true,
          eager: true,
        },
        '@emotion/styled': {
          singleton: true,
          eager: true,
        },
        'react-router-dom': {
          singleton: true,
          requiredVersion: '^7.0.1',
          eager: true,
        },
      },
    }),
    new HtmlWebpackPlugin({
      template: './public/index.html',
      title: 'PUT Checks Module',
    }),
    new webpack.DefinePlugin({
      'process.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL || 'http://localhost:3002/api'),
      'process.env.VITE_ENABLE_MSW': JSON.stringify(process.env.VITE_ENABLE_MSW || 'true'),
      'process.env.VITE_MODULE_NAME': JSON.stringify(process.env.VITE_MODULE_NAME || 'checks'),
      'process.env.VITE_DEBUG_MODE': JSON.stringify(process.env.VITE_DEBUG_MODE || 'true'),
    }),
  ],
};

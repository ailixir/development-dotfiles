const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
  mode: 'development',
  devtool: 'eval-source-map',
  devServer: {
    port: 3002,
    hot: true,
    historyApiFallback: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
    },
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
    },
  },
  optimization: {
    splitChunks: false,
  },
  output: {
    publicPath: 'http://localhost:3002/',
    clean: true,
    uniqueName: 'checks',
  },
});

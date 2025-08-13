const ModuleFederationPlugin = require('webpack').container.ModuleFederationPlugin;
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const isStandalone = process.env.STANDALONE === 'true' || process.env.STANDALONE === '1';
  const entryFile = isProduction ? './src/bootstrap.tsx' : './src/main-simple.tsx';
  
  return {
    entry: entryFile,
    output: {
      publicPath: 'auto',
    },
    mode: argv.mode || 'development',
    
    devServer: {
      port: process.env.PORT ? Number(process.env.PORT) : 3002,
      host: '0.0.0.0',
      hot: true,
      historyApiFallback: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
      },
      static: {
        directory: path.join(__dirname, 'public'),
      },
    },
    
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
      symlinks: false,
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@pages': path.resolve(__dirname, 'src/pages'),
        '@hooks': path.resolve(__dirname, 'src/hooks'),
        '@services': path.resolve(__dirname, 'src/services'),
        '@types': path.resolve(__dirname, 'src/types'),
        '@utils': path.resolve(__dirname, 'src/utils'),
        '@store': path.resolve(__dirname, 'src/store'),
        '@assets': path.resolve(__dirname, 'src/assets'),
        // Force a single React/ReactDOM instance even with linked local packages
        react: path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
        // Note: do not alias 'react/jsx-runtime' to avoid MF eager-consumption issues
      },
    },
    
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          include: [path.resolve(__dirname, 'src')],
          use: [
            {
              loader: 'ts-loader',
              options: {
                configFile: 'tsconfig.json',
                transpileOnly: true,
                compilerOptions: { noEmit: false }
              },
            },
          ],
        },
        // Restrict JS transpilation to project source only to avoid processing built sibling packages
        {
          test: /\.(js|jsx)$/,
          include: [path.resolve(__dirname, 'src')],
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: 'defaults' }],
                ['@babel/preset-react', { runtime: 'automatic' }],
              ],
            },
          },
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg|ico)$/,
          type: 'asset/resource',
        },
        {
          test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/,
          type: 'asset/resource',
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/,
          type: 'asset/resource',
        },
      ],
    },
    
    plugins: [
      new ModuleFederationPlugin({
        name: 'checks',
        filename: 'remoteEntry.js',
        exposes: {
          './Module': './src/bootstrap.tsx',
        },
        shared: isStandalone
          ? {}
          : {
              react: { singleton: true, eager: false, requiredVersion: false },
              'react-dom': { singleton: true, eager: false, requiredVersion: false },
              'react-router-dom': { singleton: true, requiredVersion: false },
              // Do not share 'react/jsx-runtime'; it is resolved via the shared 'react' package
              '@mui/material': { singleton: true, requiredVersion: '^5.15.0' },
              '@emotion/react': { singleton: true, requiredVersion: '^11.11.0' },
              '@emotion/styled': { singleton: true, requiredVersion: '^11.11.0' },
              '@put/core-components': { singleton: true, eager: false, requiredVersion: false },
            },
      }),
      new HtmlWebpackPlugin({
        template: './public/index.html',
        filename: 'index.html',
      }),
    ],
    
    optimization: isProduction
      ? {
          splitChunks: {
            chunks: 'all',
            cacheGroups: {
              vendor: {
                test: /[\\/]node_modules[\\/]/,
                name: 'vendors',
                chunks: 'all',
              },
            },
          },
        }
      : {},
  };
};


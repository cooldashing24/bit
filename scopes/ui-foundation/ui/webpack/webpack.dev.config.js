const HtmlWebpackPlugin = require('html-webpack-plugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const errorOverlayMiddleware = require('react-dev-utils/errorOverlayMiddleware');
const evalSourceMapMiddleware = require('react-dev-utils/evalSourceMapMiddleware');
const noopServiceWorkerMiddleware = require('react-dev-utils/noopServiceWorkerMiddleware');
const redirectServedPath = require('react-dev-utils/redirectServedPathMiddleware');
const getPublicUrlOrPath = require('react-dev-utils/getPublicUrlOrPath');
const path = require('path');
const { default: html } = require('./html');

/*
 * Webpack config for the bit ui
 * i.e. `bit start --dev`,
 */

const sockHost = process.env.WDS_SOCKET_HOST;
const sockPath = process.env.WDS_SOCKET_PATH; // default is '/sockjs-node';
const sockPort = process.env.WDS_SOCKET_PORT;

const publicUrlOrPath = getPublicUrlOrPath(process.env.NODE_ENV === 'development', '/', '/public');

const moduleFileExtensions = [
  'web.mjs',
  'mjs',
  'web.js',
  'js',
  'web.ts',
  'ts',
  'web.tsx',
  'tsx',
  'json',
  'web.jsx',
  'jsx',
];

module.exports = {
  createWebpackConfig,
  devConfig: createWebpackConfig,
};

function createWebpackConfig(workspaceDir, entryFiles, title, aspectPaths) {
  const resolveWorkspacePath = (relativePath) => path.resolve(workspaceDir, relativePath);

  // Host
  const host = process.env.HOST || 'localhost';

  // Required for babel-preset-react-app
  process.env.NODE_ENV = 'development';

  return {
    // Environment mode
    mode: 'development',

    devtool: 'inline-source-map',

    // Entry point of app
    entry: {
      main: entryFiles,
      // preview: entryFiles.map(filePath => resolveWorkspacePath(filePath))
    },

    output: {
      // Development filename output
      filename: 'static/js/[name].bundle.js',

      pathinfo: true,

      path: resolveWorkspacePath('/'),

      publicPath: publicUrlOrPath,

      futureEmitAssets: true,

      chunkFilename: 'static/js/[name].chunk.js',

      // point sourcemap entries to original disk locations (format as URL on windows)
      devtoolModuleFilenameTemplate: (info) => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/'),

      // this defaults to 'window', but by setting it to 'this' then
      // module chunks which are built will work in web workers as well.
      globalObject: 'this',
    },

    devServer: {
      // Serve index.html as the base
      contentBase: resolveWorkspacePath(publicUrlOrPath),

      // By default files from `contentBase` will not trigger a page reload.
      watchContentBase: true,

      contentBasePublicPath: publicUrlOrPath,

      // Enable compression
      compress: true,

      // Use 'ws' instead of 'sockjs-node' on server since we're using native
      // websockets in `webpackHotDevClient`.
      transportMode: 'ws',

      // Enable hot reloading
      hot: true,

      host,

      historyApiFallback: {
        disableDotRule: true,
        index: publicUrlOrPath,
      },

      sockHost,
      sockPath,
      sockPort,

      before(app, server) {
        // Keep `evalSourceMapMiddleware` and `errorOverlayMiddleware`
        // middlewares before `redirectServedPath` otherwise will not have any effect
        // This lets us fetch source contents from webpack for the error overlay
        app.use(evalSourceMapMiddleware(server));
        // This lets us open files from the runtime error overlay.
        app.use(errorOverlayMiddleware());
      },

      after(app) {
        // Redirect to `PUBLIC_URL` or `homepage` from `package.json` if url not match
        app.use(redirectServedPath(publicUrlOrPath));

        // This service worker file is effectively a 'no-op' that will reset any
        // previous service worker registered for the same host:port combination.
        // We do this in development to avoid hitting the production cache if
        // it used the same host and port.
        // https://github.com/facebook/create-react-app/issues/2272#issuecomment-302832432
        app.use(noopServiceWorkerMiddleware(publicUrlOrPath));
      },

      // Public path is root of content base
      publicPath: publicUrlOrPath.slice(0, -1),

      // stats: {
      //   // - for webpack-dev-server, this property needs to be in the devServer configuration object.
      //   // - webpack 5 will replace `stats.warningFilter` with `ignoreWarnings`.
      //   warningsFilter: [/Failed to parse source map/],
      // },
    },

    resolve: {
      // These are the reasonable defaults supported by the Node ecosystem.
      // We also include JSX as a common component filename extension to support
      // some tools, although we do not recommend using it, see:
      // https://github.com/facebook/create-react-app/issues/290
      // `web` extension prefixes have been added for better support
      // for React Native Web.
      extensions: moduleFileExtensions.map((ext) => `.${ext}`),
      alias: {
        react: require.resolve('react'),
        'react-dom/server': require.resolve('react-dom/server'),
        'react-dom': require.resolve('react-dom'),
        // 'react-refresh/runtime': require.resolve('react-refresh/runtime'),
      },
    },

    node: {
      fs: 'empty',
    },

    module: {
      rules: [
        // {
        //   test: /\.js$/,
        //   enforce: 'pre',
        //   include: /node_modules/,
        //   use: [require.resolve('source-map-loader')],
        // },
        {
          test: /\.(js|jsx|tsx|ts)$/,
          exclude: /node_modules/,
          include: workspaceDir,
          loader: require.resolve('babel-loader'),
          options: {
            configFile: false,
            babelrc: false,
            presets: [
              // Preset includes JSX, TypeScript, and some ESnext features
              require.resolve('babel-preset-react-app'),
            ],
            plugins: [require.resolve('react-refresh/babel')],
          },
        },
        {
          test: /\.module\.s(a|c)ss$/,
          loader: [
            require.resolve('style-loader'),
            {
              loader: require.resolve('css-loader'),
              options: {
                modules: {
                  localIdentName: '[name]__[local]--[hash:base64:5]',
                },
                sourceMap: true,
              },
            },
            {
              loader: require.resolve('sass-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
        },
        {
          test: /\.s(a|c)ss$/,
          exclude: /\.module.(s(a|c)ss)$/,
          loader: [
            require.resolve('style-loader'),
            require.resolve('css-loader'),
            {
              loader: require.resolve('sass-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
        },
        {
          test: /\.module\.less$/,
          loader: [
            require.resolve('style-loader'),
            {
              loader: require.resolve('css-loader'),
              options: {
                modules: {
                  localIdentName: '[name]__[local]--[hash:base64:5]',
                },
                sourceMap: true,
              },
            },
            {
              loader: require.resolve('less-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
        },
        {
          test: /\.less$/,
          exclude: /\.module\.less$/,
          loader: [
            require.resolve('style-loader'),
            require.resolve('css-loader'),
            {
              loader: require.resolve('less-loader'),
              options: {
                sourceMap: true,
              },
            },
          ],
        },
        {
          test: /\.css$/,
          exclude: /\.(s(a|c)ss)$/,
          loader: [require.resolve('style-loader'), require.resolve('css-loader')],
        },
      ],
    },

    plugins: [
      new ReactRefreshWebpackPlugin({
        // exclude: /@pmmmwh/, // replaces the default value of `/node_modules/`
        include: aspectPaths,
      }),
      // Re-generate index.html with injected script tag.
      // The injected script tag contains a src value of the
      // filename output defined above.
      new HtmlWebpackPlugin({
        inject: true,
        templateContent: html(title || 'My component workspace'),
        chunks: ['main'],
        filename: 'index.html',
      }),
      // new HtmlWebpackPlugin({
      //   templateContent: html('Component preview'),
      //   chunks: ['preview'],
      //   filename: 'preview.html'
      // })
    ],
  };
}

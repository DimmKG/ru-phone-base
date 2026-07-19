const path = require('node:path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/main.js',
  target: 'web',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'public/index.html', to: 'index.html' },
        { from: 'public/data', to: 'data' },
      ],
    }),
  ],
};

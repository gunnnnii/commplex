require('@babel/register')({
  extensions: ['.js', '.jsx', '.ts', '.tsx'],
  presets: [
    ['@babel/preset-react', { runtime: 'automatic' }],
    ['@babel/preset-typescript', { isTSX: true, allExtensions: true }]
  ],
  plugins: [
    ['@babel/plugin-proposal-decorators', { version: '2023-11' }]
  ],
  // Ignore node_modules except for specific packages that need transpilation
  ignore: [
    /node_modules\/(?!(ink|yoga-layout))/
  ]
});

// Polyfill for global in test environment
if (typeof global.sleep === 'undefined') {
  global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Unit tests for pure TypeScript modules (src/imaging, migrations) in Node.
 * Skia tests run the real @shopify/react-native-skia JS API on its headless
 * CanvasKit (WASM, CPU) build – same SkSL compiler, no device needed.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.(t|j)sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },
  transformIgnorePatterns: ['/node_modules/(?!pdf-lib)'],
  testTimeout: 300000,
};

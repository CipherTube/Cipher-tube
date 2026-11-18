module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/optimus.test.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { target: 'ES2022', module: 'commonjs', moduleResolution: 'node', esModuleInterop: true, strict: true, skipLibCheck: true, types: ['jest', 'node'] }, diagnostics: true }] },
};

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: 'tsconfig.spec.json',
    }],
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.interface.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.config.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/**/*.mock.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json',
  ],
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 35,
      lines: 35,
      statements: 35
    },
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/test/'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/test/database/',
    'e2e-spec.ts',
    'error_consistency.spec.ts',
    'api-keys.pagination.spec.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testTimeout: 30000,
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
  maxWorkers: '50%',
};

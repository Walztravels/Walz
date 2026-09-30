import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        // Relax some checks for test environment
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        // Compile JSX so tests can import page/layout modules (metadata tests)
        jsx: 'react-jsx',
      },
    }],
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  // Don't transform node_modules except none needed here
  transformIgnorePatterns: ['/node_modules/'],
  // postgres-concurrency.test.ts requires a real PostgreSQL connection (row
  // locking can't be meaningfully mocked) and is intentionally excluded from
  // the default Jest run. It runs only via jest.postgres-concurrency.config.js,
  // driven by .github/workflows/jade-postgres-concurrency-gate.yml against a
  // real `postgres:16` service container — see that file's header comment.
  testPathIgnorePatterns: ['/node_modules/', 'postgres-concurrency\\.test\\.ts$'],
}

export default config

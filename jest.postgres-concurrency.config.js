// jest.postgres-concurrency.config.js
//
// Dedicated Jest config for lib/jade-club/__tests__/postgres-concurrency.test.ts
// ONLY. This test exercises the real Jade Club activation code path
// (lib/jade-club/entitlements.ts::activateMembershipTerms, including its
// genuine `SELECT ... FOR UPDATE` row lock) against a REAL PostgreSQL
// database — it is a database integration test, not a unit test, and must
// never run against a mocked Prisma client or as part of the normal `npx
// jest` sweep (see jest.config.ts's testPathIgnorePatterns).
//
// Invoked only by .github/workflows/jade-postgres-concurrency-gate.yml,
// which provides a real `postgres:16` service container and a DATABASE_URL
// pointing at it. Do NOT run this config against any database you care
// about — it creates and deletes real rows (in isolated, uniquely-keyed
// fixture data, cleaned up in afterAll, but still real writes).
//
// TEST INFRASTRUCTURE ONLY — see prisma/schema.prisma / lib/jade-club/**
// for the actual product code, which this config does not modify.

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },
  testMatch: ['**/__tests__/postgres-concurrency.test.ts'],
  transformIgnorePatterns: ['/node_modules/'],
  // Real DB round-trips + deliberate lock contention are slower than mocked
  // unit tests; give each concurrency scenario room to settle.
  testTimeout: 30000,
}

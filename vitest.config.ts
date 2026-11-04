import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
	plugins: [tsconfigPaths() as any],
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./tests/setup.ts'],
		include: ['./tests/**/*.{test,spec}.{ts,tsx}', './app/**/*.{test,spec}.{ts,tsx}'],
		exclude: ['./tests/e2e/**', '**/node_modules/**'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			reportsDirectory: './tests/coverage',
			include: ['app/**/*.{ts,tsx}'],
			exclude: ['app/**/*.d.ts', 'app/entry.*.tsx', 'app/root.tsx'],
		},
		testTimeout: 10000,
	},
})

import { defineConfig } from 'vitest/config'

import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
    plugins: [
        tsConfigPaths(),
    ],
    test: {
        include: [
            'test/**/*.{js,ts}',
        ],
        exclude: [
            '**/*.d.ts',
            '**/_*',
            '**/_*/**',
        ],
        watch: false,
        globals: true,
        environment: 'node',
        setupFiles: [
            'vitest.setup.js',
        ],
        deps: {
            external: [],
        },
    },
})

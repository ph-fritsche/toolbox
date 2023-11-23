// Build the loader to run tests on toolbox itself.

import module from 'node:module'
import {rollup} from 'rollup'
import ts from 'typescript'
import { transform } from '@swc/core'

await rollup({
    input: [
        'src/node/loader-src.ts',
    ],
    plugins: [
        {
            resolveId(source, importer) {
                if (module.isBuiltin(source)) {
                    return {
                        id: source,
                        external: true,
                    }
                }

                if (!/\.ts$/.test(importer)) {
                    return
                }

                try {
                    const {resolvedModule} = ts.resolveModuleName(
                        source,
                        importer,
                        {
                            esModuleInterop: true,
                        },
                        ts.sys,
                    )
                    if (resolvedModule) {
                        if (resolvedModule.resolvedFileName.includes('/node_modules/')) {
                            return {
                                id: source,
                                external: true,
                            }
                        }

                        return resolvedModule.resolvedFileName
                    }
                } catch(e) {
                    console.log(`ERROR WHEN RESOLVING "${source}":\n${String(e)}\n`)
                }
            },
            async transform(code, id) {
                if (!/.ts$/.test(id)) {
                    return
                }

                const result = await transform(code, {
                    filename: id,
                    jsc: {
                        target: 'es2022',
                        parser: { syntax: 'typescript' },
                    },
                    sourceMaps: true,
                })
                return {
                    code: result.code,
                    map: result.map,
                }
            },
        },
    ],
}).then(build => build.write({
    file: 'build/loader-src.js',
    sourcemap: 'inline',
}))

import { CompilerOptions } from 'typescript'
import { Plugin } from 'rollup'
import { transform as swcTransform, Options as swcOptions } from '@swc/core'

export function createTransformPlugin(
    tsCompilerOptions: CompilerOptions,
    name = 'script-transformer',
): Plugin {
    return {
        name,
        async transform(code, id) {
            if (!/\.[jt]sx?(\?.*)?$/.test(id)
            // || id.includes('/node_modules/')
            ) {
                return undefined
            }
            if (id.endsWith('.d.ts')) {
                return ''
            }

            const options: swcOptions = {
                sourceFileName: id,
                jsc: {
                    externalHelpers: false,
                    parser: {
                        syntax: /\.tsx?$/.test(id) ? 'typescript' : 'ecmascript',
                        jsx: id.endsWith('x'),
                        tsx: id.endsWith('x'),
                    },
                    target: 'es2019',
                    transform: {
                        react: {
                            pragma: tsCompilerOptions.jsxFactory,
                            pragmaFrag: tsCompilerOptions.jsxFragmentFactory,
                        },
                    },
                    // Rollup produces invalid import paths that can't be resolved with this.
                    // baseUrl: tsBaseUrl + '/',
                    // paths: tsCompilerOptions.paths as Record<string, [string]>,
                },
                sourceMaps: true,
            }

            return swcTransform(code, options)
        },
    }
}

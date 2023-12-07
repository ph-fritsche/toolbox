import { Plugin } from 'rollup'
import { JscTarget, ParseOptions, transform } from '@swc/core'

export function createTransformPlugin(
    {
        cwd = process.cwd(),
        coverageVariable: getCoverageVar,
    }: {
        cwd?: string,
        coverageVariable?: (subPath: string) => string|undefined,
    },
    name = 'script-transformer',
): Plugin {
    return {
        name,
        async transform(source, id) {
            if (!/\.[jt]sx?(\?.*)?$/.test(id)
            // || id.includes('/node_modules/')
            ) {
                return undefined
            }
            if (id.endsWith('.d.ts')) {
                return ''
            }

            const [path] = id.split(/\?#/, 1)
            const subPath = path.startsWith(cwd + '/') ? path.substring(cwd.length + 1) : undefined

            const coverageVariable = subPath && getCoverageVar?.(subPath)

            const target: JscTarget = 'es2022'

            const isTs = /\.tsx?/.test(path)
            const parseOptions: ParseOptions = isTs
                ? {
                    syntax: 'typescript',
                    tsx: path.endsWith('x'),
                    target,
                }
                : {
                    syntax: 'ecmascript',
                    jsx: path.endsWith('x'),
                    target,
                }

            const { code, map } = await transform(source, {
                filename: path,
                sourceFileName: path,
                module: {
                    type: 'es6',
                    ignoreDynamic: true,
                },
                jsc: {
                    target: 'es2022',
                    parser: parseOptions,
                    preserveAllComments: true,
                    experimental: {
                        plugins: coverageVariable
                            ? [
                                ['swc-plugin-coverage-instrument', {
                                    coverageVariable,
                                }],
                            ]
                            : [],
                    },
                },
                sourceMaps: true,
            })

            return {
                code,
                map,
            }
        },
    }
}

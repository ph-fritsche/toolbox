import path from 'path'
import createCjsPlugin from '@rollup/plugin-commonjs'
import createJsonPlugin from '@rollup/plugin-json'
import { parseTsConfig } from './tsconfig'
import { createTsResolvePlugin, createNodeResolvePlugin, nodeJsModulePrefix } from './resolve'
import { createTransformPlugin } from './transform'

export { Builder, IifeBuilder } from './Builder'
export { BuildProvider } from './BuildProvider'

export function createRollupPlugins(
    tsConfigFile: string,
    externalNodeJs = true,
) {
    const { compilerOptions } = parseTsConfig(tsConfigFile)

    return [
        createCjsPlugin({
            include: '**/node_modules/**',
        }),
        createJsonPlugin(),
        createTsResolvePlugin(compilerOptions),
        createNodeResolvePlugin(externalNodeJs ? nodeJsModulePrefix : `${path.resolve('testenv-nodejs/')}/`),
        createTransformPlugin(compilerOptions),
    ]
}
export { nodeJsModulePrefix }

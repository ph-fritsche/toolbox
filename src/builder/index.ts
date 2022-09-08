import { Plugin } from 'rollup'
import createCjsPlugin from '@rollup/plugin-commonjs'
import createJsonPlugin from '@rollup/plugin-json'
import { parseTsConfig } from './tsconfig'
import { createTsResolvePlugin, createNodeResolvePlugin, NodeModuleIdRewrite } from './resolve'
import { createTransformPlugin } from './transform'
import { createIstanbulPlugin } from './instrument'

export { Builder, IifeBuilder } from './Builder'
export type { OutputFilesMap } from './Builder'
export { BuildProvider } from './BuildProvider'

export function createRollupPlugins(
    resolve: (id: string) => string,
    tsConfigFile: string,
    rewriteNodeModuleIds?: NodeModuleIdRewrite,
): Plugin[] {
    const { compilerOptions } = parseTsConfig(tsConfigFile)

    return [
        createCjsPlugin({
            include: '**/node_modules/**',
        }),
        createJsonPlugin(),
        createTsResolvePlugin(compilerOptions),
        createNodeResolvePlugin(resolve, rewriteNodeModuleIds),
        createTransformPlugin(compilerOptions),
        createIstanbulPlugin(),
    ]
}

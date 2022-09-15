import { Plugin } from 'rollup'
import createCjsPlugin from '@rollup/plugin-commonjs'
import createJsonPlugin from '@rollup/plugin-json'
import { parseTsConfig } from './tsconfig'
import { createTsResolvePlugin, createNodeResolvePlugin } from './resolve'
import { createTransformPlugin } from './transform'
import { createIstanbulPlugin } from './instrument'
import { createUndefinedPlugin } from './undefined'
import { createNodeCorePlugin, NodeCorePluginOptions } from './node'

export { Builder, IifeBuilder } from './Builder'
export type { OutputFilesMap } from './Builder'
export { BuildProvider } from './BuildProvider'

export interface RollupPluginFactoryOptions extends NodeCorePluginOptions {
    tsConfigFile: string,
}

export function createRollupPlugins({
    tsConfigFile,
    additionalPolyfills,
    externalPolyfills,
    overridePolyfills,
}: RollupPluginFactoryOptions): Plugin[] {
    const { compilerOptions } = parseTsConfig(tsConfigFile)

    return [
        createCjsPlugin({
            include: '**/node_modules/**',
            requireReturnsDefault: 'preferred',
        }),
        createJsonPlugin(),
        createNodeCorePlugin({additionalPolyfills, externalPolyfills, overridePolyfills}),
        createTsResolvePlugin(compilerOptions),
        createNodeResolvePlugin(),
        createUndefinedPlugin(),
        createTransformPlugin(compilerOptions),
        createIstanbulPlugin(),
    ]
}

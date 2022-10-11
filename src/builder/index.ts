import createCjsPlugin from '@rollup/plugin-commonjs'
import { parseTsConfig } from './tsconfig'
import { createTsResolvePlugin, createNodeResolvePlugin } from './plugins/resolve'
import { createTransformPlugin } from './plugins/transform'
import { createIstanbulPlugin } from './plugins/instrument'
import { createNodeCoreEntryFileNames, createNodeCorePaths, createNodePolyfillPlugin, createNodeReexportPlugin } from './plugins/node'
import { Builder } from './Builder'
import { isNodeJsBuiltin } from './module'
import { createUndefinedPlugin } from './plugins/undefined'
import { createCachePlugin, CachePluginOptions } from './plugins/cache'
import { createJsonPlugin } from './plugins/json'

export { Builder } from './Builder'
export type { OutputFilesMap } from './Builder'
export { BuildProvider } from './BuildProvider'

export function createSourceBuilder(
    {
        tsConfigFile,
    }: {
        tsConfigFile: string
    },
    id = 'project',
) {
    const { compilerOptions } = parseTsConfig(tsConfigFile)

    return new Builder({
        id,
        plugins: [
            createTsResolvePlugin(compilerOptions),
            createNodeResolvePlugin(),
            createJsonPlugin(),
            createTransformPlugin(compilerOptions),
            createIstanbulPlugin(),
        ],
        paths: createNodeCorePaths(),
    })
}

export function createDependencyBuilder(
    {
        cache,
    }: {
        cache?: CachePluginOptions
    } = {},
    id = 'dependencies',
) {
    return new Builder({
        id,
        plugins: [
            createCachePlugin(cache),
            createCjsPlugin({
                include: '**/node_modules/**',
                requireReturnsDefault: 'preferred',
            }),
            createJsonPlugin(),
            createNodeResolvePlugin(),
            createUndefinedPlugin(),
        ],
        isExternal: (source, importer, isResolved) => isResolved && isNodeJsBuiltin(source),
        outputOptions: {
            preserveModules: false,
        },
        paths: createNodeCorePaths(),
    })
}

export function createNodeReexportBuilder(
    {
    }: {} = {},
    id = 'nodeReexport',
) {
    return new Builder({
        id,
        plugins: [
            createNodeReexportPlugin(),
            createNodeResolvePlugin(),
        ],
        isExternal: () => false,
        outputOptions: {
            preserveModules: false,
            entryFileNames: createNodeCoreEntryFileNames(),
        },
    })
}

export function createNodePolyfillBuilder(
    {
    }: {} = {},
    id = 'nodePolyfill',
) {
    return new Builder({
        id,
        plugins: [
            createNodePolyfillPlugin(),
            createNodeResolvePlugin(),
        ],
        isExternal: () => false,
        outputOptions: {
            preserveModules: false,
            entryFileNames: createNodeCoreEntryFileNames(),
        },
    })
}

export function connectDependencyBuilder(
    dependant: Builder,
    dependency: Builder,
) {
    dependant.emitter.addListener('externals', ({externals}) => {
        let build = false
        externals.forEach(f => {
            if (!dependency.inputFiles.has(f)) {
                dependency.inputFiles.set(f, undefined)
                build = true
            }
        })
        if (build) {
            dependency.debounceBuild()
        }
    })
}

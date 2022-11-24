import { OutputOptions } from 'rollup'
import createCjsPlugin from '@rollup/plugin-commonjs'
import createNodeBuiltinsPlugin from 'rollup-plugin-node-builtins'
import { parseTsConfig } from './tsconfig'
import { createTsResolvePlugin, createNodeResolvePlugin, createNodeCoreResolvePlugin } from './plugins/resolve'
import { createTransformPlugin } from './plugins/transform'
import { createIstanbulPlugin } from './plugins/instrument'
import { createNodeCoreEntryFileNames, createNodeCorePaths, createNodePolyfillPlugin, createNodeReexportPlugin } from './plugins/node'
import { Builder } from './Builder'
import { isNodeJsBuiltin } from './module'
import { createUndefinedPlugin } from './plugins/undefined'
import { createCachePlugin, CachePluginOptions } from './plugins/cache'
import { createJsonPlugin } from './plugins/json'
import { createGlobalsPlugin } from './plugins/globals'

export { Builder } from './Builder'
export type { OutputFilesMap } from './Builder'
export { BuildProvider } from './BuildProvider'

export function createSourceBuilder(
    {
        tsConfigFile,
        globals,
    }: {
        tsConfigFile: string
        globals?: OutputOptions['globals']
    },
    id = 'project',
) {
    const { compilerOptions } = parseTsConfig(tsConfigFile)

    return new Builder({
        id,
        plugins: [
            createTsResolvePlugin(compilerOptions),
            createNodeResolvePlugin(),
            createNodeCoreResolvePlugin(),
            createJsonPlugin(),
            createTransformPlugin(compilerOptions),
            createGlobalsPlugin({globals}),
            createIstanbulPlugin(),
        ],
        paths: createNodeCorePaths(),
        outputOptions: {
            globals,
        }
    })
}

export function createDependencyBuilder(
    {
        cache,
        globals,
    }: {
        cache?: CachePluginOptions
        globals?: OutputOptions['globals']
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
            createNodeCoreResolvePlugin(),
            createGlobalsPlugin({globals}),
            createUndefinedPlugin(),
        ],
        isExternal: (source, importer, isResolved) =>
            globals && source in globals
            || isResolved && isNodeJsBuiltin(source),
        outputOptions: {
            preserveModules: false,
            globals,
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
    dependant.emitter.addListener('externals', ({imports}) => {
        let build = false
        imports.forEach(f => {
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

export function createBundleBuilder(
    {
        basePath,
        globals,
    }: {
        basePath?: string
        globals?: OutputOptions['globals']
    } = {},
    id = 'bundle',
) {
    return new Builder({
        id,
        plugins: [
            createCjsPlugin({
                include: '**/node_modules/**',
                requireReturnsDefault: 'preferred',
            }),
            createJsonPlugin(),
            createNodeBuiltinsPlugin(),
            createNodeResolvePlugin(),
            createUndefinedPlugin(),
        ],
        basePath,
        isExternal: (source) => Boolean(globals && source in globals),
        outputOptions: {
            preserveModules: false,
            format: 'iife',
            globals,
        },
    })
}

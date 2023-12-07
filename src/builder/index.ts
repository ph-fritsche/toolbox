import fsSync from 'node:fs'
import os from 'node:os'
import { OutputOptions } from 'rollup'
import createCjsPlugin from '@rollup/plugin-commonjs'
import createNodeBuiltinsPlugin from 'rollup-plugin-node-builtins'
import { createTsResolvePlugin, createNodeResolvePlugin, createNodeCoreResolvePlugin } from './plugins/resolve'
import { createTransformPlugin } from './plugins/transform'
import { createNodeCoreEntryFileNames, createNodeCorePaths, createNodePolyfillPlugin, createNodeReexportPlugin } from './plugins/node'
import { Builder } from './Builder'
import { isBuiltin } from 'node:module'
import { createUndefinedPlugin } from './plugins/undefined'
import { createCachePlugin, CachePluginOptions } from './plugins/cache'
import { createJsonPlugin } from './plugins/json'
import { createGlobalsPlugin } from './plugins/globals'
import { CachedFilesystem, SyncFilesystem } from '../files'
import { TsConfigResolver, TsModuleResolver } from '../ts'

export { Builder } from './Builder'
export type { OutputFilesMap } from './Builder'
export { BuildProvider } from './BuildProvider'

export function createSourceBuilder(
    {
        coverageVariable = '__coverage__',
        instrument = s => !/(^|\/)node_modules\//.test(s),
        globals,
        fs = new CachedFilesystem({
            caseSensitive: os.platform() !== 'win32',
            existsSync: fsSync.existsSync,
            readFileSync: fsSync.readFileSync,
            realpathSync: fsSync.realpathSync,
        }),
        tsConfigResolver = new TsConfigResolver(fs),
        tsModuleResolver = new TsModuleResolver(fs),
    }: {
        coverageVariable?: string
        instrument?: (subPath: string) => boolean,
        globals?: OutputOptions['globals'],
        fs?: SyncFilesystem,
        tsConfigResolver?: TsConfigResolver,
        tsModuleResolver?: TsModuleResolver,
    },
    id = 'project',
) {
    return new Builder({
        id,
        plugins: [
            createTsResolvePlugin(tsConfigResolver, tsModuleResolver),
            createNodeResolvePlugin(),
            createNodeCoreResolvePlugin(),
            createJsonPlugin(),
            createTransformPlugin({
                coverageVariable: s => instrument(s) ? coverageVariable : undefined,
            }),
            createGlobalsPlugin({globals}),
        ],
        paths: createNodeCorePaths(),
        outputOptions: {
            globals,
        },
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
            || isResolved && isBuiltin(source),
        outputOptions: {
            preserveModules: false,
            globals,
        },
        paths: createNodeCorePaths(),
    })
}

export function createNodeReexportBuilder(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options: object = {},
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options: object = {},
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

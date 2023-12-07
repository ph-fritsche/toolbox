import path from 'path'
import { Builder, BuildProvider, connectDependencyBuilder, createDependencyBuilder, createNodePolyfillBuilder, createSourceBuilder } from './builder'
import { FileServer, HttpFileServer } from './server'
import { AsyncFilesystem, CachedFilesystem, FileLoader, FileProvider, FsFileProvider, FsWatcher, realFilesystem, SyncFilesystem } from './files'
import { TestConductor } from './conductor/TestConductor'
import { TestRunManager } from './conductor/TestRunManager'
import { TsConfigResolver, TsModuleResolver } from './ts'
import { ModuleLoader } from './loader/ModuleLoader'
import { ImportResolverStack, constrainResolver, createNodeBuiltinResolver, createNodeImportResolver, createToRelativeResolver, createTsResolver, ImportResolverCallback } from './loader/ImportResolver'
import { createTestRun, TestFile, TestRunStack, TestSuite } from './conductor/TestRun'
import { TestRunIterator } from './conductor/TestRunIterator'
import { Trigger } from './util/Trigger'
import { ConsoleReporter } from './reporter/ConsoleReporter'

export type { TestContext } from './runner/TestContext'

export async function serveDir(dir: string) {
    const provider = new FsFileProvider(dir)
    const server = new HttpFileServer(provider)

    return {
        provider,
        server,
        url: await server.url,
    }
}

export async function serveToolboxRunner() {
    const dir = path.dirname((new URL(import.meta.url)).pathname)
    const s = await serveDir(dir)
    return {
        ...s,
        url: `${String(s.url)}runner/index.js`,
    }
}

export function createProjectBuildProvider(
    watchedFiles: string[],
    {
        globals,
        sourceBuilderFactory = () => createSourceBuilder({globals}),
        dependencyBuilderFactory = (source) => {
            const b = createDependencyBuilder({globals})
            connectDependencyBuilder(source, b)
            return b
        },
        nodeCoreBuilderFactory = (dependencies) => {
            const b = createNodePolyfillBuilder()
            connectDependencyBuilder(dependencies, b)
            return b
        },
        fileProviderFactory = () => new FileProvider(),
        fileServerFactory = (provider) => new HttpFileServer(provider),
    }: {
        globals?: Record<string, string>,
        sourceBuilderFactory?: () => Builder,
        dependencyBuilderFactory?: (source: Builder) => Builder,
        nodeCoreBuilderFactory?: (dependencies: Builder, source: Builder) => Builder,
        fileProviderFactory?: () => FileProvider,
        fileServerFactory?: (provider: FileProvider) => FileServer,
    },
) {
    const sourceBuilder = sourceBuilderFactory()
    const dependencyBuilder = dependencyBuilderFactory(sourceBuilder)
    const nodeCoreBuilder = nodeCoreBuilderFactory(dependencyBuilder, sourceBuilder)

    const buildProvider = new BuildProvider(watchedFiles)
    buildProvider.connect(sourceBuilder, watchedFiles)
    buildProvider.connect(dependencyBuilder, [])
    buildProvider.connect(nodeCoreBuilder, [])

    const fileProvider = fileProviderFactory()
    const fileServer = fileServerFactory(fileProvider)

    buildProvider.emitter.addListener('done', ({pending}) => {
        if (pending) {
            return
        }

        for (const b of [sourceBuilder, dependencyBuilder, nodeCoreBuilder]) {
            for (const [f, v] of b.outputFiles.entries()) {
                fileProvider.files.set(f, Promise.resolve(v))
            }
        }
    })

    return {
        buildProvider,
        fileProvider,
        fileServer,
        onBuildDone: (callback: () => Promise<void>) => {
            buildProvider.emitter.addListener('done', ({pending}) => {
                if (pending) {
                    return
                }
                void callback()
            })
        },
    }
}

import path from 'path'
import IstanbulLibCoverage from 'istanbul-lib-coverage'
import { Builder, BuildProvider, connectDependencyBuilder, createDependencyBuilder, createNodePolyfillBuilder, createSourceBuilder } from './builder'
import { FileServer, HttpFileServer } from './server'
import { AsyncFilesystem, CachedFilesystem, FileLoader, FileProvider, FsWatcher, realFilesystem, SyncFilesystem } from './files'
import { TestConductor } from './conductor/TestConductor'
import { TestRunManager } from './conductor/TestRunManager'
import { TsConfigResolver, TsModuleResolver } from './ts'
import { ModuleLoader, ModuleTransformer } from './loader/ModuleLoader'
import { ImportResolverStack, constrainResolverToImporter, createNodeBuiltinResolver, createNodeImportResolver, createToRelativeResolver, createTsResolver, ImportResolverCallback, createNodeRequireResolver, constrainResolverToResolved, ImportResolverResolvedConstrain } from './loader/ImportResolver'
import {TestFile, TestRunStack, TestSuite } from './conductor/TestRun'
import { TestRunIterator } from './conductor/TestRunIterator'
import { Trigger } from './util/Trigger'
import { PackageConfigResolver } from './loader/PackageConfigResolver'
import { CjsTransformer } from './loader/CjsTransformer'
import { ConsoleReporter } from './reporter/ConsoleReporter'
import { FsLoader } from './loader/FsLoader'
import { NodeTestConductor } from './conductor/NodeTestConductor'
import { ChromeTestConductor } from './conductor/ChromeTestConductor'
import { fileURLToPath } from 'url'

export type { TestContext } from './runner/TestContext'

export async function serveDir(dir: string) {
    const provider = new FileProvider([
        new FsLoader(dir),
    ])
    const server = new HttpFileServer(provider)

    return {
        provider,
        server,
        url: await server.url,
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

const defaults = {
    isModuleFile: (p: string) => (
        /(?<!\.d)\.[tj]sx?$/.test(p)
    ),
    isInTestDir: (p: string) => (
        (/^tests?\//.test(p) || /(^|\/)__tests__\//.test(p))
    ),
    isSpecFile: (p: string) => (
        /\.(test|spec)\./.test(p)
    ),
    isTestSuiteFile: (p: string) => (
        defaults.isModuleFile(p) && (
            defaults.isSpecFile(p)
            || (
                defaults.isInTestDir(p)
                && !/\/_\w/.test(p)
            )
        )
    ),
    isDependency: (p: string) => (
        /(^|\/)node_modules\//.test(p)
    ),
    instrument: (c = '__coverage__', p: string) => (
        defaults.isDependency(p) || defaults.isInTestDir(p) || defaults.isSpecFile(p)
            ? undefined
            : c
    ),
    mapPathToTitle: (p: string) => (p
        .replace(/^tests?\//, '')
        .replace(/(^|\/)__tests__\//, '')
        .replace(/\.(test|spec)\./, '')
        .replace(/\.[tj]sx?$/, '')
    ),
    mapPathsToTestFiles: (
        fileServerUrl: URL,
        subPaths: Iterable<string>,
        isTestFile?: (p: string) => boolean,
        mapPathToTitle?: (p: string) => string,
    ) => {
        isTestFile ??= defaults.isTestSuiteFile
        mapPathToTitle ??= defaults.mapPathToTitle

        const testFiles = []
        for (const p of subPaths) {
            if (isTestFile(p)) {
                const url = new URL(fileServerUrl)
                url.pathname += (url.pathname.endsWith('/') ? '' : '/') + p

                testFiles.push({
                    url: String(url),
                    title: mapPathToTitle(p),
                })
            }
        }
        return testFiles
    },
}

export async function setupSourceModuleLoader({
    fs = realFilesystem,
    cachedFs = true,
    sourceRoot = process.cwd(),
    nodePolyfill,
    instrument = !!process.env.CI,
    additionalTransformers = [],
    cjsTransformer = true,
    filesImports,
    unresolvedModules,
}: {
    /**
     * The file system to be used by module loader and resolvers.
     *
     * Note that the native node resolvers used for dependencies
     * (or if the Typescript resolver fails to resolve the specifier)
     * always use the real file system.
     */
    fs?: SyncFilesystem & AsyncFilesystem
    /**
     * Cached file system to be used by Typescript resolver.
     */
    cachedFs?: boolean | SyncFilesystem
    /**
     * Directory to serve code from.
     *
     * Defaults to the current working directory.
     */
    sourceRoot?: string
    /**
     * Resolve imports of node built-ins to polyfills to make the code run in different environments.
     *
     * If defined, the resolver will throw an error for missing polyfills
     * which will result in the `ModuleLoader` to fail loading the importing module.
     */
    nodePolyfill?: Record<string, string>
    /**
     * Instrument modules to collect code coverage.
     *
     * Defaults to instrumenting modules which are considered to be
     * {@link defaults.instrument neither a dependency, a spec file, nor in a test directory}
     * when running in CI.
     *
     * If you provide a non-empty string, this will be used as coverage variable.
     * Defaults to `__coverage__`.
     *
     * If you provide a callback, you can decide on a per-file basis
     * if and with which coverage variable you want to instrument.
     */
    instrument?: string | boolean | ((subPath: string) => string|undefined)
    /**
     * Array of {@link ModuleTransformer} to manipulate the AST.
     */
    additionalTransformers?: Array<ModuleTransformer>
    /**
     * Include {@link CjsTransformer} which tries to convert CJS to ESM.
     *
     * Defaults to `true`
     */
    cjsTransformer?: boolean
    /**
     * Per default absolute file imports in the working dir are replaced with relative imports
     * which allows to serve the same file relationship through `ModuleLoader` over HTTP.
     *
     * This option excludes imports from that transformation
     * which will result in them being imported straight from the real filesystem.
     */
    filesImports?: RegExp[]|ImportResolverResolvedConstrain
    /**
     * How to handle import specifiers that could not be resolved.
     *
     * `throw` will result in the `ModuleLoader` to fail loading the importing module.
     *
     * `replace` replaces the module specifier with a `data:` import of an `undefined` default export.
     * This provides the best interop for modules which check for other dependencies per try/catch require.
     *
     * Defaults to issuing a console warning and replacing the module specifier.
     */
    unresolvedModules?: 'throw'|'replace'|((specifier: string, importerUrl: URL) => string|undefined)
} = {}) {
    const tsFs = typeof cachedFs === 'object' ? cachedFs
        : cachedFs === true ? new CachedFilesystem(fs)
            : fs
    const tsConfigResolver = new TsConfigResolver(tsFs)
    const tsModuleResolver = new TsModuleResolver(tsFs)

    const resolvers: ImportResolverCallback[] = [
        createNodeBuiltinResolver(nodePolyfill),
        constrainResolverToImporter(
            createTsResolver(tsConfigResolver, tsModuleResolver),
            {exclude: [/(^|\/)node_modules\//]},
        ),
        await createNodeImportResolver(),
        createNodeRequireResolver(),
        constrainResolverToResolved(
            createToRelativeResolver(),
            {exclude: filesImports},
        ),
        (resolved, specifier, importerURL) => resolved || (
            typeof unresolvedModules === 'function'
                ? unresolvedModules(specifier, importerURL)
                : (() => {
                    const msg = `Unresolved import "${specifier}" in ${String(importerURL)}`
                    if (unresolvedModules === 'throw') {
                        throw msg
                    } else if (unresolvedModules !== 'replace') {
                        console.warn(msg)
                    }
                    return `data:text/javascript,export default undefined;`
                })()
        ),
    ]

    const getCovVar = typeof instrument === 'function' ? instrument
        : instrument
            ? defaults.instrument.bind(undefined, typeof instrument === 'string' ? instrument : undefined)
            : () => undefined

    const transformers = [...additionalTransformers]
    if (cjsTransformer) {
        const packageResolver = new PackageConfigResolver(tsFs)
        transformers.unshift(new CjsTransformer(packageResolver))
    }

    return new ModuleLoader(
        fs.readFile,
        sourceRoot,
        new ImportResolverStack(resolvers),
        getCovVar,
        transformers,
    )
}

export function setupNodeConductor(
    title: string,
    setupFiles: URL[],
    coverageVar = '__coverage__',
) {
    return (runnerUrl: string) => new NodeTestConductor(runnerUrl, title, setupFiles, coverageVar)
}

export function setupChromeConductor(
    title: string,
    setupFiles: URL[],
    coverageVar = '__coverage__',
) {
    return (runnerUrl: string) => new ChromeTestConductor(runnerUrl, title, setupFiles, coverageVar)
}

export async function setupToolboxRunner() {
    const self = new URL(import.meta.url)
    if (self.protocol !== 'file:') {
        throw new Error(`Unsupported origin ${String(self)}`)
    }
    const provider = new FileProvider([new FsLoader(
        path.dirname(fileURLToPath(self)),
        new Map([
            ['.js', 'text/javascript'],
        ]),
    )])
    const server = new HttpFileServer(provider)

    return {
        url: String(await server.url) + 'runner/index' + path.extname(self.pathname),
        close: () => server.close(),
    }
}

export async function setupToolboxTester(
    watchedFiles: Iterable<string>,
    conductorFactories: Iterable<(runnerUrl: string) => TestConductor>,
    loaders: Iterable<FileLoader>,
    {
        managerFactory = () => new TestRunManager,
        fileProviderFactory = (loaders) => new FileProvider(loaders),
        fileServerFactory = (provider) => new HttpFileServer(provider),
        runnerFactory = setupToolboxRunner,
        testRunIterator = TestRunIterator.iterateSuitesByConductors,
        watcherFactory = () => new FsWatcher(),
        mapPathsToTestFiles = defaults.mapPathsToTestFiles,
        connectConsoleReporter = true,
        setExitCode = !!process.env.CI,
    }: {
        /**
         * Factory for {@link TestRunManager} which creates and executes the test runs.
         */
        managerFactory?: () => TestRunManager
        /**
         * Factory for {@link FileProvider} which provides files for the {@link FileServer}.
         *
         * The default FileProvider caches the files and delegates loading unknown files to a stack of {@link FileLoader}.
         */
        fileProviderFactory?: (loaders: Iterable<FileLoader>) => FileProvider
        /**
         * Factory for {@link FileServer} which serves files from a {@link FileProvider}.
         *
         * Defaults to serving files per {@link HttpFileServer}.
         */
        fileServerFactory?: (fileProvider: FileProvider) => FileServer
        /**
         * Factory which provides the runner module.
         */
        runnerFactory?: () => Promise<{
            url: string
            close: () => void|Promise<void>
        }>,
        /**
         * Factory for {@link FsWatcher} which discovers and watches files in {@linkcode watchedFiles}.
         *
         * Defaults to a small wrapper around [Chokidar](https://github.com/paulmillr/chokidar).
         */
        watcherFactory?: () => FsWatcher
        /**
         * The iterator to use for traversing the {@link TestSuite}s in a test run.
         *
         * Defaults to {@link TestRunIterator.iterateSuitesByConductors}.
         */
        testRunIterator?: (run: TestRunStack) => Generator<TestSuite>
        /**
         * Callback to transform the list of discovered files into a list of {@link TestFile}s
         * (the URLs and titles of the {@link TestSuite}s).
         */
        mapPathsToTestFiles?: (fileserverUrl: URL, subPaths: Iterable<string>) => Iterable<TestFile>
        /**
         * Automatically connect the default {@link ConsoleReporter} to test runs created on the {@link TestRunManager}.
         *
         * Defaults to `true`.
         */
        connectConsoleReporter?: boolean
        /**
         * Set `process.exitCode` according to the test run results.
         *
         * Defaults to `true` in CI and `false` otherwise.
         *
         * If `true`:
         * - `exitCode` will be 1 if a suite fails
         *   (e.g. because of a syntax error in the test file or an error in a hook).
         * - `exitCode` will be 2 if the tests are incomplete
         *   (i.e. no test run was performed,
         *   the executed test suites did not yield any test results,
         *   or tests were skipped).
         * - `exitCode` will be 3 if tests resulted in errors or timeouts.
         */
        setExitCode?: boolean
    } = {},
) {
    const manager = managerFactory()

    const fileProvider = fileProviderFactory(loaders)
    const fileServer = fileServerFactory(fileProvider)

    const watcher = watcherFactory()
    watcher.onUnlink(p => fileProvider.invalidate(p))
    watcher.onChange(p => fileProvider.invalidate(p))
    void watcher.watch(...watchedFiles)

    let filterSuites: RegExp|undefined = undefined
    let filterTests: RegExp|undefined = undefined

    const runner = await runnerFactory()
    const conductors: TestConductor[] = []
    for(const c of conductorFactories) {
        conductors.push(c(runner.url))
    }

    const trigger = new Trigger(async () => {
        await manager.run(
            conductors,
            mapPathsToTestFiles(await fileServer.url, watcher.files()),
            testRunIterator,
            filterSuites,
            filterTests,
        )
    }, 20)

    watcher.onChange(p => {
        manager.abort(`Change in ${p}`)
        void trigger.activate()
    })

    const consoleReporter = new ConsoleReporter()
    if (connectConsoleReporter) {
        manager.addListener('create', ({run}) => consoleReporter.connect(run))
        manager.addListener('done', ({run}) => consoleReporter.disconnect(run))
    }

    let active = false
    const start = async ({
        persistent = !process.env.CI,
    }: {
        persistent?: boolean
    } = {}) => {
        await watcher.ready

        active = true
        await trigger.activate()

        if (!persistent) {
            void close()
        }
    }

    const close = async (closeConductors = true) => {
        active = false
        await watcher.close()
        manager.abort('close')

        const a = []

        if (closeConductors) {
            for (const c of conductors) {
                a.push(c.close())
            }
            a.push(runner.close())
        }
        a.push(fileServer.close())

        await Promise.allSettled(a)
    }

    const setSuitesFilter = (filter: RegExp|undefined) => {
        filterSuites = filter
        if (active) {
            void trigger.activate()
        }
    }

    const setTestsFilter = (filter: RegExp|undefined) => {
        filterTests = filter
        if (active) {
            void trigger.activate()
        }
    }

    if (setExitCode) {
        process.exitCode = 2
        manager.addListener('done', ({run}) => {
            if (run.index.errors.size) {
                process.exitCode = 1
            } else if (run.index.results.size === 0) {
                process.exitCode = 2
            } else if (run.index.results.MIXED.size || run.index.results.fail.size || run.index.results.timeout.size) {
                process.exitCode = 3
            } else if (run.index.results.skipped.size) {
                process.exitCode = Math.max(process.exitCode ?? 0, 2)
            } else {
                process.exitCode = 0
            }
        })
    }

    const connectCoverageReporter = (
        cb: (map: IstanbulLibCoverage.CoverageMap) => void|Promise<void>,
    ) => {
        return manager.addListener('done', ({run}) => {
            let hasCoverage = false
            const map = IstanbulLibCoverage.createCoverageMap()
            for (const suite of TestRunIterator.iterateSuitesByConductors(run)) {
                if (suite.coverage) {
                    hasCoverage = hasCoverage || !!Object.keys(suite.coverage).length
                    map.merge(suite.coverage)
                }
            }
            if (hasCoverage) {
                void cb(map)
            }
        })
    }

    return {
        manager,
        fileProvider,
        fileServer,
        watcher,
        consoleReporter,
        connectCoverageReporter,
        setSuitesFilter,
        setTestsFilter,
        start,
        close,
    }
}

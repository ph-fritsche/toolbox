import { Stats } from 'fs'
import { OutputOptions, Plugin, PreRenderedChunk, rollup, RollupBuild, RollupCache, RollupError, RollupOutput } from 'rollup'
import { EventEmitter } from '../event'
import { nodeJsModulePrefix } from './resolve'

type InputFilesMap = Map<string, Stats | undefined>
export type OutputFilesMap = Map<string, {
    content: string | Uint8Array
    isEntry?: boolean
    moduleId?: string | null
}>

export type BuildEventMap = {
    activate: {
        buildId: number
        inputFiles: InputFilesMap
    }
    start: {
        buildId: number
        inputFiles: InputFilesMap
        build: Promise<RollupBuild>
    }
    complete: {
        buildId: number
        build: RollupBuild
        inputFiles: InputFilesMap
        outputFiles: OutputFilesMap
    }
    error: {
        buildId: number
        error: RollupError
    }
    done: {
        buildId: number
    }
}
type BuildEvent = keyof BuildEventMap

type BuilderInit = {
    id: string
    plugins: Plugin[]
    basePath?: string
}

export class Builder {
    constructor({
        id,
        plugins,
        basePath = `${process.cwd()}/`,
    }: BuilderInit) {
        this.id = id
        this.plugins = plugins
        this.basePath = basePath
        this.outputOptions.preserveModulesRoot = basePath
    }
    readonly id
    protected plugins
    protected basePath

    protected isExternal = (
        source: string,
        importer: string|undefined,
        isResolved: boolean,
    ) => {
        return isResolved && (
            source.includes('/node_modules/')
            || isNodeJsModule(source)
        )
    }
    protected buildExternals = true
    protected outputOptions: OutputOptions = {
        preserveModules: true,
        sourcemap: true,
    }

    readonly emitter = new EventEmitter<BuildEventMap>()

    readonly inputFiles: InputFilesMap = new Map()

    private cache: RollupCache | undefined

    private _externals: string[] = []
    get externals() {
        return [...this._externals]
    }

    private internalOutputFiles: OutputFilesMap = new Map()
    private externalOutputFiles: OutputFilesMap = new Map()
    private _combinedOutput: OutputFilesMap = new Map()
    get outputFiles() {
        return this._combinedOutput
    }

    get idle() {
        return this.promisedBuildId === undefined
    }

    private nextBuildId = 0
    private promisedBuildId: number|undefined = undefined
    private currentBuild: Promise<RollupBuild>|undefined
    private pendingBuild: Promise<RollupBuild>|undefined

    private assertBuildId(event: BuildEventMap[BuildEvent], buildId: number) {
        if (event.buildId !== buildId) {
            throw new Error('Unexpected event order')
        }
    }
    private promiseBuild() {
        const buildId = this.nextBuildId
        const build = new Promise<RollupBuild>((res, rej) => {
            this.emitter.once('start', event => {
                this.assertBuildId(event, buildId)
                event.build.then(b => res(b), r => rej(r))
            })
        })
        if (this.promisedBuildId !== buildId) {
            this.emitter.dispatch('activate', {
                buildId,
                inputFiles: this.inputFiles,
            })
            this.promisedBuildId = buildId
        }
        return {buildId, build}
    }

    private debounceT: NodeJS.Timeout | undefined
    build() {
        clearTimeout(this.debounceT)

        const {buildId, build} = this.promiseBuild()

        this.triggerBuild(buildId)

        return {buildId, build}
    }
    debounceBuild() {
        clearTimeout(this.debounceT)
        
        const {buildId, build} = this.promiseBuild()

        this.debounceT = setTimeout(() => this.triggerBuild(buildId), 50)

        return {buildId, build}
    }

    /**
     * Trigger a build. If there is a current build, schedule it.
     */
    private triggerBuild(buildId: number) {
        if (this.pendingBuild || this.nextBuildId !== buildId) {
            return
        }
        
        if (this.currentBuild) {
            this.pendingBuild = new Promise((res, rej) => {
                this.emitter.once('done', currentDone => {
                    this.assertBuildId(currentDone, buildId - 1)
                    this.emitter.once('start', nextStart => {
                        this.assertBuildId(nextStart, buildId)
                        nextStart.build.then(b => res(b), r => rej(r))
                    })
                    this.doBuild(buildId)
                    this.pendingBuild = undefined
                })
            })
        } else {
            this.doBuild(buildId)
        }
    }
    private doBuild(buildId: number) {
        this.nextBuildId++

        this.currentBuild = rollup({
            cache: this.cache,
            input: Array.from(this.inputFiles.keys()),
            plugins: this.plugins,
            external: (source, importer, isResolved) => {
                if (this.isExternal(source, importer, isResolved)) {
                    this._externals.push(source)
                    return true
                }
            },
        })

        this.emitter.dispatch('start', {
            buildId,
            build: this.currentBuild,
            inputFiles: this.inputFiles,
        })

        this.currentBuild.then(
            async b => {
                this.cache = b.cache

                const externalsInput = this.externals.filter(f => !isNodeJsModule(f))

                const externalBuild = this.buildExternals && externalsInput.some(f => {
                    const name = f.startsWith(this.basePath) ? f.substring(this.basePath.length) : f
                    return !this.externalOutputFiles.has(name)
                })
                    ? rollup({
                        cache: this.cache,
                        input: externalsInput,
                        plugins: this.plugins,
                        external: (source, importer, isResolved) => {
                            if (isResolved && isNodeJsModule(source)) {
                                return true
                            }
                        },
                    })
                    : undefined

                await Promise.all([
                    b.generate(this.outputOptions).then(o => {
                        this.internalOutputFiles.clear()
                        setOutputFiles(this.internalOutputFiles, o)
                    }),
                    externalBuild?.then(e => e.generate({
                        preserveModules: false,
                        sourcemap: false,
                        entryFileNames: preserveEntryFileNames(this.basePath),
                    })).then(o => {
                        setOutputFiles(this.externalOutputFiles, o)
                    }),
                ])

                this._combinedOutput = new Map(this.internalOutputFiles)
                for (const [n, f] of this.externalOutputFiles) {
                    this._combinedOutput.set(n, f)
                }                

                this.emitter.dispatch('complete', {
                    buildId,
                    build: b,
                    inputFiles: this.inputFiles,
                    outputFiles: this.outputFiles,
                })

                await Promise.all([
                    b.close(),
                    externalBuild?.then(e => e.close()),
                ])
            },
            (error: RollupError) => {
                this.emitter.dispatch('error', {
                    buildId,
                    error,
                })
            }
        ).finally(() => {
            this.currentBuild = undefined
            if (this.promisedBuildId === buildId) {
                this.promisedBuildId = undefined
            }
            this.emitter.dispatch('done', {
                buildId,
            })
        })
    }
}

export class IifeBuilder extends Builder {
    constructor(init: BuilderInit) {
        super(init)
        this.outputOptions = {
            format: 'iife',
            preserveModules: false,
            sourcemap: true,
            entryFileNames: ({facadeModuleId}) => `__env--${getSubPath(String(facadeModuleId), this.basePath).replace('/', '--')}.[hash].js`
        }
        this.isExternal = () => false
        this.buildExternals = false
    }
}

/** Check if a *resolved* moduleName is a nodeJs module */
function isNodeJsModule(moduleName: string) {
    return !moduleName.startsWith('.') && (
        !moduleName.startsWith('/') || moduleName.startsWith(nodeJsModulePrefix)
    )
}

function preserveEntryFileNames(
    basePath: string,
) {
    return ({ facadeModuleId, name }: PreRenderedChunk) => {
        if (facadeModuleId?.startsWith(basePath)) {
            return facadeModuleId.substring(basePath.length)
                .replace(/\?.*/, '')
                .replace(/\.ts$/, '.js')
        }
        return `${name}.js`
    }
}

/** Map RollupOutput to outputFiles */
function setOutputFiles(
    map: OutputFilesMap,
    { output }: RollupOutput,
) {
    for (const f of output) {
        if (f.type === 'chunk') {
            map.set(f.fileName, {
                moduleId: f.facadeModuleId,
                isEntry: f.isEntry,
                content: `${f.code}\n//# sourceMappingURL=${f.map?.toUrl()}`,
            })
        } else {
            map.set(f.fileName, {
                content: f.source
            })
        }
    }
}

function getSubPath(
    fileName: string,
    basePath: string,
) {
    return fileName.startsWith(basePath) ? fileName.substring(basePath.length) : fileName
}

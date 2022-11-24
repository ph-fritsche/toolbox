import { Stats } from 'fs'
import path from 'path'
import { OutputOptions, Plugin, PreRenderedChunk, rollup, RollupBuild, RollupCache, RollupError, RollupOptions, RollupOutput } from 'rollup'
import { EventEmitter } from '../event'
import { isNodeJsBuiltin } from './module'

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
        build: Promise<RollupBuild|undefined>
    }
    externals: {
        buildId: number
        externals: string[]
    }
    complete: {
        buildId: number
        build: RollupBuild|undefined
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

export type BuilderInit = {
    id: string
    plugins: Plugin[]
    basePath?: string
    isExternal?: (
        source: string,
        importer: string | undefined,
        isResolved: boolean
    ) => boolean
    outputOptions?: OutputOptions
    paths?: (moduleId: string) => string|undefined
}

export class Builder {
    constructor({
        id,
        plugins,
        basePath = `${process.cwd()}/`,
        isExternal,
        outputOptions,
        paths,
    }: BuilderInit) {
        this.id = id
        this.plugins = plugins
        this.basePath = basePath
        this.outputOptions = {
            preserveModules: true,
            preserveModulesRoot: basePath,
            entryFileNames: (outputOptions?.preserveModules ?? true)
                ? undefined
                : preserveEntryFileNames(basePath),
            sourcemap: true,
            paths: (id: string) => {
                if (id.startsWith('.')) {
                    return id
                }
                const p = paths?.(id)
                if (p) {
                    return p
                } else if (id.startsWith('/')) {
                    return path.relative(basePath, id)
                }
                return id
            },
            ...outputOptions,
        }
        this.isExternal = isExternal ?? ((source, importer, isResolved) =>
            this.outputOptions.globals && source in this.outputOptions.globals
            || isResolved && (source.includes('/node_modules/') || isNodeJsBuiltin(source))
        )
    }
    readonly id: string
    protected plugins: Plugin[]
    protected basePath: string
    protected outputOptions: OutputOptions
    protected isExternal: (
        source: string,
        importer: string | undefined,
        isResolved: boolean
    ) => boolean

    readonly emitter = new EventEmitter<BuildEventMap>()

    readonly inputFiles: InputFilesMap = new Map()

    private cache: RollupCache | undefined

    private _externals = new Set<string>()
    get externals() {
        return Array.from(this._externals.values())
    }

    readonly outputFiles: OutputFilesMap = new Map()

    get idle() {
        return this.promisedBuildId === undefined
    }

    private nextBuildId = 0
    private promisedBuildId: number|undefined = undefined
    private currentBuild: Promise<RollupBuild|undefined>|undefined
    private pendingBuild: Promise<RollupBuild|undefined>|undefined

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

        this.currentBuild = this.inputFiles.size
            ? rollup({
                cache: this.cache,
                input: Array.from(this.inputFiles.keys()),
                plugins: this.plugins,
                external: (source, importer, isResolved) => {
                    if (this.isExternal(source, importer, isResolved)) {
                        if (source.startsWith('.')) {
                            throw new Error(`Relative external "${source}" imported by "${importer}" in builder "${this.id}".`)
                        }
                        this._externals.add(source)
                        return true
                    }
                },
            })
            : Promise.resolve(undefined)

        this.emitter.dispatch('start', {
            buildId,
            build: this.currentBuild,
            inputFiles: this.inputFiles,
        })

        this.currentBuild.then(
            async b => {
                if (b) {
                    this.cache = b.cache
    
                    this.emitter.dispatch('externals', {
                        buildId,
                        externals: this.externals,
                    })
    
                    await b.generate(this.outputOptions).then(o => {
                        this.outputFiles.clear()
                        setOutputFiles(this.outputFiles, o)
                    })
                }

                this.emitter.dispatch('complete', {
                    buildId,
                    build: b,
                    inputFiles: this.inputFiles,
                    outputFiles: this.outputFiles,
                })

                await b?.close()
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

export function preserveEntryFileNames(
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

export function getSubPath(
    fileName: string,
    basePath: string,
) {
    return fileName.startsWith(basePath) ? fileName.substring(basePath.length) : fileName
}

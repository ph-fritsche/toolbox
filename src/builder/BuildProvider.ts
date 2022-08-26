import { Stats } from 'fs'
import { watch } from 'chokidar'
import { Builder } from './Builder'
import { EventEmitter } from './EventEmitter'

type BuilderEntry = {
    builder: Builder
    entrypoints?: Array<string|RegExp>
}

type BuildProviderEventMap = {
    done: {
        builder: Builder
        pending: boolean
    }
}

export class BuildProvider {
    constructor(
        watchedFiles: string[],
    ) {
        this._watcher = watch(watchedFiles)
        this._watcher.on('ready', () => {
            this._ready = true
            this.files.forEach((stats, filepath) => {
                this.syncFileWithBuilders(this._builders.values(), 'add', filepath, stats)
            })
        })
        this._watcher.on('all', (eventName, filepath, stats) => {
            if (eventName === 'addDir' || eventName === 'unlinkDir') {
                return
            }
            if (eventName === 'unlink') {
                this.files.delete(filepath)
            } else {
                this.files.set(filepath, stats)
            }

            this.syncFileWithBuilders(this._builders.values(), eventName, filepath, stats)
        })
    }
    private basePath = `${process.cwd()}/`
    private _watcher
    private _ready = false

    readonly files = new Map<string, Stats|undefined>()

    readonly emitter = new EventEmitter<BuildProviderEventMap>()
    
    private _builders = new Map<string, BuilderEntry>()
    connect(
        builder: Builder,
        entrypoints?: Array<string|RegExp>,
    ) {
        if (this._builders.has(builder.id)) {
            throw new Error(`BuildProvider already has a Builder with id "${builder.id}".`)
        }
        const entry = {builder, entrypoints}
        this._builders.set(builder.id, entry)
        this.files.forEach((stats, filepath) => {
            this.syncFileWithBuilders([entry], 'add', filepath, stats)
        })
        builder.emitter.addListener('done', () => {
            this.emitter.dispatch('done', {
                builder,
                pending: Array.from(this._builders.values()).some(b => !b.builder.idle),
            })
        })
    }

    syncFileWithBuilders(
        builders: Iterable<BuilderEntry>,
        eventName: 'add'|'change'|'unlink',
        filepath: string,
        stats: Stats|undefined,
    ) {
        const subpath = filepath.startsWith(this.basePath)
            ? filepath.substring(this.basePath.length)
            : filepath

        for (const { builder, entrypoints } of builders) {
            if (!matchesEntryPoints(filepath, subpath, entrypoints)) {
                continue
            }

            if (eventName === 'unlink') {
                builder.inputFiles.delete(filepath)
            } else {
                builder.inputFiles.set(filepath, stats)
                if (this._ready) {
                    builder.debounceBuild()
                }
            }
        }
    }

    get watcher() {
        return this._watcher
    }
    getBuilder(id: string) {
        return this._builders.get(id)
    }
    get builders() {
        return this._builders.values()
    }
    get ready() {
        return this._ready
    }
}

function matchesEntryPoints(
    filepath: string,
    subpath: string,
    entrypoints?: Array<string|RegExp>,
) {
    if (!entrypoints) {
        return true
    }

    for (const p of entrypoints) {
        if (typeof p === 'string') {
            if (p.startsWith('/')
                ? p === filepath || filepath.startsWith(`${p}/`)
                : p === subpath || subpath.startsWith(`${p}/`)
            ) {
                return true
            }
        } else if (p.test(subpath)) {
            return true
        }
    }

    return false
}

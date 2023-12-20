import chokidar from 'chokidar'

/**
 * Wrapper around chokidar that maintains a list of existing files.
 */
export class FsWatcher {
    protected readonly fsWatcher
    protected readonly _files = new Set<string>()
    constructor(
        options?: chokidar.WatchOptions,
    ) {
        this.fsWatcher = new chokidar.FSWatcher({
            ...options,
            ignoreInitial: false,
        })

        this.fsWatcher.on('add', p => this._files.add(p))
        this.fsWatcher.on('unlink', p => this._files.delete(p))
    }

    files() {
        return this._files.keys()
    }

    has(path: string) {
        return this._files.has(path)
    }

    protected _ready: Promise<void> = Promise.resolve()
    get ready() {
        return this._ready
    }
    watch(...watchedFiles: string[]) {
        return this._ready = new Promise<void>(r => {
            if (watchedFiles.length) {
                this.fsWatcher.add(watchedFiles)
                this.fsWatcher.once('ready', r)
            } else {
                r()
            }
        })
    }

    unwatch(...watchedFiles: string[]) {
        this.fsWatcher.unwatch(watchedFiles)
    }

    close() {
        return this.fsWatcher.close()
    }

    onChange(cb: (path: string) => unknown) {
        this.fsWatcher.on('change', cb)
        return () => void this.fsWatcher.off('change', cb)
    }

    onUnlink(cb: (path: string) => unknown) {
        this.fsWatcher.on('unlink', cb)
        return () => void this.fsWatcher.off('unlink', cb)
    }
}

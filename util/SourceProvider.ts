import { watch } from 'chokidar'

type SourceProviderListener = (files: Set<string>, changed: Set<string>) => Promise<void>|void
export class SourceProvider {
    constructor(
        paths: string[],
    ) {
        this.watcher = watch(paths)
        this.watcher.on('ready', () => {
            this.ready = true
            this.debounceTrigger()
        })
        this.watcher.on('add', p => this.add(p))
        this.watcher.on('change', p => this.add(p))
        this.watcher.on('unlink', p => this.remove(p))
    }

    public readonly watcher
    protected ready = false

    public close() {
        return this.watcher.close()
    }

    public readonly files = new Set<string>()
    public readonly changed = new Set<string>()

    protected add(p: string) {
        this.files.add(p)
        this.changed.add(p)
        if (this.ready) {
            this.debounceTrigger()
        }
    }
    protected remove(p: string) {
        this.files.delete(p)
        this.changed.delete(p)
    }

    private t?: NodeJS.Timeout
    protected debounceTrigger() {
        clearTimeout(this.t)
        setTimeout(() => {
            void this.listener?.(
                structuredClone(this.files),
                structuredClone(this.changed),
            )
            this.changed.clear()
        }, 50)
    }

    protected listener?: SourceProviderListener
    setListener(cb?: SourceProviderListener) {
        this.listener = cb
        if (this.ready) {
            this.debounceTrigger()
        }
    }
}

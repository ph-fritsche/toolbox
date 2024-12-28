import { TestRunManager } from '../conductor/TestRunManager'
import { TestConductor } from '../conductor/TestConductor'
import { TestFile, TestRunStack, TestSuite } from '../conductor/TestRun'
import { FsWatcher } from '../files'
import { Trigger } from '../util/Trigger'
import { EventEmitter } from '../event'
import { getEventDispatch } from '../event/EventEmitter'

type TesterEventMap = {
    state:
        | { key: 'start' }
        | { key: 'stop' }
    option:
        | { key: 'conductors', value: Map<TestConductor, boolean> }
        | { key: 'filterSuites', value: RegExp|undefined }
        | { key: 'filterTests', value: RegExp|undefined }
    newRun: { run: TestRunStack }
    fileChange: { path: string }
}

export class Tester extends EventEmitter<TesterEventMap> {
    constructor(
        readonly manager: TestRunManager,
        conductors: Iterable<TestConductor|[TestConductor, boolean]>,
        readonly watcher: FsWatcher,
        protected readonly fileServerUrl: URL,
        protected readonly mapPathsToTestFiles: (fileserverUrl: URL, subPaths: Iterable<string>) => Iterable<TestFile>,
        public testRunIterator: (run: TestRunStack) => Generator<TestSuite>,
        protected readonly setExitCode: boolean,
    ) {
        super()

        const map = this.conductors.get()
        for (const c of conductors) {
            if (Array.isArray(c)) {
                map.set(c[0], c[1] !== false)
            } else {
                map.set(c, true)
            }
        }

        this.init()
    }

    protected dispatch = getEventDispatch(this)

    protected _active = false
    get active() {
        return this._active
    }

    #runId = -1
    #newestRun?: TestRunStack
    get runCount() {
        return this.#runId + 1
    }
    get newestRun() {
        return this.#newestRun
    }

    readonly conductors = new Property<Map<TestConductor, boolean>>(new Map(), value => {
        this.dispatch('option', {key: 'conductors', value})
        void this.activate()
    })

    readonly filterSuites = new Property<RegExp|undefined>(undefined, value => {
        this.dispatch('option', {key: 'filterSuites', value})
        void this.activate()
    })
    readonly filterTests = new Property<RegExp|undefined>(undefined, value => {
        this.dispatch('option', { key: 'filterTests', value })
        void this.activate()
    })

    getTestFiles() {
        return this.mapPathsToTestFiles(this.fileServerUrl, this.watcher.files())
    }

    protected trigger = new Trigger(async () => {
        const conductors = []
        for (const [c, a] of this.conductors.get()) {
            if (a) {
                conductors.push(c)
            }
        }

        const run = await this.manager.run(
            conductors,
            this.getTestFiles(),
            this.testRunIterator,
            this.filterSuites.get(),
            this.filterTests.get(),
        )

        this.updateExitCode(run)
    })

    protected init() {
        this.onDispose.add(this.watcher.onChange((path: string) => {
            this.manager.abort(`Change in ${path}`)
            this.dispatch('fileChange', {path})
            void this.activate()
        }))
        this.updateExitCode()
        this.onDispose.add(this.manager.addListener('create', ({run}) => {
            this.#runId++
            this.#newestRun = run
            this.dispatch('newRun', {run})
        }))
    }
    protected onDispose = new Set<() => Promise<void>|void>
    async [Symbol.asyncDispose]() {
        const a = []
        for (const f of this.onDispose) {
            a.push(f())
        }
        await Promise.allSettled(a)
    }

    async start() {
        this._active = true
        this.dispatch('state', {key: 'start'})

        await this.watcher.ready

        await this.trigger.activate()
    }

    async stop() {
        this._active = false
        this.dispatch('state', { key: 'stop' })

        this.manager.abort('stop')
    }

    async activate() {
        if (this._active) {
            await this.trigger.activate()
        }
    }

    protected updateExitCode(run?: TestRunStack) {
        if (!this.setExitCode) {
            return
        } else if (!run) {
            process.exitCode = 2
        } else if (run.index.errors.size) {
            process.exitCode = 1
        } else if (run.index.results.size === 0) {
            process.exitCode = 2
        } else if (run.index.results.MIXED.size || run.index.results.fail.size || run.index.results.timeout.size) {
            process.exitCode = 3
        } else if (run.index.results.skipped.size) {
            process.exitCode = Math.max(Number(process.exitCode ?? 0), 2)
        } else {
            process.exitCode = 0
        }
    }
}

class Property<T> {
    #value
    #onChange

    constructor(
        value: T,
        onChange: (newValue: T, oldValue: T) => void,
    ) {
        this.#value = value
        this.#onChange = onChange
    }

    get() {
        return this.#value
    }

    set(value: T) {
        const old = this.#value
        this.#value = value
        this.#onChange(value, old)
    }
}

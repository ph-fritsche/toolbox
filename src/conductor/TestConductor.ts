import { Entity, makeId } from '../test/Entity'
import { TestGroup } from '../reporter/TestGroup'
import { TestRun } from './TestRun'
import { ReporterServer } from '../reporter/ReporterServer'

export interface ServedFiles {
    server: URL
    paths: string[]
}

export abstract class TestConductor extends Entity {
    protected abstract readonly supportedFilesProtocols: string[]
    protected readonly includeFilesProtocol: boolean = false
    public title: string = this.constructor.name

    constructor(
        protected reporterServer: ReporterServer,
    ) {
        super()
    }

    private runId = -1

    protected setupFiles: string[]
    setSetupFiles(
        ...files: ServedFiles[]
    ) {
        this.setupFiles = files.map(f => {
            const base = this.resolveBasePath(f)
            return f.paths.map(p => `${base}${p}`)
        }).flat(1)
    }

    async runTests(
        ...tests: ServedFiles[]
    ) {
        const runId = `${this.id}:${++this.runId}`

        const testFiles = tests.map(f => {
            const base = this.resolveBasePath(f)
            return f.paths.map(p => ({
                id: makeId(6),
                name: p,
                url: `${base}${p}`
            }))
        }).flat(1)

        const run = new TestRun(this, {id: runId})
        testFiles.forEach(f => {
            const t = new TestGroup({
                id: f.id,
                title: f.name,
                children: [],
            })
            run.suites.set(f.id, t)
            run.groups.set(f.id, t)
        })

        run.state = 'running'
        this.reporterServer.reportStart(run, this.setupFiles, testFiles)

        await Promise.all(testFiles.map(f => this.runTestSuite(runId, f.url, f.id, f.name)
            .then(
                () => this.reporterServer.reportComplete(run, f.id),
                async e => this.reporterServer.reportError(run, f.id, e),
            )
        ))

        run.state = 'done'
        this.reporterServer.reportDone(run)
    }

    protected abstract runTestSuite(
        runId: string,
        testFile: string,
        id: string,
        name: string,
    ): Promise<void>

    protected resolveBasePath(
        files: ServedFiles,
    ): string {
        if (!this.supportedFilesProtocols.includes(files.server.protocol)) {
            throw new Error(`The TestRunner implementation does not support FileServer protocol for "${String(files.server)}"`)
        }
        return (files.server.protocol === 'file:' && !this.includeFilesProtocol
            ? files.server.pathname
            : String(files.server)
        ) + (files.server.pathname.endsWith('/') ? '' : '/')
    }
}

function trimStart(
    str: string,
    chars: string,
) {
    for (let i = 0;; i++) {
        if (i >= str.length || !chars.includes(str[i])) {
            return str.substring(i)
        }
    }
}

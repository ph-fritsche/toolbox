import { Entity, makeId } from '../test/Entity'
import { TestGroup } from '../reporter/TestGroup'
import { TestRun } from '../reporter/TestRun'
import { ReporterServer } from '../reporter/ReporterServer'

export interface ServedFiles {
    server: URL
    paths: string[]
}

export abstract class TestConductor extends Entity {
    protected static readonly supportedFilesProtocols: string[] = []
    protected static readonly includeFilesProtocol: boolean = false
    
    constructor(
        public readonly reporterServer: ReporterServer,
        public readonly testRunnerModule: string,
        title?: string,
        setupFiles?: ServedFiles[],
    ) {
        super()
        this.title = title ?? this.constructor.name
        this.supportedFilesProtocols = (this.constructor as typeof TestConductor).supportedFilesProtocols
        this.includeFilesProtocol = (this.constructor as typeof TestConductor).includeFilesProtocol
        this.setSetupFiles(...setupFiles)
    }

    public readonly title: string
    private runId = -1
    private readonly supportedFilesProtocols: string[]
    private readonly includeFilesProtocol: boolean

    protected setupFiles: string[]
    setSetupFiles(
        ...files: ServedFiles[]
    ) {
        this.setupFiles = files.map(f => {
            const base = this.resolveBasePath(f)
            return f.paths.map(p => `${base}${p}`)
        }).flat(1)
    }

    createTestRun(
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

        const {run, start, done} = TestRun.create(this, {id: runId})
        testFiles.forEach(f => {
            const t = new TestGroup({
                id: f.id,
                title: f.name,
                children: [],
            })
            run.suites.set(f.id, t)
            run.groups.set(f.id, t)
        })

        return {
            run,
            exec: async () => {
                start()
        
                await Promise.all(testFiles
                    .map(f => this.runTestSuite(runId, f.url, f.id, f.name)
                    .catch(e => this.reporterServer.reportError(run, f.id, e))
                ))
        
                done()
            }
        }
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

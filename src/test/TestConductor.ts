import { createServer, IncomingMessage, ServerResponse } from 'http'
import { EventEmitter } from '../event'
import { Entity, makeId } from './Entity'
import { Test } from './Test'
import { TestError } from './TestError'
import { TestGroup } from './TestGroup'
import { TestResult } from './TestResult'
import { TestRun } from './TestRun'

interface Files {
    server: URL
    paths: string[]
}

export type TestConductorEventMap = {
    start: {
        runId: string
        setupFiles: string[]
        testFiles: Array<{name: string, url: string}>
    }
    schedule: {
        runId: string
        group: TestGroup
    }
    result: {
        runId: string
        testId: string
        result: TestResult
    }
    complete: {
        runId: string
        groupTitle: string
    }
    error: {
        runId: string
        groupId: string
        testId?: string
        hook?: string
        error: TestError
    }
    done: {
        runId: string
    }
}

export abstract class TestConductor extends Entity {
    protected abstract readonly supportedFilesProtocols: string[]
    protected readonly includeFilesProtocol: boolean = false

    constructor() {
        super()
        this.reporterServer.listen(0, '127.0.0.1')

        this.emitter.addListener('schedule', ({runId, group}) => {
            const run = this.testRuns.get(runId)
            run.suites.set(group.id, group)
            for (const t of group.getDescendents()) {
                if (isGroup(t)) {
                    run.groups.set(t.id, t)
                } else {
                    run.tests.set(t.id, t)
                }
            }
        })
        this.emitter.addListener('result', ({runId, testId, result}) => {
            const run = this.testRuns.get(runId)
            run.results.set(testId, result)
        })
        this.emitter.addListener('error', ({runId, groupId, testId, hook, error}) => {
            const run = this.testRuns.get(runId)
            if (!run.errors.has(groupId)) {
                run.errors.set(groupId, [])
            }
            run.errors.get(groupId).push({hook, testId, error})
        })
    }

    private runId = -1

    readonly emitter = new EventEmitter<TestConductorEventMap>()

    protected readonly reporterServer = createServer(async <K extends 'schedule' | 'result'>(req: IncomingMessage, res: ServerResponse) => {
        if (req.method === 'POST' && req.headers["content-type"] === 'application/json') {
            const [type, data] = await new Promise<[K, TestConductorEventMap[K]]>((resolve, reject) => {
                let c = ''
                req.on('data', b => {
                    c += String(b)
                })
                req.on('end', () => {
                    try {
                        const {type, ...data} = JSON.parse(c, reviveReportProps)
                        resolve([type, data])
                    } catch(e) {
                        reject(e)
                    }
                })
                req.on('error', e => reject(e))
            })
            res.end()
            this.emitter.dispatch(type, data)
        } else {
            res.writeHead(501, 'Unsupported request type')
            res.end()
        }
    })

    readonly testRuns = new Map<string, TestRun>()

    async runTests(
        setup: Files[],
        tests: Files[],
    ) {
        const runId = `${this.id}:${++this.runId}`

        const setupFiles = ([] as string[])
            .concat(...setup.map(f => {
                const base = this.resolveBasePath(f)
                return f.paths.map(p => `${base}${p}`)
            }))
        const testFiles = ([] as Array<{id: string, name: string, url: string}>)
            .concat(...tests.map(f => {
                const base = this.resolveBasePath(f)
                return f.paths.map(p => ({
                    id: makeId(6),
                    name: p,
                    url: `${base}${p}`
                }))
            }))

        const run = new TestRun({id: runId})
        this.testRuns.set(runId, run)

        this.emitter.dispatch('start', {runId, setupFiles, testFiles})

        testFiles.forEach(f => {
            const t = new TestGroup({
                id: f.id,
                title: f.name,
                children: [],
            })
            run.suites.set(f.id, t)
            run.groups.set(f.id, t)
        })

        await Promise.all(testFiles.map(f => this.runTestSuite(runId, setupFiles, f.url, f.id, f.name)
            .then(
                () => this.emitter.dispatch('complete', {
                    runId,
                    groupTitle: f.name
                }),
                e => this.emitter.dispatch('error', {
                    runId,
                    groupId: f.id,
                    error: new TestError({
                        name: e instanceof Error ? e.name : 'Error',
                        message: e instanceof Error ? e.message : String(e),
                        stack: e instanceof Error ? e.stack : String(e),
                    })
                }),
            )
        ))

        this.emitter.dispatch('done', {runId})
    }

    protected abstract runTestSuite(
        runId: string,
        setupFiles: string[],
        testFile: string,
        id: string,
        name: string,
    ): Promise<void>

    protected resolveBasePath(
        files: Files,
    ): string {
        if (!this.supportedFilesProtocols.includes(files.server.protocol)) {
            throw new Error(`The TestRunner implementation does not support FileServer protocol for "${String(files.server)}"`)
        }
        return (files.server.protocol === 'file:' && !this.includeFilesProtocol
            ? files.server.pathname
            : String(files.server)
        ) + (files.server.pathname.endsWith('/') ? '' : '/')
    }

    protected get reporterServerUrl() {
        const addr = this.reporterServer.address()
        if (!addr) {
            throw new Error('Reporter server is unavailable.')
        } else if (typeof addr === 'string') {
            return new URL(addr)
        }
        return new URL(`http://${addr.family === 'IPv6' ? `[${addr.address}]` : addr.address}:${addr.port}/`)
    }
}

function reviveReportProps(key: string, value: unknown) {
    if (typeof value === 'object') {
        if (key === 'result') {
            return new TestResult(value as TestResult)
        } else if (key === 'group') {
            return new TestGroup(value as TestGroup)
        } else if (String(Number(key)) === key) {
            if ('children' in value) {
                return new TestGroup(value as TestGroup)
            } else {
                return new Test(value as Test)
            }
        }
    }
    return value
}

function isGroup(
    node: Test|TestGroup
): node is TestGroup {
    return 'children' in node
}

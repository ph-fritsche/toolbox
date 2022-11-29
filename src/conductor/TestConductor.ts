import { createServer, IncomingMessage, ServerResponse } from 'http'
import { SourceMapConsumer } from 'source-map'
import { EventEmitter } from '../event'
import { FileServer } from '../server'
import { Entity, makeId } from '../test/Entity'
import { Test } from '../test/Test'
import { TestError } from '../test/TestError'
import { TestGroup } from '../test/TestGroup'
import { TestResult } from '../test/TestResult'
import { TestRun } from '../test/TestRun'

export interface ServedFiles {
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
    public title: string = this.constructor.name

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
        res.setHeader('access-control-allow-origin', '*')
        if (req.method === 'OPTIONS') {
            res.setHeader('access-control-allow-headers', '*')
            res.end();
        } else if (req.method === 'POST' && req.headers["content-type"] === 'application/json') {
            const [type, data] = await new Promise<[K, TestConductorEventMap[K]]>((resolve, reject) => {
                let c = ''
                req.on('data', b => {
                    c += String(b)
                })
                req.on('end', async () => {
                    try {
                        const {type, ...data} = JSON.parse(c, reviveReportProps)
                        if (type === 'result' && data.result.error?.stack) {
                            data.result.error.stack = await this.rewriteStack(data.result.error.stack)
                        }
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

    protected setupFiles: string[]
    setSetupFiles(
        ...files: ServedFiles[]
    ) {
        this.setupFiles = files.map(f => {
            const base = this.resolveBasePath(f)
            return f.paths.map(p => `${base}${p}`)
        }).flat(1)
    }

    readonly testRuns = new Map<string, TestRun>()

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

        const run = new TestRun({id: runId})
        this.testRuns.set(runId, run)

        this.emitter.dispatch('start', {runId, setupFiles: this.setupFiles, testFiles})

        testFiles.forEach(f => {
            const t = new TestGroup({
                id: f.id,
                title: f.name,
                children: [],
            })
            run.suites.set(f.id, t)
            run.groups.set(f.id, t)
        })

        await Promise.all(testFiles.map(f => this.runTestSuite(runId, f.url, f.id, f.name)
            .then(
                () => this.emitter.dispatch('complete', {
                    runId,
                    groupTitle: f.name
                }),
                async e => this.emitter.dispatch('error', {
                    runId,
                    groupId: f.id,
                    error: new TestError({
                        name: e instanceof Error ? e.name : 'Error',
                        message: e instanceof Error ? e.message : String(e),
                        stack: e instanceof Error ? await this.rewriteStack(e.stack) : String(e),
                    })
                }),
            )
        ))

        this.emitter.dispatch('done', {runId})
    }

    protected abstract runTestSuite(
        runId: string,
        testFile: string,
        id: string,
        name: string,
    ): Promise<void>

    protected readonly fileServers = new Map<string, FileServer>()
    async registerFileServer(server: FileServer) {
        this.fileServers.set(String(await server.url), server)
    }
    protected async rewriteStack(
        stack: string,
    ) {
        const re = /(?<pre>\s+at [^\n)]+\()(?<url>\w+:\/\/[^/?]*[^)]*):(?<line>\d+):(?<column>\d+)(?<post>\)$)/gm
        let r: RegExpExecArray
        while (r = re.exec(stack)) {
            const url = r.groups.url
            const line = Number(r.groups.line)
            const column = Number(r.groups.column)
            for (const [serverUrl, server] of this.fileServers.entries()) {
                if (url.startsWith(serverUrl) && (serverUrl.endsWith('/') || url[serverUrl.length] === '/')) {
                    const subpath = trimStart(url.substring(serverUrl.length), '/')
                    let subPathAndPos = `${subpath}:${line}:${column}`
                    const file = await server.provider.getFile(subpath)
                    const mapMatch = String(file.content).match(/\n\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,(?<encodedMap>[0-9a-zA-Z+\/]+)\s*$/)
                    if (mapMatch) {
                        const map = JSON.parse(Buffer.from(mapMatch.groups.encodedMap, 'base64').toString('utf8'))
                        const original = await SourceMapConsumer.with(map, null, consumer => {
                            return consumer.originalPositionFor({ line, column, })
                        })
                        if (original.source) {
                            subPathAndPos = `${subpath.substring(0, subpath.length - map.file.length)}${original.source}:${original.line}:${original.column}`
                        }
                    }
                    const newStackEntry = r.groups.pre
                        + server.provider.origin
                        + (server.provider.origin.endsWith('/') ? '' : '/')
                        + subPathAndPos
                        + r.groups.post

                    stack = stack.substring(0, r.index)
                        + newStackEntry
                        + stack.substring(r.index + r[0].length)

                    re.lastIndex += newStackEntry.length - r[0].length

                    break
                }
            }
        }
        return stack
    }

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

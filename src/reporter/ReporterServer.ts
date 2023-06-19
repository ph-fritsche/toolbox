import { createServer, IncomingMessage, ServerResponse } from 'http'
import { RawSourceMap, SourceMapConsumer } from 'source-map'
import { EventEmitter } from '../event'
import { FileServer } from '../server'
import * as BaseEntities from '../test'
import { ReporterMessageMap } from './ReporterMessage'
import { Test } from './Test'
import { TestError } from './TestError'
import { TestGroup } from './TestGroup'
import { TestResult } from './TestResult'
import { TestRun } from './TestRun'
import { TreeIterator } from '../test/TreeIterator'

export type ReporterEventMap = {
    start: {
        run: TestRun
    }
    schedule: {
        run: TestRun
        group: TestGroup
    }
    result: {
        run: TestRun
        testId: string
        result: TestResult
    }
    complete: {
        run: TestRun
        group: TestGroup
        coverage: object
    }
    error: {
        run: TestRun
        group: TestGroup
        error: TestError
    }
    done: {
        run: TestRun
    }
}

export class ReporterServer {
    constructor() {
        this.url = new Promise((res, rej) => this.http.listen(0, '127.0.0.1', () => {
            try {
                res(this.getUrl())
            } catch(e) {
                rej(e)
            }
        }))
    }

    protected readonly fileServers = new Map<string, FileServer>()
    readonly testRuns = new Map<string, TestRun>()
    readonly emitter = new EventEmitter<ReporterEventMap>()

    protected readonly http = createServer((req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('access-control-allow-origin', '*')
        if (req.method === 'OPTIONS') {
            res.setHeader('access-control-allow-headers', '*')
            res.end()
        } else if (req.method === 'POST' && req.headers['content-type'] === 'application/json') {
            void new Promise<void>((resolve, reject) => {
                let c = ''
                req.on('data', b => {
                    c += String(b)
                })
                req.on('end', () => void (async () => {
                    const report = parseReport(c)
                    const run = this.testRuns.get(report.runId)
                    if (!run) {
                        throw new Error('Unknown runId')
                    }
                    if ('group' in report) {
                        run.groups.set(report.group.id, report.group)
                        run.suites.set(report.group.id, report.group)
                        for (const t of new TreeIterator(report.group).getDescendents()) {
                            if ('children' in t) {
                                run.groups.set(t.id, t)
                            } else {
                                run.tests.set(t.id, t)
                            }
                        }

                        this.emitter.dispatch('schedule', {
                            run,
                            group: report.group,
                        })

                    } else if ('result' in report) {
                        if (report.result.error?.stack) {
                            report.result.error.stack = await this.rewriteStack(report.result.error.stack)
                        }

                        run.results.set(report.testId, report.result)

                        this.emitter.dispatch('result', {
                            run,
                            testId: report.testId,
                            result: report.result,
                        })
                    } else if ('error' in report) {
                        if (report.error.stack) {
                            report.error.stack = await this.rewriteStack(report.error.stack)
                        }

                        const group = run.groups.get(report.groupId)
                        if (!group) {
                            throw new Error('Unknown groupId')
                        }
                        report.error.group = group
                        report.error.hook = report.hook
                        report.error.test = report.testId ? run.tests.get(report.testId) : undefined

                        if (!run.errors.has(report.groupId)) {
                            run.errors.set(report.groupId, [])
                        }
                        const errors = run.errors.get(report.groupId) as TestError[]
                        errors.push(report.error)

                        this.emitter.dispatch('error', {
                            run,
                            group,
                            error: report.error,
                        })
                    } else if ('coverage' in report) {
                        run.coverage.set(report.groupId, report.coverage)

                        const group = run.groups.get(report.groupId)
                        if (!group) {
                            throw new Error('Unknown groupId')
                        }

                        this.emitter.dispatch('complete', {
                            run,
                            group,
                            coverage: report.coverage,
                        })
                    }
                })().then(resolve, reject))
                req.on('error', e => reject(e))
            }).then(
                () => res.end(),
                e => {
                    console.error(e)
                    res.writeHead(500)
                    res.end()
                },
            )
        } else {
            res.writeHead(501, 'Unsupported request type')
            res.end()
        }
    })
    readonly url: Promise<URL>

    private getUrl() {
        const addr = this.http.address()
        if (!addr) {
            throw new Error('Reporter server is unavailable.')
        } else if (typeof addr === 'string') {
            return new URL(addr)
        }
        return new URL(`http://${addr.family === 'IPv6' ? `[${addr.address}]` : addr.address}:${addr.port}/`)
    }

    close() {
        return this.url
            .then(
                () => new Promise<void>((res, rej) => this.http.close((e) => e ? rej(e) : res())),
                (): void => void 0,
            )
    }

    async registerFileServer(server: FileServer) {
        this.fileServers.set(String(await server.url), server)
    }

    async reportStart(
        run: TestRun,
    ) {
        this.testRuns.set(run.id, run)
        this.emitter.dispatch('start', {run})
    }

    async reportError(
        run: TestRun,
        groupId: string,
        e: unknown,
    ) {
        const group = run.groups.get(groupId)
        if (!group) {
            throw new Error('Unknown groupId')
        }

        const error = new TestError({
            name: e instanceof Error ? e.name : 'Error',
            message: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error && e.stack ? await this.rewriteStack(e.stack) : String(e),
        })

        group.addError(error)
        this.emitter.dispatch('error', {run, error, group})
    }

    async reportDone(
        run: TestRun,
    ) {
        this.emitter.dispatch('done', {run})
    }

    protected async rewriteStack(
        stack: string,
    ) {
        const re = /(?<pre>\s+at [^\n)]+\()(?<url>\w+:\/\/[^/?]*[^)]*):(?<line>\d+):(?<column>\d+)(?<post>\)$)/gm
        let r: RegExpExecArray|null
        // eslint-disable-next-line no-cond-assign
        while ((r = re.exec(stack)) && r?.groups) {
            const url = r.groups.url
            const line = Number(r.groups.line)
            const column = Number(r.groups.column)
            for (const [serverUrl, server] of this.fileServers.entries()) {
                if (url.startsWith(serverUrl) && (serverUrl.endsWith('/') || url[serverUrl.length] === '/')) {
                    const subpath = trimStart(url.substring(serverUrl.length), '/')
                    let subPathAndPos = `${subpath}:${line}:${column}`

                    // TODO: handle errors when resolving code positions

                    const file = await server.provider.getFile(subpath)
                    const mapMatch = String(file.content).match(/\n\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,(?<encodedMap>[0-9a-zA-Z+/]+)\s*$/)
                    if (mapMatch?.groups) {
                        const map = JSON.parse(Buffer.from(mapMatch.groups.encodedMap, 'base64').toString('utf8')) as RawSourceMap
                        const original = await SourceMapConsumer.with(map, null, consumer => {
                            return consumer.originalPositionFor({ line, column })
                        })
                        if (original.source) {
                            subPathAndPos = `${subpath.substring(0, subpath.length - map.file.length)}${original.source}:${String(original.line)}:${String(original.column)}`
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
}

function parseReport(t: string) {
    return JSON.parse(t, reviveReportProps) as
        ReporterMessageMap<TestGroup, TestResult, TestError>[keyof ReporterMessageMap<TestGroup, TestResult, TestError>]
}

type BaseEntities = {
    TestGroup: BaseEntities.TestGroup
    Test: BaseEntities.Test
    TestResult: BaseEntities.TestResult
    TestError: BaseEntities.TestError
}
function isRevivedType<K extends keyof BaseEntities>(
    value: object,
    type: K,
): value is BaseEntities[K] {
    return '__T' in value && value['__T'] === type
}
function reviveReportProps(key: string, value: unknown) {
    if (typeof value === 'object' && value) {
        if (isRevivedType(value, 'Test')) {
            return new Test(value)
        } else if (isRevivedType(value, 'TestGroup')) {
            return new TestGroup(value)
        } else if (isRevivedType(value, 'TestError')) {
            return new TestError(value)
        } else if (isRevivedType(value, 'TestResult')) {
            return new TestResult(value)
        }
    }
    return value
}

function trimStart(
    str: string,
    chars: string,
) {
    for (let i = 0; ; i++) {
        if (i >= str.length || !chars.includes(str[i])) {
            return str.substring(i)
        }
    }
}

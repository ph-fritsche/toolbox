import { createServer, IncomingMessage, ServerResponse } from 'http'
import { SourceMapConsumer } from 'source-map'
import { EventEmitter } from '../event'
import { FileServer } from '../server'
import * as BaseEntities from '../test'
import { ReporterMessageMap } from './ReporterMessage'
import { Test } from './Test'
import { TestError } from './TestError'
import { TestGroup } from './TestGroup'
import { TestResult } from './TestResult'
import { TestRun } from '../conductor/TestRun'
import { TreeIterator } from '../test/TreeIterator'

export type ReporterEventMap = {
    start: {
        run: TestRun
        setupFiles: string[]
        testFiles: Array<{ name: string, url: string }>
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
    }
    error: {
        run: TestRun
        group: TestGroup
        test?: Test
        hook?: string
        error: TestError
    }
    done: {
        run: TestRun
    }
}

export class ReporterServer {
    constructor() {
        this.http.listen(0, '127.0.0.1')
    }

    protected readonly fileServers = new Map<string, FileServer>()
    readonly testRuns = new Map<string, TestRun>()
    readonly emitter = new EventEmitter<ReporterEventMap>()

    protected readonly http = createServer(async(req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('access-control-allow-origin', '*')
        if (req.method === 'OPTIONS') {
            res.setHeader('access-control-allow-headers', '*')
            res.end();
        } else if (req.method === 'POST' && req.headers["content-type"] === 'application/json') {
            await new Promise<void>((resolve, reject) => {
                let c = ''
                req.on('data', b => {
                    c += String(b)
                })
                req.on('end', async () => {
                    try {
                        const report = parseReport(c)
                        const run = this.testRuns.get(report.runId)
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
                            if (report.result.error) {
                                report.result.error.stack = await this.rewriteStack(report.result.error.stack)
                            }
                            run.results.set(report.testId, report.result)
                            this.emitter.dispatch('result', {
                                run,
                                testId: report.testId,
                                result: report.result,
                            })
                        } else if ('error' in report) {
                            report.error.stack = await this.rewriteStack(report.error.stack)
                            if (!run.errors.has(report.groupId)) {
                                run.errors.set(report.groupId, [])
                            }
                            run.errors.get(report.groupId).push({
                                hook: report.hook,
                                testId: report.testId,
                                error: report.error,
                            })
                            this.emitter.dispatch('error', {
                                run,
                                group: run.groups.get(report.groupId),
                                test: report.testId ? run.tests.get(report.testId) : undefined,
                                hook: report.hook,
                                error: report.error,
                            })
                        }
                    } catch (e) {
                        reject(e)
                    }
                    resolve()
                })
                req.on('error', e => reject(e))
            })
            res.end()
        } else {
            res.writeHead(501, 'Unsupported request type')
            res.end()
        }
    })

    get url() {
        const addr = this.http.address()
        if (!addr) {
            throw new Error('Reporter server is unavailable.')
        } else if (typeof addr === 'string') {
            return new URL(addr)
        }
        return new URL(`http://${addr.family === 'IPv6' ? `[${addr.address}]` : addr.address}:${addr.port}/`)
    }

    async registerFileServer(server: FileServer) {
        this.fileServers.set(String(await server.url), server)
    }

    async reportStart(
        run: TestRun,
        setupFiles: string[],
        testFiles: Array<{name: string, url: string}>
    ) {
        this.testRuns.set(run.id, run)
        this.emitter.dispatch('start', {run, setupFiles, testFiles})
    }

    async reportError(
        run: TestRun,
        groupId: string,
        e: unknown,
    ) {
        const group = run.groups.get(groupId)

        const error = new TestError({
            name: e instanceof Error ? e.name : 'Error',
            message: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? await this.rewriteStack(e.stack) : String(e),
        })

        group.addError(error)
        this.emitter.dispatch('error', {run, error, group})
    }

    async reportComplete(
        run: TestRun,
        groupId: string,
    ) {
        const group = run.groups.get(groupId)

        this.emitter.dispatch('complete', {run, group })
    }

    async reportDone(
        run: TestRun
    ) {
        this.emitter.dispatch('done', {run})
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
}

function parseReport(t: string) {
    return JSON.parse(t, reviveReportProps) as
        ReporterMessageMap<TestGroup, TestResult, TestError>[keyof ReporterMessageMap<TestGroup, TestResult, TestError>]
}

function reviveReportProps(key: string, value: unknown) {
    if (typeof value === 'object') {
        if (key === 'result') {
            return new TestResult(value as BaseEntities.TestResult)
        } else if (key === 'group') {
            return new TestGroup(value as BaseEntities.TestGroup)
        } else if (String(Number(key)) === key) {
            if ('children' in value) {
                return new TestGroup(value as BaseEntities.TestGroup)
            } else {
                return new Test(value as BaseEntities.Test)
            }
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

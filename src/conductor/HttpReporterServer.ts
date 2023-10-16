import { createServer, IncomingMessage, ServerResponse } from 'http'
import { ErrorStackResolver } from './ErrorStackResolver'
import { TestCompleteData, TestErrorData, TestReporter, TestResultData, TestScheduleData } from './TestReporter'

export type HttpReporterReport = {
    reporterId: number
} & (
    | {type: 'schedule', data: TestScheduleData}
    | {type: 'error', data: TestErrorData}
    | {type: 'result', data: TestResultData}
    | {type: 'complete', data: TestCompleteData}
)

export class HttpReporterServer {
    constructor(
        public readonly errorStackResolver: ErrorStackResolver,
        protected readonly host = '127.0.0.1',
    ) {
        this.url = new Promise((res, rej) => this.http.listen(0, '127.0.0.1', () => {
            try {
                res(this.getUrl())
            } catch(e) {
                rej(e)
            }
        }))
    }

    protected readonly reporters = new Map<number, TestReporter>()
    protected nextId = 0
    registerReporter(reporter: TestReporter) {
        const id = this.nextId++
        this.reporters.set(id, reporter)
        return id
    }
    unregisterReporter(id: number) {
        this.reporters.delete(id)
    }

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
                    const report = JSON.parse(c) as unknown
                    if (!this.isReport(report)) {
                        res.writeHead(400, 'Bad request')
                        res.end()
                        return
                    } else if (!this.reporters.has(report.reporterId)) {
                        res.writeHead(404, 'Not found')
                        res.end()
                        return
                    } else if (report.type === 'schedule') {
                        this.reporters.get(report.reporterId)?.schedule(report.data)
                    } else if (report.type === 'error') {
                        this.reporters.get(report.reporterId)?.error(report.data)
                    } else if (report.type === 'result') {
                        this.reporters.get(report.reporterId)?.result(report.data)
                    } else if (report.type === 'complete') {
                        this.reporters.get(report.reporterId)?.complete(report.data)
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

    protected isReport(report: unknown): report is HttpReporterReport {
        return !!(
            report
            && typeof report === 'object'
            && 'reporterId' in report
            && typeof report.reporterId === 'number'
            && 'type' in report
            && typeof report.type === 'string'
        )
    }
}

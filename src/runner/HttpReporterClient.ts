import { HttpReporterReport } from '../conductor/HttpReporterServer'
import { TestCompleteData, TestErrorData, TestResultData, TestScheduleData } from '../conductor/TestReporter'
import { Reporter } from './TestRunner'

export class HttpReporterClient implements Reporter {
    constructor(
        readonly reporterServerUrl: string,
        readonly fetch: typeof globalThis.fetch,
        readonly reporterId: number,
    ) {}

    async complete(data: TestCompleteData): Promise<void> {
        await this.send({reporterId: this.reporterId, type: 'complete', data})
    }

    async error(data: TestErrorData): Promise<void> {
        await this.send({reporterId: this.reporterId, type: 'error', data})
    }

    async result(data: TestResultData): Promise<void> {
        await this.send({reporterId: this.reporterId, type: 'result', data})
    }

    async schedule(data: TestScheduleData): Promise<void> {
        await this.send({reporterId: this.reporterId, type: 'schedule', data})
    }

    protected async send(report: HttpReporterReport) {
        return this.fetch(this.reporterServerUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify(report),
        })
    }
}

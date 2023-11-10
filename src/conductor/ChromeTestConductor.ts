import puppeteer from 'puppeteer-core'
import { TestConductor } from './TestConductor'
import { makeId } from '../util/id'
import { HttpReporterServer } from './HttpReporterServer'
import { TestReporter } from './TestReporter'
import { ErrorStackResolver } from './ErrorStackResolver'

export class ChromeTestConductor extends TestConductor {
    constructor(
        public readonly testRunnerModule: string,
        title?: string,
        setupFiles: URL[] = [],
        coverageVar = '__coverage__',
        errorStackResolver = new ErrorStackResolver([]),
    ) {
        super(title, setupFiles, coverageVar)

        this.reporterServer = new HttpReporterServer(errorStackResolver)
    }

    readonly reporterServer: HttpReporterServer
    readonly browser = puppeteer.launch({
        dumpio: true,
        executablePath: '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-gpu',
            '--headless',
        ],
    })

    async close(): Promise<void> {
        await Promise.all([
            this.reporterServer.close(),
            (await this.browser).close(),
        ])
    }

    async runTestSuite(
        reporter: TestReporter,
        suiteUrl: string,
        filter?: RegExp,
    ) {
        const page = await (await this.browser).newPage()
        page.setDefaultNavigationTimeout(600000)

        const callbackId = makeId(6)

        const donePromise = new Promise((res, rej) => {
            void page.exposeFunction(`__${callbackId}-resolve`, res)
            void page.exposeFunction(`__${callbackId}-reject`, rej)
        })

        page.on('console', m => console.log(m.type(), m.text()))

        const reporterId = this.reporterServer.registerReporter(reporter)

        const childCode = `
import { TestRunner, HttpReporterClient } from "${this.testRunnerModule}"

const fetch = window.fetch.bind(window)
const setTimeout = window.setTimeout.bind(window)

await ((async () => {
    await new TestRunner(
        new HttpReporterClient(
            ${JSON.stringify(await this.reporterServer.url)},
            fetch,
            ${JSON.stringify(reporterId)},
        ),
        setTimeout,
    ).run(
        ${JSON.stringify(this.setupFiles)},
        ${JSON.stringify(suiteUrl)},
        ${filter ? `new RegExp(${JSON.stringify(filter.source)}, ${JSON.stringify(filter.flags)})` : JSON.stringify(undefined)},
        ${JSON.stringify(this.coverageVar)},
    )
})()).then(
    r => window['__${callbackId}-resolve'](String(r)),
    r => window['__${callbackId}-reject'](r instanceof Error ? r.stack : String(r)),
)
        `

        await page.setContent(`<html><head><script type="module">${childCode}</script>`)

        await donePromise

        await page.close()
    }
}

import puppeteer from 'puppeteer-core'
import { TestConductor } from './TestConductor'
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
        readonly browser = puppeteer.launch({
            executablePath: '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-gpu',
            ],
        }),
    ) {
        super(title, setupFiles, coverageVar)

        this.reporterServer = new HttpReporterServer(errorStackResolver)
    }

    readonly reporterServer: HttpReporterServer

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

        const callbackPrefix = '__CHROMETESTCONDUCTOR_CALLBACK_'

        const donePromise = new Promise((res, rej) => {
            void page.exposeFunction(`${callbackPrefix}-resolve`, res)
            void page.exposeFunction(`${callbackPrefix}-reject`, rej)
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
    r => window['${callbackPrefix}-resolve'](String(r)),
    r => window['${callbackPrefix}-reject'](r instanceof Error ? r.stack : String(r)),
)
        `

        await page.setContent(`<html><head><script type="module">${childCode}</script>`)

        await donePromise

        await page.close()
    }
}

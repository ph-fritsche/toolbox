import puppeteer from 'puppeteer-core'
import { makeId } from '../test/Entity'
import { TestConductor } from './TestConductor'

export class ChromeTestConductor extends TestConductor {
    static readonly supportedFilesProtocols: string[] = ['http:']

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
        return (await this.browser).close()
    }

    protected async runTestSuite(
        runId: string,
        testFile: string,
        id: string,
        name: string,
    ) {
        const page = await (await this.browser).newPage()
        page.setDefaultNavigationTimeout(600000)

        const callbackId = makeId(6)

        const donePromise = new Promise((res, rej) => {
            void page.exposeFunction(`__${callbackId}-resolve`, res)
            void page.exposeFunction(`__${callbackId}-reject`, rej)
        })

        page.on('console', m => console.log(m.type(), m.text()))

        const childCode = `
import { setTestContext, TestGroup, TestRunner } from "${this.testRunnerModule}"

const fetch = window.fetch.bind(window)
const setTimeout = window.setTimeout.bind(window)

await ((async () => {
    const execModule = async (moduleId) => {
        const defaultExport = await import(moduleId)
        if (typeof defaultExport === 'function') {
            await defaultExport()
        }
    }

    const suite = new TestGroup(${JSON.stringify({ id, title: name })})
    setTestContext(globalThis, suite)

    ${this.setupFiles.map(f => `await execModule(${JSON.stringify(f)})`).join(';')}

    await execModule(${JSON.stringify(testFile)})

    const runner = new TestRunner(${JSON.stringify(await this.reporterServer.url)}, fetch, setTimeout)
    await runner.run(${JSON.stringify(runId)}, suite)
})()).then(
    r => window['__${callbackId}-resolve'](String(r)),
    r => window['__${callbackId}-reject'](r instanceof Error ? r.stack : String(r)),
)
        `

        await page.setContent(`<html><head><script type="module">${childCode}</script>`)

        await donePromise
    }
}

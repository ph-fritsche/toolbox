import { FileProvider } from '#src/server/FileProvider'
import { HttpFileServer } from '#src/server/HttpFileServer'
import { rollup } from 'rollup'
import { afterThis } from '#test/_util'
import { createNodeResolvePlugin, createTsResolvePlugin } from '#src/builder/plugins/resolve'
import { createTransformPlugin } from '#src/builder/plugins/transform'
import { HttpReporterServer } from '#src/conductor/HttpReporterServer'
import { ErrorStackResolver } from '#src/conductor/ErrorStackResolver'
import { createTestRun } from '#src/conductor/TestRun'
import { NodeTestConductor } from '#src/conductor/NodeTestConductor'
import { getTestFunction } from './_helper'

let runnerModule = ''
beforeEach(async () => {
    const build = await rollup({
        input: './src/runner/index.ts',
        plugins: [
            createTsResolvePlugin({}),
            createNodeResolvePlugin(),
            createTransformPlugin({}),
        ],
    })
    const {output} = await build.generate({})
    runnerModule = output[0].code
})

async function setupConductor() {
    const fileServer = new HttpFileServer(
        new FileProvider(import.meta.url, new Map([
            ['runner.js', Promise.resolve({content: runnerModule})],
        ])),
    )
    const reporter = new HttpReporterServer(new ErrorStackResolver([{
        url: String(await fileServer.url),
        origin: fileServer.provider.origin,
        getFile: p => fileServer.provider.getFile(p).then(f => String(f.content)),
    }]))
    const conductor = new NodeTestConductor(`${String(await fileServer.url)}runner.js`)

    afterThis(() => fileServer.close())
    afterThis(() => reporter.close())
    afterThis(() => conductor.close())

    return {
        reporter,
        fileServer,
        conductor,
    }
}

test('conduct test', async () => {
    const { conductor, fileServer } = await setupConductor()
    fileServer.provider.files.set('some/test.js', Promise.resolve({content: `
        test('some test', () => {});
        test('failing test', () => { throw new Error('some error') });
    `}))
    const suiteUrl = String(await fileServer.url) + '/some/test.js'

    const run = createTestRun([conductor], [{url: suiteUrl, title: 'some test'}])
    const suite = run.runs.get(conductor)!.suites.get(suiteUrl)!

    await suite.exec()

    expect(getTestFunction(suite, 1)).toHaveProperty('title', 'some test')
    expect(getTestFunction(suite, 1).result.get()).toHaveProperty('type', 'success')
    expect(getTestFunction(suite, 2)).toHaveProperty('title', 'failing test')
    expect(getTestFunction(suite, 2).result.get()).toHaveProperty('type', 'fail')
})

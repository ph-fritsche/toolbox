import { NodeTestConductor } from '#src/conductor/NodeTestConductor'
import { ReporterServer } from '#src/reporter/ReporterServer'
import { FileProvider } from '#src/server/FileProvider'
import { HttpFileServer } from '#src/server/HttpFileServer'
import { rollup } from 'rollup'
import { afterThis } from '#test/_util'
import { createNodeResolvePlugin, createTsResolvePlugin } from '#src/builder/plugins/resolve'
import { createTransformPlugin } from '#src/builder/plugins/transform'

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
    const reporter = new ReporterServer()
    afterThis(() => reporter.close())
    const fileServer = new HttpFileServer(
        new FileProvider(import.meta.url, new Map([
            ['runner.js', Promise.resolve({content: runnerModule})],
        ])),
    )
    afterThis(() => fileServer.close())
    const conductor = new NodeTestConductor(reporter, `${String(await fileServer.url)}runner.js`)
    afterThis(() => conductor.close())

    return {
        reporter,
        fileServer,
        conductor,
    }
}

test('conduct test', async () => {
    const { conductor, fileServer, reporter } = await setupConductor()
    fileServer.provider.files.set('some/test.js', Promise.resolve({content: `
        test('some test', () => {});
        test('failing test', () => { throw new Error('some error') });
    `}))
    const listener = mock.fn()
    reporter.emitter.addListener('result', listener)

    const {run, exec} = conductor.createTestRun({
        server: await fileServer.url,
        paths: ['some/test.js'],
    })
    await exec()

    expect(Array.from(run.results.values())).toEqual([
        expect.objectContaining({
            status: 'success',
        }),
        expect.objectContaining({
            status: 'fail',
        }),
    ])
})

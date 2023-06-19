import { ServedFiles, TestConductor } from '#src/conductor/TestConductor'
import { ReporterServer } from '#src/reporter/ReporterServer'
import { afterThis } from '#test/_util'
import { promise } from '#src/util/promise'

function setupConductor(setupFiles: ServedFiles[]) {
    const reporterServer = new ReporterServer()
    afterThis(() => reporterServer.close())

    const runTestSuite = mock.fn<(r: string, t: string, i: string, n: string) => Promise<void>>(async () => void 0)
    class DummyTestConductor extends TestConductor {
        protected static supportedFilesProtocols: string[] = ['test:']

        protected readonly runTestSuite = runTestSuite
    }

    const conductor = new DummyTestConductor(
        reporterServer,
        'test://localhost/just/a/dummy',
        'Dummy',
        setupFiles,
    )

    return {
        conductor,
        runTestSuite,
    }
}

test('setup conductor', () => {
    const {conductor } = setupConductor([{
        server: new URL('test://localhost/just/another/dummy/'),
        paths: ['foo/bar.js', 'foo/baz.js'],
    }])

    expect(Reflect.get(conductor, 'setupFiles')).toEqual([
        'test://localhost/just/another/dummy/foo/bar.js',
        'test://localhost/just/another/dummy/foo/baz.js',
    ])

    conductor.setSetupFiles({
        server: new URL('test://localhost/some/other/server/'),
        paths: ['some/file.js'],
    })

    expect(Reflect.get(conductor, 'setupFiles')).toEqual([
        'test://localhost/some/other/server/some/file.js',
    ])
})

test('create test run', async () => {
    const {conductor, runTestSuite} = setupConductor([{
        server: new URL('test://serverA'),
        paths: ['some/env.js'],
    }])

    const {run, exec} = conductor.createTestRun({
        server: new URL('test://serverB'),
        paths: ['some/test/suite.js'],
    })
    expect(run.state).toBe('pending')
    expect(run.groups).toHaveProperty('size', 1)
    expect(run.groups.values().next().value).toHaveProperty('title', 'some/test/suite.js')

    const runImplementation = promise<void>()
    runTestSuite.mockReturnValueOnce(runImplementation.Promise)
    void exec()

    await run.onStart()
    expect(run.state).toBe('running')
    expect(runTestSuite).toHaveBeenCalledWith(
        run.id,
        'test://serverB/some/test/suite.js',
        Array.from(run.groups.keys()).at(0),
        'some/test/suite.js',
    )

    runImplementation.resolve()
    await run.onDone()
    expect(run.state).toBe('done')
})

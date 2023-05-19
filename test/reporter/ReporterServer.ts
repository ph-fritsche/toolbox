import { TestConductor } from '#src/conductor/TestConductor'
import { ReporterEventMap, ReporterServer } from '#src/reporter/ReporterServer'
import { TestGroup as ReporterTestGroup } from '#src/reporter/TestGroup'
import { TestRun } from '#src/reporter/TestRun'
import { ReporterMessageMap } from '#src/reporter/ReporterMessage'
import * as Entity from '#src/test'
import { fn } from 'jest-mock'
import fetch from 'node-fetch'
import { SourceMapGenerator } from 'source-map'
import { FileProvider, HttpFileServer } from '#src/server'
import { afterThis } from '#test/_util'

function setupReporterServer<K extends keyof ReporterEventMap>(
    listen: K,
) {
    const reporter = new ReporterServer()
    const {run} = TestRun.create(new DummyConductor(reporter, 'http://localhost/dummy'))
    reporter.testRuns.set(run.id, run)
    const listener = fn<(e: ReporterEventMap[K]) => void>()
    const sendReport = async (
        message: K extends keyof ReporterMessageMap ? ReporterMessageMap[K] : never,
    ) => fetch(await reporter.url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({...message, type: listen}),
    })
    const fileServer = new HttpFileServer(new FileProvider('/some/local/path'))

    afterThis(() => reporter.close())
    afterThis(() => fileServer.close())

    reporter.emitter.addListener(listen, listener)

    return {
        reporter,
        listener,
        run,
        sendReport,
        fileServer,
    }
}

class DummyConductor extends TestConductor {
    runTestSuite(): Promise<void> {
        return Promise.resolve()
    }
}

class DummyTestGroup extends Entity.TestGroup {
    createTest(title: string) {
        const t = new Entity.Test({title})
        Object.defineProperty(t, 'parent', {
            configurable: true,
            get: () => this,
        })
        this._children.push(t)
    }
}

test('report `start`', async () => {
    const { reporter, listener, run } = setupReporterServer('start')

    await reporter.reportStart(run)

    expect(listener).toHaveBeenCalledWith({
        type: 'start',
        run: run,
    })
})

test('report `done`', async () => {
    const { reporter, listener, run } = setupReporterServer('done')

    await reporter.reportDone(run)

    expect(listener).toHaveBeenCalledWith({
        type: 'done',
        run: run,
    })
})

test('report `error`', async () => {
    const { reporter, listener, run } = setupReporterServer('error')

    const group = new ReporterTestGroup({title: 'some group'})
    run.groups.set(group.id, group)
    const error = new Error()

    await reporter.reportError(run, group.id, error)

    expect(listener).toHaveBeenCalledWith({
        type: 'error',
        run: run,
        group: group,
        error,
    })
})

test('receive `schedule`', async () => {
    const { listener, run, sendReport } = setupReporterServer('schedule')

    const group = new DummyTestGroup({title: 'some group'})
    group.createTest('some child')
    group.createTest('other child')

    await sendReport({
        runId: run.id,
        group: group,
    })

    expect(listener).toHaveBeenCalledWith({
        type: 'schedule',
        run: run,
        group: expect.objectContaining({
            id: group.id,
            children: [
                expect.objectContaining({
                    id: group.children[0].id,
                    title: 'some child',
                }),
                expect.objectContaining({
                    id: group.children[1].id,
                    title: 'other child',
                }),
            ],
        }),
    })
    expect(run.groups.get(group.id)).toEqual(expect.objectContaining({
        id: group.id,
    }))
    expect(run.tests.get(group.children[0].id)).toEqual(expect.objectContaining({
        id: group.children[0].id,
        title: 'some child',
    }))
})

test('receive `result`', async () => {
    const { listener, run, sendReport } = setupReporterServer('result')

    const test = new Entity.Test({title: 'some test'})

    await sendReport({
        runId: run.id,
        testId: test.id,
        result: new Entity.TestResult({status: 'success'}),
    })

    expect(listener).toHaveBeenCalledWith({
        type: 'result',
        run,
        testId: test.id,
        result: expect.objectContaining({
            status: 'success',
        }),
    })
})

test('receive `error`', async () => {
    const { reporter, listener, run, sendReport, fileServer } = setupReporterServer('error')

    const group = new ReporterTestGroup({title: 'some group'})
    run.groups.set(group.id, group)

    const sourceMap = new SourceMapGenerator({file: 'some/file.js', skipValidation: true})
    sourceMap.addMapping({
        source: 'some/file.ts',
        name: 'some/file.js',
        generated: {line: 5, column: 10},
        original: {line: 50, column: 60},
    })
    sourceMap.addMapping({
        source: 'some/file.ts',
        name: 'some/file.js',
        generated: {line: 20, column: 30},
        original: {line: 1, column: 2},
    })
    fileServer.provider.files.set('some/file.js', Promise.resolve({
        content: `foo bar\n\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${Buffer.from(String(sourceMap)).toString('base64')}`,
    }))
    await reporter.registerFileServer(fileServer)
    const fileServerUrl = String(await fileServer.url)

    await sendReport({
        runId: run.id,
        groupId: group.id,
        hook: 'some hook',
        error: new Entity.TestError({
            message: 'some error',
            name: 'Error',
            stack: [
                `Error: some error`,
                `    at some.function (${fileServerUrl}/some/file.js:5:10)`,
                `    at other.function (${fileServerUrl}/some/file.js:20:30)`,
                `    at unmapped.function (${fileServerUrl}/some/file.js:200:300)`,
                `    at unmapped.location (http://example.com/some/file.js:5:10)`,
                // TODO: guard against missing files / failing requests
                // `    at unmapped.file (${fileServerUrl}/unmapped/file.js:200:300)`,
            ].join('\n'),
        }),
    })

    expect(listener).toHaveBeenCalledWith({
        type: 'error',
        run,
        group: group,
        error: expect.objectContaining({
            message: 'some error',
            name: 'Error',
            hook: 'some hook',
            group: group,
        }),
    })
    expect(listener.mock.calls[0][0].error.stack).toMatchInlineSnapshot(`
Error: some error
    at some.function (/some/local/path/some/file.ts:50:60)
    at other.function (/some/local/path/some/file.ts:1:2)
    at unmapped.function (/some/local/path/some/file.js:200:300)
    at unmapped.location (http://example.com/some/file.js:5:10)
`)
})

test('receive `complete`', async () => {
    const { listener, run, sendReport } = setupReporterServer('complete')

    const group = new ReporterTestGroup({title: 'some group'})
    run.groups.set(group.id, group)

    await sendReport({
        runId: run.id,
        groupId: group.id,
        coverage: {},
    })

    expect(listener).toHaveBeenCalledWith({
        type: 'complete',
        run,
        group: group,
        coverage: {},
    })
})

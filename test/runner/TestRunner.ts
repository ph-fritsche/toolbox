import { TestContext } from '#src'
import { Loader, Reporter, TestRunner } from '#src/runner'

function setupTestRunner(
    moduleMocks: {[k: string]: () => void|Promise<void>},
) {
    const context = {} as TestContext
    const setTimeout = (f: () => void, t?: number) => globalThis.setTimeout(f, t) as unknown as number
    const reports: Array<{type: keyof Reporter, data: unknown}> = []
    const normalizeData = (d: unknown) => JSON.parse(JSON.stringify(d)) as unknown
    const reporter = {
        schedule: mock.fn<Reporter['schedule']>(async data => void reports.push({type: 'schedule', data: normalizeData(data)})),
        error: mock.fn<Reporter['error']>(async data => void reports.push({type: 'error', data: normalizeData(data)})),
        result: mock.fn<Reporter['result']>(async data => void reports.push({type: 'result', data: normalizeData(data)})),
        complete: mock.fn<Reporter['complete']>(async data => void reports.push({type: 'complete', data: normalizeData(data)})),
    }
    const loader = mock.fn<Loader>(async url => {
        if (url in moduleMocks) {
            return moduleMocks[url]()
        } else {
            throw new Error('Module not found')
        }
    })
    const runner = new TestRunner(reporter, setTimeout, context, loader)

    return {
        runner,
        reporter,
        loader,
        context,
        reports,
        getReports: (type: keyof Reporter) => reports.filter(r => r.type === type).map(r => r.data),
    }
}

test('run tests', async () => {
    const callback = mock.fn<(x: unknown) => void>()
    const {context, runner, reports} = setupTestRunner({
        'test://foo.js': () => {
            context.test('some test', () => callback('a'))
            context.test('other test', () => callback('b'))
        },
    })

    await runner.run([], 'test://foo.js')

    expect(callback).toHaveBeenNthCalledWith(1, 'a')
    expect(callback).toHaveBeenNthCalledWith(2, 'b')
    expect(reports).toEqual([
        {type: 'schedule', data: {
            nodes: [
                {id: 1, title: 'some test'},
                {id: 2, title: 'other test'},
            ],
        }},
        {type: 'result', data: {
            nodeId: 1,
            type: 'success',
            duration: expect.any(Number),
        }},
        {type: 'result', data: {
            nodeId: 2,
            type: 'success',
            duration: expect.any(Number),
        }},
        {type: 'complete', data: {
            coverage: {},
        }},
    ])
})

test('run grouped tests', async () => {
    const {context, runner, reports} = setupTestRunner({
        'test://foo.js': () => {
            context.describe('some group', () => {
                context.test('nested test', () => void 0)
                context.test('another nested test', () => void 0)
            })
        },
    })

    await runner.run([], 'test://foo.js')

    expect(reports).toEqual([
        {type: 'schedule', data: {
            nodes: [
                {id: 1, title: 'some group', children: [
                    {id: 2, title: 'nested test'},
                    {id: 3, title: 'another nested test'},
                ]},
            ],
        }},
        {type: 'result', data: {
            nodeId: 2,
            type: 'success',
            duration: expect.any(Number),
        }},
        {type: 'result', data: {
            nodeId: 3,
            type: 'success',
            duration: expect.any(Number),
        }},
        {type: 'complete', data: {
            coverage: {},
        }},
    ])
})

test('report failing test', async () => {
    const {context, runner, getReports} = setupTestRunner({
        'test://foo.js': () => {
            context.test('failing test', () => { throw new Error('some error') })
            context.test('following test', () => void 0)
        },
    })

    await runner.run([], 'test://foo.js')

    expect(getReports('result')).toEqual([
        { nodeId: 1, type: 'fail', duration: expect.any(Number), error: expect.objectContaining({message: 'some error'})},
        { nodeId: 2, type: 'success', duration: expect.any(Number)},
    ])
})

test('report test timeout', async () => {
    const {context, runner, getReports} = setupTestRunner({
        'test://foo.js': () => {
            context.test('timeout test', async () => {
                await new Promise(r => setTimeout(r))
            }, 0)
            context.test('following test', () => void 0)
        },
    })

    await runner.run([], 'test://foo.js')

    expect(getReports('result')).toEqual([
        { nodeId: 1, type: 'timeout', duration: expect.any(Number), error: expect.objectContaining({message: expect.stringMatching('timed out after')})},
        { nodeId: 2, type: 'success', duration: expect.any(Number)},
    ])
})

test('skip test', async () => {
    const {context, runner, getReports} = setupTestRunner({
        'test://foo.js': () => {
            context.test('skipped test', () => void 0)
            context.test('following test', () => void 0)
        },
    })

    await runner.run([], 'test://foo.js', /^(?!skipped)/)

    expect(getReports('result')).toEqual([
        { nodeId: 1, type: 'skipped'},
        { nodeId: 2, type: 'success', duration: expect.any(Number)},
    ])
})

test('run hooks', async () => {
    const log: string[] = []
    const {context, runner} = setupTestRunner({
        'test://foo.js': () => {
            context.beforeAll(() => {
                log.push('beforeAll-suite-1')
                return () => void log.push('return of beforeAll-suite-1')
            })
            context.beforeAll(() => {
                log.push('beforeAll-suite-2')
                return () => void log.push('return of beforeAll-suite-2')
            })
            context.beforeEach(() => {
                log.push('beforeEach-suite-1')
                return () => void log.push('return of beforeEach-suite-1')
            })
            context.beforeEach(() => {
                log.push('beforeEach-suite-2')
                return () => void log.push('return of beforeEach-suite-2')
            })
            context.afterAll(() => void log.push('afterAll-suite-1'))
            context.afterAll(() => void log.push('afterAll-suite-2'))
            context.afterEach(() => void log.push('afterEach-suite-1'))
            context.afterEach(() => void log.push('afterEach-suite-2'))
            context.test('testX', () => void log.push('TEST X'))
            context.describe('groupA', () => {
                context.beforeAll(() => {
                    log.push('beforeAll-groupA-1')
                    return () => void log.push('return of beforeAll-groupA-1')
                })
                context.beforeEach(() => {
                    log.push('beforeEach-groupA-1')
                    return () => void log.push('return of beforeEach-groupA-1')
                })
                context.afterAll(() => void log.push('afterAll-groupA-1'))
                context.afterEach(() => void log.push('afterEach-groupA-1'))
                context.test('testY1', () => void log.push('TEST Y1'))
                context.test('testY2', () => void log.push('TEST Y2'))
            })
        },
    })

    await runner.run([], 'test://foo.js')

    // TODO: revert order of after* callbacks which are nested or returned from before*
    expect(log).toEqual([
        'beforeAll-suite-1',
        'beforeAll-suite-2',
        'beforeEach-suite-1',
        'beforeEach-suite-2',
        'TEST X',
        'return of beforeEach-suite-2',
        'return of beforeEach-suite-1',
        'afterEach-suite-1',
        'afterEach-suite-2',
        'beforeAll-groupA-1',
        'beforeEach-suite-1',
        'beforeEach-suite-2',
        'beforeEach-groupA-1',
        'TEST Y1',
        'return of beforeEach-groupA-1',
        'afterEach-groupA-1',
        'return of beforeEach-suite-2',
        'return of beforeEach-suite-1',
        'afterEach-suite-1',
        'afterEach-suite-2',
        'beforeEach-suite-1',
        'beforeEach-suite-2',
        'beforeEach-groupA-1',
        'TEST Y2',
        'return of beforeEach-groupA-1',
        'afterEach-groupA-1',
        'return of beforeEach-suite-2',
        'return of beforeEach-suite-1',
        'afterEach-suite-1',
        'afterEach-suite-2',
        'return of beforeAll-groupA-1',
        'afterAll-groupA-1',
        'return of beforeAll-suite-2',
        'return of beforeAll-suite-1',
        'afterAll-suite-1',
        'afterAll-suite-2',
    ])
})

test('report errors in hooks', async () => {
    const {context, runner, getReports} = setupTestRunner({
        'test://foo.js': () => {
            context.beforeAll(function X() { throw 'suite-a' })
            context.beforeEach(() => { throw 'suite-b' })
            context.beforeEach(() => () => { throw 'suite-c' })
            context.describe('', () => {
                context.beforeAll(function X() { throw 'group-a' })
                context.beforeEach(() => { throw 'group-b' })
                context.beforeEach(() => () => { throw 'group-c' })
                context.beforeEach(() => { throw 'group-d' })
                context.afterEach(function Y() { throw 'group-e' })
                context.afterAll(() => { throw 'group-f' })
                context.test('', () => void 0)
            })
        },
    })

    await runner.run([], 'test://foo.js')

    expect(getReports('error')).toEqual([
        {error: 'suite-a', hook: {type: 'beforeAll', index: 0, name: 'X'}},
        {nodeId: 1, error: 'group-a', hook: {type: 'beforeAll', index: 0, name: 'X'}},
        {error: 'suite-b', hook: {type: 'beforeEach', index: 0, name: ''}},
        {nodeId: 1, error: 'group-b', hook: {type: 'beforeEach', index: 0, name: ''}},
        {nodeId: 1, error: 'group-d', hook: {type: 'beforeEach', index: 2, name: ''}},
        {nodeId: 1, error: 'group-c', hook: {type: 'beforeEach', index: 1, name: '', cleanup: true}},
        {nodeId: 1, error: 'group-e', hook: {type: 'afterEach', index: 0, name: 'Y'}},
        {error: 'suite-c', hook: {type: 'beforeEach', index: 1, name: '', cleanup: true}},
        {nodeId: 1, error: 'group-f', hook: {type: 'afterAll', index: 0, name: ''}},
    ])
})

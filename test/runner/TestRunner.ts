import { TestContext } from '#src'
import { setTestContext, TestGroup, TestRunner } from '#src/runner'
import { vi } from 'vitest'

function setupTestRunner() {
    const context = {} as TestContext
    const main = new TestGroup({title: '#test'})
    const reports: unknown[] = []
    const setTimeout = (f: () => void, t?: number) => globalThis.setTimeout(f, t) as unknown as number
    const runner = new TestRunner(
        'reporter',
        (url, init) => {
            if (init?.body) {
                reports.push(JSON.parse(init.body.toString()))
            }
            return Promise.resolve(new Response())
        },
        setTimeout,
    )

    setTestContext(context, main)

    return {
        context,
        main,
        runner,
        reports,
    }
}

test('run tests', async () => {
    const {context, main, runner, reports} = setupTestRunner()
    const callback = vi.fn<[string], void>()

    context.test('some test', () => callback('a'))
    context.test('other test', () => callback('b'))

    await runner.run('runXYZ', main)

    expect(callback).toHaveBeenNthCalledWith(1, 'a')
    expect(callback).toHaveBeenNthCalledWith(2, 'b')

    expect(reports).toContainEqual(expect.objectContaining({
        runId: 'runXYZ',
        type: 'schedule',
        group: JSON.parse(JSON.stringify(main)),
    }))
    expect(reports).toContainEqual(expect.objectContaining({
        runId: 'runXYZ',
        type: 'result',
        testId: main.children[0].id,
        result: {
            __T: 'TestResult',
            status: 'success',
            duration: expect.any(Number),
        },
    }))
    expect(reports).toContainEqual(expect.objectContaining({
        runId: 'runXYZ',
        type: 'result',
        testId: main.children[1].id,
        result: {
            __T: 'TestResult',
            status: 'success',
            duration: expect.any(Number),
        },
    }))
    expect(reports).toContainEqual(expect.objectContaining({
        runId: 'runXYZ',
        type: 'complete',
        groupId: main.id,
    }))
})

test('report failing test', async () => {
    const {context, main, runner, reports} = setupTestRunner()

    context.test('failing test', () => { throw new Error('some error') })
    context.test('following test', () => void 0)

    await runner.run('runXYZ', main)

    expect(reports).toContainEqual(expect.objectContaining({
        runId: 'runXYZ',
        type: 'result',
        testId: main.children[0].id,
        result: {
            __T: 'TestResult',
            status: 'fail',
            duration: expect.any(Number),
            error: expect.objectContaining({message: 'some error'}),
        },
    }))
    expect(reports).toContainEqual(expect.objectContaining({
        type: 'result',
        testId: main.children[1].id,
    }))
})

test('report test timeout', async () => {
    const {context, main, runner, reports} = setupTestRunner()

    context.test('timeout test', async () => {
        await new Promise(r => setTimeout(r))
    }, 0)
    context.test('following test', () => void 0)

    await runner.run('runXYZ', main)

    expect(reports).toContainEqual(expect.objectContaining({
        runId: 'runXYZ',
        type: 'result',
        testId: main.children[0].id,
        result: {
            __T: 'TestResult',
            status: 'timeout',
            duration: expect.any(Number),
            error: expect.objectContaining({message: expect.stringContaining('timed out after 0ms')}),
        },
    }))
    expect(reports).toContainEqual(expect.objectContaining({
        type: 'result',
        testId: main.children[1].id,
    }))
})

test('skip test', async () => {
    const {context, main, runner, reports} = setupTestRunner()

    context.test('skipped test', () => void 0)
    context.test('following test', () => void 0)

    await runner.run('runXYZ', main, (i) => !i.title.includes('skip'))

    expect(reports).toContainEqual(expect.objectContaining({
        runId: 'runXYZ',
        type: 'result',
        testId: main.children[0].id,
        result: {
            __T: 'TestResult',
            status: 'skipped',
        },
    }))
    expect(reports).toContainEqual(expect.objectContaining({
        type: 'result',
        testId: main.children[1].id,
    }))
})

test('run hooks', async () => {
    const {context, main, runner} = setupTestRunner()
    const log: string[] = []

    context.beforeAll(() => {
        log.push('beforeAll-A')
        return () => void log.push('return of beforeAll-A')
    })
    context.beforeAll(() => {
        log.push('beforeAll-B')
        return () => void log.push('return of beforeAll-B')
    })
    context.beforeEach(() => {
        log.push('beforeEach-A')
        return () => void log.push('return of beforeEach-A')
    })
    context.beforeEach(() => {
        log.push('beforeEach-B')
        return () => void log.push('return of beforeEach-B')
    })
    context.afterAll(() => void log.push('afterAll-A'))
    context.afterAll(() => void log.push('afterAll-B'))
    context.afterEach(() => void log.push('afterEach-A'))
    context.afterEach(() => void log.push('afterEach-B'))
    context.test('', () => void log.push('TEST X'))
    context.describe('', () => {
        context.beforeAll(() => {
            log.push('beforeAll-C')
            return () => void log.push('return of beforeAll-C')
        })
        context.beforeEach(() => {
            log.push('beforeEach-C')
            return () => void log.push('return of beforeEach-C')
        })
        context.afterAll(() => void log.push('afterAll-C'))
        context.afterEach(() => void log.push('afterEach-C'))
        context.test('', () => void log.push('TEST Y1'))
        context.test('', () => void log.push('TEST Y2'))
    })

    await runner.run('runXYZ', main)

    // TODO: revert order of after* callbacks which are nested or returned from before*
    expect(log).toMatchInlineSnapshot(`
      [
        beforeAll-A,
        beforeAll-B,
        beforeEach-A,
        beforeEach-B,
        TEST X,
        afterEach-A,
        afterEach-B,
        return of beforeEach-A,
        return of beforeEach-B,
        beforeAll-C,
        beforeEach-A,
        beforeEach-B,
        beforeEach-C,
        TEST Y1,
        afterEach-A,
        afterEach-B,
        return of beforeEach-A,
        return of beforeEach-B,
        afterEach-C,
        return of beforeEach-C,
        beforeEach-A,
        beforeEach-B,
        beforeEach-C,
        TEST Y2,
        afterEach-A,
        afterEach-B,
        return of beforeEach-A,
        return of beforeEach-B,
        afterEach-C,
        return of beforeEach-C,
        afterAll-C,
        return of beforeAll-C,
        afterAll-A,
        afterAll-B,
        return of beforeAll-A,
        return of beforeAll-B,
      ]
    `)
})

test('report errors in hooks', async () => {
    const {context, main, runner, reports} = setupTestRunner()

    context.beforeAll(function X() { throw new Error('a') })
    context.beforeEach(() => { throw new Error('b') })
    context.beforeEach(() => () => { throw new Error('c') })
    context.afterEach(function Y() { throw new Error('d') })
    context.afterAll(() => { throw new Error('e') })
    context.test('', () => void 0)

    await runner.run('runXYZ', main)

    // TODO: harmonize hook descriptors
    expect(reports).toContainEqual(expect.objectContaining({
        runId: 'runXYZ',
        type: 'error',
        groupId: main.id,
        hook: 'beforeAll (X)',
        error: expect.objectContaining({message: 'a'}),
    }))
    expect(reports).toContainEqual(expect.objectContaining({
        runId: 'runXYZ',
        type: 'error',
        groupId: main.id,
        hook: 'beforeEach ()',
        error: expect.objectContaining({message: 'b'}),
    }))
    expect(reports).toContainEqual(expect.objectContaining({
        runId: 'runXYZ',
        type: 'error',
        groupId: main.id,
        hook: 'afterEach:anonymous (per beforeEach:anonymous)',
        error: expect.objectContaining({message: 'c'}),
    }))
    expect(reports).toContainEqual(expect.objectContaining({
        runId: 'runXYZ',
        type: 'error',
        groupId: main.id,
        hook: 'afterEach:Y',
        error: expect.objectContaining({message: 'd'}),
    }))
    expect(reports).toContainEqual(expect.objectContaining({
        runId: 'runXYZ',
        type: 'error',
        groupId: main.id,
        hook: 'afterAll:anonymous',
        error: expect.objectContaining({message: 'e'}),
    }))
})

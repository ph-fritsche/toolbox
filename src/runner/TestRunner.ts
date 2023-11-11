import { CoverageMapData } from 'istanbul-lib-coverage'
import { TestNodeFilterIterator } from './TestNodeFilterIterator'
import { AfterCallback, BeforeCallback, TestFunction, TestGroup, TestSuite } from './TestNode'
import { TestError, TestResult, TimeoutError } from './TestResult'
import { Loader } from './Loader'
import { setTestContext } from './TestContext'
import { TestCompleteData, TestErrorData, TestHookData, TestResultData, TestScheduleData } from '../conductor/TestReporter'
import { TestHookType } from '../conductor/TestRun'

export interface Loader {
    (url: string): Promise<void>
}

export interface Reporter {
    schedule(data: TestScheduleData): Promise<void>
    error(data: TestErrorData): Promise<void>
    result(data: TestResultData): Promise<void>
    complete(data: TestCompleteData): Promise<void>
}

export class TestRunner {
    constructor(
        readonly reporter: Reporter,
        public setTimeout: (callback: () => void, ms?: number) => number = globalThis.setTimeout,
        readonly context: object = globalThis,
        readonly loader: Loader = Loader,
        readonly clock = () => performance.now(),
    ) {}

    async run(
        setupFiles: string[],
        testFile: string,
        filter?: RegExp,
        coverageVar = '__coverage__',
    ) {
        const suite = new TestSuite()
        setTestContext(this.context, suite)

        for (const f of setupFiles) {
            await this.loader(f)
        }

        try {
            await this.loader(testFile)
        } catch (e) {
            await this.reporter.error({error: this.normalizeError(e)})
            throw e
        }

        await this.reporter.schedule({nodes: suite.children})

        const results: Array<Promise<void>> = []
        for await (const result of this.execTestsIterator(new TestNodeFilterIterator(suite, filter && (t => filter.test(t.title))))) {
            results.push(this.reporter.result(result))
        }
        await Promise.allSettled(results)

        await this.reporter.complete({
            coverage: ((globalThis as {[k: string]: unknown})[coverageVar] as CoverageMapData|undefined) ?? {},
        })
    }

    protected async *execTestsIterator(
        iterator: TestNodeFilterIterator,
    ): AsyncGenerator<TestResult> {
        if ('children' in iterator.element) {
            const group = iterator.element
            const afterAll: Array<[AfterCallback, TestHookData]> = []
            if (iterator.include) {
                for (const [index, fn] of iterator.element.beforeAll.entries()) {
                    const ret = await this.runHook(group, fn, {type: TestHookType.beforeAll, index, name: fn.name})
                    if (typeof ret === 'function') {
                        afterAll.push([ret, {type: TestHookType.beforeAll, index, name: fn.name, cleanup: true}])
                    }
                }
            }
            afterAll.reverse()

            for (const i of iterator) {
                yield* this.execTestsIterator(i)
            }

            if (iterator.include) {
                for (const [fn, hook] of afterAll) {
                    await this.runHook(group, fn, hook)
                }
                for (const [index, fn] of iterator.element.afterAll.entries()) {
                    await this.runHook(group, fn, {type: TestHookType.afterAll, index, name: fn.name})
                }
            }
        } else if (iterator.include) {
            const tree: (TestSuite|TestGroup)[] = []
            for (
                let el: TestSuite|TestGroup|undefined = iterator.element.parent;
                el;
                el = 'parent' in el ? el.parent : undefined
            ) {
                tree.push(el)
            }
            const afterEachMap = new Map<TestSuite|TestGroup, Array<[AfterCallback, TestHookData]>>()
            for (let i = tree.length - 1; i >= 0; i--) {
                const group = tree[i]
                const afterEach: Array<[AfterCallback, TestHookData]> = []
                for (const [index, fn] of group.beforeEach.entries()) {
                    const ret = await this.runHook(group, fn, {type: TestHookType.beforeEach, index, name: fn.name})
                    if (typeof ret === 'function') {
                        afterEach.push([ret, {type: TestHookType.beforeEach, index, name: fn.name, cleanup: true}])
                    }
                }
                if (afterEach.length) {
                    afterEachMap.set(group, afterEach.reverse())
                }
            }

            yield await this.execTest(iterator.element)

            for (const group of tree) {
                for (const [fn, hook] of afterEachMap.get(group) ?? []) {
                    await this.runHook(group, fn, hook)
                }
                for (const [index, fn] of group.afterEach.entries()) {
                    await this.runHook(group, fn, {type: TestHookType.afterEach, index, name: fn.name})
                }
            }
        } else {
            yield new TestResult(iterator.element)
        }
    }

    protected async runHook(
        group: TestSuite|TestGroup,
        fn: BeforeCallback|AfterCallback,
        hook: TestHookData,
    ) {
        try {
            return await fn.apply(group)
        } catch (e) {
            await this.reporter.error({
                nodeId: group instanceof TestSuite ? undefined : group.id,
                hook,
                error: this.normalizeError(e),
            })
        }
    }

    protected async execTest(test: TestFunction) {
        const timeout = test.timeout ?? 5000
        const t0 = this.clock()
        let timer: number|undefined
        let reject: () => void = () => void 0
        try {
            await Promise.race([
                new Promise((res, rej) => {
                    timer = this.setTimeout(() => rej(
                        new TimeoutError(`Test "${test.title}" timed out after ${timeout}ms.`),
                    ), timeout)
                }),
                test.callback.call(test),
            ])
            const duration = this.clock() - t0
            return new TestResult(test, undefined, duration)
        } catch (e) {
            const duration = this.clock() - t0
            return new TestResult(test, this.normalizeError(e), duration)
        } finally {
            reject()
            clearTimeout(timer)
        }
    }

    protected normalizeError(e: unknown): Error|string {
        return e instanceof TestError ? e
            : e instanceof Error ? TestError.fromError(e)
                : String(e)
    }
}

import { ReporterMessageMap } from '../reporter/ReporterMessage'
import { FilterIterator } from '../test/FilterIterator'
import { TreeIterator } from '../test/TreeIterator'
import { Test } from './Test'
import { TestError } from './TestError'
import { BeforeCallbackReturn, TestGroup } from './TestGroup'
import { TestResult, TimeoutError } from './TestResult'
import { CoverageMapData } from 'istanbul-lib-coverage'

type RunnerMessageMap = ReporterMessageMap<TestGroup, TestResult, TestError>

type fetchApi = typeof globalThis.fetch

declare global {
    var __coverage__: CoverageMapData|undefined
}

export class TestRunner {
    constructor(
        public reporterUrl: URL|string,
        protected fetch: fetchApi,
        protected setTimeout: (callback: () => void, ms?: number) => number,
    ) {}

    async run(
        runId: string,
        group: TestGroup,
        filter?: (item: TestGroup | Test) => boolean,
    ) {
        await this.report('schedule', {runId, group})

        for await (const result of this.execTestsIterator(runId, new FilterIterator(group, filter))) {
            await this.report('result', {
                runId,
                testId: result.test.id,
                result,
            })
        }

        await this.report('complete', {
            runId,
            groupId: group.id,
            coverage: globalThis.__coverage__ ?? {},
        })
    }

    protected async *execTestsIterator<T extends TestGroup|Test>(
        runId: string,
        iterator: FilterIterator<T>,
    ): AsyncGenerator<TestResult> {
        if ('children' in iterator.element) {
            let beforeAllResult: Awaited<ReturnType<TestGroup['runBefore']>>|undefined
            if (iterator.include) {
                beforeAllResult = await iterator.element.runBeforeAll()
                await this.reportErrors(runId, beforeAllResult.errors)
            }

            for (const i of iterator) {
                yield* this.execTestsIterator(runId, i)
            }

            if (beforeAllResult) {
                const afterAllResult = await iterator.element.runAfterAll(beforeAllResult.after)
                await this.reportErrors(runId, afterAllResult.errors)
            }
        } else if (iterator.include) {
            const ancestors = Array.from(new TreeIterator(iterator.element).getAncestors())
            const afterEach = new Map<TestGroup, BeforeCallbackReturn[]>()
            for (const p of ancestors.reverse()) {
                const beforeEachResult = await p.runBeforeEach(iterator.element)
                await this.reportErrors(runId, beforeEachResult.errors)
                afterEach.set(p, beforeEachResult.after)
            }

            yield await this.execTest(iterator.element)

            for (const p of ancestors) {
                const afterEachResult = await p.runAfterEach(iterator.element, afterEach.get(p) as BeforeCallbackReturn[])
                await this.reportErrors(runId, afterEachResult.errors)
            }
        } else {
            yield new TestResult(iterator.element)
        }
    }

    protected async execTest(test: Test) {
        const timeout = test.timeout ?? 5000
        const t0 = performance.now()
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
            const duration = performance.now() - t0
            return new TestResult(test, {duration})
        } catch (error) {
            const duration = performance.now() - t0
            return new TestResult(test, {
                duration,
                error: error as Error,
            })
        } finally {
            reject()
            clearTimeout(timer)
        }
    }

    protected async report<K extends keyof RunnerMessageMap>(type: K, data: RunnerMessageMap[K]) {
        return this.fetch(this.reporterUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                type,
                ...data,
            }),
        })
    }

    protected async reportErrors(runId: string, errors: TestError[]) {
        return Promise.allSettled(errors.map(e => this.report('error', {
            runId,
            groupId: e.context.id,
            testId: e.test?.id,
            hook: e.hook,
            error: e,
        })))
    }
}

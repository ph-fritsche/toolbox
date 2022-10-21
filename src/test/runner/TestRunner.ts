import { TestConductorEventMap } from '../TestConductor'
import { TestsIteratorGroupNode, TestsIteratorNode } from '../TestGroup'
import { Test } from './Test'
import { TestError } from './TestError'
import { BeforeCallbackReturn, TestGroup } from './TestGroup'
import { TestResult, TimeoutError } from './TestResult'

type fetchApi = typeof globalThis.fetch

export class TestRunner {
    constructor(
        public reporterUrl: URL|string,
        protected fetch: fetchApi,
    ) {}

    async run(
        runId: string,
        group: TestGroup,
        filter?: (item: TestGroup | Test) => boolean,
    ) {
        await this.report('schedule', {runId, group})

        const tests = group.getTestsIteratorIterator(filter)

        for await (const result of this.execTestsIterator(runId, tests, [])) {
            await this.report('result', {
                runId,
                testId: result.test.id,
                result,
            })
        }
    }

    protected async *execTestsIterator(
        runId: string,
        node: TestsIteratorGroupNode<TestGroup>,
        parents: TestGroup[] = [],
    ): AsyncGenerator<TestResult> {
        let beforeAllResult: Awaited<ReturnType<TestGroup['runBefore']>>|undefined
        if (node.include) {
            beforeAllResult = await node.element.runBeforeAll()
            this.reportErrors(runId, beforeAllResult.errors)
        }
        const tree = [...parents, node.element]
        for (const child of node) {
            if (isGroup(child)) {
                yield* this.execTestsIterator(runId, child, tree)
            } else {
                if (child.include) {
                    const afterEach = new Map<TestGroup, BeforeCallbackReturn[]>()
                    for (const p of tree) {
                        const beforeEachResult = await p.runBeforeEach(child.element)
                        this.reportErrors(runId, beforeEachResult.errors)
                        afterEach.set(p, beforeEachResult.after)
                    }

                    yield await this.execTest(child.element)

                    for (const p of tree.reverse()) {
                        const afterEachResult = await p.runAfterEach(child.element, afterEach.get(p)!)
                        this.reportErrors(runId, afterEachResult.errors)
                    }
                } else {
                    yield new TestResult(child.element)
                }
            }
        }
        if (node.include) {
            const afterAllResult = await node.element.runAfterAll(beforeAllResult.after)
            this.reportErrors(runId, afterAllResult.errors)
        }
    }

    protected async execTest(test: Test) {
        const timeout = test.timeout ?? 5000
        const t0 = performance.now()
        let timer: NodeJS.Timeout
        let reject: () => void = () => void 0
        try {
            await Promise.race([
                new Promise((res, rej) => {
                    timer = setTimeout(() => rej(
                        new TimeoutError(`Test "${test.title}" timed out after ${timeout}ms.`)
                    ), timeout)
                }),
                test.callback.call(test),
            ])
            const duration = performance.now() - t0
            return new TestResult(test, {duration})
        } catch (error) {
            const duration = performance.now() - t0
            return new TestResult(test, {duration, error})
        } finally {
            reject()
            clearTimeout(timer)
        }
    }

    protected async report<K extends 'schedule' | 'result' | 'error'>(type: K, data: TestConductorEventMap[K]) {
        return this.fetch(this.reporterUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                type,
                ...data,
            })
        })        
    }

    protected async reportErrors(runId: string, errors: TestError[]) {
        errors.forEach(e => {
            this.report('error', {
                runId,
                groupId: e.context.id,
                testId: e.test?.id,
                hook: e.hook,
                error: e,
            })
        })
    }
}

function isGroup(
    node: TestsIteratorNode<TestGroup>
): node is TestsIteratorGroupNode<TestGroup> {
    return Symbol.iterator in node
}

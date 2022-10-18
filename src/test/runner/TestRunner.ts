import { TestConductorEventMap } from '../TestConductor'
import { TestsIteratorGroupNode, TestsIteratorNode } from '../TestGroup'
import { Test } from './Test'
import { AfterCallback, TestGroup } from './TestGroup'
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

        for await (const result of this.execTestsIterator(tests, [])) {
            await this.report('result', {
                runId,
                testId: result.test.id,
                result,
            })
        }
    }

    protected async *execTestsIterator(
        node: TestsIteratorGroupNode<TestGroup>,
        parents: TestGroup[] = [],
    ): AsyncGenerator<TestResult> {
        let afterAll: AfterCallback[] = []
        if (node.include) {
            afterAll = await node.element.runBeforeAll()
        }
        const tree = [...parents, node.element]
        for (const child of node) {
            if (isGroup(child)) {
                yield* this.execTestsIterator(child, tree)
            } else {
                if (child.include) {
                    const afterEach = new Map<TestGroup, AfterCallback[]>()
                    for (const p of tree) {
                        afterEach.set(p, await p.runBeforeEach())
                    }

                    yield await this.execTest(child.element)

                    for (const p of tree.reverse()) {
                        p.runAfterEach(afterEach.get(p)!)
                    }
                } else {
                    yield new TestResult(child.element)
                }
            }
        }
        if (node.include) {
            await node.element.runAfterAll(afterAll)
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

    protected async report<K extends 'schedule' | 'result'>(type: K, data: TestConductorEventMap[K]) {
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
}

function isGroup(
    node: TestsIteratorNode<TestGroup>
): node is TestsIteratorGroupNode<TestGroup> {
    return Symbol.iterator in node
}

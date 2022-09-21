import { Test } from './Test'
import { AfterCallback, TestGroup, TestsIteratorGroupNode, TestsIteratorNode } from './TestGroup'
import { TestResult, TimeoutError } from './TestResult'

export class TestRunner {
    async run(
        group: TestGroup,
        filter?: (item: TestGroup | Test) => boolean,
    ) {
        const tests = group.tests(filter)

        const icon = {
            timeout: '⌛',
            fail: '❌',
            success: '✓',
            skipped: '🚫',
        }

        for await (const result of this.execTestsIterator(tests, [])) {
            console.log(` [${icon[result.status] ?? result.status}] ${result.test.title} ${result.error ? '\n  ' + result.error : ''}`)
        }
    }

    protected async *execTestsIterator(
        node: TestsIteratorGroupNode,
        parents: TestGroup[] = [],
    ): AsyncGenerator<TestResult> {
        let afterAll: AfterCallback[] = []
        if (node.include) {
            afterAll = await node.element.runBeforeAll()
        }
        for (const child of node) {
            if (isGroup(child)) {
                yield* this.execTestsIterator(child, [...parents, node.element])
            } else {
                if (child.include) {
                    const afterEach = new Map<TestGroup, AfterCallback[]>()
                    for (const p of parents) {
                        afterEach.set(p, await p.runBeforeEach())
                    }

                    yield await this.execTest(child.element)

                    for (const p of parents.reverse()) {
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
        console.log('finish')
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

            const tdiff = performance.now() - t0
            return new TestResult(test, tdiff)
        } catch (e) {
            const tdiff = performance.now() - t0
            return new TestResult(test, tdiff, e)
        } finally {
            reject()
            clearTimeout(timer)
        }
    }
}

function isGroup(
    node: TestsIteratorNode
): node is TestsIteratorGroupNode {
    return node.element instanceof TestGroup
}

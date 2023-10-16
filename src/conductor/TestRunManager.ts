import { TestSuite } from './TestRun'
import os from 'node:os'

export class TestRunManager {
    maxParallel = os.availableParallelism()

    async exec(
        suites: Iterable<TestSuite>,
        filterSuites?: RegExp,
        filterTests?: RegExp,
    ) {
        const todo = new Set<TestSuite>
        for (const s of suites) {
            if (filterSuites && !filterSuites.test(s.title)) {
                s.skip()
            } else {
                todo.add(s)
            }
        }

        const iterator = todo.values()
        const current = new Set<Promise<void>>()
        for(;;) {
            const {value: suite, done} = iterator.next() as IteratorYieldResult<TestSuite|undefined>
            if (suite) {
                const promise: Promise<void> = suite.exec(filterTests)
                    .finally(() => void current.delete(promise))
                current.add(promise)
            }

            if (done) {
                await Promise.allSettled(current)
                return
            }
            if (current.size >= this.maxParallel) {
                await Promise.race(current)
            }
        }
    }
}

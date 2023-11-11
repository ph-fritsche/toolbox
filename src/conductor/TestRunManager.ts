import { TestSuite } from './TestRun'
import os from 'node:os'
import events from 'node:events'

export class TestRunManager {
    maxParallel = os.availableParallelism()

    protected abortController?: AbortController

    async exec(
        suites: Iterable<TestSuite>,
        filterSuites?: RegExp,
        filterTests?: RegExp,
    ) {
        if (this.abortController) {
            this.abort()
        }

        const abortController = new AbortController()
        this.abortController = abortController

        const todo = new Set<TestSuite>
        for (const s of suites) {
            if (filterSuites && !filterSuites.test(s.title)) {
                s.skip()
            } else {
                todo.add(s)
            }
        }

        events.setMaxListeners(Math.min(todo.size, this.maxParallel), abortController.signal)

        const iterator = todo.values()
        const current = new Set<Promise<void>>()
        for(;;) {
            const {value: suite, done} = iterator.next() as IteratorYieldResult<TestSuite|undefined>
            if (suite) {
                if (abortController.signal.aborted) {
                    suite.skip()
                    continue
                }
                const promise: Promise<void> = suite.exec(filterTests, abortController)
                    .finally(() => void current.delete(promise))
                current.add(promise)
            }

            if (done) {
                await Promise.allSettled(current)
                break
            } else if (current.size >= this.maxParallel) {
                await Promise.race(current).catch(() => void 0)
            }
        }

        if (abortController.signal.aborted) {
            throw abortController.signal
        }
    }

    abort(reason?: unknown) {
        this.abortController?.abort(reason)
        this.abortController = undefined
    }
}

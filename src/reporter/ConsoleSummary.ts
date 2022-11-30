import { createHash } from 'crypto'
import { TestConductor, TestConductorEventMap } from '../conductor/TestConductor'
import { Event } from '../event/EventEmitter'
import { TestRun } from '../test/TestRun'

const icon = {
    pending: '·',
    error: '🚨',
    fail: '⨯',
    success: '✓',
}

export class ConsoleSummary {
    protected readonly runHash = new Map<TestRun, string>()
    protected readonly runStack = new Map<string, Map<TestConductor, TestRun>>()

    protected makeHash(
        data: string[]
    ) {
        const h = createHash('sha256')
        data.forEach(f => h.update(f))

        return h.digest('base64')
    }

    makeStack(
        testConductor: TestConductor,
        testRun: TestRun,
        hashParams: string[],
    ) {
        const hash = this.makeHash(hashParams)
        this.runHash.set(testRun, hash)
        if (!this.runStack.has(hash)) {
            this.runStack.set(hash, new Map())
        }
        this.runStack.get(hash).set(testConductor, testRun)
    }

    getSummary(
        testRun: TestRun
    ) {
        const hash = this.runHash.get(testRun)
        const stack = this.runStack.has(hash)
            ? this.runStack.get(hash)
            : new Map<undefined, TestRun>([[undefined, testRun]])

        let t = `Results from ${stack.size} conductors:\n`
        for (const [conductor, run] of stack.entries()) {
            const count = { success: 0, fail: 0, timeout: 0, skipped: 0 }
            run.results.forEach(result => {
                count[result.status]++
            })
            const stateIcon = run.state !== 'done'
                ? icon.pending
                : run.errors.size
                    ? icon.error
                    : count.timeout || count.fail
                        ? icon.fail
                        : icon.success

            t += `[${stateIcon}] ${conductor?.title}\n`
            t += `${run.results.size} tests were run: ${count.success} succeeded, ${count.fail} failed, ${count.timeout} timed out, ${count.skipped} were skipped\n`
            if (run.errors.size) {
                const n = Array.from(run.errors.values()).reduce((n, e) => n + e.length, 0)
                t += `There were ${n} errors in test code.\n`
            }
        }
        return t
    }
}

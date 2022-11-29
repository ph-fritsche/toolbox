import { makeEventTypeCheck } from '../event'
import { Test } from '../test/Test'
import { TestConductor, TestConductorEventMap } from '../conductor/TestConductor'
import { TestGroup } from '../test/TestGroup'
import { TestResult } from '../test/TestResult'
import { TestRun } from '../test/TestRun'

const icon = {
    timeout: '⌛',
    fail: '❌',
    success: '✓',
    skipped: '🚫',
    error: '🚨',
    missing: '⚠',
}

const isEventType = makeEventTypeCheck<TestConductorEventMap>()

const events: Array<keyof TestConductorEventMap> = ['complete','done','error','result','schedule','start']

export class ConsoleReporter {
    protected unsubscribe = new Map<TestConductor, Set<() => void>>()

    public connect(
        conductor: TestConductor,
    ) {
        if (!this.unsubscribe.has(conductor)) {
            const set = new Set<() => void>()
            this.unsubscribe.set(conductor, set)
            for (const k of events) {
                set.add(conductor.emitter.addListener(k, e => this.log(conductor, e)))
            }
        }
    }

    public disconnect(
        conductor: TestConductor,
    ) {
        this.unsubscribe.get(conductor)?.forEach(u => u())
        this.unsubscribe.delete(conductor)
    }

    public readonly config = {
        schedule: false,
        result: true,
        error: true,
        done: true,
    }

    protected lastLog = ''

    protected log<
        K extends keyof TestConductorEventMap,
    >(
        conductor: TestConductor,
        event: TestConductorEventMap[K] & {type: K},
    ) {
        if (!(event.type in this.config && this.config[event.type as keyof typeof this.config])) {
            return
        }

        if (this.lastLog !== `${event.runId}:${event.type}`) {
            process.stdout.write('\n')
            this.lastLog = `${event.runId}:${event.type}`
        }

        if (isEventType(event, 'schedule')) {
            process.stdout.write(`Suite "${event.group.title}" for run ${event.runId}:\n`)
            process.stdout.write(this.printTree(event.group.children))
        } else if (isEventType(event, 'result')) {
            const test = conductor.testRuns.get(event.runId).tests.get(event.testId)
            const result = event.result
            process.stdout.write(this.printResult(test, result))
        } else if (isEventType(event, 'error')) {
            const group = conductor.testRuns.get(event.runId).groups.get(event.groupId)
            process.stdout.write(`${icon.error} ${group.getHierarchy().map(t => t.title).join(' › ') }\n`)
            process.stdout.write(event.hook
                ? `Test hook ${ event.hook } failed.\n`
                : `Test suite failed.\n`
            )
            process.stdout.write((event.error.stack ?? `${event.error.name}: ${event.error.message}`).trim() + '\n')
            process.stdout.write('\n')
        } else if (isEventType(event, 'done')) {
            process.stdout.write(`Results for run ${event.runId}:\n`)
            const run = conductor.testRuns.get(event.runId)
            process.stdout.write(this.printTree(
                Array.from(conductor.testRuns.get(event.runId).suites.values()),
                run,
            ))
            const count = { success: 0, fail: 0, timeout: 0, skipped: 0 }
            run.results.forEach(result => {
                count[result.status]++
            })
            process.stdout.write(`${run.results.size} tests were run: ${count.success} succeeded, ${count.fail} failed, ${count.timeout} timed out, ${count.skipped} were skipped\n`)
            if (run.errors.size) {
                const n = Array.from(run.errors.values()).reduce((n, e) => n + e.length, 0)
                process.stdout.write(`There were ${n} errors in test code.\n`)
            }
            process.stdout.write('\n')
        }
    }

    protected printTree(
        children: Array<TestGroup|Test>,
        testRun?: TestRun,
        indent = ''
    ) {
        let t = ''
        for (let i = 0; i < children.length; i++) {
            const isLast = i === children.length - 1
            const child = children[i]
            if (isGroup(child)) {
                t += indent + (isLast ? '└' : '├') + child.title
                if (testRun?.errors.has(child.id)) {
                    t += ` ${icon.error} ${testRun.errors.get(child.id).length} errors`
                }
                t += '\n'
                t += this.printTree(
                    child.children,
                    testRun,                    
                    indent + (isLast ? ' ' : '╎'),
                )
            } else if (testRun) {
                t += this.printResult(
                    child,
                    testRun.results.get(child.id),
                    {indent, isLast},
                )
            } else {
                t += indent + (isLast ? '└' : '├') + child.title + '\n'
            }
        }
        return t
    }

    protected printResult(
        test: Test,
        result?: TestResult,
        tree?: {
            indent: string
            isLast: boolean
        }
    ) {
        let t = ''
        const statusBox = `[${result ? icon[result.status] ?? result.status : icon.missing}]`
        if (tree) {
            if (result?.error) {
                t += tree.indent + '╎' + '\n'
            }
            t += tree.indent + (tree.isLast ? '└' : '├') + statusBox + test.title + '\n'
        } else {
            t += statusBox + ' ' + test.ancestors().concat([test]).map(n => n.title).join(' › ') + '\n'
        }
        if (result?.error) {
            t += result.error.stack.trim() || `${result.error.name}: ${result.error.message.trim()}`
            t += '\n'
            t += tree
                ? tree.indent + (tree.isLast ? ' ' : '╎') + '\n'
                : '\n'
        }
        return t
    }
}

function isGroup(
    node: TestGroup|Test,
): node is TestGroup {
    return 'children' in node
}

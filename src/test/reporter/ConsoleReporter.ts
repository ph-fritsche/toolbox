import { makeEventTypeCheck } from '../../event'
import { Test } from '../Test'
import { TestConductor, TestConductorEventMap } from '../TestConductor'
import { TestGroup } from '../TestGroup'
import { TestResult } from '../TestResult'

const icon = {
    timeout: '⌛',
    fail: '❌',
    success: '✓',
    skipped: '🚫',
}

const isEventType = makeEventTypeCheck<TestConductorEventMap>()

const events: Array<keyof TestConductorEventMap> = ['complete','done','error','result','schedule','start']

export class ConsoleReporter {
    public connect(
        conductor: TestConductor,
    ) {
        events.forEach(k => conductor.emitter.addListener(k, e => this.log(conductor, e)))
    }

    public disconnect(
        conductor: TestConductor,
    ) {
        events.forEach(k => conductor.emitter.removeListener(k, e => this.log(conductor, e)))
    }

    protected log<
        K extends keyof TestConductorEventMap,
    >(
        conductor: TestConductor,
        event: TestConductorEventMap[K] & {type: K},
    ) {
        if (isEventType(event, 'schedule')) {
            process.stdout.write(`\nSchedule for run ${event.runId}:\n`)
            process.stdout.write(this.printTree(
                Array.from(conductor.testRuns.get(event.runId).suites.values())
            ))
            process.stdout.write('\n')
        } else if (isEventType(event, 'result')) {
            const test = conductor.testRuns.get(event.runId).tests.get(event.testId)
            const result = event.result
            process.stdout.write(this.printResult(test, result) + '\n')
        } else if (isEventType(event, 'error')) {
            process.stdout.write(`\nTest suite "${event.groupTitle}" failed. (runId: "${event.runId}")\n`)
            if (event.error) {
                process.stdout.write(event.error.trim() + '\n')
            }
            process.stdout.write('\n')
        } else if (isEventType(event, 'done')) {
            process.stdout.write(`Results for run ${event.runId}:\n`)
            const results = conductor.testRuns.get(event.runId).results
            process.stdout.write(this.printTree(
                Array.from(conductor.testRuns.get(event.runId).suites.values()),
                results,
            ))
            const count = { success: 0, fail: 0, timeout: 0, skipped: 0 }
            results.forEach(result => {
                count[result.status]++
            })
            process.stdout.write(`${results.size} tests were run: ${count.success} succeeded, ${count.fail} failed, ${count.timeout} timed out, ${count.skipped} were skipped`)
            process.stdout.write('\n')
        }
    }

    protected printTree(
        children: Array<TestGroup|Test>,
        results?: Map<string, TestResult>,
        indent = ''
    ) {
        let t = ''
        for (let i = 0; i < children.length; i++) {
            const isLast = i === children.length - 1
            const child = children[i]
            if (isGroup(child)) {
                t += indent + (isLast ? '└' : '├') + child.title + '\n'
                t += this.printTree(
                    child.children,
                    results,
                    indent + (isLast ? ' ' : '╎'),
                )
            } else if (results) {
                t += this.printResult(
                    child,
                    results.get(child.id),
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
        result: TestResult,
        tree?: {
            indent: string
            isLast: boolean
        }
    ) {
        let t = ''
        const statusBox = `[${icon[result.status] ?? result.status}]`
        if (tree) {
            if (result.error) {
                t += tree.indent + '╎' + '\n'
            }
            t += tree.indent + (tree.isLast ? '└' : '├') + statusBox + test.title + '\n'


            // t += tree.indent + (tree.isLast ? ' ' : '╎')
        } else {
            t += statusBox + ' ' + test.ancestors().concat([test]).map(n => n.title).join(' › ') + '\n'
        }
        if (result.error) {
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

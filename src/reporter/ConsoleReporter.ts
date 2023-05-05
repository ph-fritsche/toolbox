import { makeEventTypeCheck } from '../event'
import { Test } from './Test'
import { TestGroup } from './TestGroup'
import { TestResult } from './TestResult'
import { TestRun } from './TestRun'
import { TestNodeStack } from './TestNodeStack'
import { ReporterEventMap, ReporterServer } from './ReporterServer'
import { TreeIterator } from '../test/TreeIterator'
import { TestRunStack } from './TestRunStack'

const resultIcon = {
    timeout: '⌛',
    fail: '❌',
    success: '✓',
    skipped: '🚫',
    error: '🚨',
    missing: '⚠',
}

const summaryIcon = {
    pending: '·',
    error: '🚨',
    fail: '⨯',
    divided: '⚠',
    success: '✓',
}

const isEventType = makeEventTypeCheck<ReporterEventMap>()
const events: Array<keyof ReporterEventMap> = ['complete', 'done', 'error', 'result', 'schedule', 'start']

export class ConsoleReporter {
    protected unsubscribe = new Map<ReporterServer, Set<() => void>>()

    public connect(
        server: ReporterServer,
    ) {
        if (!this.unsubscribe.has(server)) {
            const set = new Set<() => void>()
            this.unsubscribe.set(server, set)
            for (const k of events) {
                set.add(server.emitter.addListener(k, e => this.log(e)))
            }

            set.add(server.emitter.addListener('done', e => {
                if (!e.run.stack) {
                    return
                }

                process.stdout.write([
                    '',
                    `Results from ${e.run.stack.runs.length} conductors:`,
                    `${this.printTreeSummary(e.run.stack.aggregateNodes())}`,
                    this.printConductorSummary(e.run.stack),
                    '',
                ].join('\n'))
            }))
        }
    }

    public disconnect(
        server: ReporterServer,
    ) {
        this.unsubscribe.get(server)?.forEach(u => u())
        this.unsubscribe.delete(server)
    }

    public readonly config = {
        schedule: false,
        result: true,
        error: true,
        done: false,
        summary: true,
    }

    protected lastLog = ''

    protected log<
        K extends keyof ReporterEventMap,
    >(
        event: ReporterEventMap[K] & {type: K},
    ) {
        if (!(event.type in this.config && this.config[event.type as keyof typeof this.config])) {
            return
        }

        if (this.lastLog !== `${event.run.id}:${event.type}`) {
            process.stdout.write('\n')
            this.lastLog = `${event.run.id}:${event.type}`
        }

        if (isEventType(event, 'schedule')) {
            process.stdout.write(`Suite "${event.group.title}" for run ${event.run.id}:\n`)
            process.stdout.write(this.printTree(event.group.children))
        } else if (isEventType(event, 'result')) {
            const test = event.run.tests.get(event.testId)
            const result = event.result
            if (test) {
                process.stdout.write(this.printResult(test, result))
            }
        } else if (isEventType(event, 'error')) {
            const path = Array.from(new TreeIterator(event.group).getAncestors()).reverse()
            process.stdout.write(`${resultIcon.error} ${path.map(t => t.title).join(' › ') }\n`)
            process.stdout.write(event.error.hook
                ? `Test hook ${ event.error.hook } failed.\n`
                : `Test suite failed.\n`,
            )
            process.stdout.write((event.error.stack ?? `${event.error.name}: ${event.error.message}`).trim() + '\n')
            process.stdout.write('\n')
        } else if (isEventType(event, 'done')) {
            process.stdout.write(`Results for run ${event.run.id}:\n`)
            process.stdout.write(this.printTree(
                Array.from(event.run.suites.values()),
                event.run,
            ))
            const count = { success: 0, fail: 0, timeout: 0, skipped: 0 }
            event.run.results.forEach(result => {
                count[result.status]++
            })
            process.stdout.write(`${event.run.results.size} tests were run: ${count.success} succeeded, ${count.fail} failed, ${count.timeout} timed out, ${count.skipped} were skipped\n`)
            if (event.run.errors.size) {
                const n = Array.from(event.run.errors.values()).reduce((n, e) => n + e.length, 0)
                process.stdout.write(`There were ${n} errors in test code.\n`)
            }
            process.stdout.write('\n')
        }
    }

    protected printTree(
        children: Array<TestGroup|Test>,
        testRun?: TestRun,
        indent = '',
    ) {
        let t = ''
        for (let i = 0; i < children.length; i++) {
            const isLast = i === children.length - 1
            const child = children[i]
            if (isGroup(child)) {
                t += indent + (isLast ? '└' : '├') + child.title
                const errors = testRun?.errors.get(child.id)
                if (errors) {
                    t += ` ${resultIcon.error} ${errors.length} errors`
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
        },
    ) {
        let t = ''
        const statusBox = `[${result ? resultIcon[result.status] ?? result.status : resultIcon.missing}]`
        if (tree) {
            if (result?.error) {
                t += tree.indent + '╎' + '\n'
            }
            t += tree.indent + (tree.isLast ? '└' : '├') + statusBox + test.title + '\n'
        } else {
            t += statusBox + ' ' + [...test.ancestors(), test].map(n => n.title).join(' › ') + '\n'
        }
        if (result?.error) {
            t += result.error.stack?.trim() || `${result.error.name}: ${result.error.message.trim()}`
            t += '\n'
            t += tree
                ? tree.indent + (tree.isLast ? ' ' : '╎') + '\n'
                : '\n'
        }
        return t
    }

    protected printConductorSummary(
        stack: TestRunStack,
    ) {
        let t = ''
        for (const run of stack.runs) {
            const count = { success: 0, fail: 0, timeout: 0, skipped: 0 }
            run.results.forEach(result => {
                count[result.status]++
            })
            const stateIcon = run.state !== 'done'
                ? summaryIcon.pending
                : run.errors.size
                    ? summaryIcon.error
                    : count.timeout || count.fail
                        ? summaryIcon.fail
                        : summaryIcon.success

            t += `[${stateIcon}] ${run.conductor?.title}\n`
            t += `${run.results.size} tests were run: ${count.success} succeeded, ${count.fail} failed, ${count.timeout} timed out, ${count.skipped} were skipped\n`
            if (run.errors.size) {
                const n = Array.from(run.errors.values()).reduce((n, e) => n + e.length, 0)
                t += `There were ${n} errors in test code.\n`
            }
        }
        return t
    }

    protected printTreeSummary(
        children: Array<TestNodeStack>,
        indent = '',
    ) {
        let t = ''
        for (let i = 0; i < children.length; i++) {
            const isLast = i === children.length - 1
            const child = children[i]
            if (child.isGroup()) {
                t += indent + (isLast ? '└' : '├') + child.title
                const errors = child.getErrors()
                if (errors.size) {
                    const count = Array.from(errors.values()).reduce((n, s) => n + s.length, 0)
                    t += ` ${resultIcon.error} ${errors.size} errors in ${count} places`
                }
                t += '\n'
                t += this.printTreeSummary(
                    child.children,
                    indent + (isLast ? ' ' : '╎'),
                )
            } else if (child.isTest()) {
                t += this.printSummaryResult(
                    child,
                    { indent, isLast },
                )
            }
        }
        return t
    }

    protected printSummaryResult(
        test: TestNodeStack<Test>,
        tree: {
            indent: string
            isLast: boolean
        },
    ) {
        const results = test.getResults()
        const divided = results.size > 1
        const pending = Array.from(results.values()).reduce((n, s) => n + s.length, 0) < test.instances.size
        const status = divided ? 'divided' : pending ? 'pending' : Array.from(results.keys())[0] === 'success' ? 'success' : 'fail'
        let t = ''
        if (results.has('fail') || results.has('timeout')) {
            t += tree.indent + '╎' + '\n'
        }
        t += tree.indent + (tree.isLast ? '└' : '├') + `[${summaryIcon[status]}]` + test.title + '\n'
        const pre = tree.indent + (tree.isLast ? ' ' : '╎')
        if (results.has('fail') || results.has('timeout')) {
            for(const k of ['success', 'skipped', 'fail', 'timeout'] as const) {
                results.get(k)?.forEach(([run, result]) => {
                    t += pre + ` [${resultIcon[k]}] ${run.conductor.title}\n`
                    if (result.error) {
                        t += result.error.stack?.trim() || `${result.error.name}: ${result.error.message.trim()}`
                        t += '\n'
                    }
                })
            }
        }
        if (results.has('fail') || results.has('timeout')) {
            t += pre + '\n'
        }
        return t
    }

}

function isGroup(
    node: TestNodeStack|TestGroup|Test,
): node is TestGroup {

    return 'children' in node
}

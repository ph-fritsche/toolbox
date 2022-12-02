import { makeEventTypeCheck } from '../event'
import { Test } from './Test'
import { TestGroup } from './TestGroup'
import { TestResult } from './TestResult'
import { TestRun } from '../conductor/TestRun'
import { ReportStacks, TestNodeStack } from './ReportStacks'
import { ReporterEventMap, ReporterServer } from './ReporterServer'
import { TreeIterator } from '../test/TreeIterator'
import { TestConductor } from '../conductor/TestConductor'

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
    success: '✓',
}

const isEventType = makeEventTypeCheck<ReporterEventMap>()
const events: Array<keyof ReporterEventMap> = ['complete','done','error','result','schedule','start']

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
            set.add(server.emitter.addListener('start', e => this.stacks.makeStack(e.run, e.testFiles.map(f => f.name))))
            set.add(server.emitter.addListener('done', e => {
                process.stdout.write(`\n${this.printSummary(this.stacks.getStack(e.run))}\n`)
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
        done: true,
        summary: true,
    }

    protected stacks = new ReportStacks()
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
            process.stdout.write(this.printResult(test, result))
        } else if (isEventType(event, 'error')) {
            const path = Array.from(new TreeIterator(event.group).getAncestors()).reverse()
            process.stdout.write(`${resultIcon.error} ${path.map(t => t.title).join(' › ') }\n`)
            process.stdout.write(event.hook
                ? `Test hook ${ event.hook } failed.\n`
                : `Test suite failed.\n`
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
        indent = ''
    ) {
        let t = ''
        for (let i = 0; i < children.length; i++) {
            const isLast = i === children.length - 1
            const child = children[i]
            if (isGroup(child)) {
                t += indent + (isLast ? '└' : '├') + child.title
                if (testRun?.errors.has(child.id)) {
                    t += ` ${resultIcon.error} ${testRun.errors.get(child.id).length} errors`
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
        const statusBox = `[${result ? resultIcon[result.status] ?? result.status : resultIcon.missing}]`
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

    protected printSummary(
        stack: Map<TestConductor, TestRun>
    ) {
        let t = `Results from ${stack.size} conductors:\n`
        for (const [conductor, run] of stack.entries()) {
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

function isGroup(
    node: TestNodeStack|TestGroup|Test,
): node is TestGroup {

    return 'children' in node
}

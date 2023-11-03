import { makeEventTypeCheck } from '../event'
import { TestEventMap, TestFunction, TestNodeInstance, TestNodeStack, TestResultType, TestRunInstance, TestRunStack, TestRunState, isTestFunction, isTestFunctionStack, isTestGroup, isTestGroupStack, isTestSuite, isTestSuiteStack } from '../conductor/TestRun'
import { TestHookData } from '../conductor/TestReporter'
import { TestFunctionStack } from '../conductor/TestRun/TestFunction'

const icon = {
    pending: '·',
    error: '🚨',
    missing: '🚨',
    fail: '⨯',
    timeout: '⌛',
    divided: '⚠',
    success: '✓',
    skipped: '-',
}

const isEventType = makeEventTypeCheck<TestEventMap>()
const events: Array<keyof TestEventMap> = ['complete', 'done', 'error', 'result', 'schedule', 'skip', 'start']

export class ConsoleReporter {
    protected unsubscribe = new Map<TestRunStack, Set<() => void>>()

    public connect(
        runStack: TestRunStack,
    ) {
        if (!this.unsubscribe.has(runStack)) {
            const set = new Set<() => void>()
            this.unsubscribe.set(runStack, set)
            for (const k of events) {
                set.add(runStack.addListener(k, e => this.log(e)))
            }
            const summary = () => {
                for (const r of runStack.instances.values()) {
                    if (r.index.suites.pending.size || r.index.suites.running.size) {
                        return
                    }
                }

                process.stdout.write([
                    '',
                    `Results from ${runStack.instances.size} conductors:`,
                    `${this.printStackTree(runStack.suites.values())}`,
                    this.printConductorSummary(runStack),
                    '',
                ].join('\n'))
            }

            set.add(runStack.addListener('done', summary))
            set.add(runStack.addListener('skip', summary))
        }
    }

    public disconnect(
        runStack: TestRunStack,
    ) {
        this.unsubscribe.get(runStack)?.forEach(u => u())
        this.unsubscribe.delete(runStack)
    }

    public readonly config = {
        schedule: false,
        result: true,
        error: true,
        done: false,
        skip: false,
        summary: true,
    }

    protected lastLog?: {
        run: TestRunInstance,
        type: keyof TestEventMap
    }

    protected log<
        E extends TestEventMap[keyof TestEventMap] & {type: keyof TestEventMap},
    >(
        event: E,
    ) {
        if (!(event.type in this.config && this.config[event.type as keyof typeof this.config])) {
            return
        }

        if (this.lastLog?.run !== event.node.run || this.lastLog.type !== event.type) {
            process.stdout.write('\n')
            this.lastLog = {run: event.node.run, type: event.type}
        }

        if (isEventType(event, 'schedule')) {
            process.stdout.write(`Suite "${event.node.title}" on "${event.node.run.conductor.title}":\n`)
            process.stdout.write(this.printInstanceTree(event.node.children.values()))
        } else if (isEventType(event, 'result')) {
            process.stdout.write(this.printTestFunction(event.node))
        } else if (isEventType(event, 'error')) {
            const error = event.error
            process.stdout.write(`${icon.error} ${getPathTitles(event.node)}\n`)
            process.stdout.write(error.hook
                ? `Test ${this.describeHook(error.hook)} failed.\n`
                : `Test suite failed.\n`,
            )
            process.stdout.write((typeof error.error === 'string' ? error.error : (error.error.stack ?? `${error.error.name}: ${error.error.message}`)).trim() + '\n')
            process.stdout.write('\n')
        } else if (isEventType(event, 'done')) {
            process.stdout.write(`Results on ${event.node.run.conductor.title}:\n`)
            process.stdout.write(this.printInstanceTree([event.node.suite].values()))
            process.stdout.write('\n')
        }
    }
    protected describeHook(hook: TestHookData) {
        return [
            hook.cleanup && 'cleanup of',
            'hook',
            `${hook.type}#${hook.index}`,
            hook.name,
        ].filter(Boolean).join(' ')
    }

    protected printInstanceTree(
        children: Iterator<TestNodeInstance, undefined>,
        indent = '',
    ) {
        let t = ''
        for (const { value, isLast} of lookaheadIterator(children)) {
            if (isTestGroup(value) || isTestSuite(value)) {
                t += indent + (isLast ? '└' : '├') + (value.children.size ? '┮' : '╼')

                if (value.index.errors.has(value)) {
                    t += `${icon.error}`
                }

                t += ' ' + value.title + '\n'

                t += this.printInstanceTree(
                    value.children.values(),
                    indent + (isLast ? ' ' : '╎'),
                )
            } else if (isTestFunction(value)) {
                t += this.printTestFunction(value, {indent, isLast})
            }
        }
        return t
    }

    protected printTestStatusIcon(
        test: TestFunction,
    ) {
        const result = test.result.get()
        if (result) {
            return icon[result.type]
        } else if (test.suite.state === TestRunState.done) {
            return icon['missing']
        } else {
            return ' '
        }
    }

    protected printTestFunction(
        test: TestFunction,
        tree?: {
            indent: string
            isLast: boolean
        },
    ) {
        let t = ''
        const statusBox = `[${this.printTestStatusIcon(test)}]`
        const result = test.result.get()

        if (tree && result?.error) {
            t += tree.indent + '╎' + '\n'
        }

        if (tree) {
            t += tree.indent + (tree.isLast ? '└' : '├') + statusBox + test.title + '\n'
        } else {
            t += statusBox + ' ' + getPathTitles(test) + '\n'
        }

        if (result?.error) {
            t += result.getErrorAsString().trim()
            t += '\n'
            if (tree) {
                t += tree.indent + (tree.isLast ? ' ' : '╎') + '\n'
            } else {
                t += '\n'
            }
        }
        return t
    }

    protected printSummaryIcon(
        run: TestRunInstance,
    ) {
        if (run.index.suites.pending.size) {
            return icon.pending
        } else if (run.index.errors.size) {
            return icon.error
        } else if (run.index.results.fail.size || run.index.results.timeout.size) {
            return icon.fail
        } else {
            return icon.success
        }
    }

    protected printConductorSummary(
        stack: TestRunStack,
    ) {
        let t = ''
        for (const run of stack.runs.values()) {
            t += `[${this.printSummaryIcon(run)}] ${run.conductor.title}\n`
            const results = run.index.results
            t += `${results.size} tests were run: ${results.success.size} succeeded, ${results.fail.size} failed, ${results.timeout.size} timed out, ${results.skipped.size} were skipped\n`
            if (run.index.errors.size) {
                const nodes = Array.from(run.index.errors.values())
                const count = nodes.reduce((n, node) => n + node.errors.count, 0)
                t += `There were ${count} distinct errors in test code.\n`
            }
        }
        return t
    }

    protected printStackTree(
        children: Iterator<TestNodeStack>,
        indent = '',
    ) {
        let t = ''
        for (const {value, isLast } of lookaheadIterator(children)) {
            if (isTestGroupStack(value) || isTestSuiteStack(value)) {
                if (value.index.results.MIXED.size
                    || value.index.results.fail.size
                    || value.index.results.timeout.size
                ) {
                    t += indent + '╎' + '\n'
                }

                t += indent + (isLast ? '└' : '├') + (value.children.size ? '┮' : '╼')

                if (value.index.errors.has(value)) {
                    t += `${icon.error}`
                }
                t += ' ' + value.title + '\n'

                t += this.printStackTree(
                    value.children.values(),
                    indent + (isLast ? ' ' : '╎'),
                )
            } else if (isTestFunctionStack(value)) {
                t += this.printTestFunctionStack(value, {indent, isLast})
            }
        }
        return t
    }

    protected printTestStackStatusIcon(
        test: TestFunctionStack,
    ) {
        const t = test.resultType
        if (t === 'MIXED') {
            return icon.divided
        } else if (t === 'success') {
            return icon.success
        } else if (t === 'fail' || t === 'timeout') {
            return icon.fail
        } else if (t === 'skipped') {
            return icon.skipped
        }
        t satisfies undefined
        return icon.pending
    }

    protected printTestFunctionStack(
        test: TestFunctionStack,
        tree?: {
            indent: string
            isLast: boolean
        },
    ) {
        let t = ''
        const hasError = test.resultType === TestResultType.fail || test.resultType === TestResultType.timeout || test.resultType === 'MIXED'
        if (tree && hasError) {
            t += tree.indent + '╎' + '\n'
        }

        if (tree) {
            t += tree.indent + (tree.isLast ? '└' : '├') + `[${this.printTestStackStatusIcon(test)}]` + test.title + '\n'
        } else {
            t += `[${this.printTestStackStatusIcon(test)}]` + getPathTitles(test) + '\n'
        }

        const pre = tree
            ? tree.indent + (tree.isLast ? ' ' : '╎')
            : ' '

        if (hasError) {
            const resultPrint = {
                success: '',
                skipped: '',
                timeout: '',
                fail: '',
            }
            for (const i of test.instances.values()) {
                const r = i.result.get()
                if (!r) {
                    continue
                }
                resultPrint[r.type] += pre + ` ⤷⟨${this.printTestStatusIcon(i)}⟩ ${i.run.conductor.title}\n`
                if (r.type === TestResultType.fail) {
                    resultPrint[r.type] += r.getErrorAsString().trim() + '\n'
                }
            }
            t += resultPrint.success
            t += resultPrint.skipped
            t += resultPrint.timeout
            t += resultPrint.fail
        }

        if (tree && hasError) {
            t += pre + '\n'
        }
        return t
    }
}

function *lookaheadIterator<T>(iterator: Iterator<T>): Generator<{value: T, isLast: boolean}, undefined> {
    let current = iterator.next()
    while(!current.done) {
        const next = iterator.next()
        yield {value: current.value, isLast: !!next.done}
        current = next
    }
}

function getPathTitles(
    node: TestNodeInstance|TestNodeStack,
) {
    let t = []
    for (let el: TestNodeInstance|TestNodeStack|undefined = node; el; el = el.parent) {
        if ('title' in el) {
            t.push(el.title as string)
        }
    }
    return t.reverse().join(' › ')
}

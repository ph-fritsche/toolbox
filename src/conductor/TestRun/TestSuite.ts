import { TestCompleteData, TestErrorData, TestReporter, TestResultData, TestScheduleData } from '../TestReporter'
import { TestError, TestErrorList } from './TestError'
import { TestFunction } from './TestFunction'
import { TestGroup } from './TestGroup'
import { TestNodeInstance, TestNodeStack } from './TestNode'
import { TestElementInstance, TestElementStack } from './TestElement'
import { TestResult } from './TestResult'
import { TestRunInstance, TestRunStack } from './TestRun'
import { TestInstanceIndex, TestStackIndex } from './TestIndex'
import { createTestElements } from './createTestElements'
import { CoverageMapData } from './TestCoverage'
import { TestHook } from './TestHook'
import { TestRunState } from './enum'

export class TestSuiteStack extends TestNodeStack<TestSuite> {
    static create(
        stack: TestRunStack,
        url: string,
        title: string,
    ) {
        const suite = new TestSuiteStack(stack, url, title)
        this.init(suite)
        return suite
    }

    readonly children = new Map<string, TestElementStack>()
    readonly index = new TestStackIndex()

    protected constructor(
        readonly parent: TestRunStack,
        readonly url: string,
        readonly title: string,
    ) {
        if (parent.suites.has(url)) {
            throw new Error(`Node already exists`)
        }

        super(parent, url)
    }
    protected static init(instance: TestSuiteStack): void {
        TestNodeStack.init(instance)
        instance.parent.suites.set(instance.ident, instance)
    }
}

export class TestSuite extends TestNodeInstance {
    static create(
        run: TestRunInstance,
        url: string,
        title: string = url,
    ) {
        const suite = new TestSuite(run, url, title)
        TestSuite.init(suite)

        return suite
    }

    declare readonly stack: TestSuiteStack
    readonly children = new Map<string, TestNodeInstance>()
    readonly index = new TestInstanceIndex()
    readonly suite: TestSuite = this

    protected constructor(
        readonly run: TestRunInstance,
        readonly url: string,
        readonly title: string = url,
    ) {
        if (run.suites.has(url)) {
            throw new Error(`Suite already exists`)
        }

        const stack = run.stack.suites.get(url)
            ?? TestSuiteStack.create(run.stack, url, title)

        super(stack, run, url)
    }
    protected static init(instance: TestSuite): void {
        TestNodeInstance.init(instance)
        instance.run.suites.set(instance.url, instance)
        instance.run.index.suites[instance.state].add(instance)
        instance.run.stack.index.suites[instance.state].add(instance)
    }

    readonly nodes = new Map<number, TestElementInstance>()

    readonly errors = new TestErrorList(error => {
        for (const n of this.ancestors(true)) {
            n.index?.errors.add(this)
        }

        for (const n of this.stack.ancestors(true)) {
            n.index?.errors.add(this.stack)
        }

        this.dispatch('error', {node: this, error})
    })

    private _state: TestRunState = TestRunState.pending
    get state() {
        return this._state
    }
    protected set state(v: TestRunState) {
        this.run.index.suites[this._state].delete(this)
        this.run.stack.index.suites[this._state].delete(this)

        this._state = v
        this.run.index.suites[this._state].add(this)
        this.run.stack.index.suites[this._state].add(this)

        if (v === TestRunState.skipped) {
            this.dispatch('skip', {node: this})
        } else if (v === TestRunState.running) {
            this.dispatch('start', {node: this})
        } else if (v === TestRunState.done) {
            this.dispatch('done', {node: this})
        }
    }
    protected assertRunState(v: TestRunState) {
        if (this._state !== v) {
            throw new Error(`TestSuite is ${this._state}`)
        }
    }

    skip() {
        this.assertRunState(TestRunState.pending)

        this.state = TestRunState.skipped
    }

    async exec(
        filter?: RegExp,
    ) {
        this.assertRunState(TestRunState.pending)

        this.state = TestRunState.running

        await this.run.conductor.runTestSuite(this.getReporter(), this.url, filter)
            .catch(e => this.reportError({error: e instanceof Error ? e : String(e)}))

        this.state = TestRunState.done
    }

    protected getReporter(): TestReporter {
        return {
            schedule: d => this.reportSchedule(d),
            error: d => this.reportError(d),
            result: d => this.reportResult(d),
            complete: d => this.reportComplete(d),
        }
    }

    private reportSchedule(data: TestScheduleData) {
        this.assertRunState(TestRunState.running)

        createTestElements(this, data.nodes)

        this.dispatch('schedule', {node: this})
    }

    private reportError(data: TestErrorData) {
        this.assertRunState(TestRunState.running)

        const node = typeof data.nodeId === 'number' ? this.nodes.get(data.nodeId) : this
        if (!(node instanceof TestSuite || node instanceof TestGroup)) {
            throw new Error(`Can not add error for node #${String(data.nodeId)}`)
        }

        node.errors.add(new TestError(
            data.error,
            data.hook && new TestHook(data.hook.type, data.hook.index, data.hook.name, data.hook.cleanup),
        ))
    }

    private reportResult(data: TestResultData) {
        this.assertRunState(TestRunState.running)

        const node = this.nodes.get(data.nodeId)
        if (!(node instanceof TestFunction)) {
            throw new Error(`Can not add result for node #${data.nodeId}`)
        }

        node.result.set(new TestResult(data.type, data.error, data.duration))
    }

    protected _coverage?: CoverageMapData
    get coverage() {
        return this._coverage
    }
    private reportComplete(data: TestCompleteData) {
        this.assertRunState(TestRunState.running)

        this._coverage = data.coverage
        this.dispatch('complete', {node: this})
    }
}

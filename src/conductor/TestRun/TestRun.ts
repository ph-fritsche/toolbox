import { TestConductor } from '../TestConductor'
import { TestRunInstanceIndex, TestRunStackIndex } from './TestIndex'
import { TestNodeInstance, TestNodeStack } from './TestNode'
import { TestSuite, TestSuiteStack } from './TestSuite'

export type TestFile = {
    url: string
    title: string
}

export class TestRunStack extends TestNodeStack<TestRunInstance> {
    static create(
        conductors: Iterable<TestConductor>,
        testFiles: Iterable<TestFile>,
    ) {
        const run = new TestRunStack()
        this.init(run)

        for (const c of conductors) {
            TestRunInstance.create(run, c, testFiles)
        }

        return run
    }

    readonly runs = new Map<TestConductor, TestRunInstance>()
    readonly instances = new Map<TestRunInstance, TestRunInstance>()
    readonly children = new Map<string, TestSuiteStack>()
    readonly index = new TestRunStackIndex()
    readonly suites = this.children

    protected constructor() {
        super(undefined, '')

    }
}

export class TestRunInstance extends TestNodeInstance {
    static create(
        stack: TestRunStack,
        conductor: TestConductor,
        testFiles: Iterable<TestFile>,
    ) {
        const run = new TestRunInstance(stack, conductor)
        this.init(run)

        for (const {url, title} of testFiles) {
            TestSuite.create(run, url, title)
        }

        return run
    }

    readonly run: TestRunInstance = this
    readonly children = new Map<string, TestSuite>()
    readonly index = new TestRunInstanceIndex()
    readonly suites = this.children

    protected constructor(
        readonly stack: TestRunStack,
        readonly conductor: TestConductor,
    ) {
        super(stack, undefined, '')
    }
    protected static init(instance: TestRunInstance): void {
        TestNodeInstance.init(instance)
        instance.stack.runs.set(instance.conductor, instance)
    }
}

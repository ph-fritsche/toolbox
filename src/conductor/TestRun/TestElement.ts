import { TestGroup, TestGroupStack } from './TestGroup'
import { TestNodeInstance, TestNodeStack } from './TestNode'
import { TestRunInstance } from './TestRun'
import { TestSuite, TestSuiteStack } from './TestSuite'

export abstract class TestElementStack<T extends TestElementInstance = TestElementInstance> extends TestNodeStack<T> {
    protected constructor(
        readonly parent: TestSuiteStack|TestGroupStack,
        ident: string,
        readonly title: string,
    ) {
        super(parent, ident)
    }
}

export abstract class TestElementInstance extends TestNodeInstance {
    readonly run: TestRunInstance
    readonly suite: TestSuite

    protected constructor(
        readonly stack: TestElementStack,
        readonly parent: TestSuite|TestGroup,
        ident: string,
        readonly id: number,
        readonly title: string,
    ) {
        if (parent.suite.nodes.has(id)) {
            throw new Error(`Node #${id} already exists`)
        } else if (parent.children.has(ident)) {
            throw new Error(`Child "${ident}" already exists`)
        }

        super(stack, parent, ident)

        this.run = parent.run
        this.suite = parent.suite
    }
    protected static init(instance: TestElementInstance): void {
        TestNodeInstance.init(instance)
        instance.suite.nodes.set(instance.id, instance)
    }
}

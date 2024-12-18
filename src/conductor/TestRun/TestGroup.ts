import { TestErrorList } from './TestError'
import { TestElementInstance, TestElementStack } from './TestElement'
import { TestInstanceIndex, TestStackIndex } from './TestIndex'
import { TestSuite, TestSuiteStack } from './TestSuite'
import { TestNodeChildren } from './TestNode'
import { TestRunInstance } from './TestRun'

export class TestGroupStack extends TestElementStack {
    static create(
        parent: TestSuiteStack|TestGroupStack,
        ident: string,
        title: string,
    ) {
        const group = new this(parent, ident, title)
        this.init(group)
        return group
    }

    readonly instances = new Map<TestRunInstance, TestGroup>()
    readonly children = new TestNodeChildren<TestElementStack>()
    readonly index = new TestStackIndex()
}

export class TestGroup extends TestElementInstance {
    static create(
        parent: TestSuite|TestGroup,
        id: number,
        title: string,
        ident: string,
    ) {
        const stack = parent.stack.children.get(ident)
            ?? TestGroupStack.create(parent.stack, ident, title)

        const group = new TestGroup(stack, parent, ident, id, title)
        this.init(group)
        return group
    }

    declare readonly stack: TestGroupStack
    readonly children = new TestNodeChildren<TestElementInstance>()
    readonly index = new TestInstanceIndex()

    readonly errors = new TestErrorList(error => {
        for (const n of this.ancestors(true)) {
            n.index?.errors.add(this)
        }

        for (const n of this.stack.ancestors(true)) {
            n.index?.errors.add(this.stack)
        }

        this.dispatch('error', {node: this, error})
    })
}

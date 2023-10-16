import { TestGroup, TestGroupStack } from './TestGroup'
import { TestElementInstance, TestElementStack } from './TestElement'
import { TestResultState } from './TestResult'
import { TestSuite, TestSuiteStack } from './TestSuite'
import { TestResultType } from './enum'

export class TestFunctionStack extends TestElementStack<TestFunction> {
    static create(
        parent: TestSuiteStack|TestGroupStack,
        ident: string,
        title: string,
    ) {
        const func = new this(parent, ident, title)
        this.init(func)
        return func
    }

    declare children: undefined
    resultType?: TestResultType|'MIXED'

    protected static init(instance: TestFunctionStack) {
        TestElementStack.init(instance)
        for (const n of instance.ancestors(false)) {
            n.index?.tests.add(instance)
        }
    }
}

export class TestFunction extends TestElementInstance {
    static create(
        parent: TestSuite|TestGroup,
        id: number,
        title: string,
        ident: string,
    ) {
        const stack = parent.stack.children.get(ident)
            ?? TestFunctionStack.create(parent.stack, ident, title)

        const func = new TestFunction(stack, parent, ident, id, title)
        this.init(func)
        return func
    }

    declare readonly stack: TestFunctionStack
    declare children: never

    protected static init(instance: TestFunction) {
        TestElementInstance.init(instance)
        for (const n of instance.ancestors(false)) {
            n.index?.tests.add(instance)
        }
    }

    readonly result = new TestResultState(result => {
        for (const n of this.ancestors(false)) {
            n.index?.results[result.type].add(this)
        }

        let type: undefined|TestResultType|'MIXED' = result.type
        for (const i of this.stack.instances.values()) {
            const t = i.result.get()?.type
            if (t === undefined) {
                type = undefined
                break
            } else if (type === 'MIXED' || t !== type) {
                type = 'MIXED'
            }
        }
        if (type) {
            this.stack.resultType = type
            for (const n of this.stack.ancestors(false)) {
                n.index?.results[type].add(this.stack)
            }
        }

        this.dispatch('result', {node: this, result})
    })
}

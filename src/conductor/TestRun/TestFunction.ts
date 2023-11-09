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

    protected static init(instance: TestFunctionStack) {
        TestElementStack.init(instance)
        for (const n of instance.ancestors(false)) {
            n.index?.tests.add(instance)
        }
    }

    #resultType?: TestResultType|'MIXED'
    get resultType(): undefined|TestResultType|'MIXED' {
        return this.#resultType
    }
    set resultType(t: TestResultType|'MIXED') {
        if (t !== this.#resultType) {
            const newType = this.#resultType ? 'MIXED' : t
            for (const n of this.ancestors(false)) {
                if (this.#resultType) {
                    n.index?.results[this.#resultType].delete(this)
                }
                n.index?.results[newType].add(this)
            }
            this.#resultType = newType
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

        this.stack.resultType = result.type

        this.dispatch('result', {node: this, result})
    })
}

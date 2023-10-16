import { EventEmitter, getEventDispatch } from '../../event'
import { TestEventMap } from './TestEvent'
import { TestInstanceIndex, TestStackIndex } from './TestIndex'
import { TestRunInstance } from './TestRun'

export abstract class TestNodeStack<T extends TestNodeInstance = TestNodeInstance> extends EventEmitter<TestEventMap> {
    readonly instances = new Map<TestRunInstance, T>()
    readonly children?: Map<string, TestNodeStack>
    readonly index?: TestStackIndex

    protected constructor(
        readonly parent: TestNodeStack|undefined,
        protected readonly ident: string,
    ) {
        super(parent)
    }
    protected static init(instance: TestNodeStack): void {
        instance.parent?.children?.set(instance.ident, instance)
    }

    *ancestors(includeSelf = true) {
        for(let el = includeSelf ? this : this.parent; el; el = el.parent) {
            yield el
        }
    }
}

export abstract class TestNodeInstance extends EventEmitter<TestEventMap>{
    abstract readonly run: TestRunInstance
    readonly children?: Map<string, TestNodeInstance>
    readonly index?: TestInstanceIndex

    protected constructor(
        readonly stack: TestNodeStack,
        readonly parent: TestNodeInstance|undefined,
        protected readonly ident: string,
    ) {
        super(parent)
    }
    protected static init(instance: TestNodeInstance): void {
        instance.stack.instances.set(instance.run, instance)
        instance.parent?.children?.set(instance.ident, instance)
    }

    protected dispatch<K extends keyof TestEventMap>(type: K, init: TestEventMap[K]): void {
        getEventDispatch(this)(type, init)
        getEventDispatch(this.stack)(type, init)
    }

    *ancestors(includeSelf = true) {
        for(let el = includeSelf ? this : this.parent; el; el = el.parent) {
            yield el
        }
    }
}

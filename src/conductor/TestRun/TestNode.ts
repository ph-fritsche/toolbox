import { EventEmitter, getEventDispatch } from '../../event'
import { TestEventMap } from './TestEvent'
import { TestInstanceIndex, TestStackIndex } from './TestIndex'
import { TestRunInstance } from './TestRun'

export abstract class TestNodeStack extends EventEmitter<TestEventMap> {
    abstract readonly instances: Map<TestRunInstance, TestNodeInstance>
    readonly children?: TestNodeChildren<TestNodeStack>
    readonly index?: TestStackIndex

    protected constructor(
        readonly parent: TestNodeStack|undefined,
        protected readonly ident: string,
    ) {
        super(parent)
    }
    protected static init(instance: TestNodeStack): void {
        instance.parent?.children?.add(instance.ident, instance)
    }

    *ancestors(includeSelf = true) {
        for(let el = includeSelf ? this : this.parent; el; el = el.parent) {
            yield el
        }
    }

    get previousSibling() {
        return this.parent?.children?.previous(this)
    }
    get nextSibling() {
        return this.parent?.children?.next(this)
    }

    get previousNode(): TestNodeStack {
        return getPreviousNode(this)
    }
    get nextNode(): TestNodeStack {
        return getNextNode(this)
    }
}

export abstract class TestNodeInstance extends EventEmitter<TestEventMap>{
    abstract readonly run: TestRunInstance
    readonly children?: TestNodeChildren<TestNodeInstance>
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
        instance.parent?.children?.add(instance.ident, instance)
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

    get previousSibling() {
        return this.parent?.children?.previous(this)
    }
    get nextSibling() {
        return this.parent?.children?.next(this)
    }

    get previousNode(): TestNodeInstance {
        return getPreviousNode(this)
    }
    get nextNode(): TestNodeInstance {
        return getNextNode(this)
    }
}

export class TestNodeChildren<T, Ident = string> implements Iterable<[T, Ident, number], void, undefined> {
    #ids = new Map<T, number>()
    #idents = new Map<Ident, T>()
    #items: T[] = []

    add(ident: Ident, item: T) {
        if (this.#idents.has(ident)) {
            throw new Error(`Child "${String(ident)}" already exists.`)
        }

        const i = this.#items.length
        this.#items.push(item)
        this.#ids.set(item, i)
        this.#idents.set(ident, item)
    }

    has(ident: Ident) {
        return this.#idents.has(ident)
    }

    get(ident: Ident) {
        return this.#idents.get(ident)
    }

    get size() {
        return this.#idents.size
    }

    getPos(item: T) {
        const i = this.#ids.get(item)
        if (i === undefined) {
            throw new Error('Item is not a child')
        }
        return i
    }

    nth(i: number): T|undefined {
        return this.#items[i]
    }

    get first(): T|undefined {
        return this.#items[0]
    }

    get last(): T|undefined {
        return this.#items[this.#items.length - 1]
    }

    previous(item: T) {
        return this.nth(this.getPos(item) - 1)
    }

    next(item: T) {
        return this.nth(this.getPos(item) + 1)
    }

    *[Symbol.iterator](): Generator<[T, Ident, number], void, undefined> {
        let i = 0
        for (const [ident, item] of this.#idents) {
            yield [item, ident, i]
            i++
        }
    }

    values() {
        return this.#items.values()
    }

    keys() {
        return this.#idents.keys()
    }
}

function getPreviousNode<T extends TestNodeStack|TestNodeInstance>(node: T) {
    for (let n = node;;) {
        const previousSibling = n.previousSibling
        if (previousSibling) {
            return getLastLeaf(previousSibling as T)
        } else if (n.parent) {
            return n.parent as T
        } else {
            return getLastLeaf(n)
        }
    }
}

function getLastLeaf<T extends TestNodeStack|TestNodeInstance>(node: T) {
    for (let n = node;;) {
        const lastChild = n.children?.last
        if (lastChild) {
            n = lastChild as T
        } else {
            return n
        }
    }
}

function getNextNode<T extends TestNodeStack|TestNodeInstance>(node: T) {
    return (node.children?.first ?? getNextBranch(node)) as T
}

function getNextBranch<T extends TestNodeStack|TestNodeInstance>(node: T) {
    for (let n = node;;) {
        const nextSibling = n.nextSibling
        if (nextSibling) {
            return nextSibling as T
        } else if (n.parent) {
            n = n.parent as T
        } else {
            return n
        }
    }
}


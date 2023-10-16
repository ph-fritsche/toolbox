class Counter {
    #i = 1
    next() {
        return this.#i++
    }
}

export class TestSuite {
    readonly nodeCounter: Counter = new Counter()

    readonly children: (TestGroup|TestFunction)[] = []
    readonly beforeAll: BeforeCallback[] = []
    readonly beforeEach: BeforeCallback[] = []
    readonly afterAll: AfterCallback[] = []
    readonly afterEach: AfterCallback[] = []

    toJSON() {
        return { children: this.children }
    }
}

abstract class TestChildNode {
    readonly suite: TestSuite
    readonly id: number

    constructor(
        readonly parent: TestSuite|TestGroup,
        readonly title: string,
    ) {
        this.suite = parent instanceof TestSuite ? parent : parent.suite
        this.id = this.suite.nodeCounter.next()
        if (this instanceof TestGroup || this instanceof TestFunction) {
            parent.children.push(this)
        }
    }
}

export class TestGroup extends TestChildNode {
    readonly children: (TestGroup|TestFunction)[] = []
    readonly beforeAll: BeforeCallback[] = []
    readonly beforeEach: BeforeCallback[] = []
    readonly afterAll: AfterCallback[] = []
    readonly afterEach: AfterCallback[] = []

    toJSON() {
        return {
            id: this.id,
            title: this.title,
            children: this.children,
        }
    }
}

export type BeforeCallback = (this: TestSuite|TestGroup) => void | AfterCallback | Promise<void | AfterCallback>

export type AfterCallback = (this: TestSuite|TestGroup) => void | Promise<void>

export class TestFunction extends TestChildNode {
    constructor(
        readonly parent: TestSuite|TestGroup,
        readonly title: string,
        readonly callback: TestCallback,
        readonly timeout?: number,
    ) {
        super(parent, title)
    }

    toJSON() {
        return {
            id: this.id,
            title: this.title,
        }
    }
}

export type TestCallback<Args extends unknown[] = []> = (this: TestFunction, ...args: Args) => void | Promise<void>

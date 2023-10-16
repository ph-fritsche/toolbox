import { TestFunction, TestGroup, TestSuite } from './TestNode'

export class TestNodeFilterIterator {
    constructor(
        readonly element: TestSuite|TestGroup|TestFunction,
        readonly filter?: (item: TestGroup|TestFunction) => boolean,
    ) {
        this.hit = this.element instanceof TestSuite ? false : !!filter?.(this.element)

        this.children = 'children' in element
            ? element.children.map(c => new TestNodeFilterIterator(c, filter))
            : []

        this.include = this.hit || !filter || this.children.some(el => el.include)
    }

    readonly hit: boolean
    readonly include: boolean
    readonly children: TestNodeFilterIterator[]

    *[Symbol.iterator](): Generator<TestNodeFilterIterator, void, undefined> {
        yield* this.children
    }
}

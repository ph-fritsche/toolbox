import { Entity } from './Entity'
import { Test } from './Test'

export class TestGroup extends Entity {
    readonly parent?: TestGroup
    readonly title: string

    protected _children: Array<TestGroup|Test>
    get children() {
        return [...this._children]
    }

    constructor(
        props: {
            id?: string
            title: string
            children?: Array<TestGroup|Test>
        },
    ) {
        super(props)
        this.title = props.title
        this._children = props.children ?? []
        for (const c of this._children) {
            Object.defineProperty(c, 'parent', {
                configurable: true,
                get: () => this
            })
        }
    }

    getHierarchy() {
        const path: TestGroup[] = [this]
        for (let p = this.parent; p; p = p.parent) {
            path.push(p)
        }
        return path.reverse()
    }

    getTestsIteratorIterator<T extends TestGroup>(
        this: T,
        filter?: (item: Children<T>) => boolean,
    ): TestsIteratorGroupNode<T> {
        const hitSelf = filter?.(this)
        const elements = this._children.map(child => {
            if ('getTestsIteratorIterator' in child) {
                return child.getTestsIteratorIterator(hitSelf ? undefined : filter)
            } else {
                return {
                    element: child,
                    include: hitSelf || !filter || filter(child)
                }
            }
        })
        const include = elements.some(el => el.include)

        return {
            *[Symbol.iterator]() {
                yield* elements as TestsIteratorNode<T>[]
            },
            element: this,
            include,
        }
    }

    *getTests<T extends TestGroup>(
        this: T,
    ) {
        yield* this.getTestsGenerator(this.getTestsIteratorIterator())
    }

    private *getTestsGenerator<T extends TestGroup>(
        this: T,
        node: TestsIteratorGroupNode<T>,
        parents: TestGroup[] = [],
    ): Generator<Test> {
        for (const child of node) {
            if (isGroup(child)) {
                yield* this.getTestsGenerator(child, [...parents, node.element])
            } else {
                yield child.element as Test
            }
        }
    }

    *getDescendents<T extends TestGroup>(
        this: T,
    ) {
        yield* this.getDescendentsGenerator(this.getTestsIteratorIterator())
    }

    private *getDescendentsGenerator<T extends TestGroup>(
        this: T,
        node: TestsIteratorGroupNode<T>,
        parents: TestGroup[] = [],
    ): Generator<Test|TestGroup> {
        for (const child of node) {
            yield child.element
            if (isGroup(child)) {
                yield* this.getDescendentsGenerator(child, [...parents, node.element])
            }
        }
    }

    toJSON() {
        return {
            id: this.id,
            title: this.title,
            children: this._children,
        }
    }
}

function isGroup<T extends TestGroup>(
    node: TestsIteratorNode<T>,
): node is TestsIteratorGroupNode<T> {
    return Symbol.iterator in node
}

type Children<T extends TestGroup> = T['children'][number]

type Item<T extends TestGroup> = Exclude<T['children'][number], T>
export type TestsIteratorTestNode<Group extends TestGroup> = {
    element: Item<Group>
    include: boolean
}
export type TestsIteratorGroupNode<Group extends TestGroup> = {
    element: Group
    include: boolean
} & Iterable<TestsIteratorNode<Group>>
export type TestsIteratorNode<Group extends TestGroup> =
    | TestsIteratorTestNode<Group>
    | TestsIteratorGroupNode<Group>

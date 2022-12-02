import { Test } from './Test';
import { TestGroup } from './TestGroup'

type Child<T> = T extends TestGroup ? T['children'][number] : never

export class TreeIterator<T extends TestGroup|Test> {
    constructor(
        readonly element: T
    ) {

    }

    *getAncestors(): Generator<T['parent']> {
        for (let el = this.element.parent; el; el = el.parent) {
            yield el
        }
    }

    *getDescendents(): Generator<Child<T>> {
        if ('children' in this.element) {
            for (const el of this.element.children) {
                yield el as Child<T>
                yield* new TreeIterator(el).getDescendents() as Generator<Child<T>>
            }
        }
    }
}

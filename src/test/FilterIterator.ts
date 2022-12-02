import { Test } from './Test'
import { TestGroup } from './TestGroup'

type Child<T> = T extends TestGroup ? T['children'][number] : never

export class FilterIterator<T extends TestGroup|Test> {
    constructor(
        readonly element: T,
        readonly filter?: (item: T | Child<T>) => boolean,
    ) {
        this.hit = filter?.(this.element)

        if ('children' in element) {
            this.children = element.children.map(child => new FilterIterator(child, filter) as FilterIterator<Child<T>>)
        }

        this.include = this.hit || !filter || this.children.some(el => el.include)
    }

    readonly hit: boolean
    readonly include: boolean
    readonly children: FilterIterator<Child<T>>[] = []

    ;*[Symbol.iterator](): Generator<FilterIterator<Child<T>>, void, undefined> {
        yield* this.children
    }
}

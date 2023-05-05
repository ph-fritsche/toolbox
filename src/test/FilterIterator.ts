import { Test } from './Test'
import { TestGroup } from './TestGroup'

type Child<T> = T extends {children: Array<unknown>} ? T['children'][number] : never
type Filter<T> = (item: T | Child<T>) => boolean

export class FilterIterator<T extends TestGroup|Test> {
    constructor(
        readonly element: T,
        readonly filter?: Filter<T>,
    ) {
        this.hit = !!filter?.(this.element)

        if ('children' in element) {
            this.children = element.children.map(child => new FilterIterator<Child<T>>(
                child as Child<T>,
                filter as Filter<Child<T>>,
            ))
        }

        this.include = this.hit || !filter || this.children.some(el => el.include)
    }

    readonly hit: boolean
    readonly include: boolean
    readonly children: FilterIterator<Child<T>>[] = []

        ;
    *[Symbol.iterator](): Generator<FilterIterator<Child<T>>, void, undefined> {
        yield* this.children
    }
}

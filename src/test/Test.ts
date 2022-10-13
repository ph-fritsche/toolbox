import { Entity } from './Entity'
import { TestGroup } from './TestGroup'
import { Serializable } from './types'

export class Test extends Entity {
    readonly parent?: TestGroup
    readonly title: string

    constructor(
        props: Partial<Test>,
    ) {
        super(props)
        for (const k in props) {
            this[k] = props[k]
        }
    }

    ancestors() {
        let p = []
        let n: TestGroup|Test = this
        while(n.parent) {
            p.push(n.parent)
            n = n.parent
        }
        return p.reverse()
    }

    toJSON(): Serializable<Test> {
        return {
            id: this.id,
            title: this.title,
        }
    }
}

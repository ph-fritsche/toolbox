import { Entity } from './Entity'
import { TestGroup } from './TestGroup'

export class Test extends Entity {
    readonly parent?: TestGroup
    readonly title: string

    constructor(
        props: {
            id?: string
            title: string
        },
    ) {
        super(props)
        this.title = props.title
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

    toJSON() {
        return {
            __T: 'Test',
            id: this.id,
            title: this.title,
        }
    }
}

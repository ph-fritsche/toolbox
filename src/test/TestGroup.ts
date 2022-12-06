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

    toJSON() {
        return {
            __T: 'TestGroup',
            id: this.id,
            title: this.title,
            children: this._children,
        }
    }
}

import { TestGroup as BaseTestGroup } from '../test/TestGroup'
import { Test } from './Test'
import { TestError } from './TestError'

export class TestGroup extends BaseTestGroup {
    declare parent?: TestGroup
    declare protected _children: (TestGroup | Test)[]
    get children() {
        return [...this._children]
    }

    protected readonly _errors: TestError[] = []
    get errors() {
        return [...this._errors]
    }

    addError(error: TestError) {
        this._errors.push(error)
        error.group = this
    }
}

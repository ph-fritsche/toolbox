import { Test as BaseTest } from '../test/Test'
import { TestGroup } from './TestGroup'
import { TestResult } from './TestResult'

export class Test extends BaseTest {
    declare parent?: TestGroup
    readonly results: TestResult[] = []

    addError(result: TestResult) {
        this.results.push(result)
        result.test = this
    }
}

import {ModuleMocker} from 'jest-mock'
import {Expect} from 'expect'
import { TestContext } from '#src'

type PromiseOrReturn<T> = Promise<T> | PromiseLike<T> | T

declare global {
    var afterAll: TestContext['afterAll']
    var afterEach: TestContext['afterEach']
    var beforeAll: TestContext['beforeAll']
    var beforeEach: TestContext['beforeEach']
    var describe: TestContext['describe']
    var test: TestContext['test']

    var expect: Expect
    var mock: ModuleMocker
}

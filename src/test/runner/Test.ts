import { Test as BaseTest } from '../Test'
import type { TestGroup } from './TestGroup'

export type TestCallback<Args extends [] = []> = (this: Test, ...args: Args) => void | Promise<void>

export class Test extends BaseTest {
    declare readonly parent: TestGroup
    readonly callback: TestCallback
    readonly timeout?: number

    constructor(
        props: Partial<BaseTest> & {
            parent: TestGroup
            callback: TestCallback
            timeout?: number
        }
    ) {
        super(props)
    }
}

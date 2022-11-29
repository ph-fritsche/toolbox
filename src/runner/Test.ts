import { Test as BaseTest } from '../test/Test'
import type { TestGroup } from './TestGroup'

export type TestCallback<Args extends unknown[] = []> = (this: Test, ...args: Args) => void | Promise<void>

export class Test extends BaseTest {
    declare readonly parent: TestGroup
    readonly callback: TestCallback
    readonly timeout?: number

    constructor(
        props: ConstructorParameters<typeof BaseTest>[0] & {
            parent: TestGroup
            callback: TestCallback
            timeout?: number
        }
    ) {
        super(props)
    }
}

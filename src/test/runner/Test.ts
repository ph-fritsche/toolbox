import type { TestGroup } from './TestGroup'

export type TestCallback<Args extends [] = []> = (this: Test, ...args: Args) => void | Promise<void>

export class Test {
    constructor(
        title: string,
        parent: TestGroup,
        callback: TestCallback,
        timeout?: number,
    ) {
        this.title = title
        this.parent = parent
        this.callback = callback
        this.timeout = timeout
    }
    readonly title: string
    readonly parent?: TestGroup
    readonly callback: TestCallback
    readonly timeout?: number
}

import { TestHookType } from './enum'

export class TestHook {
    constructor(
        readonly type: TestHookType,
        readonly index: number,
        readonly name = '',
        readonly cleanup = false,
    ) {}
}

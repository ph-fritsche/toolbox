import { Test } from '../test/Test'
import { TestGroup } from './TestGroup'
import { TestError as BaseTestError } from '../test/TestError'

export class TestError extends BaseTestError {
    constructor(
        readonly context: TestGroup,
        readonly hook: string,
        reason: string|Error,
        readonly test?: Test,
    ) {
        const {message, cause = undefined, name = 'Error', stack = undefined} = typeof reason === 'string'
            ? {message: reason}
            : reason
        super({message, name, stack, cause})
    }
}

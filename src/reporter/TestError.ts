import { TestError as BaseTestError } from '../test/TestError'
import { Test } from './Test'
import { TestGroup } from './TestGroup'

export class TestError extends BaseTestError {
    public group: TestGroup
    public hook?: string
    public test?: Test
}

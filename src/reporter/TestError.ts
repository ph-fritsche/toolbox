import { TestError as BaseTestError } from '../test/TestError'
import { TestGroup } from './TestGroup'

export class TestError extends BaseTestError {
    public group: TestGroup
}

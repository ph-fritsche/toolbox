import { TestResult as BaseTestResult } from '../test/TestResult'
import { Test } from './Test'

export class TestResult extends BaseTestResult {
    public test?: Test
}

import { TestFunction, TestFunctionStack } from './TestFunction'
import { TestGroup, TestGroupStack } from './TestGroup'
import { TestRunInstance, TestRunStack } from './TestRun'
import { TestSuite, TestSuiteStack } from './TestSuite'

export function isTestRunStack(n: unknown): n is TestRunStack {
    return n instanceof TestRunStack
}
export function isTestSuiteStack(n: unknown): n is TestSuiteStack {
    return n instanceof TestSuiteStack
}
export function isTestGroupStack(n: unknown): n is TestGroupStack {
    return n instanceof TestGroupStack
}
export function isTestFunctionStack(n: unknown): n is TestFunctionStack {
    return n instanceof TestFunctionStack
}
export function isTestRun(n: unknown): n is TestRunInstance {
    return n instanceof TestRunInstance
}
export function isTestSuite(n: unknown): n is TestSuite {
    return n instanceof TestSuite
}
export function isTestGroup(n: unknown): n is TestGroup {
    return n instanceof TestGroup
}
export function isTestFunction(n: unknown): n is TestFunction {
    return n instanceof TestFunction
}

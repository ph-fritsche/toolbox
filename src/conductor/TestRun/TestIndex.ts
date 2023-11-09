import { TestFunction, TestFunctionStack } from './TestFunction'
import { TestGroup, TestGroupStack } from './TestGroup'
import { TestSuite, TestSuiteStack } from './TestSuite'
import { TestResultType, TestRunState } from './enum'

export class TestStackIndex {
    readonly errors = new Set<TestGroupStack|TestSuiteStack>
    readonly tests = new Set<TestFunctionStack>
    readonly results = new TestStackIndexResults
}

class TestStackIndexResults {
    readonly [TestResultType.success] = new Set<TestFunctionStack>()
    readonly [TestResultType.fail] = new Set<TestFunctionStack>()
    readonly [TestResultType.skipped] = new Set<TestFunctionStack>()
    readonly [TestResultType.timeout] = new Set<TestFunctionStack>()
    readonly MIXED = new Set<TestFunctionStack>()

    get size() {
        return this.fail.size + this.skipped.size + this.success.size + this.timeout.size
    }
}

export class TestRunStackIndex extends TestStackIndex {
    readonly suites = new TestIndexSuites()
}

export class TestInstanceIndex {
    readonly errors = new Set<TestGroup|TestSuite>
    readonly tests = new Set<TestFunction>
    readonly results = new TestInstanceIndexResults()
}

class TestInstanceIndexResults {
    readonly [TestResultType.success] = new Set<TestFunction>()
    readonly [TestResultType.fail] = new Set<TestFunction>()
    readonly [TestResultType.skipped] = new Set<TestFunction>()
    readonly [TestResultType.timeout] = new Set<TestFunction>()

    get size() {
        return this.fail.size + this.skipped.size + this.success.size + this.timeout.size
    }
}

export class TestRunInstanceIndex extends TestInstanceIndex {
    readonly suites = new TestIndexSuites()
}

class TestIndexSuites {
    readonly [TestRunState.pending] = new Set<TestSuite>
    readonly [TestRunState.skipped] = new Set<TestSuite>
    readonly [TestRunState.running] = new Set<TestSuite>
    readonly [TestRunState.done] = new Set<TestSuite>
}

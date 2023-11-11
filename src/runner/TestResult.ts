import { TestResultData } from '../conductor/TestReporter'
import { TestResultType } from '../conductor/TestRun'
import { TestFunction } from './TestNode'

export class TestResult {
    constructor(
        readonly node: TestFunction,
        readonly error?: Error|string,
        readonly duration?: number,
    ) {
        this.node = node
    }

    get nodeId(): number {
        return this.node.id
    }

    get type(): TestResultType {
        if (this.error instanceof TimeoutError) {
            return TestResultType.timeout
        } else if (this.error) {
            return TestResultType.fail
        } else if (this.duration !== undefined) {
            return TestResultType.success
        } else {
            return TestResultType.skipped
        }
    }

    toJSON(): TestResultData {
        return {
            nodeId: this.node.id,
            type: this.type,
            error: this.error,
            duration: this.duration,
        }
    }
}

export class TestError extends Error {
    static fromError(e: Error) {
        return new TestError(e.message, {cause: e})
    }

    get name() {
        return this.cause instanceof Error ? this.cause.name : this.constructor.name
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            stack: this.cause instanceof Error ? this.cause.stack : this.stack,
        }
    }
}

export class TimeoutError extends TestError { }

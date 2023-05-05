import type { CoverageMapData } from 'istanbul-lib-coverage'
import { Entity } from '../test/Entity'
import { Test } from './Test'
import { TestError } from './TestError'
import { TestGroup } from './TestGroup'
import { TestResult } from './TestResult'
import { TestConductor } from '../conductor/TestConductor'
import { promise } from '../util/promise'
import { TestRunStack } from './TestRunStack'

export class TestRun extends Entity implements PromiseLike<void> {
    static create(
        conductor: TestConductor,
        others?: ConstructorParameters<typeof Entity>[0],
    ) {
        const run = new TestRun(conductor, others)
        return {
            run,
            start: () => {
                if (run._state === 'pending') {
                    run._state = 'running'
                    run._startPromise.resolve()
                    return run.conductor.reporterServer.reportStart(run)
                }
            },
            done: () => {
                if (run._state === 'running') {
                    run._state = 'done'
                    run._donePromise.resolve()
                    return run.conductor.reporterServer.reportDone(run)
                }
            },
        }
    }

    readonly stack?: TestRunStack

    protected constructor(
        readonly conductor: TestConductor,
        others?: ConstructorParameters<typeof Entity>[0],
    ) {
        super(others)
    }

    protected _state: 'pending' | 'running' | 'done' = 'pending'
    protected _startPromise = promise<void>()
    protected _donePromise = promise<void>()
    get state() {
        return this._state
    }

    suites = new Map<string, TestGroup>()
    groups = new Map<string, TestGroup>()
    tests = new Map<string, Test>()
    /** Map testId->TestResult */
    results = new Map<string, TestResult>
    /** Map groupId->TestError */
    errors = new Map<string, TestError[]>
    /** Map groupId->CoverageMapData */
    coverage = new Map<string, CoverageMapData>

    get onStart() {
        return this._startPromise.Promise.then.bind(this._startPromise.Promise)
    }
    get onDone() {
        return this._donePromise.Promise.then.bind(this._donePromise.Promise)
    }
    get then() {
        return this._donePromise.Promise.then.bind(this._donePromise.Promise)
    }
}

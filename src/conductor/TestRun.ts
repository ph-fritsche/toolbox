import type { CoverageMapData } from 'istanbul-lib-coverage'
import { Entity } from '../test/Entity'
import { Test } from '../reporter/Test'
import { TestError } from '../reporter/TestError'
import { TestGroup } from '../reporter/TestGroup'
import { TestResult } from '../reporter/TestResult'
import { TestConductor } from './TestConductor'

export class TestRun extends Entity {
    constructor(
        readonly conductor: TestConductor,
        others?: ConstructorParameters<typeof Entity>[0],
    ) {
        super(others)
    }

    state: 'pending' | 'running' | 'done' = 'pending'
    suites = new Map<string, TestGroup>()
    groups = new Map<string, TestGroup>()
    tests = new Map<string, Test>()
    /** Map testId->TestResult */
    results = new Map<string, TestResult>
    /** Map groupId->TestError */
    errors = new Map<string, TestError[]>
    /** Map groupId->CoverageMapData */
    coverage = new Map<string, CoverageMapData>
}

import { setupToolboxTester, TestContext } from '../src'
import { TestConductor } from '../src/conductor/TestConductor'
import { TestCompleteData, TestErrorData, TestReporter, TestResultData, TestScheduleData } from '../src/conductor/TestReporter'
import { TestHookType } from '../src/conductor/TestRun'
import { FsWatcher } from '../src/files/FsWatcher'
import { TestRunner } from '../src/runner'
import { AfterCallback, BeforeCallback } from '../src/runner/TestNode'
import { TimeoutError } from '../src/runner/TestResult'
import { AbortablePromise } from '../src/util/AbortablePromise'
import { setupToolboxRunner } from '../test/_setup'

export function setupMockTester(results: MockResults) {
    return setupToolboxTester([], [
        () => new MockConductor('Mock, First', results, 0),
        () => new MockConductor('Mock, Second', results, 1),
        () => new MockConductor('Mock, Third', results, 2),
    ], [], {
        runnerFactory: setupToolboxRunner,
        connectConsoleReporter: false,
        watcherFactory: () => ({
            get ready() {
                return Promise.resolve()
            },
            files() {
                return new Set(Object.keys(results)).keys()
            },
            has(path: string) {
                return Object.keys(results).includes(path)
            },
            watch() {
                return Promise.resolve()
            },
            unwatch() {
                return void 0
            },
            onChange() {
                return () => void 0
            },
            onUnlink() {
                return () => void 0
            },
            close() {
                return Promise.resolve()
            },
        } as unknown as FsWatcher),
        mapPathsToTestFiles(fileserverUrl, subPaths) {
            return Array.from(subPaths).map(s => ({
                title: s,
                url: s,
            }))
        },
    })
}

export type MockResults = Record<string, MockSuite>
type A<T> = Array<T|undefined>|T
type MockSuite = {
    error?: A<Error>
    beforeAll?: A<BeforeCallback>[]
    beforeEach?: A<BeforeCallback>[]
    afterAll?: A<AfterCallback>[]
    afterEach?: A<AfterCallback>[]
    children: Array<MockGroup|MockFunction>
}
type MockGroup = MockSuite & {
    title: string
}
type MockFunction = {
    title: string
    fn?: A<() => void>
}

export class MockConductor extends TestConductor {
    constructor(
        title: string|undefined,
        public mockResults: MockResults,
        public mixedResultsIndex = 0,
    ) {
        super(title)
    }

    runTestSuite(
        reporter: TestReporter,
        suiteUrl: string,
        filter?: RegExp,
        abortController: AbortController = new AbortController(),
    ): AbortablePromise<void> {
        return new AbortablePromise(abortController, (res) => {
            const ctx = {}
            new TestRunner(
                {
                    schedule: async d => this.tryReport(reporter, 'schedule', d),
                    result: async d => this.tryReport(reporter, 'result', d),
                    error: async d => this.tryReport(reporter, 'error', d),
                    complete: async d => this.tryReport(reporter, 'complete', d),
                },
                undefined,
                ctx,
                async url => {
                    if (url === suiteUrl && this.mockResults[url]) {
                        this.createMockTests(ctx as TestContext, this.mockResults[url])
                    }
                },
            ).run(
                [],
                suiteUrl,
                filter,
            ).then(res, res)
        })
    }

    protected createMockTests(
        ctx: TestContext,
        mockData: MockSuite|MockGroup,
    ) {
        this.createMockHook(ctx, TestHookType.beforeAll, mockData)
        this.createMockHook(ctx, TestHookType.beforeEach, mockData)
        this.createMockHook(ctx, TestHookType.afterAll, mockData)
        this.createMockHook(ctx, TestHookType.afterEach, mockData)
        for (const c of mockData.children) {
            if ('children' in c) {
                ctx.describe(c.title, () => this.createMockTests(ctx, c))
            } else {
                ctx.test(
                    c.title,
                    () => new Promise<void>(r => setTimeout(r, 200))
                        .then(() => (Array.isArray(c.fn) ? c.fn[this.mixedResultsIndex] : c.fn)?.()),
                )
            }
        }
        const e = Array.isArray(mockData.error) ? mockData.error.at(this.mixedResultsIndex) : mockData.error
        if (e) {
            throw e
        }
    }

    protected createMockHook(
        ctx: TestContext,
        hook: TestHookType,
        mockData: MockSuite|MockGroup,
    ) {
        mockData[hook]?.forEach(a => {
            const f = Array.isArray(a) ? a.at(this.mixedResultsIndex) : a
            if (f) {
                ctx[hook](f as () => void)
            }
        })
    }

    protected tryReport<K extends 'schedule'|'result'|'error'|'complete'>(
        reporter: TestReporter,
        key: K,
        data: Parameters<TestReporter[K]>[0],
    ) {
        try {
            reporter[key](data as (TestScheduleData & TestResultData & TestErrorData & TestCompleteData))
        } catch {
            return
        }
    }
}

export const results: MockResults = {
    'foo': {
        children: [
            {title: 'important group', children: [
                {title: 'a nice feature'},
                {title: 'some bug fix'},
            ]},
        ],
    },
    'bar': {
        children: [
            {title: 'another group', children: [
                {title: 'very important task with a lot of text in the test description'},
                {title: 'failing task', fn: () => { throw new Error('some error') }},
                {title: 'another passing test'},
            ]},
        ],
    },
    'baz': {
        children: [
            {title: 'some test that should pass'},
        ],
    },
    'suite/without/tests': {
        children: [],
    },
    'Suite with timeout': {
        children: [
            {title: 'some passing test'},
            {title: 'some test that times out', fn: () => { throw new TimeoutError() }},
            {title: 'another passing test'},
            {title: 'time out in one conductor', fn: [undefined, () => { throw new TimeoutError() }]},
        ],
    },
    'Exception in a hook': {
        children: [
            {title: 'Group containing failing hooks', children: [
                {title: 'A passing test that can not be trusted'},
                {title: 'Another untrustworthy result because of a failing hook'},
            ], beforeEach: [
                function successfulHook() { return },
                function failingHook(){ throw 'Something went wrong as planned.' },
                function anotherFailingHook(){ throw new Error('Expected error')},
                function (){ throw new Error('One more error in an anonymous function')},
            ]},
            {title: 'Other test that passes.'},
            {title: 'Outer group', children: [
                {title: 'Group hook that fails in one conductor', children: [
                    {title: 'A passing test'},
                    {title: 'Nested group', children: [
                        {title: 'Another passing test'},
                        {title: 'A test that fails when the hook fails', fn: [undefined, () => { throw new Error('Something that depends on the failing hook') }]},
                    ]},
                ], beforeAll: [
                    [undefined, function() { throw new Error('Some error in second conductor') }],
                ]},
            ]},
        ],
    },
    'Exception in a group': {
        children: [
            {title: 'Ancestor', children: [
                {title: 'Nested group with broken describe', children: [
                    {title: 'Some test'},
                ], error: new Error('Error in describe function')},
            ]},
        ],
    },
    'Mixed results in conductors': {
        children: [
            {title: 'Group with the mixed result', children: [
                {title: 'A test that passes'},
                {title: 'Fail in second conductor', fn: [
                    undefined,
                    () => { throw 'some error'},
                ]},
                {title: 'Another test'},
            ]},
        ],
    },
}

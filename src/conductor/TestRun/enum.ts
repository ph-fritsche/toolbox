export enum TestRunState {
    pending = 'pending',
    skipped = 'skipped',
    running = 'running',
    done = 'done',
}

export enum TestHookType {
    beforeAll = 'beforeAll',
    beforeEach = 'beforeEach',
    afterAll = 'afterAll',
    afterEach = 'afterEach',
}

export enum TestResultType {
    skipped = 'skipped',
    timeout = 'timeout',
    fail = 'fail',
    success = 'success',
}

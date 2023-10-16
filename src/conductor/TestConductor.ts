import { TestReporter } from './TestReporter'

export abstract class TestConductor {
    public readonly title: string

    constructor(
        title?: string,
        setupFiles: URL[] = [],
        public readonly coverageVar: string = '__coverage__',
    ) {
        this.title = title ?? this.constructor.name
        this.setSetupFiles(setupFiles)
    }

    toString() {
        return this.title
    }

    protected setupFiles: URL[] = []
    setSetupFiles(
        files: URL[],
    ) {
        this.setupFiles = files
    }

    async close() {
        // empty
    }

    abstract runTestSuite(
        reporter: TestReporter,
        suiteUrl: string,
        filter?: RegExp,
    ): Promise<void>
}

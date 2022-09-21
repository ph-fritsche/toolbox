interface Files {
    server: URL
    paths: string[]
}

export abstract class TestConductor {
    protected abstract readonly supportedFilesProtocols: string[]
    protected readonly includeFilesProtocol: boolean = false

    async runTests(
        setup: Files[],
        tests: Files[],
    ) {
        const setupFiles = ([] as string[])
            .concat(...setup.map(f => {
                const base = this.resolveBasePath(f)
                return f.paths.map(p => `${base}${p}`)
            }))
        const testFiles = ([] as Array<{name: string, url: string}>)
            .concat(...tests.map(f => {
                const base = this.resolveBasePath(f)
                return f.paths.map(p => ({
                    name: p,
                    url: `${base}${p}`
                }))
            }))

        console.log('Run Tests', {setupFiles, testFiles})

        await Promise.all(testFiles.map(f => this.runTestSuite(setupFiles, f.url, f.name)
            .then(
                () => console.log('successfully ran', f.name),
                () => console.log('failed to run', f.name),
            )
        ))
    }

    protected abstract runTestSuite(
        setupFiles: string[],
        testFile: string,
        name: string,
    ): Promise<void>

    protected resolveBasePath(
        files: Files,
    ): string {
        if (!this.supportedFilesProtocols.includes(files.server.protocol)) {
            throw new Error(`The TestRunner implementation does not support FileServer protocol for "${String(files.server)}"`)
        }
        return (files.server.protocol === 'file:' && !this.includeFilesProtocol
            ? files.server.pathname
            : String(files.server)
        ) + (files.server.pathname.endsWith('/') ? '' : '/')
    }
}

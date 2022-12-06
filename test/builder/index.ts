import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {createProjectBuildProvider} from '#src'

let tmpDir: string
beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'))
})
afterAll(async () => {
    fs.rm(tmpDir, {recursive: true})
})

describe('build fixture src', () => {
    const {
        buildProvider,
        fileProvider,
        fileServer,
        onBuildDone,
    } = createProjectBuildProvider([
        path.resolve('./test/_fixtures/src'),
    ], {
        tsConfigFile: './tsconfig.json',
    })

    test('provide transpiled code', async () => {
        await new Promise<void>(r => onBuildDone(async () => r()))

        expect(Array.from(fileProvider.files.keys())).toEqual([
            'test/_fixtures/src/javascript.js',
            'test/_fixtures/src/typescript.js',
        ])
    })
    
})

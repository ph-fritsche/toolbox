import fsSync from 'fs'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { FileServer, FileServerEventMap } from './FileServer'
import { OutputFilesMap } from '../builder'

type TmpFileServerEventMap = FileServerEventMap & {
    update: {
        prune: string[]
        mkDir: string[]
        write: string[]
    }
}

export class TmpFileServer extends FileServer<TmpFileServerEventMap> {
    constructor(
        prefix = 'toolbox-',
    ) {
        super()
        this._url = new Promise((res, rej) => {
            fsSync.mkdtemp(path.join(os.tmpdir(), prefix), (err, dir) => {
                if (err) {
                    rej(err)
                } else {
                    res(new URL(`file://${dir}`))
                    onExit(() => {
                        if (fsSync.existsSync(dir)) {
                            fsSync.rmSync(dir, { recursive: true })
                        }
                    })
                }
            })
        })
    }

    updateFiles(files: OutputFilesMap) {
        return this._files = this._files.then(async prevFiles => {
            const rootDir = (await this._url).pathname

            const dirs = new Set<string>()
            files.forEach((f, name) => {
                const pathSegs = name.split('/').slice(0, -1)
                pathSegs.forEach((_, i) => {
                    dirs.add(pathSegs.slice(0, i + 1).join('/'))
                })
            })

            const prune: string[] = []
            const existingDirs = new Set<string>()
            prevFiles.forEach((f, name) => {
                const pathSegs = name.split('/').slice(0, -1)
                let pruneDir: string|undefined
                for (const i of pathSegs.keys()) {
                    const d = pathSegs.slice(0, i + 1).join('/')
                    if (!dirs.has(d)) {
                        pruneDir = d
                        break
                    } else {
                        existingDirs.add(d)
                    }
                }
                if (pruneDir) {
                    prune.push(pruneDir)
                } else if (!files.has(name)) {
                    prune.push(name)
                }
            })

            const makeDirs = Array.from(dirs.values()).filter(d => !existingDirs.has(d))

            await Promise.all([
                ...prune.map(f => fs.rm(`${rootDir}/${f}`, {recursive: true})),
            ])

            const mkPromise = new Map<string, Promise<void>>()
            makeDirs.forEach(d => {
                const parent = d.includes('/') ? d.substring(0, d.lastIndexOf('/')) : undefined
                mkPromise.set(d, (parent && mkPromise.get(parent) || Promise.resolve())
                    .then(() => fs.mkdir(`${rootDir}/${d}`))
                )
            })
            await Promise.all(mkPromise.values())

            await Promise.all(
                Array.from(files.entries())
                    .map(([name, {content}]) => fs.writeFile(`${rootDir}/${name}`, content))
            )

            this.emitter.dispatch('update', {
                files,
                prune,
                mkDir: makeDirs,
                write: Array.from(files.keys()),
            })

            return files
        })
    }
}

function onExit(
    cb: (code?: number, signal?: NodeJS.Signals) => void,
) {
    process.on('exit', (code) => {
        cb(code)
        process.exit(code)
    })
    process.on('uncaughtExceptionMonitor', (err) => {
        cb(1)
        console.error(err)
    })
    process.on('SIGINT', (signal) => {
        cb(undefined, signal)
        process.exit(1)
    })
}

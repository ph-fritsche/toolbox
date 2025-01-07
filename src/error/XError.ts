import { Position } from 'source-map'
import { ResolvedValue } from '../util/ResolvedValue'

export class XError implements Error {
    protected constructor(
        readonly name: string,
        readonly message: string,
        readonly stack?: string,
        readonly cause?: unknown,
    ) {
        if (stack) {
            const a: StackEntry[] = []
            this.text = stack.substring(0, forEach(
                genStackEntries(stack),
                e => a.push(e),
            ))
            this.stackEntries = a.reverse()
        } else if (name) {
            this.text = `${this.name}:${this.message}`
        } else {
            this.text = this.message
        }
    }

    toString() {
        let t = this.text
        if (this.stackEntries) {
            t += `\n\n`
            for (const e of this.stackEntries) {
                t += `    at ${String(e)}\n`
            }
        }
        return t
    }

    text: string
    stackEntries?: StackEntry[]
}

function forEach<T, R>(
    generator: Generator<T, R>,
    cb: (item: T) => unknown,
) {
    for(let e;;) {
        e = generator.next()
        if (e.done) {
            return e.value
        }
        cb(e.value)
    }
}

function* genStackEntries(stack: string) {
    let end = stack.length
    for (let start = end;
        start = stack.lastIndexOf('\n', start - 1), start >= 0;
        end = start
    ) {
        const l = stack.substring(start, end)
        if (l === '\n') {
            continue
        }
        const pre = l.match(/^\s+at /)?.[0]
        if (pre === undefined) {
            break
        }
        const raw = l.substring(pre.length)

        const m0 = raw.match(/(?<name>.+) \((?<file>[^)]+):(?<line>\d+):(?<column>\d+)\)$/)
        if (m0?.groups) {
            yield new StackEntry(
                raw,
                m0.groups.file,
                {line: Number(m0.groups.line), column: Number(m0.groups.column)},
                m0.groups.name,
            )
            continue
        }

        const m1 = raw.match(/(?<file>.*):(?<line>\d+):(?<column>\d+)$/)
        if (m1?.groups) {
            yield new StackEntry(
                raw,
                m1.groups.file,
                {line: Number(m1.groups.line), column: Number(m1.groups.column)},
            )
            continue
        }

        yield new StackEntry(raw)
    }
    return end
}

export type SourceLocation = {
    file?: string
    url?: string
    position?: Position
    name?: string
}

export class StackEntry {
    constructor(
        readonly raw: string,
        readonly file?: string,
        readonly position?: Position,
        readonly name?: string,
    ) {
        this.resolved = new ResolvedValue<SourceLocation>({file, position, name})
    }
    readonly resolved

    toString(
        useUrl = false,
    ) {
        const e = this.resolved.get()

        const pos = e.position ? `:${e.position.line}:${e.position.column}` : ''
        if (useUrl && e.url && e.name) {
            return `${e.name} (${e.url})`
        } else if (useUrl && e.url) {
            return `${e.url}`
        } else if (e.name && e.file) {
            return `${e.name} (${e.file}${pos})`
        } else if (e.file) {
            return `${e.file}${pos}`
        }
        return this.raw
    }
}

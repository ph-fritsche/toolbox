import { SourceLocation, StackEntry } from './XError'

export type { SourceLocation }

export interface SourceLocationResolver {
    resolve(loc: SourceLocation): Promise<SourceLocation|undefined>|SourceLocation|undefined
}

export class ErrorStackResolver {
    constructor(
        public resolvers: SourceLocationResolver[],
    ) {}

    #results: Record<string, Promise<SourceLocation>> = {}

    clear() {
        this.#results = {}
    }

    async resolve(entry: StackEntry) {
        if (!(entry.raw in this.#results)) {
            const p = this.#doResolve(entry)
            this.#results[entry.raw] = p
        }

        return await this.#results[entry.raw]
    }

    async #doResolve(entry: StackEntry) {
        let loc: SourceLocation = {
            file: entry.file,
            position: entry.position,
            name: entry.name,
        }
        for (const r of this.resolvers) {
            loc = await r.resolve(loc) ?? loc
        }
        return loc
    }
}

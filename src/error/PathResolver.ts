import { SourceLocationResolver } from './ErrorStackResolver'
import { SourceLocation } from './XError'

export class PathResolver implements SourceLocationResolver {
    constructor(
        path: string,
        resolved: string,
    ) {
        this.path = path + (path.endsWith('/') ? '' : '/')
        this.resolved = resolved
            ? resolved + (resolved.endsWith('/') ? '' : '/')
            : ''
    }
    readonly path: string
    readonly resolved: string

    resolve(loc: SourceLocation) {
        if (loc.file?.startsWith(this.path)) {
            return { ...loc,
                file: this.resolved + loc.file.substring(this.path.length),
            }
        }
    }
}

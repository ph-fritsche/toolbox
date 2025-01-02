import { Position, RawSourceMap, SourceMapConsumer } from 'source-map'
import { FileProvider } from '../files'
import { SourceLocation } from './XError'
import { SourceLocationResolver } from './ErrorStackResolver'

export class SourceMapResolver implements SourceLocationResolver {
    constructor(
        readonly url: string,
        readonly provider: FileProvider,
    ) {}

    resolve(loc: SourceLocation) {
        if (!loc.file?.startsWith(this.url) || !loc.position) {
            return undefined
        }
        const path = loc.file.substring(this.url.length)

        return this.resolveInline(path, loc.position, loc.name)
    }

    protected async resolveInline(
        path: string,
        position: Position,
        name?: string,
    ): Promise<SourceLocation|undefined> {
        try {
            const file = await this.provider.get(path)

            const map = this.getSourceMap(
                file.content.toString(),
                file.origin ?? (this.url + '/' + path),
            )
            if (!map) {
                return undefined
            }

            const resolved = await SourceMapConsumer.with(map.raw, map.url, consumer => {
                return consumer.originalPositionFor(position)
            })

            return {
                file: resolved.source ?? path,
                position: {
                    line: resolved.line ?? position.line,
                    column: resolved.column ?? position.column,
                },
                name: resolved.name ?? name,
            }
        } catch {
            return undefined
        }
    }

    protected getSourceMap(
        source: string,
        sourceUrl: string,
    ) {
        const sourceMappingURL = source.match(/\n\/\/# sourceMappingURL=([^\n]+)\s*$/m)?.[1]

        if (sourceMappingURL?.startsWith('data:application/json')) {
            const encodedMap = sourceMappingURL.match(/^data:application\/json(?:;charset=[-\w]+)?;base64,(?<encoded>[0-9a-zA-Z+/]+)/)?.groups?.encoded
            if (encodedMap) {
                return {
                    raw: JSON.parse(Buffer.from(encodedMap, 'base64').toString()) as RawSourceMap,
                    url: sourceUrl,
                }
            }
        }
    }

}

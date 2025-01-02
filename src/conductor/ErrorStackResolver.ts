import { fileURLToPath } from 'node:url'
import { RawSourceMap, SourceMapConsumer } from 'source-map'

export type FileServer = {
    url: string
    getFile: (path: string) => Promise<string>
    origin?: string
}

export class ErrorStackResolver {
    constructor(
        readonly fileServers: Array<FileServer>,
    ) {}

    async rewriteStack(
        stack: string,
    ) {
        for (let end = stack.length, start = end;
            start = stack.lastIndexOf('\n', start - 1), start >= 0;
            end = start
        ) {
            const l = stack.substring(start, end)
            if (l === '\n') {
                continue
            }
            const at = l.match(/^\s+at /)
            if (!at) {
                break
            }
            const m = l.match(/ \((?<file>[^)]+):(?<line>\d+):(?<column>\d+)\)$/)
            if (!m?.groups || m.index === undefined) {
                continue
            }

            const name = l.substring(at[0].length, m.index)
            const {file, line, column} = m.groups

            const server = this.getServer(file)
            if (!server) {
                continue
            }

            const map = await server.getFile(server.path).then(
                source => this.getSourceMap(source, file),
                () => undefined,
            )

            let resolved = map
                ? await SourceMapConsumer.with(map.raw, map.url, consumer => {
                    return consumer.originalPositionFor({line: Number(line), column: Number(column)})
                })
                : undefined

            if (!resolved?.source) {
                resolved = {
                    source: server.origin
                        ? server.origin + (server.origin.endsWith('/') ? '' : '/') + server.path
                        : null,
                    name: null,
                    line: null,
                    column: null,
                }
            }

            if (resolved.source?.startsWith('file://')) {
                resolved.source = fileURLToPath(resolved.source)
            }

            stack = stack.substring(0, start)
                + at[0]
                + (resolved.name ?? name)
                + ' ('
                + (resolved.source ?? file)
                + (resolved.line !== null && resolved.column !== null
                    ? `:${resolved.line}:${resolved.column}`
                    : `:${line}:${column}`
                )
                + ')'
                + stack.substring(end)
        }
        return stack
    }

    protected getServer(
        url: string,
    ) {
        for (const server of this.fileServers) {
            const pre = server.url.endsWith('/') ? server.url : server.url + '/'
            if (url.startsWith(pre)) {
                return {
                    origin: server.origin,
                    getFile: (p: string) => server.getFile(p),
                    path: url.substring(pre.length),
                }
            }
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

import { RawSourceMap, SourceMapConsumer } from 'source-map'

export type FileServer = {
    url: string
    getFile: (path: string) => Promise<string>
    origin: string
}

export class ErrorStackResolver {
    constructor(
        readonly fileServers: Array<FileServer>,
    ) {
    }

    async rewriteStack(
        stack: string,
    ) {
        const re = /(?<pre>\s+at [^\n)]+\()(?<url>\w+:\/\/[^/?]*[^)]*):(?<line>\d+):(?<column>\d+)(?<post>\)$)/gm
        let r: RegExpExecArray|null
        // eslint-disable-next-line no-cond-assign
        while ((r = re.exec(stack)) && r?.groups) {
            const url = r.groups.url
            const line = Number(r.groups.line)
            const column = Number(r.groups.column)
            for (const server of this.fileServers) {
                if (url.startsWith(server.url) && (server.url.endsWith('/') || url[server.url.length] === '/')) {
                    const subpath = trimStart(url.substring(server.url.length), '/')
                    let subPathAndPos = `${subpath}:${line}:${column}`

                    // TODO: handle errors when resolving code positions

                    const content = await server.getFile(subpath)
                    const mapMatch = String(content).match(/\n\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,(?<encodedMap>[0-9a-zA-Z+/]+)\s*$/)
                    if (mapMatch?.groups) {
                        const map = JSON.parse(Buffer.from(mapMatch.groups.encodedMap, 'base64').toString('utf8')) as RawSourceMap
                        const original = await SourceMapConsumer.with(map, null, consumer => {
                            return consumer.originalPositionFor({ line, column })
                        })
                        if (original.source) {
                            subPathAndPos = `${subpath.substring(0, subpath.length - map.file.length)}${original.source}:${String(original.line)}:${String(original.column)}`
                        }
                    }
                    const newStackEntry = r.groups.pre
                        + server.origin
                        + (server.origin.endsWith('/') ? '' : '/')
                        + subPathAndPos
                        + r.groups.post

                    stack = stack.substring(0, r.index)
                        + newStackEntry
                        + stack.substring(r.index + r[0].length)

                    re.lastIndex += newStackEntry.length - r[0].length

                    break
                }
            }
        }
        return stack
    }
}

function trimStart(
    str: string,
    chars: string,
) {
    for (let i = 0; ; i++) {
        if (i >= str.length || !chars.includes(str[i])) {
            return str.substring(i)
        }
    }
}

import {createServer, IncomingMessage, ServerResponse} from 'http'
import { FileProvider } from './FileProvider'
import { FileServer, FileServerEventMap } from './FileServer'

type HttpFileServerEventMap = FileServerEventMap & {
    connection: {
        request: IncomingMessage
        response: ServerResponse
    }
}

export class HttpFileServer extends FileServer<HttpFileServerEventMap> {
    constructor(
        provider: FileProvider,
        port = 0,
        host = '127.0.0.1',
    ) {
        super(provider)
        this._url = new Promise<URL>((res, rej) => {
            this.server.listen(port, host, () => {
                const url = this.getUrl()
                if (url) {
                    res(url)
                } else {
                    rej()
                }
            })
            this.server.on('error', e => {
                rej(e)
                throw e
            })
            this.server.on('close', () => {
                this._url = Promise.reject('Server is already closed.')
            })
        })
    }
    readonly server = createServer(async (req, res) => {
        if (req.method === 'GET') {
            const [subpath, line, char] = (req.url?.startsWith('/') ? req.url.substring(1) : '').split(':')
            const file = subpath ? this.provider.getFile(subpath) : Promise.reject()
            await file.then(
                ({content}) => {
                    const queryPos = subpath.indexOf('?')
                    const filename = subpath.substring(0, queryPos >= 0 ? queryPos : undefined)
                    if (filename.endsWith('.js')) {
                        res.setHeader('Content-Type', 'text/javascript')
                    }
                    res.setHeader('Access-Control-Allow-Origin', '*')
                    res.end(content)
                },
                () => {
                    res.writeHead(404, 'Not Found')
                    res.end()
                },
            )
        } else {
            res.writeHead(501, 'Method not implemented')
            res.end()
        }

        this.emitter.dispatch('connection', {
            request: req,
            response: res,
        })
    })

    private getUrl() {
        const addr = this.server.address()
        if (!addr) {
            return
        } else if (typeof addr === 'string') {
            return new URL(addr)
        }
        return new URL(`http://${addr.family === 'IPv6' ? `[${addr.address}]` : addr.address}:${addr.port}/`)
    }
}

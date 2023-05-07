import { FileProvider, HttpFileServer } from '#src/server'
import fetch from 'node-fetch'

const server = new HttpFileServer(new FileProvider())
server.provider.files.set('some/file', Promise.resolve({content: 'some content'}))
server.provider.files.set('some/script.js', Promise.resolve({content: 'const a = 1;'}))

afterAll(async () => {
    await server.close()
})

test('serve on localhost', () => {
    return expect(server.url).resolves.toHaveProperty('hostname', '127.0.0.1')
})

test('serve files from provider', async () => {
    const response = await fetch(`${String(await server.url)}/some/file`)

    expect(response).toHaveProperty('status', 200)
    await expect(response.text()).resolves.toBe('some content')
})

// The origin is undefined when the script is inserted per Puppeteer's `Page.setContent()`
test('allow requests from any origin', async() => {
    const response = await fetch(`${String(await server.url)}/some/file`)

    expect(response).toHaveProperty('status', 200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
})

test('set `Content-Type` for JS files', async () => {
    const response = await fetch(`${String(await server.url)}/some/script.js`)

    expect(response).toHaveProperty('status', 200)
    expect(response.headers.get('content-type')).toBe('text/javascript')
})

test('reject unsupported methods', async () => {
    const response = await fetch(`${String(await server.url)}/some/file`, {method: 'DELETE'})

    expect(response).toHaveProperty('status', 501)
})

test('return `404` for missing files', async () => {
    const response = await fetch(`${String(await server.url)}/some/missing/file`)

    expect(response).toHaveProperty('status', 404)
})

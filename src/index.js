'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')
const ws = require('ws')
const os = require('os')

const STATIC_DIR = path.join(__dirname, '..', 'static')

const VEYON_PORT = 11080
const VEYON_ADDRESS = 'localhost'

const SERVER_PORT = 8080

const netInterfaces = os.networkInterfaces()
const addresses = []
for (const identifier in netInterfaces) {
    const netInterface = netInterfaces[identifier] ?? []
    for (const item of netInterface) {
        if (item.internal) { continue }
        if (item.family !== 'IPv4') { continue }
        addresses.push(item.address)
    }
}

if (addresses.length === 0) {
    console.error('No network interface found to host on')
    process.exit(1)
}

// This is for my school
if (addresses.length > 1) {
    for (let i = 0; i < addresses.length; i++) {
        if (!addresses[i].startsWith('10.')) addresses.splice(i--, 1)
    }
}

if (addresses.length > 1) {
    console.error('Multiple network interfaces found to host on')
    process.exit(1)
}

const serverAddress = addresses[0]

const server = http.createServer()

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<Buffer>}
 */
function receive(req) {
    return new Promise((resolve, reject) => {
        /** @type {Array<Buffer>} */
        let chunks = []
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', () => resolve(Buffer.concat(chunks)))
        req.on('error', reject)
    })
}

const wss = new ws.WebSocketServer({ server: server, path: '/ws' })

server.addListener('request', (req, res) => {
    const url = new URL(`http://${serverAddress}:${SERVER_PORT}${req.url}`)
    switch (url.pathname) {
        case '/proxy':
            /** @type {string | null | undefined} */ let _url = url.searchParams.get('url')
            /** @type {string | null | undefined} */ let _method = url.searchParams.get('method')
            /** @type {string | null | undefined} */ let _body = url.searchParams.get('body')
            /** @type {string | null | undefined} */ let _headers = url.searchParams.get('headers')

            if (_url === 'undefined') _url = undefined
            if (_method === 'undefined') _method = undefined
            if (_body === 'undefined') _body = undefined
            if (_headers === 'undefined') _headers = undefined

            if (_url === 'null') _url = null
            if (_method === 'null') _method = null
            if (_body === 'null') _body = null
            if (_headers === 'null') _headers = null

            if (_headers) _headers = JSON.parse(_headers)

            try {
                // @ts-ignore
                const _req = http.request({
                    host: VEYON_ADDRESS,
                    port: VEYON_PORT,
                    path: _url,
                    method: _method ?? 'GET',
                    body: _body,
                    headers: _headers,
                }, (_res) => {
                    res.writeHead(_res.statusCode ?? 200, _res.headers)
                    _res.pipe(res)
                })
                _req.addListener('error', (error) => {
                    res.writeHead(500, {
                        'content-type': 'application/json'
                    })
                    res.write(JSON.stringify(error))
                    res.end()
                })
                req.pipe(_req)
            } catch (error) {
                res.writeHead(500, {
                    'content-type': 'application/json'
                })
                res.write(JSON.stringify(error))
                res.end()
            }
            break
        case '/message':
            if (req.method === 'GET') {
                const text = url.searchParams.get('text') ?? ''
                res.writeHead(200, {
                    'content-type': 'text/html'
                })
                let html = fs.readFileSync('message.html', 'utf8')
                html = html.replace(/\bMESSAGE\b/g, text)
                html = html.replace(/\bHOST\b/g, `${serverAddress}:${SERVER_PORT}`)
                res.write(html)
                res.end()
            } else if (req.method === 'POST') {
                receive(req).then(body => {
                    const bodyText = body.toString('utf8')
                    wss.clients.forEach(client => {
                        client.send(JSON.stringify({
                            address: req.socket.remoteAddress,
                            text: bodyText,
                        }))
                    })
                }).catch(console.error).finally(() => {
                    res.writeHead(200)
                    res.end()
                })
            }
            break
        default:
            let local = url.pathname
            if (!local || local === '/') local = '/index.html'
            const localPath = path.join(STATIC_DIR, '.' + local)
            if (!fs.existsSync(localPath)) {
                res.writeHead(404, 'Not found')
                res.end()
                break
            }
            const ext = path.extname(localPath)
            res.writeHead(200, 'OK', {
                'content-type': (() => {
                    switch (ext) {
                        case '.html':
                            return 'text/html'
                        case '.css':
                            return 'text/css'
                        case '.js':
                            return 'text/javascript'
                        case '.svg':
                            return 'image/svg+xml'
                        default:
                            return undefined
                    }
                })(),
            })
            fs.createReadStream(localPath).pipe(res)
            break
    }
})

server.addListener('listening', () => {
    console.log(`Listening on http://${serverAddress}:${SERVER_PORT}/`)
})

server.listen(SERVER_PORT, serverAddress)

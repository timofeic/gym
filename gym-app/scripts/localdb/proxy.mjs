// Serves PostgREST under /rest/v1, the path Supabase clients use.
import http from 'node:http'

const [listenPort, upstreamPort] = process.argv.slice(2).map(Number)

http
  .createServer((req, res) => {
    if (!req.url.startsWith('/rest/v1')) {
      res.writeHead(404).end()
      return
    }
    const headers = { ...req.headers }
    // Supabase sends the anon key as `apikey`; PostgREST only reads Authorization.
    if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`
    const upstream = http.request(
      { host: '127.0.0.1', port: upstreamPort, method: req.method, path: req.url.slice('/rest/v1'.length) || '/', headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      },
    )
    upstream.on('error', () => res.writeHead(502).end())
    req.pipe(upstream)
  })
  .listen(listenPort, '127.0.0.1')

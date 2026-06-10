import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getMeta(html: string, ...names: string[]): string | null {
  for (const name of names) {
    let m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"'<>]+)["']`, 'i'))
    if (m?.[1]) return decodeEntities(m[1].trim())
    m = html.match(new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+(?:property|name)=["']${name}["']`, 'i'))
    if (m?.[1]) return decodeEntities(m[1].trim())
  }
  return null
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function toAbsoluteUrl(url: string, base: string): string {
  if (!url) return url
  if (url.startsWith('http')) return url
  if (url.startsWith('//')) return 'https:' + url
  try { return new URL(url, base).href } catch { return url }
}

// ----------------------------------------------------------------
// SSRF 対策: 内部・予約済みアドレスへのリクエストを遮断する。
// ユーザー指定 URL をサーバー側で fetch するため、メタデータエンドポイント
// (169.254.169.254) やローカル/プライベート網に到達できないようにする。
// ----------------------------------------------------------------
function ipv4InBlockedRange(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true                 // link-local / クラウドメタデータ
  if (a === 172 && b >= 16 && b <= 31) return true        // 172.16.0.0/12
  if (a === 192 && b === 168) return true                 // 192.168.0.0/16
  if (a === 192 && b === 0) return true                   // 192.0.0.0/24
  if (a === 100 && b >= 64 && b <= 127) return true       // CGNAT 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return true     // ベンチマーク用
  if (a >= 224) return true                               // マルチキャスト/予約
  return false
}

function isBlockedHost(hostname: string): boolean {
  let host = hostname.toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)

  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.internal') || host.endsWith('.local')) return true

  // IPv6
  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true
    if (host.startsWith('fe80') || host.startsWith('fc') || host.startsWith('fd')) return true
    const tail = host.split(':').pop() ?? ''
    if (tail.includes('.')) return ipv4InBlockedRange(tail)   // ::ffff:127.0.0.1 等
    return false
  }

  // 整数・16進などで難読化された IP は一律ブロック
  if (/^\d+$/.test(host) || /^0x/i.test(host)) return true

  // ドット区切りの数値 = IPv4 リテラル
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return ipv4InBlockedRange(host)

  // 単一ラベル（ドットなし）のホスト名はイントラネット扱いで遮断
  if (!host.includes('.')) return true

  return false
}

// リダイレクトを手動で辿り、各ホップのホストを毎回検証する。
// （公開 URL が 302 で内部アドレスへ飛ばす SSRF を防ぐ）
async function safeFetch(start: URL, signal: AbortSignal): Promise<Response> {
  let url = start
  for (let hop = 0; hop < 5; hop++) {
    if (isBlockedHost(url.hostname)) throw new Error('blocked host')
    const res = await fetch(url.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Bobtter/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.9',
      },
      signal,
      redirect: 'manual',
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return res
      const next = new URL(loc, url)
      if (!['http:', 'https:'].includes(next.protocol)) throw new Error('invalid redirect protocol')
      url = next
      continue
    }
    return res
  }
  throw new Error('too many redirects')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const urlParam = new URL(req.url).searchParams.get('url')
  if (!urlParam) return new Response(JSON.stringify({ error: 'missing url' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  let targetUrl: URL
  try {
    targetUrl = new URL(urlParam)
    if (!['http:', 'https:'].includes(targetUrl.protocol)) throw new Error('invalid protocol')
    if (isBlockedHost(targetUrl.hostname)) throw new Error('blocked host')
  } catch {
    return new Response(JSON.stringify({ error: 'invalid url' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const response = await safeFetch(targetUrl, controller.signal)
    clearTimeout(timeout)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const reader = response.body?.getReader()
    if (!reader) throw new Error('no body')
    let html = ''
    let bytes = 0
    while (bytes < 200 * 1024) {
      const { done, value } = await reader.read()
      if (done) break
      html += new TextDecoder().decode(value)
      bytes += value.length
      if (html.includes('</head>')) break
    }
    reader.cancel()

    const title = getMeta(html, 'og:title') ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null
    const description = getMeta(html, 'og:description', 'description')
    let image = getMeta(html, 'og:image', 'og:image:url')
    if (image) image = toAbsoluteUrl(image, targetUrl.href)
    const siteName = getMeta(html, 'og:site_name')

    return new Response(JSON.stringify({ title, description, image, siteName }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

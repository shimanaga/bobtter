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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const urlParam = new URL(req.url).searchParams.get('url')
  if (!urlParam) return new Response(JSON.stringify({ error: 'missing url' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  let targetUrl: URL
  try {
    targetUrl = new URL(urlParam)
    if (!['http:', 'https:'].includes(targetUrl.protocol)) throw new Error('invalid protocol')
  } catch {
    return new Response(JSON.stringify({ error: 'invalid url' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const response = await fetch(targetUrl.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Bobtter/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    })
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

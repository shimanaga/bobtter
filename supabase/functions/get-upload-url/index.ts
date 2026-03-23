/**
 * get-upload-url
 *
 * 認証済みユーザーからのリクエストを受け、
 * Cloudflare R2 への署名付き PUT URL と公開 URL を返す。
 * ブラウザはこの URL に直接 PUT するため、画像データが Edge Function を経由しない。
 *
 * 環境変数（Supabase Secrets）:
 *   R2_ACCOUNT_ID       Cloudflare のアカウント ID
 *   R2_ACCESS_KEY_ID    R2 API トークンのアクセスキー ID
 *   R2_SECRET_ACCESS_KEY R2 API トークンのシークレット
 *   R2_BUCKET_NAME      バケット名（例: bobtter-media）
 *   R2_PUBLIC_URL       公開 URL のベース（例: https://pub-xxx.r2.dev）
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.11'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 認証確認
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: '認証が必要です' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return json({ error: '認証が無効です' }, 401)

    const { folder, ext, content_type } = await req.json() as {
      folder: string
      ext: string
      content_type?: string
    }
    if (!['posts', 'avatars'].includes(folder)) return json({ error: '不正なフォルダです' }, 400)

    // 動画は posts フォルダのみ許可
    const isVideo = content_type?.startsWith('video/')
    if (isVideo && folder !== 'posts') return json({ error: '動画は posts フォルダのみ許可されています' }, 400)

    // R2 クライアント
    const r2 = new AwsClient({
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      service: 's3',
      region: 'auto',
    })

    const accountId = Deno.env.get('R2_ACCOUNT_ID')!
    const bucket = Deno.env.get('R2_BUCKET_NAME')!
    const publicBase = Deno.env.get('R2_PUBLIC_URL')!.replace(/\/$/, '')

    // ランダムなキーを生成（UUID ベース）
    const key = `${folder}/${crypto.randomUUID()}.${ext}`
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`

    // 署名付き PUT URL を生成（有効期限 5 分）
    // X-Amz-Expires はクエリパラメータとして URL に含める必要がある
    const url = new URL(endpoint)
    url.searchParams.set('X-Amz-Expires', '300')
    const signedReq = await r2.sign(
      new Request(url.toString(), { method: 'PUT' }),
      { aws: { signQuery: true, unsignedPayload: true } },
    )

    return json({
      upload_url: signedReq.url,
      public_url: `${publicBase}/${key}`,
    })
  } catch (err) {
    console.error(err)
    return json({ error: 'サーバーエラーが発生しました' }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

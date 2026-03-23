/**
 * request-verification
 *
 * フロントエンドから呼ばれる Edge Function。
 * 1. Discord ユーザー名をボットに問い合わせて discord_id を解決
 * 2. 認証コード（6桁）を生成し pending_verifications に保存
 * 3. Discord Bot の HTTP エンドポイントを叩いて DM 送信を依頼
 *
 * 環境変数（Supabase ダッシュボード → Project Settings → Edge Functions → Secrets）:
 *   SUPABASE_URL              自動設定済み
 *   SUPABASE_SERVICE_ROLE_KEY 自動設定済み
 *   DISCORD_BOT_ENDPOINT      Bot サーバーのベース URL（例: https://your-bot-server.example.com）
 *   DISCORD_BOT_SECRET        Bot エンドポイントへの認証トークン
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { username, display_name } = await req.json() as {
      username: string
      display_name?: string
    }

    if (!username?.trim()) {
      return json({ error: 'Discord ユーザー名が必要です' }, 400)
    }

    const botBase = Deno.env.get('DISCORD_BOT_ENDPOINT')
    if (!botBase) {
      return json({ error: 'Bot エンドポイントが設定されていません' }, 500)
    }

    const botHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
    const botSecret = Deno.env.get('DISCORD_BOT_SECRET')
    if (botSecret) botHeaders['X-Bot-Secret'] = botSecret

    // ユーザー名 → discord_id を解決
    const resolveRes = await fetch(`${botBase}/resolve-user`, {
      method: 'POST',
      headers: botHeaders,
      body: JSON.stringify({ username: username.trim() }),
    })

    if (!resolveRes.ok) {
      return json({ error: 'Discord ユーザーが見つかりません。ユーザー名を確認してください。' }, 404)
    }

    const { discord_id } = await resolveRes.json() as { discord_id: string }

    // service_role クライアント（RLS をバイパス）
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 既存ユーザーか確認
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('discord_id', discord_id)
      .maybeSingle()

    // 新規ユーザーで display_name が未指定の場合はエラー
    if (!existingProfile && !display_name?.trim()) {
      return json({ error: '初回登録時は表示名が必要です', is_new_user: true }, 400)
    }

    // 古い未使用コードを削除（同一 Discord ID）
    await supabase
      .from('pending_verifications')
      .delete()
      .eq('discord_id', discord_id)
      .eq('used', false)

    // 6桁コード生成
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const resolvedName = existingProfile?.display_name ?? display_name ?? 'ユーザー'

    await supabase.from('pending_verifications').insert({
      discord_id,
      display_name: resolvedName,
      code,
      expires_at: expiresAt,
    })

    // Discord Bot に DM 送信を依頼
    const botRes = await fetch(`${botBase}/send-dm`, {
      method: 'POST',
      headers: botHeaders,
      body: JSON.stringify({
        discord_id,
        message: `**bobtter** の認証コード: \`${code}\`\n有効期限: 15分\n\nこのコードをサイトに入力してください。`,
      }),
    })

    if (!botRes.ok) {
      const botErr = await botRes.text()
      console.error('Bot DM error:', botErr)
      return json({ error: 'DM の送信に失敗しました。Discord ID を確認してください。' }, 502)
    }

    return json({ ok: true, is_new_user: !existingProfile, discord_id })
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

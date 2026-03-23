/**
 * complete-verification
 *
 * フロントエンドから呼ばれる Edge Function。
 * 1. コードを検証
 * 2. 新規ユーザーなら auth.users + profiles を作成
 * 3. 既存ユーザーなら認証のみ
 * 4. Supabase セッション（access_token / refresh_token）を返す
 *
 * 環境変数:
 *   SUPABASE_URL              自動設定済み
 *   SUPABASE_SERVICE_ROLE_KEY 自動設定済み
 *   DISCORD_BOT_TOKEN         Bot トークン（初回登録時のアバター取得に使用）
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
    const { discord_id, code } = await req.json() as {
      discord_id: string
      code: string
    }

    if (!discord_id || !code) {
      return json({ error: 'パラメーターが不足しています' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // コード検証
    const { data: verification, error: vErr } = await supabase
      .from('pending_verifications')
      .select('*')
      .eq('discord_id', discord_id)
      .eq('code', code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (vErr || !verification) {
      return json({ error: 'コードが無効か期限切れです' }, 401)
    }

    // コードを使用済みにする
    await supabase
      .from('pending_verifications')
      .update({ used: true })
      .eq('id', verification.id)

    // 既存ユーザーか確認
    let { data: profile } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('discord_id', discord_id)
      .maybeSingle()

    let userId: string

    if (!profile) {
      // Discord アバターを取得（失敗してもアカウント作成は続行）
      const avatarUrl = await fetchDiscordAvatar(discord_id)

      // 新規ユーザー: auth.users に追加（プレースホルダーメール使用）
      const placeholderEmail = `${discord_id}@discord.bobtter.internal`
      const tempPassword = crypto.randomUUID()

      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: placeholderEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { discord_id },
      })

      if (createErr || !newUser.user) {
        console.error('create user error:', createErr)
        return json({ error: 'アカウント作成に失敗しました' }, 500)
      }

      userId = newUser.user.id

      const username = `user_${discord_id.slice(-6)}`

      const { error: profileErr } = await supabase.from('profiles').insert({
        id: userId,
        discord_id,
        username,
        display_name: verification.display_name,
        avatar_url: avatarUrl,
        discord_avatar_url: avatarUrl,  // 初期アバターとして永続保存
      })

      if (profileErr) {
        await supabase.auth.admin.deleteUser(userId)
        console.error('profile insert error:', profileErr)
        return json({ error: 'プロフィール作成に失敗しました' }, 500)
      }
    } else {
      // 既存ユーザー: auth.users の ID を取得
      const { data: authUser } = await supabase.auth.admin.getUserById(profile.id)
      if (!authUser.user) {
        return json({ error: 'ユーザーが見つかりません' }, 404)
      }
      userId = authUser.user.id
    }

    // セッション生成（magic link 経由でトークンを取得）
    const placeholderEmail = `${discord_id}@discord.bobtter.internal`
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: placeholderEmail,
    })

    if (linkErr || !linkData.properties) {
      console.error('generate link error:', linkErr)
      return json({ error: 'セッション生成に失敗しました' }, 500)
    }

    // hashed_token を使ってセッションを発行
    const { data: sessionData, error: sessionErr } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    })

    if (sessionErr || !sessionData.session) {
      console.error('verify otp error:', sessionErr)
      return json({ error: 'セッション発行に失敗しました' }, 500)
    }

    return json({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
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

/**
 * Discord API でユーザーのアバター URL を取得する。
 * アバターが未設定の場合はデフォルトアバター URL を返す。
 * Bot トークンが未設定または API 失敗時は null を返す（アカウント作成は続行）。
 */
async function fetchDiscordAvatar(discordId: string): Promise<string | null> {
  const token = Deno.env.get('DISCORD_BOT_TOKEN')
  if (!token) return null

  try {
    const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
      headers: { Authorization: `Bot ${token}` },
    })
    if (!res.ok) return null

    const user = await res.json() as { avatar: string | null }

    if (user.avatar) {
      // カスタムアバター（WebP、256px）
      return `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.webp?size=256`
    } else {
      // アバター未設定時は Discord のデフォルトアバター
      const index = Number(BigInt(discordId) >> 22n) % 6
      return `https://cdn.discordapp.com/embed/avatars/${index}.png`
    }
  } catch {
    return null
  }
}

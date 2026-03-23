import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Step = 'input' | 'code'

const ALLOWED_USERNAMES = [
  '1692.3.1', 'mirufiru3', 'mirifiru3', 'sehayaijiko',
  'katsuobushi9195', 'nossan25', 'frosiky1314', 'nosu8118', 'azalea_171',
]

export default function LoginPage() {
  const [step, setStep] = useState<Step>('input')
  const [username, setUsername] = useState('')
  const [discordId, setDiscordId] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function requestCode(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = username.trim().toLowerCase()
    if (!trimmed) return

    if (!ALLOWED_USERNAMES.includes(trimmed)) {
      setError('招待されていないユーザー名です。')
      return
    }

    setError(null)
    setLoading(true)

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/request-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ username: trimmed }),
    })

    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error ?? 'エラーが発生しました')
      return
    }

    setDiscordId(json.discord_id)
    setStep('code')
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6) return
    setError(null)
    setLoading(true)

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/complete-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        discord_id: discordId.trim(),
        code: code.trim(),
      }),
    })

    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error ?? '認証に失敗しました')
      return
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
    })

    if (sessionError) {
      setError(sessionError.message)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl opacity-10"
          style={{ backgroundColor: 'var(--accent)' }}
        />
      </div>

      <div className="w-full max-w-sm relative">
        <div className="text-center mb-10">
          <h1 className="font-display text-5xl font-extrabold tracking-tight mb-1" style={{ color: 'var(--accent)' }}>
            bobtter
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>完全招待制。ボブいSNS。</p>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          {step === 'input' ? (
            <form onSubmit={requestCode} className="space-y-4">
              <div>
                <p className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--text-1)' }}>
                  Discord でログイン
                </p>

                <label className="block text-sm mb-1.5" style={{ color: 'var(--text-2)' }}>
                  Discord ユーザー名
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value.replace(/^@+/, ''))}
                  required
                  className="input-base w-full font-mono"
                  placeholder="username"
                  autoComplete="off"
                  autoCapitalize="none"
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  アカウント設定 &gt; ユーザー名 から確認できます。
                </p>
              </div>

              {error && (
                <div
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: 'rgba(232,120,120,0.1)', border: '1px solid rgba(232,120,120,0.3)', color: '#e87878' }}
                >
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || !username.trim()} className="btn-primary w-full py-2.5">
                {loading ? '送信中...' : 'DM に認証コードを送る'}
              </button>

              <p className="text-xs text-center" style={{ color: 'var(--text-3)' }}>
                DM が届かない場合は Discord の設定 &gt; コンテンツ&ソーシャル &gt;<br />
                「サーバーの他のメンバーからのDMを許可」をオンにしてください。
              </p>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-4">
              <div>
                <p className="font-display font-semibold text-sm mb-1" style={{ color: 'var(--text-1)' }}>
                  認証コードを入力
                </p>
                <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                  Discord の DM に届いた6桁のコードを入力してください（15分間有効）
                </p>

                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  className="input-base w-full font-mono text-center text-2xl tracking-[0.5em]"
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                />
              </div>

              {error && (
                <div
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: 'rgba(232,120,120,0.1)', border: '1px solid rgba(232,120,120,0.3)', color: '#e87878' }}
                >
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || code.length !== 6} className="btn-primary w-full py-2.5">
                {loading ? '確認中...' : 'ログイン'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('input'); setCode(''); setDiscordId(''); setError(null) }}
                className="w-full text-sm py-1"
                style={{ color: 'var(--text-3)' }}
              >
                戻る
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

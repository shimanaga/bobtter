import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Step = 'input' | 'code'

export default function LoginPage() {
  const [step, setStep] = useState<Step>('input')
  const [discordId, setDiscordId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function requestCode(e: React.FormEvent) {
    e.preventDefault()
    if (!discordId.trim()) return
    setError(null)
    setLoading(true)

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/request-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        discord_id: discordId.trim(),
        display_name: displayName.trim() || undefined,
      }),
    })

    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error ?? 'エラーが発生しました')
      return
    }

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

    // Edge Function から access_token / refresh_token を受け取ってセッションをセット
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
    })

    if (sessionError) {
      setError(sessionError.message)
    }
    // セッションがセットされると AuthContext の onAuthStateChange が反応し App 側でリダイレクト
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl opacity-10"
          style={{ backgroundColor: 'var(--accent)' }}
        />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="font-display text-5xl font-extrabold tracking-tight mb-1" style={{ color: 'var(--accent)' }}>
            bobtter
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>招待制の身内 SNS</p>
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
                  Discord ユーザー ID
                </label>
                <input
                  type="text"
                  value={discordId}
                  onChange={e => setDiscordId(e.target.value.replace(/\D/g, ''))}
                  required
                  className="input-base w-full font-mono"
                  placeholder="123456789012345678"
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  設定 → 詳細設定 → 開発者モードをONにするとコピーできます
                </p>
              </div>

              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'var(--text-2)' }}>
                  表示名
                  <span className="ml-1 text-xs" style={{ color: 'var(--text-3)' }}>（初回登録時）</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="input-base w-full"
                  placeholder="すでに登録済みなら空欄でOK"
                  maxLength={40}
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

              <button type="submit" disabled={loading || !discordId.trim()} className="btn-primary w-full py-2.5">
                {loading ? '送信中...' : 'DM に認証コードを送る'}
              </button>
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
                onClick={() => { setStep('input'); setCode(''); setError(null) }}
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

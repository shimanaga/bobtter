// グローバルなローディング状態の掲示板。
// 各ローダーが beginLoading('〜を読み込んでいます...') で登録し、
// 返ってきた関数を呼ぶと解除される。LoadingToast が購読して
// 最後に登録されたラベルを画面下に表示する。

interface Entry {
  id: number
  label: string
}

let nextId = 1
const entries: Entry[] = []
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach(fn => fn())
}

/** ローディング開始を登録し、終了用の関数を返す（多重呼び出しは無害） */
export function beginLoading(label: string): () => void {
  const id = nextId++
  entries.push({ id, label })
  notify()
  let ended = false
  return () => {
    if (ended) return
    ended = true
    const i = entries.findIndex(e => e.id === id)
    if (i >= 0) entries.splice(i, 1)
    notify()
  }
}

/** 現在表示すべきラベル（最後に登録されたもの）。なければ null */
export function currentLoadingLabel(): string | null {
  return entries.length > 0 ? entries[entries.length - 1].label : null
}

export function subscribeLoading(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

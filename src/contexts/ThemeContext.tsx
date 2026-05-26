import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'cyber' | 'cute'

const STORAGE_KEY = 'bobtter-theme'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getInitialTheme(): Theme {
  const attr = document.documentElement.dataset.theme
  if (attr === 'cute') return 'cute'
  try {
    if (localStorage.getItem(STORAGE_KEY) === 'cute') return 'cute'
  } catch { /* localStorage 不可環境は無視 */ }
  return 'cyber'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    // cyber は :root のデフォルトなので属性を外す
    if (theme === 'cute') document.documentElement.dataset.theme = 'cute'
    else delete document.documentElement.dataset.theme
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* 無視 */ }
  }, [theme])

  const toggleTheme = () => setTheme(prev => (prev === 'cute' ? 'cyber' : 'cute'))

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

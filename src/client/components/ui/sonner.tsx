import { useTheme } from '@/contexts/theme-context'
import { Toaster as Sonner, ToasterProps } from 'sonner'

const Toaster = ({ theme, ...props }: Partial<ToasterProps>) => {
  const { effectiveTheme } = useTheme()
  const themeValue = (effectiveTheme ?? 'light') as ToasterProps['theme']
  const safeProps = props as Omit<ToasterProps, 'theme'>

  const merged = { ...safeProps, theme: themeValue, className: 'toaster group', style: { '--normal-bg': 'var(--popover)', '--normal-text': 'var(--popover-foreground)', '--normal-border': 'var(--border)' } } as ToasterProps

  return <Sonner {...merged} />
}

export { Toaster }

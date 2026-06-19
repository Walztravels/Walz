'use client'
import { MessageCircle } from 'lucide-react'

interface Props {
  className?: string
  children?: React.ReactNode
}

function openJadeChat() {
  if (typeof window === 'undefined') return
  if (window.$chatwoot) {
    window.$chatwoot.toggle('open')
    return
  }
  let n = 0
  const t = setInterval(() => {
    n++
    if (window.$chatwoot) {
      clearInterval(t)
      window.$chatwoot.toggle('open')
    } else if (n >= 40) {
      clearInterval(t)
      window.open(
        'https://wa.me/447398753797?text=Hi%20Jade%2C%20I%20need%20help%20with%20my%20travel%20plans',
        '_blank',
        'noopener,noreferrer',
      )
    }
  }, 200)
}

export function ChatWithJadeButton({ className, children }: Props) {
  return (
    <button onClick={openJadeChat} className={className}>
      {children ?? (
        <>
          <MessageCircle className="w-4 h-4" />
          Chat with Jade
        </>
      )}
    </button>
  )
}

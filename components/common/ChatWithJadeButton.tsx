'use client'
import { MessageCircle } from 'lucide-react'

interface Props {
  className?: string
  children?: React.ReactNode
}

function openJadeChat() {
  if (typeof window === 'undefined') return
  // Primary: open the Jade widget
  window.dispatchEvent(new CustomEvent('jade:open', { detail: {} }))
  // Enhancement: open Chatwoot if available
  if (window.$chatwoot) window.$chatwoot.toggle('open')
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

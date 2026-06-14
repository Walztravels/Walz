'use client'

import { openJadeChat, type JadeChatContext } from '@/lib/useJadeChat'
import { MessageCircle } from 'lucide-react'

interface Props extends JadeChatContext {
  label?:     string
  className?: string
  icon?:      boolean
  children?:  React.ReactNode
}

export function JadeChatButton({
  label = 'Chat with Jade',
  className = '',
  icon = true,
  children,
  service,
  detail,
  page,
  message,
}: Props) {
  return (
    <button
      type="button"
      onClick={() => openJadeChat({ service, detail, page, message })}
      className={className}
    >
      {icon && <MessageCircle className="w-4 h-4" />}
      {children ?? label}
    </button>
  )
}

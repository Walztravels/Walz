'use client'

import { MessageCircle } from 'lucide-react'
import '@/lib/useJadeChat' // ensure Window.$chatwoot types are loaded

interface JadeChatProps {
  context: {
    source:        string
    pageTitle?:    string
    pageUrl?:      string
    price?:        string
    location?:     string
    category?:     string
    enquiryType?:  string
  }
  label?:    string
  className?: string
  variant?:  'primary' | 'outline' | 'ghost'
}

export function JadeChat({ context, label = 'Chat with Jade', className = '', variant = 'primary' }: JadeChatProps) {
  function openJade() {
    // Always dispatch the custom event so JadeChatWidget can open
    window.dispatchEvent(new CustomEvent('jade:open', { detail: context }))

    // Also try Chatwoot if the SDK is loaded (graceful enhancement)
    if (window.$chatwoot) {
      window.$chatwoot.setCustomAttributes({
        source:       context.source,
        page_title:   context.pageTitle  ?? '',
        page_url:     context.pageUrl    ?? window.location.pathname,
        price:        context.price      ?? '',
        location:     context.location   ?? '',
        category:     context.category   ?? '',
        enquiry_type: context.enquiryType ?? context.source,
      })
      window.$chatwoot.setLabel(context.enquiryType ?? context.source)
      window.$chatwoot.toggle('open')
    }
  }

  const styles = {
    primary: 'bg-[#C9A84C] text-[#0B1F3A] hover:bg-white font-bold',
    outline:  'border border-[#C9A84C]/40 text-[#C9A84C] hover:border-[#C9A84C] font-medium',
    ghost:    'text-[#C9A84C] hover:text-white underline-offset-4 hover:underline font-medium',
  }

  return (
    <button
      onClick={openJade}
      className={`flex items-center justify-center gap-2 px-6 py-3 rounded-full transition-all duration-300 text-sm ${styles[variant]} ${className}`}
    >
      <MessageCircle className="w-4 h-4 flex-shrink-0" />
      {label}
    </button>
  )
}

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import {
  Globe,
  Mail,
  Loader2,
  Chrome,
  CheckCircle,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

type LoginFormData = z.infer<typeof loginSchema>

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isEmailLoading, setIsEmailLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)

  const isVerify = searchParams.get('verify') === 'true'
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
  const errorParam = searchParams.get('error')

  useEffect(() => {
    if (status === 'authenticated') {
      router.push(callbackUrl)
    }
  }, [status, router, callbackUrl])

  useEffect(() => {
    if (errorParam === 'OAuthAccountNotLinked') {
      setLoginError('An account with this email already exists. Please sign in with email.')
    } else if (errorParam === 'EmailSignin') {
      setLoginError('Failed to send magic link. Please try again.')
    } else if (errorParam) {
      setLoginError('An error occurred. Please try again.')
    }
  }, [errorParam])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const handleEmailSignIn = async (data: LoginFormData) => {
    setIsEmailLoading(true)
    setLoginError(null)

    try {
      const result = await signIn('email', {
        email: data.email,
        redirect: false,
        callbackUrl,
      })

      if (result?.error) {
        setLoginError('Failed to send magic link. Please try again.')
      } else {
        setSentEmail(data.email)
        setEmailSent(true)
      }
    } catch {
      setLoginError('An unexpected error occurred. Please try again.')
    } finally {
      setIsEmailLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true)
    setLoginError(null)
    try {
      await signIn('google', { callbackUrl })
    } catch {
      setLoginError('Failed to sign in with Google. Please try again.')
      setIsGoogleLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-walz-gold animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 group mb-6">
            <div className="w-12 h-12 rounded-xl walz-gold-gradient flex items-center justify-center shadow-gold-glow">
              <Globe className="w-6 h-6 text-walz-deep-navy" />
            </div>
            <div className="text-left">
              <div className="font-display text-2xl font-bold text-walz-deep-navy">
                Walz <span className="text-walz-gold">Travels</span>
              </div>
              <div className="text-walz-muted text-xs tracking-wider uppercase">
                Luxury Travel Agency
              </div>
            </div>
          </Link>
        </div>

        <div className="card-luxury p-7 lg:p-8">
          {/* Verify Request State */}
          {(isVerify || emailSent) ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-9 h-9 text-walz-success" />
              </div>
              <h2 className="font-display text-2xl font-bold text-walz-deep-navy mb-2">
                Check Your Email
              </h2>
              <p className="text-walz-muted mb-4 text-sm leading-relaxed">
                We&apos;ve sent a magic sign-in link to{' '}
                <span className="text-walz-deep-navy font-medium">
                  {sentEmail || 'your email address'}
                </span>.
                Click the link in the email to sign in.
              </p>
              <div className="bg-walz-off-white rounded-xl p-4 text-left mb-5">
                <p className="text-xs font-semibold text-walz-deep-navy mb-2">
                  Didn&apos;t receive the email?
                </p>
                <ul className="text-xs text-walz-muted space-y-1">
                  <li>• Check your spam or junk folder</li>
                  <li>• Make sure you entered the correct email</li>
                  <li>• The link expires in 24 hours</li>
                </ul>
              </div>
              <button
                onClick={() => {
                  setEmailSent(false)
                  setSentEmail('')
                }}
                className="text-walz-gold text-sm font-medium hover:text-walz-gold-light transition-colors flex items-center gap-1 mx-auto"
              >
                Try a different email
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <h2 className="font-display text-2xl font-bold text-walz-deep-navy text-center mb-1">
                Welcome Back
              </h2>
              <p className="text-walz-muted text-sm text-center mb-6">
                Sign in to manage your bookings
              </p>

              {/* Error */}
              {loginError && (
                <div className="p-3 bg-red-50 border border-walz-error/20 rounded-xl text-walz-error text-sm mb-4">
                  {loginError}
                </div>
              )}

              {/* Google Sign In */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 border-walz-border hover:border-walz-gold hover:bg-walz-off-white mb-4 gap-3"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
              >
                {isGoogleLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-walz-muted" />
                ) : (
                  <Chrome className="w-5 h-5 text-blue-500" />
                )}
                <span className="text-walz-deep-navy font-medium">
                  Continue with Google
                </span>
              </Button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-walz-border" />
                <span className="text-walz-muted text-xs font-medium">or sign in with email</span>
                <div className="flex-1 h-px bg-walz-border" />
              </div>

              {/* Email Magic Link */}
              <form onSubmit={handleSubmit(handleEmailSignIn)}>
                <div className="mb-4">
                  <label className="label-walz">Email Address</label>
                  <div className="relative">
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      className={cn(
                        'h-12 pl-10',
                        errors.email && 'border-walz-error'
                      )}
                      {...register('email')}
                    />
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-walz-muted" />
                  </div>
                  {errors.email && (
                    <p className="text-walz-error text-xs mt-1">{errors.email.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="gold"
                  className="w-full h-12"
                  disabled={isEmailLoading}
                >
                  {isEmailLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending link...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Send Magic Link
                    </>
                  )}
                </Button>
              </form>

              {/* Info */}
              <p className="text-center text-xs text-walz-muted mt-5">
                We&apos;ll send a one-click sign-in link to your email.
                No password required.
              </p>
            </>
          )}
        </div>

        {/* Footer links */}
        <div className="text-center mt-5 space-y-2">
          <p className="text-xs text-walz-muted">
            By signing in, you agree to our{' '}
            <Link href="/terms" className="text-walz-gold hover:underline">Terms</Link>
            {' '}and{' '}
            <Link href="/privacy" className="text-walz-gold hover:underline">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-4 border-walz-gold border-t-transparent rounded-full animate-spin" /></div>}>
      <LoginPageContent />
    </Suspense>
  )
}

import { NextAuthOptions } from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import EmailProvider from 'next-auth/providers/email'
import { prisma } from '@/lib/db'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY ?? 'placeholder')

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),
    EmailProvider({
      server: {
        host: 'smtp.resend.com',
        port: 465,
        auth: {
          user: 'resend',
          pass: process.env.RESEND_API_KEY!,
        },
      },
      from: 'Walz Travels <noreply@walztravels.com>',
      sendVerificationRequest: async ({ identifier: email, url }) => {
        await resend.emails.send({
          from: 'Walz Travels <noreply@walztravels.com>',
          to: email,
          subject: 'Sign in to Walz Travels',
          html: `
            <!DOCTYPE html>
            <html lang="en">
            <head><meta charset="UTF-8"><title>Sign in to Walz Travels</title></head>
            <body style="margin: 0; padding: 0; font-family: system-ui, sans-serif; background: #F7F4EF;">
              <div style="max-width: 600px; margin: 0 auto; background: #fff;">
                <div style="background: linear-gradient(135deg, #0A1628, #1C3557); padding: 40px; text-align: center;">
                  <span style="font-size: 28px; font-weight: 700; color: #C9A84C;">W</span>
                  <span style="font-size: 22px; font-weight: 600; color: #fff; margin-left: 8px;">Walz Travels</span>
                </div>
                <div style="padding: 40px; text-align: center;">
                  <h2 style="color: #0A1628; margin: 0 0 16px;">Sign in to your account</h2>
                  <p style="color: #1C3557; margin-bottom: 32px;">Click the button below to sign in to Walz Travels. This link expires in 24 hours.</p>
                  <a href="${url}" style="display: inline-block; background: linear-gradient(135deg, #C9A84C, #E8C97A); color: #0A1628; font-weight: 700; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
                    Sign In
                  </a>
                  <p style="margin-top: 24px; color: #8B9BAE; font-size: 12px;">
                    If you didn't request this, you can safely ignore this email.
                  </p>
                </div>
                <div style="padding: 24px 40px; background: #F7F4EF; text-align: center;">
                  <p style="margin: 0; color: #8B9BAE; font-size: 12px;">© ${new Date().getFullYear()} Walz Travels Ltd.</p>
                </div>
              </div>
            </body>
            </html>
          `,
        })
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.image = user.image
      }
      if (account) {
        token.provider = account.provider
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.image = token.image as string
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`
      if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
    verifyRequest: '/login?verify=true',
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name: string
      email: string
      image: string
    }
  }
}

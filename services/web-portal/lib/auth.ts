import { NextAuthOptions } from 'next-auth'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import CredentialsProvider from 'next-auth/providers/credentials'
import GitHubProvider from 'next-auth/providers/github'
import GoogleProvider from 'next-auth/providers/google'
import { compare } from 'bcryptjs'
import { db } from './db'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/auth/login',
    signUp: '/auth/register',
    error: '/auth/error',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Invalid credentials')
        }

        const user = await db.user.findUnique({
          where: {
            email: credentials.email
          },
          include: {
            workspaces: {
              include: {
                workspace: true
              }
            }
          }
        })

        if (!user || !user.passwordHash) {
          throw new Error('Invalid credentials')
        }

        const isPasswordValid = await compare(credentials.password, user.passwordHash)

        if (!isPasswordValid) {
          throw new Error('Invalid credentials')
        }

        if (!user.isActive) {
          throw new Error('Account is disabled')
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
          role: user.role,
          workspaces: user.workspaces.map(wm => ({
            id: wm.workspace.id,
            name: wm.workspace.name,
            role: wm.role
          }))
        }
      }
    }),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? [
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        profile(profile) {
          return {
            id: profile.id.toString(),
            name: profile.name || profile.login,
            email: profile.email,
            image: profile.avatar_url,
            provider: 'github',
            providerId: profile.id.toString()
          }
        }
      })
    ] : []),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        profile(profile) {
          return {
            id: profile.sub,
            name: profile.name,
            email: profile.email,
            image: profile.picture,
            provider: 'google',
            providerId: profile.sub
          }
        }
      })
    ] : [])
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'credentials') {
        return true
      }

      // Handle OAuth sign-in
      if (account?.provider && account.provider !== 'credentials') {
        try {
          const existingUser = await db.user.findFirst({
            where: {
              OR: [
                { email: user.email! },
                {
                  provider: account.provider,
                  providerId: account.providerAccountId
                }
              ]
            }
          })

          if (existingUser) {
            // Update provider info if needed
            if (existingUser.provider !== account.provider) {
              await db.user.update({
                where: { id: existingUser.id },
                data: {
                  provider: account.provider,
                  providerId: account.providerAccountId,
                  avatarUrl: user.image,
                  lastLoginAt: new Date()
                }
              })
            }
            return true
          }

          // Create new user for OAuth
          const newUser = await db.user.create({
            data: {
              email: user.email!,
              name: user.name || user.email!,
              avatarUrl: user.image,
              provider: account.provider,
              providerId: account.providerAccountId,
              role: 'developer',
              isActive: true,
              lastLoginAt: new Date()
            }
          })

          // Add to default workspace if it exists
          const defaultWorkspace = await db.workspace.findFirst({
            where: { slug: 'default' }
          })

          if (defaultWorkspace) {
            await db.workspaceMember.create({
              data: {
                workspaceId: defaultWorkspace.id,
                userId: newUser.id,
                role: 'developer'
              }
            })
          }

          return true
        } catch (error) {
          console.error('Error during OAuth sign-in:', error)
          return false
        }
      }

      return true
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.workspaces = user.workspaces
      }

      // Refresh user data from database
      if (token.email) {
        const dbUser = await db.user.findUnique({
          where: { email: token.email },
          include: {
            workspaces: {
              include: {
                workspace: true
              }
            }
          }
        })

        if (dbUser) {
          token.id = dbUser.id
          token.role = dbUser.role
          token.workspaces = dbUser.workspaces.map(wm => ({
            id: wm.workspace.id,
            name: wm.workspace.name,
            role: wm.role
          }))

          // Update last login
          await db.user.update({
            where: { id: dbUser.id },
            data: { lastLoginAt: new Date() }
          })
        }
      }

      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.workspaces = token.workspaces as any[]
      }
      return session
    }
  },
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log(`User ${user.email} signed in with ${account?.provider}`)
    },
    async signOut({ session, token }) {
      console.log(`User ${session?.user?.email || token?.email} signed out`)
    }
  },
  debug: process.env.NODE_ENV === 'development'
}

// Type augmentation for NextAuth
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      image?: string
      role: string
      workspaces: Array<{
        id: string
        name: string
        role: string
      }>
    }
  }

  interface User {
    id: string
    email: string
    name: string
    image?: string
    role: string
    provider?: string
    providerId?: string
    workspaces?: Array<{
      id: string
      name: string
      role: string
    }>
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    workspaces: Array<{
      id: string
      name: string
      role: string
    }>
  }
}

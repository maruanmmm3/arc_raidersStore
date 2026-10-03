import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import i18n, { currentLang } from '@/lib/i18n'
import { AuthContext } from './AuthContext'

// Los usuarios de Auth se comparten con otras apps del proyecto: el perfil de ARC
// se crea la primera vez que el usuario entra en la tienda (RPC arc_ensure_profile).
async function fetchProfile() {
  const { data, error } = await supabase.rpc('arc_ensure_profile')
  if (error) throw error
  return data
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id ?? null

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: fetchProfile,
    enabled: Boolean(userId),
    staleTime: 60_000,
  })
  const profile = profileQuery.data ?? null

  // Al iniciar sesión, el idioma guardado en el perfil manda sobre el del navegador
  const appliedLocaleFor = useRef(null)
  useEffect(() => {
    if (profile && appliedLocaleFor.current !== profile.id) {
      appliedLocaleFor.current = profile.id
      if (profile.locale && profile.locale !== currentLang()) {
        i18n.changeLanguage(profile.locale)
      }
    }
    if (!userId) appliedLocaleFor.current = null
  }, [profile, userId])

  const changeLanguage = useCallback(
    async (lang) => {
      await i18n.changeLanguage(lang)
      if (userId) {
        await supabase.from('ARC_profiles').update({ locale: lang }).eq('id', userId)
        queryClient.invalidateQueries({ queryKey: ['profile', userId] })
      }
    },
    [userId, queryClient],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    queryClient.removeQueries({ queryKey: ['profile'] })
  }, [queryClient])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      // Solo para la UI. La autorización real la hacen RLS y las Edge Functions.
      isAdmin: profile?.role === 'admin' && !profile?.is_blocked,
      // Admin principal: el único que puede dar o quitar el rol admin
      isOwner: Boolean(profile?.is_owner) && profile?.role === 'admin' && !profile?.is_blocked,
      loading: sessionLoading || (Boolean(userId) && profileQuery.isPending),
      refreshProfile: () => queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
      changeLanguage,
      signOut,
    }),
    [session, profile, sessionLoading, userId, profileQuery.isPending, queryClient, changeLanguage, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

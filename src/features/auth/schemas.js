import { z } from 'zod'

// Los mensajes son claves de traducción del namespace "auth"
export const loginSchema = z.object({
  email: z.email('errors.email'),
  password: z.string().min(1, 'errors.passwordMin'),
})

export const registerSchema = z
  .object({
    username: z.string().regex(/^[A-Za-z0-9_]{3,32}$/, 'errors.username'),
    email: z.email('errors.email'),
    password: z.string().min(8, 'errors.passwordMin'),
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, 'errors.terms'),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: 'errors.passwordMatch' })

export const recoverSchema = z.object({ email: z.email('errors.email') })

export const newPasswordSchema = z
  .object({ password: z.string().min(8, 'errors.passwordMin'), confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: 'errors.passwordMatch' })

// { campo: 'clave.de.error' } con el primer error de cada campo
export function fieldErrors(result) {
  if (result.success) return {}
  const errors = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0]
    if (key && !errors[key]) errors[key] = issue.message
  }
  return errors
}

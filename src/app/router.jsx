import { createBrowserRouter } from 'react-router-dom'
import { PublicLayout } from './layouts/PublicLayout'
import { AccountLayout } from './layouts/AccountLayout'
import { AdminLayout } from './layouts/AdminLayout'
import { GuestOnly, RequireAdmin, RequireAuth } from '@/components/guards/Guards'
import { ComingSoon } from '@/components/ui/PageLoader'
import { HomePage } from '@/pages/HomePage'
import { CatalogPage } from '@/pages/CatalogPage'
import { ProductRoute } from '@/pages/ProductPage'
import { CartPage } from '@/pages/CartPage'
import { DiscordPage } from '@/pages/DiscordPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { NewPasswordPage, RecoverPage } from '@/pages/auth/PasswordPages'
import { ProfilePage } from '@/pages/account/ProfilePage'
import { AppointmentsPage, OrdersPage } from '@/pages/account/OrdersPages'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { TicketPage } from '@/pages/TicketPage'
import { AgendaPage } from '@/pages/admin/AgendaPage'
import { RoomsPage } from '@/pages/admin/RoomsPage'
import { AvailabilityPage } from '@/pages/admin/AvailabilityPage'
import { ProductsListPage } from '@/pages/admin/ProductsListPage'
import { ProductFormPage } from '@/pages/admin/ProductFormPage'
import { UsersPage } from '@/pages/admin/UsersPage'
import { ContactPage, FaqPage, HowItWorksPage, LegalPage } from '@/pages/TrustPages'
import { NotFoundPage, RouteError } from '@/pages/SystemPages'

const soon = (phase) => <ComingSoon phase={phase} />

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'tienda', element: <CatalogPage /> },
      { path: 'tienda/:categoria', element: <CatalogPage /> },
      { path: 'producto/:slug', element: <ProductRoute /> },
      { path: 'carrito', element: <CartPage /> },
      { path: 'discord', element: <DiscordPage /> },
      { path: 'como-funciona', element: <HowItWorksPage /> },
      { path: 'faq', element: <FaqPage /> },
      { path: 'terminos', element: <LegalPage key="terms" doc="terms" /> },
      { path: 'reembolsos', element: <LegalPage key="refunds" doc="refunds" /> },
      { path: 'privacidad', element: <LegalPage key="privacy" doc="privacy" /> },
      { path: 'contacto', element: <ContactPage /> },
      { path: 'nueva-contrasena', element: <NewPasswordPage /> },
      {
        element: <GuestOnly />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'registro', element: <RegisterPage /> },
          { path: 'recuperar', element: <RecoverPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          { path: 'checkout', element: <CheckoutPage /> },
          { path: 'cita/:code', element: <TicketPage /> },
          {
            path: 'cuenta',
            element: <AccountLayout />,
            children: [
              { index: true, element: <ProfilePage /> },
              { path: 'pedidos', element: <OrdersPage /> },
              { path: 'citas', element: <AppointmentsPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: 'admin',
    element: (
      <RequireAdmin>
        <AdminLayout />
      </RequireAdmin>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: soon('2') },
      { path: 'agenda', element: <AgendaPage /> },
      { path: 'salas', element: <RoomsPage /> },
      { path: 'disponibilidad', element: <AvailabilityPage /> },
      { path: 'usuarios', element: <UsersPage /> },
      // armas | planos | mods | packs (ADMIN_KINDS); cualquier otro segmento vuelve a /admin
      { path: ':seg', element: <ProductsListPage /> },
      { path: ':seg/:id', element: <ProductFormPage /> },
      { path: '*', element: soon('1–2') },
    ],
  },
])

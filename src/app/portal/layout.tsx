import { Archivo } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import { MobileMenuProvider } from '@/contexts/MobileMenuContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import ServiceWorkerRegistrar from '@/components/portal/ServiceWorkerRegistrar';

// Display face for portal brand moments (login, KPI headers) — exposed as
// --font-archivo and consumed by the .portal-display helper in globals.css.
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
});

export const metadata = {
  title: "Employee Portal | 3C World Group",
  description: "3C World Group employee portal - access your dashboard, training, and resources.",
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout wraps the portal with Theme, Auth and MobileMenu providers.
  return (
    <ThemeProvider>
      <AuthProvider>
        <MobileMenuProvider>
          <ServiceWorkerRegistrar />
          {/* .portal-scope gates the portal reskin tokens/overrides in
              globals.css; display:contents keeps it out of the layout. */}
          <div className={`portal-scope contents ${archivo.variable}`}>{children}</div>
        </MobileMenuProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

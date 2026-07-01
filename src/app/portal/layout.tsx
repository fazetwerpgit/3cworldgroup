import { AuthProvider } from '@/contexts/AuthContext';
import { MobileMenuProvider } from '@/contexts/MobileMenuContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import ServiceWorkerRegistrar from '@/components/portal/ServiceWorkerRegistrar';

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
          {children}
        </MobileMenuProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

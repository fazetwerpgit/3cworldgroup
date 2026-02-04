import { AuthProvider } from '@/contexts/AuthContext';
import { MobileMenuProvider } from '@/contexts/MobileMenuContext';

export const metadata = {
  title: "Employee Portal | 3C World Group",
  description: "3C World Group employee portal - access your dashboard, training, and resources.",
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout wraps the portal with AuthProvider and MobileMenuProvider
  return (
    <AuthProvider>
      <MobileMenuProvider>
        {children}
      </MobileMenuProvider>
    </AuthProvider>
  );
}

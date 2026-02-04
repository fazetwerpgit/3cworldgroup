import Navbar from "./Navbar";
import Footer from "./Footer";
import FloatingCTA from "./FloatingCTA";
import HiringTicker from "./HiringTicker";

export default function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HiringTicker />
      <Navbar />
      <main className="min-h-screen">
        {children}
      </main>
      <Footer />
      <FloatingCTA />
    </>
  );
}

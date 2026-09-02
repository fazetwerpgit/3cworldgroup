import Navbar from "./Navbar";
import Footer from "./Footer";

export default function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-site">
      <Navbar />
      <div className="public-ending-surface">
        <main className="public-main">{children}</main>
        <Footer />
      </div>
    </div>
  );
}

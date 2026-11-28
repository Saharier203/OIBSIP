import { Outlet } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';

const Layout = () => {
  return (
    <div className="bg-cream min-h-screen">
      <Header />
      <main className="py-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default Layout;
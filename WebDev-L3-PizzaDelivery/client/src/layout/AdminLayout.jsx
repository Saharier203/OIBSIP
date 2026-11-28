import { Outlet } from 'react-router-dom';
import Header from '../components/Header';

const AdminLayout = () => {
  return (
    <div className="bg-cream min-h-screen">
      <Header />
      <main className="py-8 max-w-7xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
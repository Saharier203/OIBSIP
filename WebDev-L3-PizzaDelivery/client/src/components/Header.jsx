import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Header = () => {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="bg-primary text-white py-4 shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 text-xl font-bold">
          <span className="text-2xl">🍕</span>
          <span>Pizza Delivery</span>
        </Link>

        <nav>
          <ul className="flex items-center gap-6 text-sm font-medium">
            <li>
              <Link to="/" className="hover:opacity-80">Home</Link>
            </li>
            <li>
              <Link to="/menu" className="hover:opacity-80">Menu</Link>
            </li>
            <li>
              <Link to="/cart" className="hover:opacity-80">Cart</Link>
            </li>
          </ul>
        </nav>

        <div className="flex items-center gap-3 text-sm">
          {loading ? null : user ? (
            <>
              <span className="font-medium">Hi, {user.name || user.email}</span>
              <Link to="/orders/my" className="underline hover:opacity-80">
                My Orders
              </Link>
              <button
                onClick={handleLogout}
                className="bg-white/20 px-3 py-1.5 rounded-full hover:bg-white/30 transition-colors"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="px-4 py-1.5 rounded-full hover:bg-white/20 transition-colors">
                Login
              </Link>
              <Link
                to="/register"
                className="bg-white text-primary font-semibold px-4 py-1.5 rounded-full hover:bg-white/90 transition-colors"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;

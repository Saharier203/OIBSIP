import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-border text-sm text-muted py-6 border-t border-border">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <strong>Pizza Delivery</strong>
            <p className="mt-1">
              Premium pizzeria since 2026
            </p>
          </div>

          <nav className="flex gap-4">
            <Link to="/">Home</Link>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </nav>
        </div>

        <div className="mt-4 text-center md:text-left">
          <p className="text-xs opacity-60">
            © 2026 Pizza Delivery. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
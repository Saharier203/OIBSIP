import { useState } from 'react';
import api from '../api/api';
import { useNavigate } from 'react-router-dom';

const AdminLoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/admin/login', {
        email,
        password,
      }, { withCredentials: true });
      const { user } = res.data;
      navigate('/admin/orders');
    } catch (err) {
      setError('Invalid email or password');
    }
    setLoading(false);
  };

  return (
    <div className="bg-cream min-h-screen p-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-primary mb-6">Admin Login</h2>
      {error && (
        <div className="bg-red-100 text-red-800 p-4 rounded mb-4">
          {error}
        </div>
      )}
      {loading && (
        <div className="bg-gray-200 text-gray-800 p-4 rounded mb-4">
          Logging in...
        </div>
      )}
      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault();
          handleLogin();
        }}
      >
        <div>
          <label className="block text-sm font-medium text-charcoal mb-1">
            Email
          </label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            type="email"
            required
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-charcoal mb-1">
            Password
          </label>
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            type="password"
            required
            className="w-full border border-border rounded px-3 py-2"
          />
        </div>
        <button type="submit" className="w-full bg-primary text-white py-2 rounded hover:bg-opacity-90 transition">
          {loading ? 'Sign in...' : 'Sign In'}
        </button>
      </form>
      <p className="mt-4 text-sm">
        <a href="/">Go to customer site</a>
      </p>
    </div>
  );
};

export default AdminLoginPage;
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

export const healthCheck = async () => {
  try {
    const res = await api.get('/health');
    return res.data;
  } catch (err) {
    console.error('Health check failed', err);
    throw err;
  }
};

export default api;
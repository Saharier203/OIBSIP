import { useState, useEffect } from 'react';
import api from '../api/api';
import { Link } from 'react-router-dom';
import heroImg from '../assets/hero.png';

const steps = [
  { icon: '🍞', title: 'Choose a Base', text: 'Hand-tossed, thin crust or cheese burst — pick your favourite.' },
  { icon: '🥫', title: 'Pick a Sauce', text: 'Classic tomato, tangy BBQ or creamy garlic.' },
  { icon: '🧀', title: 'Add Cheese', text: 'Mozzarella, cheddar or a gooey four-cheese blend.' },
  { icon: '🥦', title: 'Load Veggies', text: 'Fresh onions, capsicum, olives, mushrooms and more.' },
];

const features = [
  { icon: '🔥', title: 'Freshly Baked', text: 'Every pizza is made to order in a stone oven.' },
  { icon: '🚀', title: 'Fast Delivery', text: 'Hot at your door in 30 minutes or less.' },
  { icon: '🔒', title: 'Secure Payments', text: 'Pay safely online with Razorpay.' },
  { icon: '💚', title: 'Quality Ingredients', text: 'Fresh veggies and premium cheese, always.' },
];

const HomePage = () => {
  const [catalog, setCatalog] = useState({
    bases: [],
    sauces: [],
    cheeses: [],
    vegetables: [],
    pizzas: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        setLoading(true);
        const res = await api.get('/catalog', {
          withCredentials: true,
        });
        setCatalog(res.data);
      } catch (err) {
        setError('Failed to load menu. Please try again later.');
        console.error('Catalog fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCatalog();
  }, []);

  const pizzas = catalog.pizzas || [];

  return (
    <div className="bg-cream">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <div className="text-center md:text-left">
            <span className="inline-block bg-primary/10 text-primary font-semibold text-sm px-4 py-1.5 rounded-full mb-5">
              Fresh • Hot • Fast
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-charcoal leading-tight mb-5">
              Authentic Pizza <br className="hidden sm:block" />
              <span className="text-primary">Delivered Fresh</span>
            </h1>
            <p className="text-lg text-muted max-w-lg mx-auto md:mx-0 mb-8">
              Hand-tossed bases, rich sauces, quality cheese and crisp vegetables — build your perfect pizza and we'll deliver it hot.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              <Link
                to="/menu"
                className="bg-primary text-white font-semibold px-8 py-3 rounded-full shadow-lg shadow-primary/30 hover:bg-primary/90 transition-colors"
              >
                Order Now
              </Link>
              <Link
                to="/menu"
                className="bg-white text-charcoal font-semibold px-8 py-3 rounded-full border border-border hover:border-primary hover:text-primary transition-colors"
              >
                Build Your Pizza
              </Link>
            </div>
          </div>
          <div className="relative flex justify-center">
            <div className="absolute inset-0 m-auto h-72 w-72 md:h-96 md:w-96 rounded-full bg-accent/20" />
            <img
              src={heroImg}
              alt="Delicious pizza"
              className="relative w-64 md:w-80 lg:w-96 drop-shadow-2xl"
            />
          </div>
        </div>
      </section>

      {/* Pizzas */}
      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-charcoal mb-3">
              Our Signature Pizzas
            </h2>
            <p className="text-muted max-w-xl mx-auto">
              Classic favourites, freshly baked and ready to order.
            </p>
          </div>

          {loading && (
            <div className="flex flex-col items-center py-12">
              <div className="h-16 w-16 rounded-full border-4 border-border border-t-primary animate-spin" />
              <p className="text-muted mt-4">Loading menu...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-red-600 mb-4">{error}</p>
              <Link to="/menu" className="text-primary font-medium underline">
                Browse Menu
              </Link>
            </div>
          )}

          {!loading && !error && pizzas.length === 0 && (
            <p className="text-center text-muted py-8">No pizzas available at the moment.</p>
          )}

          {!loading && !error && pizzas.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {pizzas.map((pizza) => {
                const isVeg = pizza.category === 'veg';
                return (
                  <article
                    key={pizza.slug}
                    className="group bg-white rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
                  >
                    <div className="relative h-48 bg-linear-to-br from-accent/30 to-primary/20 flex items-center justify-center overflow-hidden">
                      <span className="text-7xl transform group-hover:scale-110 transition-transform duration-300">
                        🍕
                      </span>
                      <span
                        className={`absolute top-3 left-3 text-xs font-semibold px-3 py-1 rounded-full ${
                          isVeg ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {isVeg ? 'Veg' : 'Non-Veg'}
                      </span>
                    </div>
                    <div className="p-6 flex flex-col flex-1">
                      <h3 className="text-xl font-bold text-charcoal mb-1">{pizza.name}</h3>
                      <p className="text-sm text-muted line-clamp-2 flex-1">
                        {pizza.description || 'Signature recipe with fresh ingredients.'}
                      </p>
                      <div className="mt-5 flex items-center justify-between">
                        <span className="text-2xl font-extrabold text-primary">₹{pizza.price}</span>
                        <Link
                          to="/menu"
                          className="bg-primary/10 text-primary font-semibold text-sm px-4 py-2 rounded-full hover:bg-primary hover:text-white transition-colors"
                        >
                          Order
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-charcoal mb-3">
              Build Your Pizza
            </h2>
            <p className="text-muted max-w-xl mx-auto">
              Four simple steps to your perfect pie.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className="relative bg-cream rounded-2xl p-6 border border-border hover:border-primary transition-colors"
              >
                <span className="absolute -top-3 -left-2 h-8 w-8 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="text-4xl mb-3">{step.icon}</div>
                <h3 className="text-lg font-bold text-charcoal mb-1">{step.title}</h3>
                <p className="text-sm text-muted">{step.text}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              to="/menu"
              className="inline-block bg-primary text-white font-semibold px-8 py-3 rounded-full shadow-lg shadow-primary/30 hover:bg-primary/90 transition-colors"
            >
              Start Building
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="text-center p-6">
                <div className="text-4xl mb-3">{feature.icon}</div>
                <h3 className="text-lg font-bold text-charcoal mb-1">{feature.title}</h3>
                <p className="text-sm text-muted">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;

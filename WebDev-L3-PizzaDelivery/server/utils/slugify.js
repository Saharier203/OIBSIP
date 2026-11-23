export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function inventorySlug(category, name) {
  return `${category}-${slugify(name)}`;
}

export function pizzaSlug(name) {
  return `pizza-${slugify(name)}`;
}

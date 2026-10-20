-- Data-only migration: rewrite stored Font Awesome / PrimeIcons avatar names to the
-- registry names in packages/shared-data/src/avatar-icons.ts (AVATAR_ICON_NAMES).
-- Only rows whose name actually changes are listed. Unmapped values are left alone on
-- purpose: the web avatar falls back to a default icon for anything not in the registry.

-- categories
UPDATE "categories" SET "icon" = CASE "icon"
  WHEN 'cart' THEN 'shopping-cart'
  WHEN 'tshirt' THEN 'shirt'
  WHEN 'couch' THEN 'sofa'
  WHEN 'file-invoice' THEN 'receipt'
  WHEN 'spray-can-sparkles' THEN 'spray-can'
  WHEN 'hand-holding-heart' THEN 'hand-heart'
  WHEN 'phone' THEN 'smartphone'
  WHEN 'question' THEN 'circle-help'
  WHEN 'money-bill-wave' THEN 'banknote'
  WHEN 'bank' THEN 'landmark'
  WHEN 'building-columns' THEN 'landmark'
  WHEN 'money-bill' THEN 'banknote'
  WHEN 'home' THEN 'house'
END
WHERE "icon" IN (
  'cart', 'tshirt', 'couch', 'file-invoice', 'spray-can-sparkles', 'hand-holding-heart', 'phone',
  'question', 'money-bill-wave', 'bank', 'building-columns', 'money-bill', 'home'
);

-- accounts
UPDATE "accounts" SET "icon" = CASE "icon"
  WHEN 'cart' THEN 'shopping-cart'
  WHEN 'tshirt' THEN 'shirt'
  WHEN 'couch' THEN 'sofa'
  WHEN 'file-invoice' THEN 'receipt'
  WHEN 'spray-can-sparkles' THEN 'spray-can'
  WHEN 'hand-holding-heart' THEN 'hand-heart'
  WHEN 'phone' THEN 'smartphone'
  WHEN 'question' THEN 'circle-help'
  WHEN 'money-bill-wave' THEN 'banknote'
  WHEN 'bank' THEN 'landmark'
  WHEN 'building-columns' THEN 'landmark'
  WHEN 'money-bill' THEN 'banknote'
  WHEN 'home' THEN 'house'
END
WHERE "icon" IN (
  'cart', 'tshirt', 'couch', 'file-invoice', 'spray-can-sparkles', 'hand-holding-heart', 'phone',
  'question', 'money-bill-wave', 'bank', 'building-columns', 'money-bill', 'home'
);

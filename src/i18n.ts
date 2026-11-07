import en from './locales/en.json';
import it from './locales/it.json';

const fieldLabels: Record<string, string> = {
  name: 'Wine name',
  producer: 'Producer / winery',
  type: 'Wine type',
  vintage: 'Vintage',
  country: 'Country',
  region: 'Region',
  appellation: 'Appellation',
  grapes: 'Grape varieties',
  abv: 'Alcohol (ABV %)',
  size: 'Bottle size',
  sweetness: 'Sweetness / style',
  quantity: 'Quantity',
  cellar: 'Cellar',
  cellarId: 'Cellar',
  position: 'Shelf / position',
  datePlaced: 'Date placed in cellar',
  origin: 'Origin',
  originDetails: 'Origin details',
  giftedBy: 'Gifted by',
  occasion: 'Occasion',
  shopName: 'Shop name',
  trip: 'Place / trip',
  price: 'Purchase price',
  value: 'Estimated value',
  drinkFrom: 'Drink from (year)',
  drinkBy: 'Drink by (year)',
  servingMin: 'Serving minimum (°C)',
  servingMax: 'Serving maximum (°C)',
  rating: 'Rating',
  notes: 'Tasting notes',
  tags: 'Tags',
  barcode: 'Barcode',
  query: 'Search your wines',
  status: 'Drinking status',
  vintageMin: 'Vintage minimum',
  vintageMax: 'Vintage maximum',
  abvMin: 'ABV minimum',
  abvMax: 'ABV maximum',
  ratingMin: 'Minimum rating',
  priceMin: 'Minimum price',
  priceMax: 'Maximum price',
  Required: 'required',
};
export function translator(language: 'en' | 'it') {
  const dictionary: Record<string, string> = language === 'it' ? it : en;
  return (key: string) => {
    const label = fieldLabels[key] ?? key;
    if (
      language === 'it' &&
      /^Vintage must be NV or a year between 1800 and \d{4}$/.test(key)
    )
      return `L’annata deve essere NV oppure un anno tra 1800 e ${key.slice(-4)}`;
    if (language === 'it' && /^Only \d+ bottles in stock$/.test(key))
      return `Solo ${key.match(/\d+/)?.[0]} bottiglie disponibili`;
    return dictionary[label] ?? label;
  };
}

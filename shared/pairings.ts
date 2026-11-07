import type { Bottle } from './model';
import { drinkingStatus } from './model';

type Rule = {
  dishes: string[];
  keywords: string[];
  reason: string;
  min: number;
  max: number;
  glass: string;
  decant: string;
};
const sparkling: Rule = {
  dishes: ['Oysters', 'Seafood risotto', 'Fried appetisers', 'Aged Parmigiano'],
  keywords: [
    'oyster',
    'seafood',
    'risotto',
    'fried',
    'parmigiano',
    'pesce',
    'ostriche',
    'fritto',
  ],
  reason:
    'Bright acidity and bubbles cut through richness and complement seafood.',
  min: 6,
  max: 8,
  glass: 'Tulip',
  decant: 'No decanting',
};
const red: Rule = {
  dishes: ['Braised beef', 'Game', 'Truffle tagliatelle', 'Mature cheeses'],
  keywords: [
    'beef',
    'game',
    'truffle',
    'cheese',
    'steak',
    'manzo',
    'tartufo',
    'formaggio',
  ],
  reason: 'Tannins complement protein; earthy aromas match savoury dishes.',
  min: 16,
  max: 18,
  glass: 'Large red wine glass',
  decant: 'Decant 30–60 minutes',
};
const white: Rule = {
  dishes: ['Grilled fish', 'Salads', 'Goat cheese', 'Mushroom risotto'],
  keywords: [
    'fish',
    'salad',
    'goat',
    'risotto',
    'mushroom',
    'pesce',
    'insalata',
    'funghi',
  ],
  reason: 'Fresh acidity balances creamy textures and delicate flavours.',
  min: 8,
  max: 12,
  glass: 'White wine glass',
  decant: 'No decanting',
};
const rules: Record<string, Rule> = {
  Champagne: sparkling,
  Franciacorta: sparkling,
  'Other sparkling': sparkling,
  Prosecco: {
    ...sparkling,
    dishes: ['Aperitif snacks', 'Light pasta', 'Fruit desserts'],
    keywords: ['aperitif', 'snack', 'pasta', 'fruit', 'aperitivo', 'frutta'],
  },
  Red: red,
  White: white,
  Rosé: {
    ...white,
    dishes: ['Mediterranean dishes', 'Pizza', 'Paella'],
    keywords: ['mediterranean', 'pizza', 'paella', 'tomato', 'pomodoro'],
  },
  Dessert: {
    ...white,
    dishes: ['Blue cheese', 'Dark chocolate', 'Dry pastries'],
    keywords: [
      'blue cheese',
      'chocolate',
      'pastry',
      'dessert',
      'cioccolato',
      'dolce',
    ],
    min: 10,
    max: 14,
    reason: 'Sweetness balances salty cheese and rich desserts.',
  },
  Fortified: {
    ...red,
    dishes: ['Blue cheese', 'Dark chocolate', 'Dry pastries'],
    keywords: [
      'blue cheese',
      'chocolate',
      'pastry',
      'dessert',
      'cioccolato',
      'dolce',
    ],
    reason: 'Concentrated flavours match intense cheeses and chocolate.',
    min: 12,
    max: 16,
  },
};
export function serving(
  b: Pick<Bottle, 'type' | 'grapes' | 'abv' | 'sweetness' | 'region'>,
): Rule {
  let rule = rules[b.type] ?? white;
  const traits = `${b.grapes.join(' ')} ${b.region}`.toLowerCase();
  if (
    b.type === 'Red' &&
    (/pinot|gamay|beaujolais/.test(traits) ||
      (b.abv !== undefined && b.abv < 13))
  )
    rule = {
      ...red,
      dishes: ['Grilled salmon', 'Mushrooms', 'Charcuterie'],
      keywords: [
        'salmon',
        'mushroom',
        'charcuterie',
        'risotto',
        'salmone',
        'funghi',
      ],
      min: 14,
      max: 16,
      decant: 'Optional: 15 minutes',
      reason: 'Gentle tannins and bright fruit suit lighter, earthy dishes.',
    };
  if (b.sweetness === 'Sweet') rule = rules.Dessert;
  return rule;
}
export function pairingsFor(b: Bottle) {
  const r = serving(b);
  const regionDish = /piedmont|piemonte/i.test(b.region)
    ? 'Truffle tagliatelle'
    : /lombard/i.test(b.region)
      ? 'Seafood risotto'
      : '';
  return [
    ...new Set([
      ...b.pairings,
      ...(regionDish ? [regionDish] : []),
      ...r.dishes,
    ]),
  ]
    .sort(
      (a, c) =>
        (b.feedback[a] === 'dislike' ? 1 : b.feedback[a] === 'like' ? -1 : 0) -
        (b.feedback[c] === 'dislike' ? 1 : b.feedback[c] === 'like' ? -1 : 0),
    )
    .map((dish) => ({
      dish,
      reason: b.pairings.includes(dish) ? 'Your personal pairing.' : r.reason,
    }));
}
export function reversePairing(bottles: Bottle[], query: string) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (!terms.length) return [];
  return bottles
    .filter((b) => b.quantity > 0)
    .map((b) => {
      const r = serving(b);
      const haystack = [
        ...r.keywords,
        ...pairingsFor(b)
          .filter((p) => b.feedback[p.dish] !== 'dislike')
          .map((p) => p.dish),
      ]
        .join(' ')
        .toLowerCase();
      return {
        bottle: b,
        score: terms.filter((t) => haystack.includes(t)).length,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => {
      const priority = (wine: Bottle) =>
        ['Ready', 'Drink soon'].includes(drinkingStatus(wine)) ? 0 : 1;
      return priority(a.bottle) - priority(b.bottle) || b.score - a.score;
    });
}

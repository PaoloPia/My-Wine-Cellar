import {
  cellarSchema,
  emptyCollection,
  newBottle,
  type Collection,
} from '../shared/model';
export function fixture(): Collection {
  const s = emptyCollection();
  s.cellars = [
    cellarSchema.parse({
      id: 'fridge',
      name: 'Sparkling Fridge',
      temperature: 8,
      capacity: 24,
    }),
    cellarSchema.parse({ id: 'red', name: 'Red Wine Rack', temperature: 16 }),
  ];
  s.bottles = [
    {
      ...newBottle('b1', 'fridge'),
      name: 'Franciacorta Brut DOCG',
      type: 'Franciacorta',
      vintage: '2019',
      origin: 'Gift',
      quantity: 6,
      abv: 12.5,
      price: 32,
      drinkFrom: 2024,
      drinkBy: 2030,
      producer: 'Cantina Esempio',
      region: 'Lombardy',
      grapes: ['Chardonnay'],
      tags: ['anniversary'],
      notes: 'cherry',
      photos: [
        {
          src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
          alt: 'Franciacorta label',
        },
      ],
    },
    {
      ...newBottle('b2', 'red'),
      name: 'Barolo',
      type: 'Red',
      vintage: '2016',
      origin: 'Wine shop',
      quantity: 3,
      price: 48,
      drinkFrom: 2020,
      drinkBy: 2031,
      region: 'Piedmont',
      grapes: ['Nebbiolo'],
    },
  ];
  return s;
}

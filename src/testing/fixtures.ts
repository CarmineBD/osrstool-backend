import { Item } from '../items/entities/item.entity';
import { Method } from '../methods/entities/method.entity';
import { MethodVariant } from '../methods/entities/variant.entity';
import { VariantIoItem } from '../methods/entities/io-item.entity';

export const buildItemFixture = (overrides: Partial<Item> = {}): Item => {
  const base: Item = {
    id: 4151,
    name: 'Abyssal whip',
    iconPath: 'Abyssal whip (p).png',
    examine: 'A weapon from the abyss.',
    value: 120001,
    highAlch: 72000,
    lowAlch: 48000,
    buyLimit: 70,
    questItem: false,
    equipable: true,
    noteable: false,
    stackable: false,
    weight: 0.5,
    tradeable: true,
    members: true,
    lastSyncedAt: new Date('2026-01-31T19:30:00.000Z'),
  };
  return { ...base, ...overrides };
};

export const buildMethodFixture = (): Method => {
  const method = new Method();
  method.name = 'Method One';
  method.slug = 'method-one';
  method.description = 'Test method';
  method.category = 'Skilling';

  const variantA = new MethodVariant();
  variantA.label = 'Variant A';
  variantA.slug = 'variant-a';
  variantA.description = null;
  variantA.xpHour = null;
  variantA.clickIntensity = 2;
  variantA.afkiness = 3;
  variantA.riskLevel = '1';
  variantA.requirements = null;
  variantA.recommendations = null;
  variantA.wilderness = false;
  variantA.actionsPerHour = 600;
  variantA.ioItems = [
    Object.assign(new VariantIoItem(), {
      itemId: 100,
      type: 'input',
      quantity: 2,
      variant: variantA,
    }),
    Object.assign(new VariantIoItem(), {
      itemId: 200,
      type: 'output',
      quantity: 1,
      variant: variantA,
    }),
  ];

  const variantB = new MethodVariant();
  variantB.label = 'Variant B';
  variantB.slug = 'variant-b';
  variantB.description = null;
  variantB.xpHour = [{ skill: 'Cooking', experience: 10000 }];
  variantB.clickIntensity = 1;
  variantB.afkiness = 4;
  variantB.riskLevel = '1';
  variantB.requirements = null;
  variantB.recommendations = null;
  variantB.wilderness = false;
  variantB.actionsPerHour = 800;
  variantB.ioItems = [
    Object.assign(new VariantIoItem(), {
      itemId: 100,
      type: 'input',
      quantity: 1,
      variant: variantB,
    }),
    Object.assign(new VariantIoItem(), {
      itemId: 200,
      type: 'output',
      quantity: 3,
      variant: variantB,
    }),
  ];

  variantA.method = method;
  variantB.method = method;
  method.variants = [variantA, variantB];
  return method;
};

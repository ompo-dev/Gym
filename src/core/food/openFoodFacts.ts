import type { FoodData } from '@/domains/schemas';

const PRODUCT_FIELDS = [
  'code',
  'product_name',
  'generic_name',
  'brands',
  'categories',
  'categories_tags',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
  'serving_size',
  'serving_quantity',
  'serving_quantity_unit',
  'nutriments',
  'image_front_url',
].join(',');

interface OpenFoodFactsProduct {
  product_name?: unknown;
  generic_name?: unknown;
  brands?: unknown;
  categories?: unknown;
  categories_tags?: unknown;
  quantity?: unknown;
  product_quantity?: unknown;
  product_quantity_unit?: unknown;
  serving_size?: unknown;
  serving_quantity?: unknown;
  serving_quantity_unit?: unknown;
  nutriments?: Record<string, unknown>;
  image_front_url?: unknown;
}

interface OpenFoodFactsResponse {
  product?: OpenFoodFactsProduct;
  status?: unknown;
}

export interface OpenFoodFactsFood {
  text: string;
  data: FoodData;
  imageUri?: string;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNumber(nutriments: Record<string, unknown>, key: string): number | undefined {
  const raw = nutriments[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(',', '.')) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

function readNumeric(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.')) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function kcal(nutriments: Record<string, unknown>, suffix: 'serving' | '100g'): number {
  const direct = readNumber(nutriments, `energy-kcal_${suffix}`) ?? readNumber(nutriments, 'energy-kcal');
  if (direct !== undefined) return Math.round(direct);
  const kj = readNumber(nutriments, `energy_${suffix}`) ?? readNumber(nutriments, 'energy');
  return kj === undefined ? 0 : Math.round(kj / 4.184);
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function volumeToMl(amount: number, unit: string): number | undefined {
  const normalized = normalizeText(unit);
  if (normalized === 'ml' || normalized === 'milliliter' || normalized === 'milliliters') return amount;
  if (normalized === 'cl') return amount * 10;
  if (normalized === 'dl') return amount * 100;
  if (normalized === 'l' || normalized === 'lt' || normalized.startsWith('litro') || normalized.startsWith('liter') || normalized.startsWith('litre')) {
    return amount * 1000;
  }
  return undefined;
}

function parseVolumeMl(...values: (string | undefined)[]): number | undefined {
  for (const value of values) {
    if (!value) continue;
    const text = normalizeText(value).replace(',', '.');
    const multiplied = text.match(/(\d+(?:\.\d+)?)\s*(?:x|\*)\s*(\d+(?:\.\d+)?)\s*([a-z]+)/);
    if (multiplied) {
      const ml = volumeToMl(Number(multiplied[1]) * Number(multiplied[2]), multiplied[3]);
      if (ml !== undefined) return Math.round(ml);
    }
    const single = text.match(/(\d+(?:\.\d+)?)\s*([a-z]+)/);
    if (single) {
      const ml = volumeToMl(Number(single[1]), single[2]);
      if (ml !== undefined) return Math.round(ml);
    }
  }
  return undefined;
}

function hydrationMl(product: OpenFoodFactsProduct, productName: string): number {
  const productQuantity = readNumeric(product.product_quantity);
  const productUnit = readString(product.product_quantity_unit);
  const servingQuantity = readNumeric(product.serving_quantity);
  const servingUnit = readString(product.serving_quantity_unit);
  const volumeMl = parseVolumeMl(
    productQuantity !== undefined && productUnit ? `${productQuantity} ${productUnit}` : undefined,
    readString(product.quantity),
    servingQuantity !== undefined && servingUnit ? `${servingQuantity} ${servingUnit}` : undefined,
    readString(product.serving_size),
  );
  if (!volumeMl) return 0;

  const categories = Array.isArray(product.categories_tags)
    ? product.categories_tags.filter((item): item is string => typeof item === 'string').join(' ')
    : '';
  const text = normalizeText([productName, readString(product.categories), categories].filter(Boolean).join(' '));
  const excluded = ['oil', 'oleo', 'azeite', 'vinegar', 'vinagre'].some((term) => text.includes(term));
  if (excluded) return 0;
  const hydrating = ['water', 'agua', 'milk', 'leite', 'beverage', 'bebida', 'drink', 'juice', 'suco', 'soda', 'refrigerante', 'tea', 'cha', 'coffee', 'cafe', 'yogurt', 'iogurte', 'kefir'].some((term) => text.includes(term));
  return hydrating ? volumeMl : 0;
}

export function mapOpenFoodFactsProduct(code: string, product: OpenFoodFactsProduct | undefined): OpenFoodFactsFood | null {
  if (!product) return null;
  const nutriments = product.nutriments ?? {};
  const productName = readString(product.product_name) ?? readString(product.generic_name);
  if (!productName) return null;

  const brand = readString(product.brands);
  const servingSize = readString(product.serving_size);
  const suffix: 'serving' | '100g' =
    readNumber(nutriments, 'energy-kcal_serving') !== undefined ? 'serving' : '100g';
  const basis = suffix === 'serving' && servingSize ? `por porcao de ${servingSize}` : 'por 100 g/ml';
  const text = brand ? `${productName} (${brand})` : productName;

  return {
    text,
    imageUri: readString(product.image_front_url),
    data: {
      items: [
        {
          label: productName,
          quantity: 1,
          unit: 'unidade',
          calories: kcal(nutriments, suffix),
          protein: round(readNumber(nutriments, `proteins_${suffix}`) ?? readNumber(nutriments, 'proteins') ?? 0),
          carbs: round(readNumber(nutriments, `carbohydrates_${suffix}`) ?? readNumber(nutriments, 'carbohydrates') ?? 0),
          fat: round(readNumber(nutriments, `fat_${suffix}`) ?? readNumber(nutriments, 'fat') ?? 0),
          waterMl: hydrationMl(product, productName),
        },
      ],
      reasoning: `Produto ${code} encontrado no Open Food Facts. Valores importados ${basis}; revise com o rotulo se necessario.`,
      confidence: 95,
    },
  };
}

export async function lookupOpenFoodFactsProduct(code: string): Promise<OpenFoodFactsFood | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}.json?fields=${PRODUCT_FIELDS}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'GymNotes/1.0',
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as OpenFoodFactsResponse;
    return mapOpenFoodFactsProduct(code, payload.product);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

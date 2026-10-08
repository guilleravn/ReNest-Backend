import type {
  City,
  ListingCondition,
  Weekday,
} from '../../src/generated/prisma/client.js';

// Demo data only. Credentials are documented in the README.
export const DEMO_PASSWORD = 'renest-demo';

export const CATEGORIES = [
  { name: 'Muebles', slug: 'muebles' },
  { name: 'Electrónica', slug: 'electronica' },
  { name: 'Hogar', slug: 'hogar' },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

interface DemoUser {
  email: string;
  fullName: string;
  phoneE164: string;
  city: City;
  isVerified: boolean;
}

export const USERS = {
  verifiedSeller: {
    email: 'vendedora.verificada@renest.app',
    fullName: 'Laura Gómez',
    phoneE164: '+59170000001',
    city: 'COCHABAMBA_BO',
    isVerified: true,
  },
  unverifiedSeller: {
    email: 'vendedor@renest.app',
    fullName: 'Diego Quispe',
    phoneE164: '+51987000002',
    city: 'AREQUIPA_PE',
    isVerified: false,
  },
  buyerA: {
    email: 'comprador1@renest.app',
    fullName: 'Ana Rojas',
    phoneE164: '+59170000003',
    city: 'COCHABAMBA_BO',
    isVerified: false,
  },
  buyerB: {
    email: 'comprador2@renest.app',
    fullName: 'Carlos Méndez',
    phoneE164: '+51987000004',
    city: 'AREQUIPA_PE',
    isVerified: false,
  },
} satisfies Record<string, DemoUser>;

export type DemoUserKey = keyof typeof USERS;

interface DemoPickup {
  locationLabel: string;
  weekdays: Weekday[];
  start: string; // HH:MM, local time of the meetup city
  end: string;
}

// Each step happens this many days after the previous one. The buyer's
// reception is independent of the seller's handover.
interface DemoReservation {
  buyer: DemoUserKey;
  reservedAfterDays: number;
  handedOverAfterDays?: number;
  reception?: {
    receivedAfterDays: number;
    checklist: {
      matchesListing: boolean;
      worksNoUndisclosedDamage: boolean;
      allPartsIncluded: boolean;
      issueReport?: string;
    };
    stars?: number;
  };
}

export interface DemoListing {
  id: string; // fixed, so a second run finds it and skips it
  seller: DemoUserKey;
  category: CategorySlug;
  title: string;
  description: string;
  condition: ListingCondition;
  priceCents: number;
  publishedDaysAgo: number;
  photos: string[]; // files in prisma/seed/photos, first = cover
  pickups: DemoPickup[];
  reservation?: DemoReservation;
}

const COCHABAMBA_PICKUPS: DemoPickup[] = [
  {
    locationLabel: 'Plaza 14 de Septiembre, frente a la Catedral',
    weekdays: ['SATURDAY', 'SUNDAY'],
    start: '10:00',
    end: '13:00',
  },
  {
    locationLabel: 'Hupermall, patio de comidas',
    weekdays: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
    start: '18:00',
    end: '20:30',
  },
];

const AREQUIPA_PICKUPS: DemoPickup[] = [
  {
    locationLabel: 'Plaza de Armas de Arequipa, portal de San Agustín',
    weekdays: ['TUESDAY', 'THURSDAY'],
    start: '17:00',
    end: '19:00',
  },
  {
    locationLabel: 'Café Valenzuela, Calle Mercaderes',
    weekdays: ['SATURDAY'],
    start: '09:30',
    end: '12:00',
  },
];

const listingId = (n: number) =>
  `0192d3a4-5eed-7000-8000-${String(n).padStart(12, '0')}`;

export const LISTINGS: DemoListing[] = [
  {
    id: listingId(1),
    seller: 'verifiedSeller',
    category: 'muebles',
    title: 'Sofá de tres cuerpos gris',
    description:
      'Sofá de tela gris, tres cuerpos. Cojines firmes, sin manchas ni roturas. Se entrega sin las fundas decorativas.',
    condition: 'GENTLY_USED',
    priceCents: 85000,
    publishedDaysAgo: 1,
    photos: ['sofa-1.jpg', 'sofa-2.jpg', 'sofa-3.jpg'],
    pickups: COCHABAMBA_PICKUPS,
  },
  {
    id: listingId(2),
    seller: 'verifiedSeller',
    category: 'muebles',
    title: 'Mesa de comedor de roble para 6',
    description:
      'Mesa de roble macizo de 180 x 90 cm. Comprada hace un año, casi sin uso. No incluye sillas.',
    condition: 'LIKE_NEW',
    priceCents: 120000,
    publishedDaysAgo: 2,
    photos: ['mesa-1.jpg', 'mesa-2.jpg'],
    pickups: [COCHABAMBA_PICKUPS[0]],
  },
  {
    id: listingId(3),
    seller: 'unverifiedSeller',
    category: 'muebles',
    title: 'Silla de escritorio ergonómica',
    description:
      'Silla con soporte lumbar y altura regulable. El tapiz tiene desgaste en los apoyabrazos; todo lo demás funciona.',
    condition: 'HEAVILY_USED',
    priceCents: 15000,
    publishedDaysAgo: 3,
    photos: ['silla-1.jpg'],
    pickups: AREQUIPA_PICKUPS,
  },
  {
    id: listingId(4),
    seller: 'unverifiedSeller',
    category: 'muebles',
    title: 'Estantería de pino de 5 niveles',
    description:
      'Estantería de pino natural, 180 cm de alto. Se entrega armada.',
    condition: 'GENTLY_USED',
    priceCents: 9000,
    publishedDaysAgo: 12,
    photos: ['estanteria-1.jpg', 'estanteria-2.jpg'],
    pickups: [AREQUIPA_PICKUPS[1]],
    reservation: { buyer: 'buyerA', reservedAfterDays: 2 },
  },
  {
    id: listingId(5),
    seller: 'verifiedSeller',
    category: 'electronica',
    title: 'Laptop Lenovo ThinkPad T480',
    description:
      'Intel i5 de 8.ª generación, 16 GB de RAM y SSD de 512 GB. La batería dura unas 5 horas. Incluye el cargador original.',
    condition: 'GENTLY_USED',
    priceCents: 180000,
    publishedDaysAgo: 4,
    photos: ['laptop-1.jpg', 'laptop-2.jpg', 'laptop-3.jpg'],
    pickups: COCHABAMBA_PICKUPS,
  },
  {
    id: listingId(6),
    seller: 'unverifiedSeller',
    category: 'electronica',
    title: 'Audífonos Sony WH-1000XM4',
    description:
      'Audífonos inalámbricos con cancelación de ruido. Vienen con su estuche y el cable de carga.',
    condition: 'LIKE_NEW',
    priceCents: 95000,
    publishedDaysAgo: 5,
    photos: ['audifonos-1.jpg', 'audifonos-2.jpg'],
    pickups: [AREQUIPA_PICKUPS[0]],
  },
  {
    id: listingId(7),
    seller: 'verifiedSeller',
    category: 'electronica',
    title: 'Monitor Samsung de 24 pulgadas',
    description:
      'Monitor Full HD con entrada HDMI. Tiene rayones en el marco que no afectan la pantalla.',
    condition: 'HEAVILY_USED',
    priceCents: 35000,
    publishedDaysAgo: 14,
    photos: ['monitor-1.jpg'],
    pickups: [COCHABAMBA_PICKUPS[1]],
    // The buyer confirmed reception before the seller confirmed the handover.
    reservation: {
      buyer: 'buyerB',
      reservedAfterDays: 1,
      reception: {
        receivedAfterDays: 3,
        checklist: {
          matchesListing: true,
          worksNoUndisclosedDamage: true,
          allPartsIncluded: false,
          issueReport: 'No venía el cable HDMI.',
        },
        stars: 4,
      },
    },
  },
  {
    id: listingId(8),
    seller: 'verifiedSeller',
    category: 'electronica',
    title: 'Consola Nintendo Switch con dos controles',
    description:
      'Modelo con batería mejorada. Incluye la base, dos Joy-Con y el cargador.',
    condition: 'GENTLY_USED',
    priceCents: 140000,
    publishedDaysAgo: 20,
    photos: ['switch-1.jpg', 'switch-2.jpg'],
    pickups: COCHABAMBA_PICKUPS,
    reservation: {
      buyer: 'buyerA',
      reservedAfterDays: 1,
      handedOverAfterDays: 2,
      reception: {
        receivedAfterDays: 1,
        checklist: {
          matchesListing: true,
          worksNoUndisclosedDamage: true,
          allPartsIncluded: true,
        },
        stars: 5,
      },
    },
  },
  {
    id: listingId(9),
    seller: 'verifiedSeller',
    category: 'hogar',
    title: 'Lámpara de pie de madera',
    description: 'Lámpara de pie con pantalla de lino, 160 cm. Usa foco E27.',
    condition: 'LIKE_NEW',
    priceCents: 12000,
    publishedDaysAgo: 6,
    photos: ['lampara-1.jpg'],
    pickups: [COCHABAMBA_PICKUPS[0]],
  },
  {
    id: listingId(10),
    seller: 'verifiedSeller',
    category: 'hogar',
    title: 'Juego de ollas de acero inoxidable',
    description:
      'Cinco ollas con tapa de vidrio. Sirven para cocina a gas e inducción.',
    condition: 'GENTLY_USED',
    priceCents: 25000,
    publishedDaysAgo: 7,
    photos: ['ollas-1.jpg', 'ollas-2.jpg'],
    pickups: COCHABAMBA_PICKUPS,
  },
  {
    id: listingId(11),
    seller: 'verifiedSeller',
    category: 'hogar',
    title: 'Cafetera italiana de 6 tazas',
    description: 'Cafetera de aluminio. Funciona bien; tiene marcas de uso.',
    condition: 'HEAVILY_USED',
    priceCents: 4500,
    publishedDaysAgo: 9,
    photos: ['cafetera-1.jpg'],
    pickups: [COCHABAMBA_PICKUPS[1]],
    reservation: { buyer: 'buyerA', reservedAfterDays: 3 },
  },
  {
    id: listingId(12),
    seller: 'verifiedSeller',
    category: 'hogar',
    title: 'Alfombra tejida a mano de 2 x 3 m',
    description: 'Alfombra de lana en tonos tierra. Recién lavada.',
    condition: 'LIKE_NEW',
    priceCents: 30000,
    publishedDaysAgo: 18,
    photos: ['alfombra-1.jpg', 'alfombra-2.jpg'],
    pickups: [COCHABAMBA_PICKUPS[0]],
    // Handed over, but the buyer hasn't confirmed reception yet.
    reservation: {
      buyer: 'buyerB',
      reservedAfterDays: 1,
      handedOverAfterDays: 2,
    },
  },
];

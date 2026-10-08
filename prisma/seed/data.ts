import type { City } from '../../src/generated/prisma/client.js';

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

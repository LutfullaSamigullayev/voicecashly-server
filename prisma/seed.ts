import { PrismaClient } from '@prisma/client';
import { defaultCategories } from '../src/shared/default-categories';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding default categories template...');
  console.log(`${defaultCategories.length} default categories ready for workspace seeding.`);
  console.log('Seed completed.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

export { defaultCategories };

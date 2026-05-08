import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultCategories = [
  // EXPENSE kategoriyalar
  { nameUz: 'Oziq-ovqat', nameRu: 'Продукты', nameEn: 'Food', type: 'EXPENSE', color: '#E74C3C', icon: 'shopping-cart' },
  { nameUz: 'Transport', nameRu: 'Транспорт', nameEn: 'Transport', type: 'EXPENSE', color: '#E67E22', icon: 'car' },
  { nameUz: 'Ijara', nameRu: 'Аренда', nameEn: 'Rent', type: 'EXPENSE', color: '#9B59B6', icon: 'home' },
  { nameUz: 'Kommunal', nameRu: 'Коммунальные', nameEn: 'Utilities', type: 'EXPENSE', color: '#3498DB', icon: 'zap' },
  { nameUz: 'Sog\'liq', nameRu: 'Здоровье', nameEn: 'Health', type: 'EXPENSE', color: '#1ABC9C', icon: 'heart' },
  { nameUz: 'Ta\'lim', nameRu: 'Образование', nameEn: 'Education', type: 'EXPENSE', color: '#F39C12', icon: 'book' },
  { nameUz: 'Ko\'ngilochar', nameRu: 'Развлечения', nameEn: 'Entertainment', type: 'EXPENSE', color: '#E91E63', icon: 'smile' },
  { nameUz: 'Kiyim', nameRu: 'Одежда', nameEn: 'Clothing', type: 'EXPENSE', color: '#FF5722', icon: 'tag' },
  { nameUz: 'Logistika', nameRu: 'Логистика', nameEn: 'Logistics', type: 'EXPENSE', color: '#607D8B', icon: 'truck' },
  { nameUz: 'Marketing', nameRu: 'Маркетинг', nameEn: 'Marketing', type: 'EXPENSE', color: '#FF9800', icon: 'trending-up' },
  { nameUz: 'Boshqa xarajat', nameRu: 'Другие расходы', nameEn: 'Other expenses', type: 'EXPENSE', color: '#795548', icon: 'more-horizontal' },
  // INCOME kategoriyalar
  { nameUz: 'Maosh', nameRu: 'Зарплата', nameEn: 'Salary', type: 'INCOME', color: '#27AE60', icon: 'briefcase' },
  { nameUz: 'Savdo tushumi', nameRu: 'Выручка', nameEn: 'Sales revenue', type: 'INCOME', color: '#2ECC71', icon: 'shopping-bag' },
  { nameUz: 'Xizmat haqqi', nameRu: 'Сервисный доход', nameEn: 'Service income', type: 'INCOME', color: '#1D9E75', icon: 'award' },
  { nameUz: 'Ijara tushumi', nameRu: 'Доход от аренды', nameEn: 'Rental income', type: 'INCOME', color: '#00BCD4', icon: 'key' },
  { nameUz: 'Boshqa kirim', nameRu: 'Другие доходы', nameEn: 'Other income', type: 'INCOME', color: '#4CAF50', icon: 'plus-circle' },
];

async function main() {
  console.log('Seeding default categories template...');
  console.log(`${defaultCategories.length} default categories ready for workspace seeding.`);
  console.log('Seed completed.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

export { defaultCategories };

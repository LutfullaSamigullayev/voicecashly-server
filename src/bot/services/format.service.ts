export function formatReport(lang: 'uz' | 'ru' | 'en', data: any): string {
  const n = (v: number) => v.toLocaleString('uz-UZ');
  const periodLabel = data.label[lang];

  if (data.type === 'balance') {
    const labels = {
      uz: `📊 ${periodLabel} hisoboti\n\n📈 Kirim:   ${n(data.income)} so'm\n📉 Chiqim:  ${n(data.expense)} so'm\n💵 Foyda:   ${data.net >= 0 ? '+' : ''}${n(data.net)} so'm`,
      ru: `📊 Отчёт — ${periodLabel}\n\n📈 Доходы:  ${n(data.income)} сум\n📉 Расходы: ${n(data.expense)} сум\n💵 Прибыль: ${data.net >= 0 ? '+' : ''}${n(data.net)} сум`,
      en: `📊 ${periodLabel} Report\n\n📈 Income:  ${n(data.income)} UZS\n📉 Expense: ${n(data.expense)} UZS\n💵 Profit:  ${data.net >= 0 ? '+' : ''}${n(data.net)} UZS`,
    };
    return labels[lang];
  }

  if (data.type === 'top' || data.type === 'income' || data.type === 'expense') {
    const title = {
      uz: data.type === 'top'
        ? `🔝 ${periodLabel} — eng ko'p ${data.txType === 'EXPENSE' ? 'xarajat' : 'daromad'} kategoriyalar`
        : `${data.type === 'income' ? '📈 Kirimlar' : '📉 Chiqimlar'} — ${periodLabel}`,
      ru: data.type === 'top'
        ? `🔝 Топ категорий — ${periodLabel}`
        : `${data.type === 'income' ? '📈 Доходы' : '📉 Расходы'} — ${periodLabel}`,
      en: data.type === 'top'
        ? `🔝 Top categories — ${periodLabel}`
        : `${data.type === 'income' ? '📈 Income' : '📉 Expenses'} — ${periodLabel}`,
    };

    const total = data.total ? `\nJami: ${n(data.total)} so'm\n` : '';
    const rows = data.items.map((item: any, i: number) => {
      const catName = lang === 'uz' ? item.name.nameUz : lang === 'ru' ? item.name.nameRu : item.name.nameEn;
      return `   ${i + 1}. ${catName.padEnd(14)} — ${n(item.amount)} so'm`;
    }).join('\n');

    return `${title[lang]}\n${total}\n${rows}`;
  }

  return lang === 'ru' ? '❌ Данные не найдены' : lang === 'en' ? '❌ No data found' : '❌ Ma\'lumot topilmadi';
}

export function formatTransaction(
  lang: 'uz' | 'ru' | 'en',
  tx: { type: string; category: any; amount: number; currency: string; exchangeRate?: number; amountUzs?: number; date: Date },
): string {
  const n = (v: number) => v.toLocaleString('uz-UZ');
  const dateStr = tx.date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'uz-UZ', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const catName = lang === 'uz' ? tx.category.nameUz : lang === 'ru' ? tx.category.nameRu : tx.category.nameEn;
  const typeIcon = tx.type === 'INCOME' ? '📈' : '📉';

  const templates = {
    uz: [
      `✅ Qayd etildi!\n`,
      `${typeIcon} Tur:        ${tx.type === 'INCOME' ? 'Kirim' : 'Chiqim'}`,
      `🏷 Kategoriya: ${catName}`,
      `💰 Miqdor:     ${tx.currency === 'USD' ? `$${tx.amount}` : `${n(tx.amount)} so'm`}`,
      tx.currency === 'USD' && tx.amountUzs ? `💱 Kurs:       1 USD = ${n(tx.exchangeRate ?? 0)} so'm` : '',
      tx.currency === 'USD' && tx.amountUzs ? `            ≈ ${n(tx.amountUzs)} so'm` : '',
      `📅 Sana:       ${dateStr}`,
    ].filter(Boolean).join('\n'),
    ru: [
      `✅ Записано!\n`,
      `${typeIcon} Тип:        ${tx.type === 'INCOME' ? 'Доход' : 'Расход'}`,
      `🏷 Категория:  ${catName}`,
      `💰 Сумма:      ${tx.currency === 'USD' ? `$${tx.amount}` : `${n(tx.amount)} сум`}`,
      tx.currency === 'USD' && tx.amountUzs ? `💱 Курс:       1 USD = ${n(tx.exchangeRate ?? 0)} сум` : '',
      tx.currency === 'USD' && tx.amountUzs ? `            ≈ ${n(tx.amountUzs)} сум` : '',
      `📅 Дата:       ${dateStr}`,
    ].filter(Boolean).join('\n'),
    en: [
      `✅ Saved!\n`,
      `${typeIcon} Type:       ${tx.type === 'INCOME' ? 'Income' : 'Expense'}`,
      `🏷 Category:   ${catName}`,
      `💰 Amount:     ${tx.currency === 'USD' ? `$${tx.amount}` : `${n(tx.amount)} UZS`}`,
      tx.currency === 'USD' && tx.amountUzs ? `💱 Rate:       1 USD = ${n(tx.exchangeRate ?? 0)} UZS` : '',
      tx.currency === 'USD' && tx.amountUzs ? `            ≈ ${n(tx.amountUzs)} UZS` : '',
      `📅 Date:       ${dateStr}`,
    ].filter(Boolean).join('\n'),
  };

  return templates[lang];
}

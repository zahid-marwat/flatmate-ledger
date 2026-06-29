function normalizeBalances(balances) {
  return balances
    .map((entry) => ({
      ...entry,
      balanceMinor: Math.trunc(entry.balanceMinor),
    }))
    .filter((entry) => entry.balanceMinor !== 0);
}

export function simplifyDebts(balances) {
  const normalized = normalizeBalances(balances);
  if (normalized.length === 0) return [];

  const currency = normalized[0]?.currency ?? "PKR";
  const creditors = normalized
    .filter((entry) => entry.balanceMinor > 0)
    .sort((a, b) => b.balanceMinor - a.balanceMinor);
  const debtors = normalized
    .filter((entry) => entry.balanceMinor < 0)
    .sort((a, b) => a.balanceMinor - b.balanceMinor);

  const transfers = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amountMinor = Math.min(Math.abs(debtor.balanceMinor), creditor.balanceMinor);

    if (amountMinor > 0) {
      transfers.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amountMinor,
        currency,
      });
    }

    debtor.balanceMinor += amountMinor;
    creditor.balanceMinor -= amountMinor;

    if (debtor.balanceMinor === 0) i += 1;
    if (creditor.balanceMinor === 0) j += 1;
  }

  return transfers;
}

export function formatMinor(amountMinor, currency = "PKR") {
  const amount = amountMinor / 100;
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}


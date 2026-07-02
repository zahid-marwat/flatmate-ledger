import { ApiError } from "../errors.js";
import { createId } from "../id.js";
import { calculateExpenseSplits } from "../split.js";

function hasManagementRole(store, houseId, userId) {
  if (isGlobalAdmin(store, userId)) return true;
  const member = store.houseMembers.get(`${houseId}:${userId}`);
  return ["admin", "manager"].includes(member?.role) && member.status === "active";
}

function isAdmin(store, houseId, userId) {
  if (isGlobalAdmin(store, userId)) return true;
  const member = store.houseMembers.get(`${houseId}:${userId}`);
  return member?.role === "admin" && member.status === "active";
}

function isGlobalAdmin(store, userId) {
  const user = store.users.get(userId);
  const adminContacts = String(process.env.GLOBAL_ADMIN_CONTACTS || "zahid-admin")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(user?.contact && adminContacts.includes(String(user.contact).toLowerCase()));
}

function assertHouseMember(store, houseId, userId) {
  if (isGlobalAdmin(store, userId) && store.houses.has(houseId)) {
    return { userId, role: "admin", status: "active", isGlobalAdmin: true };
  }
  const member = store.houseMembers.get(`${houseId}:${userId}`);
  if (!member || member.status !== "active") {
    throw new ApiError(403, "House membership required");
  }
  return member;
}

export function createExpenseService(store, logActivity, persistence) {
  function addCashLedgerEntry(houseId, payload) {
    const id = createId();
    const entry = {
      id,
      houseId,
      userId: payload.userId || null,
      entryType: payload.entryType,
      amountMinor: payload.amountMinor,
      currency: payload.currency || "PKR",
      relatedPaymentId: payload.relatedPaymentId || null,
      relatedExpenseId: payload.relatedExpenseId || null,
      balanceAfterMinor: payload.balanceAfterMinor ?? null,
      note: payload.note || null,
      createdBy: payload.createdBy || null,
      createdAt: new Date().toISOString(),
    };
    store.cashLedger.set(id, entry);
    return entry;
  }

  function computeBalances(houseId) {
    const balances = new Map();

    for (const member of store.houseMembers.values()) {
      if (member.houseId === houseId && member.status === "active" && !isGlobalAdmin(store, member.userId)) {
        balances.set(member.userId, 0);
      }
    }

    for (const expense of store.expenses.values()) {
      if (expense.houseId !== houseId || expense.status !== "approved") continue;
      const payerContributions = expense.payerContributions?.length
        ? expense.payerContributions
        : [{ userId: expense.paidByUserId, amountMinor: expense.amountMinor }];
      for (const contribution of payerContributions) {
        balances.set(contribution.userId, (balances.get(contribution.userId) || 0) + contribution.amountMinor);
      }

      for (const split of expense.splits) {
        balances.set(split.userId, (balances.get(split.userId) || 0) - split.owedAmountMinor);
      }
    }

    for (const payment of store.payments.values()) {
      if (payment.houseId !== houseId || payment.confirmationStatus !== "confirmed") continue;
      balances.set(payment.payerUserId, (balances.get(payment.payerUserId) || 0) + payment.amountMinor);
      balances.set(payment.receiverUserId, (balances.get(payment.receiverUserId) || 0) - payment.amountMinor);
    }

    return balances;
  }

  return {
    buildSplits({ houseId, paidByUserId, payload, amountMinor }) {
      const house = store.houses.get(houseId);
      const participantUserIds = payload.participantUserIds?.length
        ? payload.participantUserIds
        : [...store.houseMembers.values()]
            .filter((member) => member.houseId === houseId && member.status === "active" && !isGlobalAdmin(store, member.userId))
            .map((member) => member.userId);

      const splits = calculateExpenseSplits({
        amountMinor,
        splitType: payload.splitType,
        paidByUserId,
        participantUserIds,
        selectedUserIds: payload.selectedUserIds || [],
        percentageSplits: payload.percentageSplits || [],
        unequalSplits: payload.unequalSplits || [],
        guestShareMinor: 0,
        hostUserId: null,
        currency: payload.currency || house?.baseCurrency || "PKR",
      });
      for (const split of splits) {
        if (isGlobalAdmin(store, split.userId)) {
          throw new ApiError(400, "Global admin cannot be included in expense splits");
        }
        assertHouseMember(store, houseId, split.userId);
      }
      return splits;
    },

    async createExpense({ houseId, actorUserId, payload }) {
      assertHouseMember(store, houseId, actorUserId);
      const actorCanManage = hasManagementRole(store, houseId, actorUserId);

      const house = store.houses.get(houseId);
      if (!house) throw new ApiError(404, "House not found");

      const paidByUserId = actorCanManage ? payload.paidByUserId || actorUserId : actorUserId;
      if (isGlobalAdmin(store, paidByUserId)) {
        throw new ApiError(400, "Global admin cannot be selected as expense payer");
      }
      assertHouseMember(store, houseId, paidByUserId);

      const amountMinor = Math.trunc(Number(payload.amountMinor));
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        throw new ApiError(400, "amountMinor must be a positive integer");
      }

      const payerContributions = actorCanManage && payload.payerContributions?.length
        ? payload.payerContributions.map((entry) => ({
            userId: entry.userId,
            amountMinor: Math.trunc(Number(entry.amountMinor)),
          }))
        : [{ userId: paidByUserId, amountMinor }];

      const contributionTotal = payerContributions.reduce((sum, entry) => sum + entry.amountMinor, 0);
      if (contributionTotal !== amountMinor) {
        throw new ApiError(400, "Payer contributions must equal the expense total");
      }
      for (const contribution of payerContributions) {
        if (isGlobalAdmin(store, contribution.userId)) {
          throw new ApiError(400, "Global admin cannot be selected as expense payer");
        }
        if (!contribution.userId || !Number.isFinite(contribution.amountMinor) || contribution.amountMinor <= 0) {
          throw new ApiError(400, "Each payer contribution needs a userId and positive amountMinor");
        }
        assertHouseMember(store, houseId, contribution.userId);
      }

      const splits = this.buildSplits({ houseId, paidByUserId, payload, amountMinor });

      const expenseId = createId();
      const needsApproval = actorCanManage ? Boolean(payload.requiresApproval) : true;
      const status = needsApproval ? "pending_approval" : "approved";
      const now = new Date().toISOString();
      const expense = {
        id: expenseId,
        houseId,
        createdBy: actorUserId,
        approvedBy: status === "approved" ? actorUserId : null,
        categoryId: payload.categoryId || null,
        title: payload.title,
        note: payload.note || null,
        amountMinor,
        currency: payload.currency || house.baseCurrency || "PKR",
        expenseDate: payload.expenseDate || new Date().toISOString().slice(0, 10),
        dueDate: payload.dueDate || null,
        splitType: payload.splitType,
        status,
        isRecurring: Boolean(payload.isRecurring),
        recurrenceId: payload.recurrenceId || null,
        receiptUrl: payload.receiptUrl || null,
        paidByUserId,
        payerContributions,
        splits,
        createdAt: now,
        updatedAt: now,
      };

      store.expenses.set(expenseId, expense);
      store.expenseSplits.set(expenseId, splits.map((split) => ({ id: createId(), expenseId, ...split })));
      await persistence.saveExpense(expense);
      await persistence.saveExpenseSplits(expenseId, splits);
      logActivity(houseId, actorUserId, "expense.created", "expense", expenseId, { amountMinor, splitType: payload.splitType, status });

      return expense;
    },

    async updateExpense({ houseId, actorUserId, expenseId, payload }) {
      if (!isAdmin(store, houseId, actorUserId)) {
        throw new ApiError(403, "Only the admin can edit expenses");
      }
      const expense = store.expenses.get(expenseId);
      if (!expense || expense.houseId !== houseId) throw new ApiError(404, "Expense not found");

      const amountMinor = payload.amountMinor === undefined
        ? expense.amountMinor
        : Math.trunc(Number(payload.amountMinor));
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        throw new ApiError(400, "amountMinor must be a positive integer");
      }

      const paidByUserId = payload.paidByUserId || expense.paidByUserId || actorUserId;
      assertHouseMember(store, houseId, paidByUserId);
      const splitPayload = {
        ...expense,
        ...payload,
        splitType: payload.splitType || expense.splitType,
        selectedUserIds: payload.selectedUserIds || expense.splits.map((split) => split.userId),
        participantUserIds: payload.participantUserIds || expense.splits.map((split) => split.userId),
        percentageSplits: payload.percentageSplits || expense.splits.map((split) => ({
          userId: split.userId,
          percent: expense.amountMinor ? (split.owedAmountMinor / expense.amountMinor) * 100 : 0,
        })),
        unequalSplits: payload.unequalSplits || expense.splits.map((split) => ({
          userId: split.userId,
          amount: split.owedAmountMinor / 100,
        })),
      };
      const splits = this.buildSplits({ houseId, paidByUserId, payload: splitPayload, amountMinor });
      const payerContributions = payload.payerContributions?.length
        ? payload.payerContributions.map((entry) => ({
            userId: entry.userId,
            amountMinor: Math.trunc(Number(entry.amountMinor)),
          }))
        : [{ userId: paidByUserId, amountMinor }];

      const contributionTotal = payerContributions.reduce((sum, entry) => sum + entry.amountMinor, 0);
      if (contributionTotal !== amountMinor) {
        throw new ApiError(400, "Payer contributions must equal the expense total");
      }

      const updated = {
        ...expense,
        title: payload.title || expense.title,
        note: payload.note ?? expense.note,
        amountMinor,
        expenseDate: payload.expenseDate || expense.expenseDate,
        splitType: splitPayload.splitType,
        paidByUserId,
        payerContributions,
        splits,
        updatedAt: new Date().toISOString(),
      };
      store.expenses.set(expenseId, updated);
      store.expenseSplits.set(expenseId, splits.map((split) => ({ id: createId(), expenseId, ...split })));
      await persistence.saveExpense(updated);
      await persistence.saveExpenseSplits(expenseId, splits);
      logActivity(houseId, actorUserId, "expense.updated", "expense", expenseId, { amountMinor, splitType: updated.splitType });
      return updated;
    },

    async approveExpense({ houseId, actorUserId, expenseId }) {
      if (!hasManagementRole(store, houseId, actorUserId)) {
        throw new ApiError(403, "Only an admin or manager can approve expenses");
      }
      const expense = store.expenses.get(expenseId);
      if (!expense || expense.houseId !== houseId) throw new ApiError(404, "Expense not found");

      const updated = {
        ...expense,
        approvedBy: actorUserId,
        status: "approved",
        updatedAt: new Date().toISOString(),
      };
      store.expenses.set(expenseId, updated);
      await persistence.saveExpense(updated);
      logActivity(houseId, actorUserId, "expense.approved", "expense", expenseId, {});
      return updated;
    },

    async rejectExpense({ houseId, actorUserId, expenseId, reason }) {
      if (!hasManagementRole(store, houseId, actorUserId)) {
        throw new ApiError(403, "Only an admin or manager can reject expenses");
      }
      const expense = store.expenses.get(expenseId);
      if (!expense || expense.houseId !== houseId) throw new ApiError(404, "Expense not found");

      const updated = {
        ...expense,
        status: "rejected",
        updatedAt: new Date().toISOString(),
        rejectionReason: reason || null,
      };
      store.expenses.set(expenseId, updated);
      await persistence.saveExpense(updated);
      logActivity(houseId, actorUserId, "expense.rejected", "expense", expenseId, { reason });
      return updated;
    },

    listExpenses(houseId) {
      return [...store.expenses.values()].filter((expense) => expense.houseId === houseId);
    },

    getBalances(houseId) {
      const balances = computeBalances(houseId);
      return [...balances.entries()].map(([userId, balanceMinor]) => ({
        userId,
        balanceMinor,
        currency: store.houses.get(houseId)?.baseCurrency || "PKR",
      }));
    },

    async addCashLedgerEntry(houseId, payload) {
      const entry = addCashLedgerEntry(houseId, payload);
      await persistence.saveCashEntry(entry);
      return entry;
    },

    async recordPaymentConfirmation({ houseId, actorUserId, payment, approved }) {
      const entry = await this.addCashLedgerEntry(houseId, {
        userId: payment.receiverUserId,
        entryType: approved ? "cash_collected" : "payment_rejected",
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        relatedPaymentId: payment.id,
        createdBy: actorUserId,
        note: payment.note || null,
      });
      return entry;
    },
  };
}

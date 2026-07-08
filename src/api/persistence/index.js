import { createSupabaseClient } from "./supabase.js";

function toArray(data) {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

function mapUser(row) {
  return {
    id: row.id,
    phone: row.phone || null,
    email: row.email || null,
    contact: row.contact || row.phone || row.email || null,
    fullName: row.full_name,
    avatarUrl: row.avatar_url || null,
    defaultCurrency: row.default_currency || "PKR",
    locale: row.locale || "en-PK",
    passwordHash: row.password_hash || null,
    passwordSalt: row.password_salt || null,
    passwordAlgorithm: row.password_algorithm || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHouse(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address || null,
    city: row.city || null,
    country: row.country || "PK",
    baseCurrency: row.base_currency || "PKR",
    timezone: row.timezone || "Asia/Karachi",
    createdBy: row.created_by || null,
    currentMonthStart: row.current_month_start || null,
    currentMonthEnd: row.current_month_end || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHouseMember(row) {
  return {
    id: row.id,
    houseId: row.house_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
    leftAt: row.left_at || null,
    roomName: row.room_name || null,
    phoneDisplay: row.phone_display || null,
    isDefaultPayer: Boolean(row.is_default_payer),
  };
}

function mapExpense(row) {
  return {
    id: row.id,
    houseId: row.house_id,
    createdBy: row.created_by || null,
    approvedBy: row.approved_by || null,
    paidByUserId: row.paid_by_user_id || null,
    categoryId: row.category_id || null,
    title: row.title,
    note: row.note || null,
    amountMinor: row.amount_minor,
    currency: row.currency || "PKR",
    expenseDate: row.expense_date,
    dueDate: row.due_date || null,
    splitType: row.split_type,
    status: row.status,
    isRecurring: Boolean(row.is_recurring),
    recurrenceId: row.recurrence_id || null,
    receiptUrl: row.receipt_url || null,
    payerContributions: row.payer_contributions_json || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExpenseSplit(row) {
  return {
    id: row.id,
    expenseId: row.expense_id,
    userId: row.user_id,
    splitMethod: row.split_method,
    sharePercent: row.share_percent || null,
    shareAmountMinor: row.share_amount_minor || null,
    owedAmountMinor: row.owed_amount_minor,
    isGuestAssignedToHost: Boolean(row.is_guest_assigned_to_host),
  };
}

function mapPayment(row) {
  return {
    id: row.id,
    houseId: row.house_id,
    expenseId: row.expense_id || null,
    payerUserId: row.payer_user_id,
    receiverUserId: row.receiver_user_id || null,
    amountMinor: row.amount_minor,
    currency: row.currency || "PKR",
    method: row.method,
    paymentDate: row.payment_date,
    proofUrl: row.proof_url || null,
    confirmationStatus: row.confirmation_status,
    confirmedBy: row.confirmed_by || null,
    confirmedAt: row.confirmed_at || null,
    note: row.note || null,
    createdAt: row.created_at,
  };
}

function mapCashEntry(row) {
  return {
    id: row.id,
    houseId: row.house_id,
    userId: row.user_id || null,
    entryType: row.entry_type,
    amountMinor: row.amount_minor,
    currency: row.currency || "PKR",
    relatedPaymentId: row.related_payment_id || null,
    relatedExpenseId: row.related_expense_id || null,
    balanceAfterMinor: row.balance_after_minor ?? null,
    note: row.note || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
  };
}

function mapDispute(row) {
  return {
    id: row.id,
    houseId: row.house_id,
    expenseId: row.expense_id || null,
    paymentId: row.payment_id || null,
    openedBy: row.opened_by,
    reason: row.reason,
    status: row.status,
    resolutionNote: row.resolution_note || null,
    resolvedBy: row.resolved_by || null,
    resolvedAt: row.resolved_at || null,
    createdAt: row.created_at,
  };
}

function mapSettlement(row) {
  return {
    id: row.id,
    houseId: row.house_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    algorithmVersion: row.algorithm_version || "v1",
    totalExpensesMinor: row.total_expenses_minor,
    totalPaymentsMinor: row.total_payments_minor,
    netBalanceMinor: row.net_balance_minor,
    generatedAt: row.generated_at,
    finalizedAt: row.finalized_at || null,
    finalizedBy: row.finalized_by || null,
  };
}

function mapSettlementLine(row) {
  return {
    id: row.id,
    settlementId: row.settlement_id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    amountMinor: row.amount_minor,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function createPersistence(store) {
  const client = createSupabaseClient();

  async function hydrate() {
    if (!client.enabled) return;

    const [users, houses, houseMembers, expenses, expenseSplits, payments, cashLedger, sessions, otps, activityLog, files, invitations, disputes, settlements, settlementLines] =
      await Promise.all([
        client.select("users"),
        client.select("houses"),
        client.select("house_members"),
        client.select("expenses"),
        client.select("expense_splits"),
        client.select("payments"),
        client.select("cash_ledger"),
        client.select("sessions"),
        client.select("auth_otps"),
        client.select("activity_log"),
        client.select("files"),
        client.select("house_invitations"),
        client.select("disputes"),
        client.select("settlements"),
        client.select("settlement_lines"),
      ]);

    const rows = (result) => (result && !result.error ? toArray(result.data) : []);

    for (const user of rows(users).map(mapUser)) {
      store.users.set(user.id, user);
      if (user.contact) store.usersByContact.set(user.contact, user);
    }
    for (const house of rows(houses).map(mapHouse)) store.houses.set(house.id, house);
    for (const member of rows(houseMembers).map(mapHouseMember)) store.houseMembers.set(`${member.houseId}:${member.userId}`, member);
    for (const expense of rows(expenses).map(mapExpense)) store.expenses.set(expense.id, expense);
    for (const split of rows(expenseSplits)) {
      const mapped = mapExpenseSplit(split);
      const current = store.expenseSplits.get(mapped.expenseId) || [];
      current.push(mapped);
      store.expenseSplits.set(mapped.expenseId, current);
    }
    for (const expense of store.expenses.values()) {
      expense.splits = store.expenseSplits.get(expense.id) || [];
    }
    for (const payment of rows(payments).map(mapPayment)) store.payments.set(payment.id, payment);
    for (const entry of rows(cashLedger).map(mapCashEntry)) store.cashLedger.set(entry.id, entry);
    for (const session of rows(sessions)) store.sessions.set(session.token, { userId: session.user_id, createdAt: session.created_at });
    for (const otp of rows(otps)) store.otps.set(otp.contact, { contact: otp.contact, code: otp.code, expiresAt: new Date(otp.expires_at).getTime(), fullName: otp.full_name || null });
    for (const item of rows(activityLog)) store.activityLog.push(item);
    for (const file of rows(files)) store.files.set(file.id, file);
    for (const invitation of rows(invitations)) {
      store.houseInvitations.set(invitation.id, {
        id: invitation.id,
        houseId: invitation.house_id,
        contact: invitation.contact,
        role: invitation.role,
        createdBy: invitation.created_by || null,
        status: invitation.status,
        createdAt: invitation.created_at,
      });
    }
    for (const dispute of rows(disputes).map(mapDispute)) {
      if (!dispute.houseId) {
        dispute.houseId = store.expenses.get(dispute.expenseId)?.houseId || null;
      }
      store.disputes.set(dispute.id, dispute);
    }
    for (const settlement of rows(settlements).map(mapSettlement)) store.settlements.set(settlement.id, settlement);
    for (const line of rows(settlementLines).map(mapSettlementLine)) {
      const current = store.settlementLines.get(line.settlementId) || [];
      current.push(line);
      store.settlementLines.set(line.settlementId, current);
    }
  }

  return {
    enabled: client.enabled,
    hydrate,
    async saveUser(user) {
      if (!client.enabled) return;
      await client.upsert("users", [{
        id: user.id,
        phone: user.phone,
        email: user.email,
        contact: user.contact,
        full_name: user.fullName,
        avatar_url: user.avatarUrl,
        default_currency: user.defaultCurrency,
        locale: user.locale,
        password_hash: user.passwordHash || null,
        password_salt: user.passwordSalt || null,
        password_algorithm: user.passwordAlgorithm || null,
        created_at: user.createdAt,
        updated_at: user.updatedAt,
      }]);
    },
    async saveOtp(otp) {
      if (!client.enabled) return;
      await client.insert("auth_otps", [{
        contact: otp.contact,
        code: otp.code,
        full_name: otp.fullName,
        expires_at: new Date(otp.expiresAt).toISOString(),
      }]);
    },
    async saveSession(sessionToken, userId) {
      if (!client.enabled) return;
      await client.insert("sessions", [{
        token: sessionToken,
        user_id: userId,
        created_at: new Date().toISOString(),
      }]);
    },
    async saveHouse(house) {
      if (!client.enabled) return;
      await client.upsert("houses", [{
        id: house.id,
        name: house.name,
        address: house.address,
        city: house.city,
        country: house.country,
        base_currency: house.baseCurrency,
        timezone: house.timezone,
        created_by: house.createdBy,
        current_month_start: house.currentMonthStart,
        current_month_end: house.currentMonthEnd,
        created_at: house.createdAt,
        updated_at: house.updatedAt,
      }]);
    },
    async saveHouseMember(member) {
      if (!client.enabled) return;
      await client.upsert("house_members", [{
        id: member.id,
        house_id: member.houseId,
        user_id: member.userId,
        role: member.role,
        status: member.status,
        joined_at: member.joinedAt,
        left_at: member.leftAt,
        room_name: member.roomName,
        phone_display: member.phoneDisplay,
        is_default_payer: member.isDefaultPayer,
      }]);
    },
    async saveInvitation(invitation) {
      if (!client.enabled) return;
      await client.upsert("house_invitations", [{
        id: invitation.id,
        house_id: invitation.houseId,
        contact: invitation.contact,
        role: invitation.role,
        created_by: invitation.createdBy,
        status: invitation.status,
        created_at: invitation.createdAt,
      }]);
    },
    async saveExpense(expense) {
      if (!client.enabled) return;
      await client.upsert("expenses", [{
        id: expense.id,
        house_id: expense.houseId,
        created_by: expense.createdBy,
        approved_by: expense.approvedBy,
        paid_by_user_id: expense.paidByUserId,
        payer_contributions_json: expense.payerContributions || [],
        category_id: expense.categoryId,
        title: expense.title,
        note: expense.note,
        amount_minor: expense.amountMinor,
        currency: expense.currency,
        expense_date: expense.expenseDate,
        due_date: expense.dueDate,
        split_type: expense.splitType,
        status: expense.status,
        is_recurring: expense.isRecurring,
        recurrence_id: expense.recurrenceId,
        receipt_url: expense.receiptUrl,
        created_at: expense.createdAt,
        updated_at: expense.updatedAt,
      }]);
    },
    async saveExpenseSplits(expenseId, splits) {
      if (!client.enabled) return;
      await client.remove("expense_splits", { expense_id: expenseId });
      await client.insert("expense_splits", splits.map((split) => ({
        expense_id: expenseId,
        user_id: split.userId,
        split_method: split.splitMethod,
        share_percent: split.sharePercent || null,
        share_amount_minor: split.shareAmountMinor || null,
        owed_amount_minor: split.owedAmountMinor,
        is_guest_assigned_to_host: split.isGuestAssignedToHost || false,
      })));
    },
    async savePayment(payment) {
      if (!client.enabled) return;
      await client.upsert("payments", [{
        id: payment.id,
        house_id: payment.houseId,
        expense_id: payment.expenseId,
        payer_user_id: payment.payerUserId,
        receiver_user_id: payment.receiverUserId,
        amount_minor: payment.amountMinor,
        currency: payment.currency,
        method: payment.method,
        payment_date: payment.paymentDate,
        proof_url: payment.proofUrl,
        confirmation_status: payment.confirmationStatus,
        confirmed_by: payment.confirmedBy,
        confirmed_at: payment.confirmedAt,
        note: payment.note,
        created_at: payment.createdAt,
      }]);
    },
    async saveCashEntry(entry) {
      if (!client.enabled) return;
      await client.insert("cash_ledger", [{
        id: entry.id,
        house_id: entry.houseId,
        user_id: entry.userId,
        entry_type: entry.entryType,
        amount_minor: entry.amountMinor,
        currency: entry.currency,
        related_payment_id: entry.relatedPaymentId,
        related_expense_id: entry.relatedExpenseId,
        balance_after_minor: entry.balanceAfterMinor,
        note: entry.note,
        created_by: entry.createdBy,
        created_at: entry.createdAt,
      }]);
    },
    async saveActivity(entry) {
      if (!client.enabled) return;
      await client.insert("activity_log", [{
        id: entry.id,
        house_id: entry.houseId,
        actor_user_id: entry.actorUserId,
        action_type: entry.actionType,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        metadata_json: entry.metadata,
        created_at: entry.createdAt,
      }]);
    },
    async saveFile(file) {
      if (!client.enabled) return;
      await client.insert("files", [{
        id: file.id,
        bucket: file.bucket || "receipts",
        file_name: file.fileName,
        mime_type: file.mimeType,
        public_url: file.publicUrl,
        upload_status: file.uploadStatus || "pending",
        created_by: file.createdBy || null,
        created_at: file.createdAt,
        updated_at: file.updatedAt || file.createdAt,
      }]);
    },
    async saveDispute(dispute) {
      if (!client.enabled) return;
      const row = {
        id: dispute.id,
        house_id: dispute.houseId,
        expense_id: dispute.expenseId || null,
        opened_by: dispute.openedBy,
        reason: dispute.reason,
        status: dispute.status,
        resolution_note: dispute.resolutionNote,
        resolved_by: dispute.resolvedBy,
        resolved_at: dispute.resolvedAt,
        created_at: dispute.createdAt,
      };
      if (dispute.paymentId) row.payment_id = dispute.paymentId;
      const result = await client.upsert("disputes", [row]);
      if (result.error) throw result.error;
    },
    async saveSettlement(settlement) {
      if (!client.enabled) return;
      await client.upsert("settlements", [{
        id: settlement.id,
        house_id: settlement.houseId,
        period_start: settlement.periodStart,
        period_end: settlement.periodEnd,
        algorithm_version: settlement.algorithmVersion,
        total_expenses_minor: settlement.totalExpensesMinor,
        total_payments_minor: settlement.totalPaymentsMinor,
        net_balance_minor: settlement.netBalanceMinor,
        generated_at: settlement.generatedAt,
        finalized_at: settlement.finalizedAt,
        finalized_by: settlement.finalizedBy,
      }]);
    },
    async saveSettlementLines(settlementId, lines) {
      if (!client.enabled) return;
      await client.insert("settlement_lines", lines.map((line) => ({
        settlement_id: settlementId,
        from_user_id: line.fromUserId,
        to_user_id: line.toUserId,
        amount_minor: line.amountMinor,
        status: line.status || "pending",
        created_at: line.createdAt || new Date().toISOString(),
      })));
    },
  };
}

import { ApiError, isApiError } from "./errors.js";
import { jsonResponse } from "./response.js";
import { readBearerToken, readJson } from "./request.js";
import { createStore } from "./store.js";
import { createPersistence } from "./persistence/index.js";
import { createAuthService } from "./services/auth.js";
import { createHouseService } from "./services/houses.js";
import { createExpenseService } from "./services/expenses.js";
import { createPaymentService } from "./services/payments.js";
import { simplifyDebts } from "../domain/debt.js";
import {
  optionalString,
  requireArray,
  requireInteger,
  requireOneOf,
  requireString,
} from "./validation.js";

const store = createStore();
const persistence = createPersistence(store);

function logActivity(houseId, actorUserId, actionType, entityType, entityId, metadata) {
  const entry = {
    id: store.createId(),
    houseId,
    actorUserId,
    actionType,
    entityType,
    entityId,
    metadata,
    createdAt: new Date().toISOString(),
  };
  store.activityLog.push(entry);
  void persistence.saveActivity(entry);
}

const authService = createAuthService(store, persistence);
const houseService = createHouseService(store, logActivity, persistence);
const expenseService = createExpenseService(store, logActivity, persistence);
const paymentService = createPaymentService(store, logActivity, expenseService, persistence);

function getSessionUser(request) {
  const token = readBearerToken(request);
  if (!token) return null;

  const session = store.sessions.get(token);
  if (!session) return null;

  return store.users.get(session.userId || session.user_id) || null;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes"].includes(value.toLowerCase());
  return fallback;
}

function ensureUser(request) {
  const user = getSessionUser(request);
  if (!user) {
    throw new ApiError(401, "Unauthorized");
  }
  return user;
}

function ensureHouseAccess(houseId, userId) {
  const member = store.houseMembers.get(`${houseId}:${userId}`);
  if (!member || member.status !== "active") {
    throw new ApiError(403, "House membership required");
  }
  return member;
}

function isManagementRole(role) {
  return ["admin", "manager"].includes(role);
}

function isAdminRole(role) {
  return role === "admin";
}

function getHouseRole(houseId, userId) {
  return store.houseMembers.get(`${houseId}:${userId}`)?.role || null;
}

function getPrimaryManagementRole(userId) {
  const membership = [...store.houseMembers.values()].find(
    (member) => member.userId === userId && member.status === "active" && isManagementRole(member.role),
  );
  return membership?.role || "manager";
}

function getHouseSummary(houseId) {
  const house = store.houses.get(houseId);
  if (!house) throw new ApiError(404, "House not found");

  const expenses = expenseService.listExpenses(houseId);
  const payments = paymentService.listPayments(houseId);
  const balances = expenseService.getBalances(houseId);
  const cashEntries = [...store.cashLedger.values()].filter((entry) => entry.houseId === houseId);

  const totalCollectedMinor = payments
    .filter((payment) => payment.confirmationStatus === "confirmed")
    .reduce((sum, payment) => sum + payment.amountMinor, 0);

  const totalPendingMinor = payments
    .filter((payment) => payment.confirmationStatus === "pending")
    .reduce((sum, payment) => sum + payment.amountMinor, 0);

  const cashInHandMinor = cashEntries.reduce((sum, entry) => {
    if (entry.entryType === "cash_collected") return sum + entry.amountMinor;
    if (entry.entryType === "cash_spent") return sum - entry.amountMinor;
    return sum;
  }, 0);

  const totalExpensesMinor = expenses
    .filter((expense) => expense.status === "approved")
    .reduce((sum, expense) => sum + expense.amountMinor, 0);

  const pendingExpenseMinor = expenses
    .filter((expense) => expense.status === "pending_approval")
    .reduce((sum, expense) => sum + expense.amountMinor, 0);

  return {
    house,
    expenseCount: expenses.length,
    paymentCount: payments.length,
    totalExpensesMinor,
    pendingExpenseMinor,
    totalCollectedMinor,
    totalPendingMinor,
    cashInHandMinor,
    balances,
  };
}

function toMinorFromRequest(body, minorKey = "amountMinor", pkrKey = "amountPkr") {
  if (body[pkrKey] !== undefined && body[pkrKey] !== null && body[pkrKey] !== "") {
    return Math.round(Number(body[pkrKey]) * 100);
  }
  return body[minorKey];
}

async function handleAuthRequest(request) {
  const body = await readJson(request);
  return jsonResponse(await authService.requestOtp({
    contact: requireString(body.contact, "contact"),
    fullName: optionalString(body.fullName),
  }));
}

async function handleAuthVerify(request) {
  const body = await readJson(request);
  return jsonResponse(await authService.verifyOtp({
    contact: requireString(body.contact, "contact"),
    code: requireString(String(body.code ?? ""), "code"),
    fullName: optionalString(body.fullName),
  }));
}

async function handleCreatePasswordUser(request) {
  const actor = getSessionUser(request);
  const body = await readJson(request);
  const configuredSetupKey = process.env.ADMIN_SETUP_KEY;
  const isSetupKeyValid = configuredSetupKey && body.setupKey === configuredSetupKey;
  if (actor) {
    const houseId = requireString(body.houseId, "houseId");
    if (!isAdminRole(getHouseRole(houseId, actor.id))) {
      throw new ApiError(403, "Only the admin can create member accounts");
    }
  } else if (!isSetupKeyValid) {
    throw new ApiError(403, "Only the admin can create member accounts");
  }

  const role = requireOneOf(body.role || "flatmate", "role", ["admin", "manager", "flatmate", "viewer"]);
  const result = await authService.createPasswordUser({
    contact: requireString(body.contact, "contact"),
    fullName: requireString(body.fullName, "fullName"),
    password: requireString(body.password, "password"),
    role,
  });

  if (actor && body.houseId) {
    await houseService.addMember({
      houseId: requireString(body.houseId, "houseId"),
      actorUserId: actor.id,
      user: {
        id: result.user.id,
        fullName: result.user.fullName,
        contact: result.user.contact,
        avatarUrl: optionalString(body.avatarUrl),
      },
      role,
    });
  } else if (isManagementRole(role)) {
    const hasManagerMembership = [...store.houseMembers.values()].some(
      (member) => member.userId === result.user.id && isManagementRole(member.role) && member.status === "active",
    );
    if (!hasManagerMembership) {
      const houseName = `${result.user.fullName.split(" ")[0] || "My"} House`;
      await houseService.createHouse({
        creatorUserId: result.user.id,
        name: houseName,
        address: null,
        city: null,
        baseCurrency: "PKR",
        timezone: "Asia/Karachi",
        creatorRole: role,
      });
    }
  } else {
    const firstHouse = [...store.houses.values()][0];
    if (firstHouse) {
      const member = {
        id: store.createId(),
        houseId: firstHouse.id,
        userId: result.user.id,
        role,
        status: "active",
        joinedAt: new Date().toISOString(),
        leftAt: null,
        roomName: null,
        phoneDisplay: result.user.phone || result.user.email || result.user.contact,
        isDefaultPayer: false,
      };
      store.houseMembers.set(`${firstHouse.id}:${result.user.id}`, member);
      await persistence.saveHouseMember(member);
    }
  }

  return jsonResponse(result, 201);
}

async function handlePasswordLogin(request) {
  const body = await readJson(request);
  return jsonResponse(await authService.loginWithPassword({
    contact: requireString(body.contact, "contact"),
    password: requireString(body.password, "password"),
  }));
}

async function handleChangePassword(request) {
  const user = ensureUser(request);
  const body = await readJson(request);
  return jsonResponse(await authService.changePassword({
    userId: user.id,
    currentPassword: requireString(body.currentPassword, "currentPassword"),
    newPassword: requireString(body.newPassword, "newPassword"),
  }));
}

function handleMe(request) {
  const user = ensureUser(request);
  const memberships = [...store.houseMembers.values()]
    .filter((member) => member.userId === user.id && member.status === "active")
    .map((member) => ({
      ...member,
      house: store.houses.get(member.houseId) || null,
    }));

  return jsonResponse({ user, memberships });
}

async function handleCreateHouse(request) {
  const user = ensureUser(request);
  const canCreateGroup = [...store.houseMembers.values()].some(
    (member) => member.userId === user.id && member.status === "active" && member.role === "admin",
  );
  if (!canCreateGroup) {
    throw new ApiError(403, "Only the admin can create groups");
  }
  const body = await readJson(request);
  return jsonResponse(await houseService.createHouse({
    creatorUserId: user.id,
    name: requireString(body.name, "name"),
    address: optionalString(body.address),
    city: optionalString(body.city),
    baseCurrency: requireString(body.baseCurrency || "PKR", "baseCurrency"),
    timezone: requireString(body.timezone || "Asia/Karachi", "timezone"),
    creatorRole: getPrimaryManagementRole(user.id),
  }), 201);
}

function handleGetHouse(request, params) {
  const user = ensureUser(request);
  ensureHouseAccess(params.id, user.id);
  return jsonResponse(getHouseSummary(params.id));
}

function handleListMembers(request, params) {
  const user = ensureUser(request);
  ensureHouseAccess(params.id, user.id);
  const members = houseService.listMembers(params.id).map((member) => ({
    ...member,
    user: store.users.get(member.userId) || null,
  }));
  return jsonResponse({ members });
}

async function handleAddMember(request, params) {
  const user = ensureUser(request);
  const body = await readJson(request);
  return jsonResponse(await houseService.addMember({
    houseId: params.id,
    actorUserId: user.id,
    user: {
      fullName: requireString(body.user?.fullName, "user.fullName"),
      contact: optionalString(body.user?.contact),
      phone: optionalString(body.user?.phone),
      email: optionalString(body.user?.email),
      roomName: optionalString(body.user?.roomName),
      phoneDisplay: optionalString(body.user?.phoneDisplay),
      isDefaultPayer: parseBoolean(body.user?.isDefaultPayer, false),
      defaultCurrency: optionalString(body.user?.defaultCurrency) || "PKR",
      locale: optionalString(body.user?.locale) || "en-PK",
      avatarUrl: optionalString(body.user?.avatarUrl),
    },
    role: requireOneOf(body.role || "flatmate", "role", ["flatmate", "manager", "admin", "viewer"]),
  }), 201);
}

async function handleUpdateMember(request, params) {
  const user = ensureUser(request);
  const body = await readJson(request);
  return jsonResponse(await houseService.updateMember({
    houseId: params.id,
    actorUserId: user.id,
    memberUserId: params.userId,
    patch: {
      role: requireOneOf(body.role, "role", ["flatmate", "manager", "admin", "viewer"]),
    },
  }));
}

async function handleCreateInvitation(request, params) {
  const user = ensureUser(request);
  const body = await readJson(request);
  return jsonResponse(await houseService.createInvitation({
    houseId: params.id,
    actorUserId: user.id,
    contact: requireString(body.contact, "contact"),
    role: requireOneOf(body.role || "flatmate", "role", ["flatmate", "manager", "admin", "viewer"]),
  }), 201);
}

async function handleCreateExpense(request, params) {
  const user = ensureUser(request);
  const body = await readJson(request);
  return jsonResponse(await expenseService.createExpense({
    houseId: params.id,
    actorUserId: user.id,
    payload: {
      title: requireString(body.title, "title"),
      amountMinor: requireInteger(toMinorFromRequest(body), "amount", { min: 1 }),
      expenseDate: requireString(body.expenseDate || new Date().toISOString().slice(0, 10), "expenseDate"),
      dueDate: optionalString(body.dueDate),
      categoryId: optionalString(body.categoryId),
      note: optionalString(body.note),
      splitType: requireOneOf(body.splitType, "splitType", ["equal_all", "equal_selected", "percentage", "unequal"]),
      participantUserIds: Array.isArray(body.participantUserIds) ? body.participantUserIds : [],
      selectedUserIds: Array.isArray(body.selectedUserIds) ? body.selectedUserIds : [],
      percentageSplits: Array.isArray(body.percentageSplits) ? body.percentageSplits : [],
      unequalSplits: Array.isArray(body.unequalSplits) ? body.unequalSplits : [],
      payerContributions: Array.isArray(body.payerContributions) ? body.payerContributions : [],
      guestShareMinor: 0,
      hostUserId: null,
      currency: optionalString(body.currency) || "PKR",
      paidByUserId: optionalString(body.paidByUserId) || user.id,
      receiptUrl: optionalString(body.receiptUrl),
      requiresApproval: isManagementRole(getHouseRole(params.id, user.id))
        ? parseBoolean(body.requiresApproval, false)
        : true,
      isRecurring: parseBoolean(body.isRecurring, false),
      recurrenceId: optionalString(body.recurrenceId),
    },
  }), 201);
}

async function handleUpdateExpense(request, params) {
  const user = ensureUser(request);
  const body = await readJson(request);
  return jsonResponse(await expenseService.updateExpense({
    houseId: params.id,
    actorUserId: user.id,
    expenseId: params.expenseId,
    payload: {
      title: optionalString(body.title),
      amountMinor: body.amountPkr !== undefined ? toMinorFromRequest(body) : body.amountMinor,
      expenseDate: optionalString(body.expenseDate),
      note: optionalString(body.note),
      splitType: body.splitType ? requireOneOf(body.splitType, "splitType", ["equal_all", "equal_selected", "percentage", "unequal"]) : undefined,
      participantUserIds: Array.isArray(body.participantUserIds) ? body.participantUserIds : undefined,
      selectedUserIds: Array.isArray(body.selectedUserIds) ? body.selectedUserIds : undefined,
      percentageSplits: Array.isArray(body.percentageSplits) ? body.percentageSplits : undefined,
      unequalSplits: Array.isArray(body.unequalSplits) ? body.unequalSplits : undefined,
      payerContributions: Array.isArray(body.payerContributions) ? body.payerContributions : undefined,
      paidByUserId: optionalString(body.paidByUserId),
    },
  }));
}

function handleListExpenses(request, params) {
  const user = ensureUser(request);
  ensureHouseAccess(params.id, user.id);
  return jsonResponse({ expenses: expenseService.listExpenses(params.id) });
}

async function handleApproveExpense(request, params) {
  const user = ensureUser(request);
  const body = await readJson(request);
  return jsonResponse(await expenseService.approveExpense({
    houseId: params.id,
    actorUserId: user.id,
    expenseId: requireString(body.expenseId, "expenseId"),
  }));
}

async function handleRejectExpense(request, params) {
  const user = ensureUser(request);
  const body = await readJson(request);
  return jsonResponse(await expenseService.rejectExpense({
    houseId: params.id,
    actorUserId: user.id,
    expenseId: requireString(body.expenseId, "expenseId"),
    reason: optionalString(body.reason),
  }));
}

async function handleCreatePayment(request, params) {
  const user = ensureUser(request);
  const body = await readJson(request);
  return jsonResponse(await paymentService.createPayment({
    houseId: params.id,
    actorUserId: user.id,
    payload: {
      expenseId: optionalString(body.expenseId),
      payerUserId: requireString(body.payerUserId, "payerUserId"),
      receiverUserId: requireString(body.receiverUserId, "receiverUserId"),
      amountMinor: requireInteger(toMinorFromRequest(body), "amount", { min: 1 }),
      currency: optionalString(body.currency) || "PKR",
      method: requireOneOf(body.method || "cash", "method", ["cash", "bank", "wallet"]),
      paymentDate: requireString(body.paymentDate || new Date().toISOString().slice(0, 10), "paymentDate"),
      proofUrl: optionalString(body.proofUrl),
      note: optionalString(body.note),
    },
  }), 201);
}

async function handleConfirmPayment(request, params) {
  const user = ensureUser(request);
  const body = await readJson(request);
  return jsonResponse(await paymentService.confirmPayment({
    houseId: params.id,
    actorUserId: user.id,
    paymentId: requireString(body.paymentId, "paymentId"),
  }));
}

async function handleRejectPayment(request, params) {
  const user = ensureUser(request);
  const body = await readJson(request);
  return jsonResponse(await paymentService.rejectPayment({
    houseId: params.id,
    actorUserId: user.id,
    paymentId: requireString(body.paymentId, "paymentId"),
    reason: optionalString(body.reason),
  }));
}

async function handleCreateDispute(request, params) {
  const user = ensureUser(request);
  ensureHouseAccess(params.id, user.id);
  const body = await readJson(request);
  const expenseId = requireString(body.expenseId, "expenseId");
  const reason = requireString(body.reason, "reason");
  const expense = store.expenses.get(expenseId);
  if (!expense || expense.houseId !== params.id) {
    throw new ApiError(404, "Expense not found in this group");
  }
  const disputeId = store.createId();
  const dispute = {
    id: disputeId,
    houseId: params.id,
    expenseId,
    openedBy: user.id,
    reason,
    status: "open",
    resolutionNote: null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date().toISOString(),
  };
  store.disputes.set(disputeId, dispute);
  await persistence.saveDispute(dispute);
  logActivity(params.id, user.id, "dispute.created", "dispute", disputeId, { expenseId, reason });
  return jsonResponse(dispute, 201);
}

function handleListDisputes(request, params) {
  const user = ensureUser(request);
  ensureHouseAccess(params.id, user.id);
  const disputes = [...store.disputes.values()]
    .filter((item) => {
      const expense = store.expenses.get(item.expenseId);
      return item.houseId === params.id || expense?.houseId === params.id;
    })
    .map((item) => ({
      ...item,
      houseId: item.houseId || store.expenses.get(item.expenseId)?.houseId || null,
      openedByUser: store.users.get(item.openedBy) || null,
      expense: store.expenses.get(item.expenseId) || null,
    }));
  return jsonResponse({ disputes });
}

async function handleGenerateSettlement(request, params) {
  const user = ensureUser(request);
  ensureHouseAccess(params.id, user.id);
  const house = store.houses.get(params.id);
  if (!house) throw new ApiError(404, "House not found");

  const balances = expenseService.getBalances(params.id);
  const settlementLines = simplifyDebts(
    balances.map((entry) => ({
      userId: entry.userId,
      displayName: entry.userId,
      balanceMinor: entry.balanceMinor,
      currency: entry.currency,
    })),
  );

  const settlementId = store.createId();
  const settlement = {
    id: settlementId,
    houseId: params.id,
    periodStart: house.currentMonthStart || new Date().toISOString().slice(0, 10),
    periodEnd: house.currentMonthEnd || new Date().toISOString().slice(0, 10),
    algorithmVersion: "v1",
    totalExpensesMinor: [...store.expenses.values()].filter((item) => item.houseId === params.id && item.status === "approved").reduce((sum, item) => sum + item.amountMinor, 0),
    totalPaymentsMinor: [...store.payments.values()].filter((item) => item.houseId === params.id && item.confirmationStatus === "confirmed").reduce((sum, item) => sum + item.amountMinor, 0),
    netBalanceMinor: balances.reduce((sum, item) => sum + item.balanceMinor, 0),
    generatedAt: new Date().toISOString(),
    finalizedAt: null,
    finalizedBy: null,
  };
  store.settlements.set(settlementId, settlement);
  store.settlementLines.set(settlementId, settlementLines.map((line) => ({ id: store.createId(), settlementId, ...line, status: "pending", createdAt: new Date().toISOString() })));
  void persistence.saveSettlement(settlement);
  void persistence.saveSettlementLines(settlementId, settlementLines);
  logActivity(params.id, user.id, "settlement.generated", "settlement", settlementId, { lineCount: settlementLines.length });
  return jsonResponse({ settlement, lines: settlementLines }, 201);
}

function handleListSettlements(request, params) {
  const user = ensureUser(request);
  ensureHouseAccess(params.id, user.id);
  const settlements = [...store.settlements.values()].filter((item) => item.houseId === params.id);
  return jsonResponse({ settlements });
}

function handleBalances(request, params) {
  const user = ensureUser(request);
  ensureHouseAccess(params.id, user.id);
  return jsonResponse({ balances: expenseService.getBalances(params.id) });
}

function handleCashLedger(request, params) {
  const user = ensureUser(request);
  ensureHouseAccess(params.id, user.id);
  return jsonResponse({
    entries: [...store.cashLedger.values()].filter((entry) => entry.houseId === params.id),
  });
}

function handleActivityLog(request, params) {
  const user = ensureUser(request);
  ensureHouseAccess(params.id, user.id);
  const history = store.activityLog
    .filter((entry) => (entry.houseId || entry.house_id) === params.id)
    .map((entry) => {
      const actorUserId = entry.actorUserId || entry.actor_user_id || null;
      return {
        id: entry.id,
        houseId: entry.houseId || entry.house_id,
        actorUserId,
        actor: actorUserId ? store.users.get(actorUserId) || null : null,
        actionType: entry.actionType || entry.action_type,
        entityType: entry.entityType || entry.entity_type,
        entityId: entry.entityId || entry.entity_id,
        metadata: entry.metadata || entry.metadata_json || {},
        createdAt: entry.createdAt || entry.created_at,
      };
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  return jsonResponse({ history });
}

function handleListPayments(request, params) {
  const user = ensureUser(request);
  ensureHouseAccess(params.id, user.id);
  return jsonResponse({ payments: paymentService.listPayments(params.id) });
}

async function handleUploadUrl(request) {
  const user = ensureUser(request);
  const body = await readJson(request);
  const fileId = store.createId();
  const fileName = body.fileName || `receipt-${fileId}`;
  const publicUrl = `https://storage.local/${fileId}/${encodeURIComponent(fileName)}`;

  const file = {
    id: fileId,
    bucket: body.bucket || "receipts",
    fileName,
    mimeType: body.mimeType || "application/octet-stream",
    publicUrl,
    uploadStatus: "pending",
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.files.set(fileId, file);
  void persistence.saveFile(file);

  return jsonResponse({
    fileId,
    uploadUrl: `https://storage.local/upload/${fileId}`,
    publicUrl,
  });
}

function handleHealth() {
  return jsonResponse({ ok: true, service: "flatmate-ledger-api" });
}

function handleNotFound() {
  return jsonResponse({ error: "Not found" }, 404);
}

const routes = [
  ["GET", "/health", handleHealth],
  ["POST", "/admin/users", handleCreatePasswordUser],
  ["POST", "/auth/login", handlePasswordLogin],
  ["POST", "/me/password", handleChangePassword],
  ["POST", "/auth/request-otp", handleAuthRequest],
  ["POST", "/auth/verify-otp", handleAuthVerify],
  ["GET", "/me", handleMe],
  ["POST", "/houses", handleCreateHouse],
  ["GET", "/houses/:id", handleGetHouse],
  ["GET", "/houses/:id/members", handleListMembers],
  ["POST", "/houses/:id/members", handleAddMember],
  ["PATCH", "/houses/:id/members/:userId", handleUpdateMember],
  ["POST", "/houses/:id/invitations", handleCreateInvitation],
  ["POST", "/houses/:id/expenses", handleCreateExpense],
  ["GET", "/houses/:id/expenses", handleListExpenses],
  ["PATCH", "/houses/:id/expenses/:expenseId", handleUpdateExpense],
  ["POST", "/houses/:id/expenses/approve", handleApproveExpense],
  ["POST", "/houses/:id/expenses/reject", handleRejectExpense],
  ["POST", "/houses/:id/payments", handleCreatePayment],
  ["GET", "/houses/:id/payments", handleListPayments],
  ["POST", "/houses/:id/payments/confirm", handleConfirmPayment],
  ["POST", "/houses/:id/payments/reject", handleRejectPayment],
  ["POST", "/houses/:id/disputes", handleCreateDispute],
  ["GET", "/houses/:id/disputes", handleListDisputes],
  ["POST", "/houses/:id/settlements/generate", handleGenerateSettlement],
  ["GET", "/houses/:id/settlements", handleListSettlements],
  ["GET", "/houses/:id/balances", handleBalances],
  ["GET", "/houses/:id/cash-ledger", handleCashLedger],
  ["GET", "/houses/:id/activity", handleActivityLog],
  ["POST", "/files/upload-url", handleUploadUrl],
];

function matchRoute(method, pathname) {
  for (const [routeMethod, pattern, handler] of routes) {
    if (method !== routeMethod) continue;

    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);
    if (patternParts.length !== pathParts.length) continue;

    const params = {};
    let matched = true;
    for (let i = 0; i < patternParts.length; i += 1) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];
      if (patternPart.startsWith(":")) {
        params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      } else if (patternPart !== pathPart) {
        matched = false;
        break;
      }
    }

    if (matched) return { handler, params };
  }
  return null;
}

export async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    const matched = matchRoute(request.method, url.pathname);
    if (!matched) return handleNotFound();

    const result = await matched.handler(request, matched.params);
    return result instanceof Response ? result : jsonResponse(result);
  } catch (error) {
    if (isApiError(error)) {
      return jsonResponse({ error: error.message, details: error.details || null }, error.statusCode);
    }

    console.error(error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}

export async function createApp() {
  await persistence.hydrate();
  return {
    store,
    handleRequest,
  };
}

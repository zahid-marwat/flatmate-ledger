import { ApiError, isApiError } from "./errors.js";
import { jsonResponse } from "./response.js";
import { readBearerToken, readJson } from "./request.js";
import { createStore } from "./store.js";
import { createPersistence } from "./persistence/index.js";
import { createAuthService } from "./services/auth.js";
import { createHouseService } from "./services/houses.js";
import { createExpenseService } from "./services/expenses.js";
import { createPaymentService } from "./services/payments.js";
import { isGlobalAdminUser, isGlobalAdminUserId as checkGlobalAdminUserId } from "./admin.js";
import { simplifyDebts } from "../domain/debt.js";
import {
  assertAllowedFields,
  optionalArray,
  optionalDateString,
  optionalString,
  optionalUsername,
  requireDateString,
  requireInteger,
  requireOneOf,
  requireString,
  requireUsername,
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

function sessionTtlMs() {
  const configuredSeconds = Number(process.env.SESSION_TTL_SECONDS || 3600);
  const safeSeconds = Number.isFinite(configuredSeconds) && configuredSeconds > 0 ? configuredSeconds : 3600;
  return safeSeconds * 1000;
}

function getSessionUser(request) {
  const token = readBearerToken(request);
  if (!token) return null;

  const session = store.sessions.get(token);
  if (!session) return null;

  const now = Date.now();
  const expiresAt = session.expiresAt || (session.expires_at ? new Date(session.expires_at).getTime() : null);
  if (!expiresAt || expiresAt <= now) {
    store.sessions.delete(token);
    void persistence.deleteSession(token);
    return null;
  }

  const userId = session.userId || session.user_id;
  const nextExpiresAt = now + sessionTtlMs();
  store.sessions.set(token, {
    ...session,
    userId,
    expiresAt: nextExpiresAt,
  });
  void persistence.saveSession(token, userId, nextExpiresAt);

  return store.users.get(userId) || null;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes"].includes(value.toLowerCase());
  return fallback;
}

function sanitizeUser(user) {
  if (!user) return null;
  const {
    passwordHash,
    passwordSalt,
    passwordAlgorithm,
    password_hash,
    password_salt,
    password_algorithm,
    ...safeUser
  } = user;
  void passwordHash;
  void passwordSalt;
  void passwordAlgorithm;
  void password_hash;
  void password_salt;
  void password_algorithm;
  return safeUser;
}

function sanitizeUserPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (!("user" in payload)) return payload;
  return {
    ...payload,
    user: sanitizeUser(payload.user),
  };
}

function ensureUser(request) {
  const user = getSessionUser(request);
  if (!user) {
    throw new ApiError(401, "Unauthorized");
  }
  return user;
}

function isGlobalAdmin(user) {
  return isGlobalAdminUser(user);
}

function isGlobalAdminUserId(userId) {
  return checkGlobalAdminUserId(store, userId);
}

function ensureHouseAccess(houseId, userId) {
  if (isGlobalAdminUserId(userId) && store.houses.has(houseId)) {
    return { userId, role: "admin", status: "active", isGlobalAdmin: true };
  }
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
  if (isGlobalAdminUserId(userId) && store.houses.has(houseId)) return "admin";
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

function optionalIdArray(value, fieldName) {
  return optionalArray(value, fieldName).map((item, index) => requireString(item, `${fieldName}[${index}]`, { maxLength: 64 }));
}

function optionalPercentageSplits(value) {
  return optionalArray(value, "percentageSplits").map((entry, index) => {
    assertAllowedFields(entry, ["userId", "percent"], `percentageSplits[${index}]`);
    const percent = Number(entry.percent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      throw new ApiError(400, `percentageSplits[${index}].percent must be between 0 and 100`);
    }
    return {
      userId: requireString(entry.userId, `percentageSplits[${index}].userId`, { maxLength: 64 }),
      percent,
    };
  });
}

function optionalUnequalSplits(value) {
  return optionalArray(value, "unequalSplits").map((entry, index) => {
    assertAllowedFields(entry, ["userId", "amount"], `unequalSplits[${index}]`);
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(400, `unequalSplits[${index}].amount must be positive`);
    }
    return {
      userId: requireString(entry.userId, `unequalSplits[${index}].userId`, { maxLength: 64 }),
      amount,
    };
  });
}

function optionalPayerContributions(value) {
  return optionalArray(value, "payerContributions").map((entry, index) => {
    assertAllowedFields(entry, ["userId", "amountMinor"], `payerContributions[${index}]`);
    return {
      userId: requireString(entry.userId, `payerContributions[${index}].userId`, { maxLength: 64 }),
      amountMinor: requireInteger(entry.amountMinor, `payerContributions[${index}].amountMinor`, { min: 1 }),
    };
  });
}

async function handleAuthRequest(request) {
  const body = assertAllowedFields(await readJson(request), ["contact", "fullName"]);
  return jsonResponse(await authService.requestOtp({
    contact: requireString(body.contact, "contact", { maxLength: 120 }),
    fullName: optionalString(body.fullName, "fullName", { maxLength: 80 }),
  }));
}

async function handleAuthVerify(request) {
  const body = assertAllowedFields(await readJson(request), ["contact", "code", "fullName"]);
  return jsonResponse(sanitizeUserPayload(await authService.verifyOtp({
    contact: requireString(body.contact, "contact", { maxLength: 120 }),
    code: requireString(String(body.code ?? ""), "code", { minLength: 4, maxLength: 12 }),
    fullName: optionalString(body.fullName, "fullName", { maxLength: 80 }),
  })));
}

async function handleCreatePasswordUser(request) {
  const actor = getSessionUser(request);
  const body = assertAllowedFields(await readJson(request), ["contact", "fullName", "password", "role", "houseId", "avatarUrl", "setupKey"]);
  const configuredSetupKey = process.env.ADMIN_SETUP_KEY;
  const isSetupKeyValid = configuredSetupKey && body.setupKey === configuredSetupKey;
  if (actor) {
    const houseId = requireString(body.houseId, "houseId");
    if (!isGlobalAdmin(actor) && !isAdminRole(getHouseRole(houseId, actor.id))) {
      throw new ApiError(403, "Only the admin can create member accounts");
    }
  } else if (!isSetupKeyValid) {
    throw new ApiError(403, "Only the admin can create member accounts");
  }

  const role = requireOneOf(body.role || "flatmate", "role", ["admin", "manager", "flatmate", "viewer"]);
  if (actor && role === "admin") {
    throw new ApiError(400, "Admin is a global account and cannot be added to a group");
  }
  const result = await authService.createPasswordUser({
    contact: requireUsername(body.contact, "username"),
    fullName: requireString(body.fullName, "fullName", { maxLength: 80 }),
    password: requireString(body.password, "password", { minLength: 6, maxLength: 128 }),
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
        avatarUrl: optionalString(body.avatarUrl, "avatarUrl", { maxLength: 255 }),
      },
      role,
      actorIsGlobalAdmin: isGlobalAdmin(actor),
    });
  } else if (role !== "admin" && isManagementRole(role)) {
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

  return jsonResponse(sanitizeUserPayload(result), 201);
}

async function handlePasswordLogin(request) {
  const body = assertAllowedFields(await readJson(request), ["contact", "password"]);
  return jsonResponse(sanitizeUserPayload(await authService.loginWithPassword({
    contact: requireUsername(body.contact, "username"),
    password: requireString(body.password, "password", { minLength: 1, maxLength: 128 }),
  })));
}

async function handleLogout(request) {
  assertAllowedFields(await readJson(request), []);
  const token = readBearerToken(request);
  if (token) {
    store.sessions.delete(token);
    await persistence.deleteSession(token);
  }
  return jsonResponse({ ok: true });
}

async function handleChangePassword(request) {
  const user = ensureUser(request);
  const body = assertAllowedFields(await readJson(request), ["currentPassword", "newPassword"]);
  return jsonResponse(sanitizeUserPayload(await authService.changePassword({
    userId: user.id,
    currentPassword: requireString(body.currentPassword, "currentPassword", { minLength: 1, maxLength: 128 }),
    newPassword: requireString(body.newPassword, "newPassword", { minLength: 6, maxLength: 128 }),
  })));
}

async function handleUpdateProfile(request) {
  const user = ensureUser(request);
  const body = assertAllowedFields(await readJson(request), ["fullName", "contact", "avatarUrl"]);
  return jsonResponse(sanitizeUserPayload(await authService.updateProfile({
    userId: user.id,
    fullName: optionalString(body.fullName, "fullName", { maxLength: 80 }),
    contact: optionalUsername(body.contact, "username"),
    avatarUrl: body.avatarUrl === undefined ? undefined : optionalString(body.avatarUrl, "avatarUrl", { maxLength: 255 }),
  })));
}

function handleMe(request) {
  const user = ensureUser(request);
  const globalAdmin = isGlobalAdmin(user);
  const memberships = globalAdmin
    ? [...store.houses.values()].map((house) => ({
        id: `global-admin:${house.id}`,
        houseId: house.id,
        userId: user.id,
        role: "admin",
        status: "active",
        isGlobalAdmin: true,
        house,
      }))
    : [...store.houseMembers.values()]
        .filter((member) => member.userId === user.id && member.status === "active")
        .map((member) => ({
          ...member,
          house: store.houses.get(member.houseId) || null,
        }));

  return jsonResponse({ user: sanitizeUser(user), memberships, role: globalAdmin ? "admin" : memberships[0]?.role || null, isGlobalAdmin: globalAdmin });
}

async function handleCreateHouse(request) {
  const user = ensureUser(request);
  const canCreateGroup = [...store.houseMembers.values()].some(
    (member) => member.userId === user.id && member.status === "active" && member.role === "admin",
  ) || isGlobalAdmin(user);
  if (!canCreateGroup) {
    throw new ApiError(403, "Only the admin can create groups");
  }
  const body = assertAllowedFields(await readJson(request), ["name", "address", "city", "baseCurrency", "timezone"]);
  return jsonResponse(await houseService.createHouse({
    creatorUserId: user.id,
    name: requireString(body.name, "name", { maxLength: 80 }),
    address: optionalString(body.address, "address", { maxLength: 160 }),
    city: optionalString(body.city, "city", { maxLength: 80 }),
    baseCurrency: requireString(body.baseCurrency || "PKR", "baseCurrency", { maxLength: 3, pattern: /^[A-Z]{3}$/ }),
    timezone: requireString(body.timezone || "Asia/Karachi", "timezone", { maxLength: 64, pattern: /^[A-Za-z0-9_+/-]+$/ }),
    creatorRole: getPrimaryManagementRole(user.id),
    createCreatorMembership: !isGlobalAdmin(user),
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
    user: sanitizeUser(store.users.get(member.userId)),
  }));
  return jsonResponse({ members });
}

async function handleAddMember(request, params) {
  const user = ensureUser(request);
  const body = assertAllowedFields(await readJson(request), ["user", "role"]);
  assertAllowedFields(body.user || {}, ["fullName", "contact", "phone", "email", "roomName", "phoneDisplay", "isDefaultPayer", "defaultCurrency", "locale", "avatarUrl"], "user");
  const result = await houseService.addMember({
    houseId: params.id,
    actorUserId: user.id,
    user: {
      fullName: requireString(body.user?.fullName, "user.fullName", { maxLength: 80 }),
      contact: optionalUsername(body.user?.contact, "user.username"),
      phone: optionalString(body.user?.phone, "user.phone", { maxLength: 24, pattern: /^\+?[0-9 -]+$/ }),
      email: optionalString(body.user?.email, "user.email", { maxLength: 120, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }),
      roomName: optionalString(body.user?.roomName, "user.roomName", { maxLength: 40 }),
      phoneDisplay: optionalString(body.user?.phoneDisplay, "user.phoneDisplay", { maxLength: 40 }),
      isDefaultPayer: parseBoolean(body.user?.isDefaultPayer, false),
      defaultCurrency: optionalString(body.user?.defaultCurrency, "user.defaultCurrency", { maxLength: 3, pattern: /^[A-Z]{3}$/ }) || "PKR",
      locale: optionalString(body.user?.locale, "user.locale", { maxLength: 12, pattern: /^[A-Za-z]{2,3}(?:-[A-Za-z]{2})?$/ }) || "en-PK",
      avatarUrl: optionalString(body.user?.avatarUrl, "user.avatarUrl", { maxLength: 255 }),
    },
    role: requireOneOf(body.role || "flatmate", "role", ["flatmate", "manager", "viewer"]),
    actorIsGlobalAdmin: isGlobalAdmin(user),
  });
  return jsonResponse(sanitizeUserPayload(result), 201);
}

async function handleUpdateMember(request, params) {
  const user = ensureUser(request);
  const body = assertAllowedFields(await readJson(request), ["role"]);
  return jsonResponse(await houseService.updateMember({
    houseId: params.id,
    actorUserId: user.id,
    memberUserId: params.userId,
    patch: {
      role: requireOneOf(body.role, "role", ["flatmate", "manager", "viewer"]),
    },
    actorIsGlobalAdmin: isGlobalAdmin(user),
  }));
}

async function handleCreateInvitation(request, params) {
  const user = ensureUser(request);
  const body = assertAllowedFields(await readJson(request), ["contact", "role"]);
  return jsonResponse(await houseService.createInvitation({
    houseId: params.id,
    actorUserId: user.id,
    contact: requireUsername(body.contact, "username"),
    role: requireOneOf(body.role || "flatmate", "role", ["flatmate", "manager", "viewer"]),
  }), 201);
}

async function handleCreateExpense(request, params) {
  const user = ensureUser(request);
  const body = assertAllowedFields(await readJson(request), [
    "title",
    "amountMinor",
    "amountPkr",
    "expenseDate",
    "dueDate",
    "categoryId",
    "note",
    "splitType",
    "participantUserIds",
    "selectedUserIds",
    "percentageSplits",
    "unequalSplits",
    "payerContributions",
    "currency",
    "paidByUserId",
    "receiptUrl",
    "requiresApproval",
    "isRecurring",
    "recurrenceId",
  ]);
  return jsonResponse(await expenseService.createExpense({
    houseId: params.id,
    actorUserId: user.id,
    payload: {
      title: requireString(body.title, "title", { maxLength: 80 }),
      amountMinor: requireInteger(toMinorFromRequest(body), "amount", { min: 1 }),
      expenseDate: requireDateString(body.expenseDate || new Date().toISOString().slice(0, 10), "expenseDate"),
      dueDate: optionalDateString(body.dueDate, "dueDate"),
      categoryId: optionalString(body.categoryId, "categoryId", { maxLength: 64 }),
      note: optionalString(body.note, "note", { maxLength: 500 }),
      splitType: requireOneOf(body.splitType, "splitType", ["equal_all", "equal_selected", "percentage", "unequal"]),
      participantUserIds: optionalIdArray(body.participantUserIds, "participantUserIds"),
      selectedUserIds: optionalIdArray(body.selectedUserIds, "selectedUserIds"),
      percentageSplits: optionalPercentageSplits(body.percentageSplits),
      unequalSplits: optionalUnequalSplits(body.unequalSplits),
      payerContributions: optionalPayerContributions(body.payerContributions),
      guestShareMinor: 0,
      hostUserId: null,
      currency: optionalString(body.currency, "currency", { maxLength: 3, pattern: /^[A-Z]{3}$/ }) || "PKR",
      paidByUserId: optionalString(body.paidByUserId, "paidByUserId", { maxLength: 64 }) || user.id,
      receiptUrl: optionalString(body.receiptUrl, "receiptUrl", { maxLength: 255 }),
      requiresApproval: isManagementRole(getHouseRole(params.id, user.id))
        ? parseBoolean(body.requiresApproval, false)
        : true,
      isRecurring: parseBoolean(body.isRecurring, false),
      recurrenceId: optionalString(body.recurrenceId, "recurrenceId", { maxLength: 64 }),
    },
  }), 201);
}

async function handleUpdateExpense(request, params) {
  const user = ensureUser(request);
  const body = assertAllowedFields(await readJson(request), [
    "title",
    "amountMinor",
    "amountPkr",
    "expenseDate",
    "note",
    "splitType",
    "participantUserIds",
    "selectedUserIds",
    "percentageSplits",
    "unequalSplits",
    "payerContributions",
    "paidByUserId",
  ]);
  return jsonResponse(await expenseService.updateExpense({
    houseId: params.id,
    actorUserId: user.id,
    expenseId: params.expenseId,
    payload: {
      title: optionalString(body.title, "title", { maxLength: 80 }),
      amountMinor: body.amountPkr !== undefined ? toMinorFromRequest(body) : body.amountMinor,
      expenseDate: optionalDateString(body.expenseDate, "expenseDate"),
      note: optionalString(body.note, "note", { maxLength: 500 }),
      splitType: body.splitType ? requireOneOf(body.splitType, "splitType", ["equal_all", "equal_selected", "percentage", "unequal"]) : undefined,
      participantUserIds: body.participantUserIds === undefined ? undefined : optionalIdArray(body.participantUserIds, "participantUserIds"),
      selectedUserIds: body.selectedUserIds === undefined ? undefined : optionalIdArray(body.selectedUserIds, "selectedUserIds"),
      percentageSplits: body.percentageSplits === undefined ? undefined : optionalPercentageSplits(body.percentageSplits),
      unequalSplits: body.unequalSplits === undefined ? undefined : optionalUnequalSplits(body.unequalSplits),
      payerContributions: body.payerContributions === undefined ? undefined : optionalPayerContributions(body.payerContributions),
      paidByUserId: optionalString(body.paidByUserId, "paidByUserId", { maxLength: 64 }),
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
  const body = assertAllowedFields(await readJson(request), ["expenseId"]);
  return jsonResponse(await expenseService.approveExpense({
    houseId: params.id,
    actorUserId: user.id,
    expenseId: requireString(body.expenseId, "expenseId", { maxLength: 64 }),
  }));
}

async function handleRejectExpense(request, params) {
  const user = ensureUser(request);
  const body = assertAllowedFields(await readJson(request), ["expenseId", "reason"]);
  return jsonResponse(await expenseService.rejectExpense({
    houseId: params.id,
    actorUserId: user.id,
    expenseId: requireString(body.expenseId, "expenseId", { maxLength: 64 }),
    reason: optionalString(body.reason, "reason", { maxLength: 500 }),
  }));
}

async function handleCreatePayment(request, params) {
  const user = ensureUser(request);
  const body = assertAllowedFields(await readJson(request), [
    "expenseId",
    "payerUserId",
    "receiverUserId",
    "amountMinor",
    "amountPkr",
    "currency",
    "method",
    "paymentDate",
    "proofUrl",
    "note",
  ]);
  return jsonResponse(await paymentService.createPayment({
    houseId: params.id,
    actorUserId: user.id,
    payload: {
      expenseId: optionalString(body.expenseId, "expenseId", { maxLength: 64 }),
      payerUserId: requireString(body.payerUserId, "payerUserId", { maxLength: 64 }),
      receiverUserId: requireString(body.receiverUserId, "receiverUserId", { maxLength: 64 }),
      amountMinor: requireInteger(toMinorFromRequest(body), "amount", { min: 1 }),
      currency: optionalString(body.currency, "currency", { maxLength: 3, pattern: /^[A-Z]{3}$/ }) || "PKR",
      method: requireOneOf(body.method || "cash", "method", ["cash", "bank", "wallet"]),
      paymentDate: requireDateString(body.paymentDate || new Date().toISOString().slice(0, 10), "paymentDate"),
      proofUrl: optionalString(body.proofUrl, "proofUrl", { maxLength: 255 }),
      note: optionalString(body.note, "note", { maxLength: 500 }),
    },
  }), 201);
}

async function handleConfirmPayment(request, params) {
  const user = ensureUser(request);
  const body = assertAllowedFields(await readJson(request), ["paymentId"]);
  return jsonResponse(await paymentService.confirmPayment({
    houseId: params.id,
    actorUserId: user.id,
    paymentId: requireString(body.paymentId, "paymentId", { maxLength: 64 }),
  }));
}

async function handleRejectPayment(request, params) {
  const user = ensureUser(request);
  const body = assertAllowedFields(await readJson(request), ["paymentId", "reason"]);
  return jsonResponse(await paymentService.rejectPayment({
    houseId: params.id,
    actorUserId: user.id,
    paymentId: requireString(body.paymentId, "paymentId", { maxLength: 64 }),
    reason: optionalString(body.reason, "reason", { maxLength: 500 }),
  }));
}

async function handleUpdatePayment(request, params) {
  const user = ensureUser(request);
  const body = assertAllowedFields(await readJson(request), [
    "payerUserId",
    "receiverUserId",
    "amountMinor",
    "amountPkr",
    "paymentDate",
    "method",
    "note",
  ]);
  return jsonResponse(await paymentService.updatePayment({
    houseId: params.id,
    actorUserId: user.id,
    paymentId: params.paymentId,
    payload: {
      payerUserId: optionalString(body.payerUserId, "payerUserId", { maxLength: 64 }),
      receiverUserId: optionalString(body.receiverUserId, "receiverUserId", { maxLength: 64 }),
      amountMinor: body.amountPkr !== undefined ? toMinorFromRequest(body) : body.amountMinor,
      paymentDate: optionalDateString(body.paymentDate, "paymentDate"),
      method: body.method ? requireOneOf(body.method, "method", ["cash", "bank", "wallet"]) : undefined,
      note: optionalString(body.note, "note", { maxLength: 500 }),
    },
  }));
}

async function handleCreateDispute(request, params) {
  const user = ensureUser(request);
  ensureHouseAccess(params.id, user.id);
  const body = assertAllowedFields(await readJson(request), ["expenseId", "paymentId", "reason"]);
  const expenseId = optionalString(body.expenseId, "expenseId", { maxLength: 64 });
  const paymentId = optionalString(body.paymentId, "paymentId", { maxLength: 64 });
  const reason = requireString(body.reason, "reason", { maxLength: 500 });
  if (!expenseId && !paymentId) {
    throw new ApiError(400, "Select an expense or cash deposit to dispute");
  }
  const expense = expenseId ? store.expenses.get(expenseId) : null;
  const payment = paymentId ? store.payments.get(paymentId) : null;
  if (expenseId && (!expense || expense.houseId !== params.id)) {
    throw new ApiError(404, "Expense not found in this group");
  }
  if (paymentId && (!payment || payment.houseId !== params.id)) {
    throw new ApiError(404, "Cash deposit not found in this group");
  }
  const disputeId = store.createId();
  const dispute = {
    id: disputeId,
    houseId: params.id,
    expenseId: expenseId || null,
    paymentId: paymentId || null,
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
  logActivity(params.id, user.id, "dispute.created", "dispute", disputeId, { expenseId, paymentId, reason });
  return jsonResponse(dispute, 201);
}

function handleListDisputes(request, params) {
  const user = ensureUser(request);
  ensureHouseAccess(params.id, user.id);
  const disputes = [...store.disputes.values()]
    .filter((item) => {
      const expense = store.expenses.get(item.expenseId);
      const payment = store.payments.get(item.paymentId);
      return item.houseId === params.id || expense?.houseId === params.id || payment?.houseId === params.id;
    })
    .map((item) => ({
      ...item,
      houseId: item.houseId || store.expenses.get(item.expenseId)?.houseId || store.payments.get(item.paymentId)?.houseId || null,
      openedByUser: sanitizeUser(store.users.get(item.openedBy)),
      expense: store.expenses.get(item.expenseId) || null,
      payment: store.payments.get(item.paymentId) || null,
    }));
  return jsonResponse({ disputes });
}

async function handleGenerateSettlement(request, params) {
  const user = ensureUser(request);
  assertAllowedFields(await readJson(request), []);
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
        actor: actorUserId ? sanitizeUser(store.users.get(actorUserId)) : null,
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
  const body = assertAllowedFields(await readJson(request), ["fileName", "bucket", "mimeType"]);
  const fileId = store.createId();
  const fileName = optionalString(body.fileName, "fileName", { maxLength: 120 }) || `receipt-${fileId}`;
  const publicUrl = `https://storage.local/${fileId}/${encodeURIComponent(fileName)}`;

  const file = {
    id: fileId,
    bucket: optionalString(body.bucket, "bucket", { maxLength: 60, pattern: /^[a-z0-9][a-z0-9._-]*$/ }) || "receipts",
    fileName,
    mimeType: optionalString(body.mimeType, "mimeType", { maxLength: 80, pattern: /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i }) || "application/octet-stream",
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
  ["POST", "/auth/logout", handleLogout],
  ["POST", "/me/password", handleChangePassword],
  ["PATCH", "/me/profile", handleUpdateProfile],
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
  ["PATCH", "/houses/:id/payments/:paymentId", handleUpdatePayment],
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

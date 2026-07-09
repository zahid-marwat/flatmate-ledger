const SESSION_TIMEOUT_MS = 60 * 60 * 1000;
const ACTIVITY_EVENTS = ["click", "keydown", "mousemove", "touchstart", "scroll"];

function storedSessionIsActive() {
  const lastActiveAt = Number(localStorage.getItem("flatmateLedgerLastActiveAt") || 0);
  return Boolean(lastActiveAt && Date.now() - lastActiveAt < SESSION_TIMEOUT_MS);
}

const hasActiveStoredSession = storedSessionIsActive();
if (!hasActiveStoredSession) {
  localStorage.removeItem("flatmateLedgerToken");
  localStorage.removeItem("flatmateLedgerLastActiveAt");
}

const state = {
  token: hasActiveStoredSession ? localStorage.getItem("flatmateLedgerToken") || "" : "",
  houseId: localStorage.getItem("flatmateLedgerHouseId") || "",
  user: null,
  role: null,
  memberships: [],
  members: [],
  expenses: [],
  payments: [],
  balances: [],
  history: [],
  currentHouse: null,
  summary: null,
  dashboardTimeWindow: localStorage.getItem("flatmateLedgerDashboardTimeWindow") || "all",
  dashboardStartDate: localStorage.getItem("flatmateLedgerDashboardStartDate") || "",
  dashboardEndDate: localStorage.getItem("flatmateLedgerDashboardEndDate") || "",
  sidebarCollapsed: localStorage.getItem("flatmateLedgerSidebarCollapsed") === "true",
  currentPage: localStorage.getItem("flatmateLedgerPage") || "dashboard",
  isGlobalAdmin: false,
  memberProfilePinnedId: "",
};

const $ = (selector) => document.querySelector(selector);

const els = {
  loginView: $("#loginView"),
  appView: $("#appView"),
  sidebar: $(".sidebar"),
  menuToggle: $(".menu-toggle"),
  sidebarDisplayBtn: $("#sidebarDisplayBtn"),
  adminView: $("#adminView"),
  userView: $("#userView"),
  adminHousePanel: $("#adminHousePanel"),
  adminQuickActions: $("#adminQuickActions"),
  adminMemberPanel: $("#adminMemberPanel"),
  adminEditExpensePanel: $("#adminEditExpensePanel"),
  menuGroupCount: $("#menuGroupCount"),
  groupsMenuItem: $("#groupsMenuItem"),
  menuMemberCount: $("#menuMemberCount"),
  menuExpenseCount: $("#menuExpenseCount"),
  menuPaymentCount: $("#menuPaymentCount"),
  menuHistoryCount: $("#menuHistoryCount"),
  settingsView: $("#settingsView"),
  settingsAvatarPreview: $("#settingsAvatarPreview"),
  topActiveGroup: $("#topActiveGroup"),
  workspaceTitle: $("#workspaceTitle"),
  viewEyebrow: $("#viewEyebrow"),
  viewHeadline: $("#viewHeadline"),
  signedInUser: $("#signedInUser"),
  signedInRole: $("#signedInRole"),
  topSignedInUser: $("#topSignedInUser"),
  tokenState: $("#tokenState"),
  logoutBtn: $("#logoutBtn"),
  topLogoutBtn: $("#topLogoutBtn"),
  houseSelect: $("#houseSelect"),
  houseName: $("#houseName"),
  userHouseName: $("#userHouseName"),
  collectedMetric: $("#collectedMetric"),
  pendingMetric: $("#pendingMetric"),
  cashMetric: $("#cashMetric"),
  dashboardSummaryCards: $("#dashboardSummaryCards"),
  dashboardTimeWindow: $("#dashboardTimeWindow"),
  dashboardStartDate: $("#dashboardStartDate"),
  dashboardEndDate: $("#dashboardEndDate"),
  dashboardRoster: $("#dashboardRoster"),
  historyList: $("#historyList"),
  historyCount: $("#historyCount"),
  summaryCards: $("#summaryCards"),
  userSummaryCards: $("#userSummaryCards"),
  memberList: $("#memberList"),
  balanceList: $("#balanceList"),
  userBalanceList: $("#userBalanceList"),
  expenseList: $("#expenseList"),
  paymentList: $("#paymentList"),
  disputeList: $("#disputeList"),
  settlementList: $("#settlementList"),
  memberCount: $("#memberCount"),
  balanceCount: $("#balanceCount"),
  userBalanceLabel: $("#userBalanceLabel"),
  expenseCount: $("#expenseCount"),
  paymentCount: $("#paymentCount"),
  managerPaidByUserId: $("#managerPaidByUserId"),
  managerSplitMembers: $("#managerSplitMembers"),
  paymentGroupSelect: $("#paymentGroupSelect"),
  paymentPayerUserId: $("#paymentPayerUserId"),
  userPaymentGroupSelect: $("#userPaymentGroupSelect"),
  editExpenseId: $("#editExpenseId"),
  disputeExpenseId: $("#disputeExpenseId"),
  userDisputeExpenseId: $("#userDisputeExpenseId"),
  disputeTarget: $("#disputeTarget"),
  userDisputeTarget: $("#userDisputeTarget"),
  memberProfilePopover: $("#memberProfilePopover"),
  historyPreviewPopover: $("#historyPreviewPopover"),
  roleMemberUserId: $("#roleMemberUserId"),
  generateSettlementBtn: $("#generateSettlementBtn"),
  refreshSettlementBtn: $("#refreshSettlementBtn"),
  toast: $("#toast"),
};

let refreshTimer = null;
let sessionTimer = null;
let lastActivityWriteAt = 0;

function money(minor) {
  const value = (Number(minor) || 0) / 100;
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(value);
}

function signedMoney(minor) {
  const numeric = Number(minor) || 0;
  if (numeric === 0) return money(0);
  const sign = numeric > 0 ? "+" : "-";
  return `${sign}${money(Math.abs(numeric))}`;
}

function balanceClass(minor) {
  const numeric = Number(minor) || 0;
  if (numeric > 0) return "balance-credit";
  if (numeric < 0) return "balance-debt";
  return "balance-neutral";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function safeImageUrl(value) {
  const url = String(value || "").trim();
  if (url.startsWith("/avatars/")) return url;
  if (!/^https?:\/\//i.test(url)) return "";
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function optionHtml(value, label, { selected = false } = {}) {
  return `<option value="${escapeAttr(value)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function balanceByUserId(userId) {
  const balances = state.currentHouse?.balances?.length ? state.currentHouse.balances : state.balances;
  const balance = balances.find((entry) => (entry.userId || entry.user_id) === userId);
  return Number(balance?.balanceMinor || balance?.balance_minor || 0);
}

function relationToCurrentUser(memberUserId) {
  const currentUserId = state.user?.id;
  if (!currentUserId) return null;
  const currentIsGroupMember = state.members.some((member) => (member.userId || member.user_id) === currentUserId && member.status === "active");
  if (!currentIsGroupMember) return null;

  const memberBalance = balanceByUserId(memberUserId);
  const currentBalance = balanceByUserId(currentUserId);

  if (memberUserId === currentUserId) {
    return {
      label: "Your net",
      amountMinor: memberBalance,
      className: balanceClass(memberBalance),
    };
  }

  if (currentBalance < 0 && memberBalance > 0) {
    return {
      label: "You owe",
      amountMinor: -Math.min(Math.abs(currentBalance), memberBalance),
      className: "balance-debt",
    };
  }

  if (currentBalance > 0 && memberBalance < 0) {
    return {
      label: "Owes you",
      amountMinor: Math.min(currentBalance, Math.abs(memberBalance)),
      className: "balance-credit",
    };
  }

  return {
    label: "Settled with you",
    amountMinor: 0,
    className: "balance-neutral",
  };
}

function fieldValue(item, field) {
  return String(field).split(".").reduce((current, part) => current?.[part], item);
}

function timeValue(item, fields = []) {
  for (const field of fields) {
    const value = fieldValue(item, field);
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

function newestFirst(items = [], fields = []) {
  return [...items].sort((left, right) => timeValue(right, fields) - timeValue(left, fields));
}

function showToast(message, tone = "info") {
  els.toast.textContent = message;
  els.toast.style.borderColor = tone === "error" ? "rgba(255, 123, 123, 0.55)" : "rgba(95, 227, 179, 0.35)";
  els.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2600);
}

async function api(path, options = {}) {
  if (state.token && !enforceSession()) {
    throw new Error("Session expired. Please login again.");
  }
  const method = String(options.method || "GET").toUpperCase();
  const requestPath = method === "GET"
    ? `${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}`
    : path;
  const headers = new Headers(options.headers || {});
  headers.set("content-type", "application/json");
  headers.set("cache-control", "no-cache");
  if (state.token) headers.set("authorization", `Bearer ${state.token}`);

  const response = await fetch(requestPath, {
    ...options,
    method,
    cache: "no-store",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.error || `Request failed with ${response.status}`);
  touchSession();
  return payload;
}

function currentMembership() {
  if (state.houseId) {
    const exact = state.memberships.find((member) => member.houseId === state.houseId || member.house_id === state.houseId);
    if (exact) return exact;
  }
  return state.memberships[0] || null;
}

function isManagement() {
  return ["admin", "manager"].includes(state.role);
}

function isAdmin() {
  return state.role === "admin";
}

function isPageAllowed(pageKey) {
  if (pageKey === "groups") return isAdmin();
  if (pageKey === "settlement") return isManagement();
  return true;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function localDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function monthBounds(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: dateOnly(start), end: dateOnly(end) };
}

function dashboardWindowBounds() {
  const key = state.dashboardTimeWindow;
  if (key === "this_month") return monthBounds(0);
  if (key === "last_month") return monthBounds(-1);
  if (key === "last_30") {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);
    return { start: dateOnly(start), end: dateOnly(end) };
  }
  if (key === "custom") {
    return {
      start: state.dashboardStartDate || "",
      end: state.dashboardEndDate || "",
    };
  }
  return { start: "", end: "" };
}

function isWithinDashboardWindow(value) {
  const { start, end } = dashboardWindowBounds();
  if (!start && !end) return true;
  const date = localDate(value);
  if (!date) return false;
  const startDate = localDate(start);
  const endDate = localDate(end);
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

function pkrToMinor(value) {
  return Math.round(Number(value || 0) * 100);
}

function setToken(token) {
  state.token = token;
  if (token) {
    localStorage.setItem("flatmateLedgerToken", token);
    touchSession();
  } else {
    localStorage.removeItem("flatmateLedgerToken");
    localStorage.removeItem("flatmateLedgerLastActiveAt");
  }
  els.tokenState.textContent = token ? token : "Not signed in";
}

function touchSession() {
  if (!state.token) return;
  localStorage.setItem("flatmateLedgerLastActiveAt", String(Date.now()));
  scheduleSessionExpiry();
}

function sessionExpired() {
  if (!state.token) return false;
  const lastActiveAt = Number(localStorage.getItem("flatmateLedgerLastActiveAt") || 0);
  return !lastActiveAt || Date.now() - lastActiveAt >= SESSION_TIMEOUT_MS;
}

function scheduleSessionExpiry() {
  clearTimeout(sessionTimer);
  if (!state.token) return;
  const lastActiveAt = Number(localStorage.getItem("flatmateLedgerLastActiveAt") || Date.now());
  const remainingMs = Math.max(0, SESSION_TIMEOUT_MS - (Date.now() - lastActiveAt));
  sessionTimer = setTimeout(() => {
    enforceSession();
  }, remainingMs);
}

function clearSession({ message = "" } = {}) {
  clearTimeout(sessionTimer);
  clearTimeout(refreshTimer);
  setToken("");
  setHouseId("");
  state.user = null;
  state.role = null;
  state.memberships = [];
  state.members = [];
  state.currentHouse = null;
  state.isGlobalAdmin = false;
  state.currentPage = "dashboard";
  setAppMode();
  if (message) showToast(message, "error");
}

function enforceSession() {
  if (!sessionExpired()) return true;
  clearSession({ message: "Session expired after 1 hour of inactivity. Please login again." });
  return false;
}

function recordUserActivity() {
  if (!state.token) return;
  if (!enforceSession()) return;
  const now = Date.now();
  if (now - lastActivityWriteAt < 30000) return;
  lastActivityWriteAt = now;
  touchSession();
}

function syncDashboardTimeFilter() {
  if (!els.dashboardTimeWindow) return;
  els.dashboardTimeWindow.value = state.dashboardTimeWindow;
  if (els.dashboardStartDate) {
    els.dashboardStartDate.value = state.dashboardStartDate;
    els.dashboardStartDate.hidden = state.dashboardTimeWindow !== "custom";
  }
  if (els.dashboardEndDate) {
    els.dashboardEndDate.value = state.dashboardEndDate;
    els.dashboardEndDate.hidden = state.dashboardTimeWindow !== "custom";
  }
}

function updateDashboardTimeFilter() {
  state.dashboardTimeWindow = els.dashboardTimeWindow?.value || "all";
  state.dashboardStartDate = els.dashboardStartDate?.value || "";
  state.dashboardEndDate = els.dashboardEndDate?.value || "";
  localStorage.setItem("flatmateLedgerDashboardTimeWindow", state.dashboardTimeWindow);
  localStorage.setItem("flatmateLedgerDashboardStartDate", state.dashboardStartDate);
  localStorage.setItem("flatmateLedgerDashboardEndDate", state.dashboardEndDate);
  syncDashboardTimeFilter();
  renderSummary();
}

function setHouseId(houseId) {
  state.houseId = houseId || "";
  if (houseId) {
    localStorage.setItem("flatmateLedgerHouseId", houseId);
  } else {
    localStorage.removeItem("flatmateLedgerHouseId");
  }
  if (els.houseSelect) els.houseSelect.value = state.houseId;
}

function setSidebarCollapsed(collapsed) {
  state.sidebarCollapsed = Boolean(collapsed);
  localStorage.setItem("flatmateLedgerSidebarCollapsed", String(state.sidebarCollapsed));
  els.appView?.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  if (els.sidebarDisplayBtn) {
    els.sidebarDisplayBtn.textContent = state.sidebarCollapsed ? "→ Show Sidebar Options" : "← Hide Sidebar Options";
  }
}

function currentUserMember() {
  if (!state.user) return null;
  return {
    userId: state.user.id,
    user: state.user,
    role: state.role,
  };
}

function renderSettingsAvatarPreview(avatarUrl = state.user?.avatarUrl || null) {
  if (!els.settingsAvatarPreview) return;
  const previewUser = state.user ? { ...state.user, avatarUrl } : null;
  els.settingsAvatarPreview.innerHTML = `
    ${avatarMarkup({ ...currentUserMember(), user: previewUser })}
    <div>
      <strong>${escapeHtml(state.user?.fullName || "Not signed in")}</strong>
      <span>${escapeHtml(avatarUrl || "Default avatar")}</span>
    </div>
  `;
}

function populateSettings() {
  if (!state.user) return;
  const profileForm = document.getElementById("profileForm");
  const avatarForm = document.getElementById("avatarForm");
  if (profileForm) {
    profileForm.fullName.value = state.user.fullName || "";
    profileForm.contact.value = state.user.contact || "";
  }
  if (avatarForm) {
    avatarForm.avatarUrl.value = state.user.avatarUrl || "";
  }
  renderSettingsAvatarPreview();
}

function showSettingsPage(pageKey = "profile") {
  document.querySelectorAll("[data-settings-page]").forEach((page) => {
    page.hidden = page.getAttribute("data-settings-page") !== pageKey;
  });
  document.querySelectorAll("[data-settings-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-settings-tab") === pageKey);
  });
}

function canShowPageElement(element) {
  if (element.id === "adminHousePanel") return isAdmin();
  if (element.id === "adminMemberPanel" || element.id === "adminEditExpensePanel") return isAdmin();
  if (element.closest("#adminView")) return isManagement();
  if (element.closest("#userView")) return !isManagement();
  return true;
}

function showAppPage(pageKey = state.currentPage || "dashboard") {
  hideMemberProfile({ force: true });
  const nextPage = isPageAllowed(pageKey) ? pageKey : "dashboard";
  state.currentPage = nextPage;
  localStorage.setItem("flatmateLedgerPage", nextPage);

  document.querySelectorAll(".app-page").forEach((page) => {
    const pageName = page.getAttribute("data-page");
    const isDashboardSubPage = page.id === "dashboardView" && ["dashboard", "members", "history"].includes(nextPage);
    page.hidden = !(canShowPageElement(page) && (pageName === nextPage || isDashboardSubPage));
  });

  document.querySelectorAll("#dashboardView [data-page-panel]").forEach((panel) => {
    const panelName = panel.getAttribute("data-page-panel");
    panel.hidden = nextPage !== "dashboard" && panelName !== nextPage;
  });

  document.querySelectorAll(".menu-item").forEach((item) => {
    item.classList.toggle("is-active", item.getAttribute("data-jump") === nextPage);
  });
}

function setAppMode() {
  const signedIn = Boolean(state.token && state.user);
  els.loginView.hidden = signedIn;
  els.appView.hidden = !signedIn;
  if (!signedIn) return;

  const canManage = isManagement();
  els.adminView.hidden = !canManage;
  if (els.groupsMenuItem) els.groupsMenuItem.hidden = !isAdmin();
  if (els.adminQuickActions) els.adminQuickActions.hidden = !canManage;
  els.userView.hidden = canManage;
  if (els.workspaceTitle) els.workspaceTitle.textContent = canManage ? "Group Console" : "My Ledger";
  els.viewEyebrow.textContent = canManage ? `${state.role} Workspace` : "Flatmate Workspace";
  els.viewHeadline.textContent = isAdmin()
    ? "Track groups, bills, cash, payments, and settlement."
    : "See your balance, group expenses, and payment status.";
  els.signedInUser.textContent = state.user.fullName || state.user.contact;
  els.signedInRole.textContent = state.role || "No house role";
  if (els.topSignedInUser) {
    els.topSignedInUser.textContent = `${state.user.fullName || state.user.contact} · ${state.role || "No group role"}`;
  }
  if (els.menuGroupCount) els.menuGroupCount.textContent = String(state.memberships.length || 0);
  populateSettings();
  showAppPage(state.currentPage);
}

function filteredDashboardTotals(summary) {
  const expenses = state.expenses.filter((expense) => isWithinDashboardWindow(expense.expenseDate || expense.expense_date || expense.createdAt || expense.created_at));
  const payments = state.payments.filter((payment) => isWithinDashboardWindow(payment.paymentDate || payment.payment_date || payment.createdAt || payment.created_at));
  if (!state.expenses.length && !state.payments.length) {
    return {
      totalExpensesMinor: summary.totalExpensesMinor,
      pendingExpenseMinor: summary.pendingExpenseMinor,
      totalCollectedMinor: summary.totalCollectedMinor,
      totalPendingMinor: summary.totalPendingMinor,
      cashInHandMinor: summary.cashInHandMinor,
    };
  }

  const totalExpensesMinor = expenses
    .filter((expense) => expense.status === "approved")
    .reduce((sum, expense) => sum + (Number(expense.amountMinor) || 0), 0);
  const pendingExpenseMinor = expenses
    .filter((expense) => expense.status === "pending_approval")
    .reduce((sum, expense) => sum + (Number(expense.amountMinor) || 0), 0);
  const totalCollectedMinor = payments
    .filter((payment) => payment.confirmationStatus === "confirmed")
    .reduce((sum, payment) => sum + (Number(payment.amountMinor) || 0), 0);
  const totalPendingMinor = payments
    .filter((payment) => payment.confirmationStatus === "pending")
    .reduce((sum, payment) => sum + (Number(payment.amountMinor) || 0), 0);
  const cashInHandMinor = payments
    .filter((payment) => payment.method === "cash" && payment.confirmationStatus === "confirmed")
    .reduce((sum, payment) => sum + (Number(payment.amountMinor) || 0), 0);

  return { totalExpensesMinor, pendingExpenseMinor, totalCollectedMinor, totalPendingMinor, cashInHandMinor };
}

function renderSummary(summary = state.summary) {
  if (!summary) return;
  state.summary = summary;
  const totals = filteredDashboardTotals(summary);
  const cards = [
    ["Group", summary.house?.name || "Unknown"],
    ["Total Expenses", money(totals.totalExpensesMinor)],
    ["Pending Expenses", money(totals.pendingExpenseMinor)],
    ["Collected", money(totals.totalCollectedMinor)],
    ["Pending", money(totals.totalPendingMinor)],
    ["Cash in Hand", money(totals.cashInHandMinor)],
  ];
  const html = cards.map(([label, value]) => `
    <div class="summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");

  if (els.dashboardSummaryCards) els.dashboardSummaryCards.innerHTML = html;
  if (els.summaryCards) els.summaryCards.innerHTML = html;
  if (els.userSummaryCards) els.userSummaryCards.innerHTML = html;
  els.collectedMetric.textContent = money(totals.totalCollectedMinor);
  els.pendingMetric.textContent = money(totals.totalPendingMinor);
  els.cashMetric.textContent = money(totals.cashInHandMinor);
  if (els.houseName) els.houseName.textContent = summary.house?.name || "No group selected";
  if (els.userHouseName) els.userHouseName.textContent = summary.house?.name || "No group selected";
  els.topActiveGroup.textContent = summary.house?.name || "No group selected";
  els.balanceCount.textContent = `${summary.balances?.length || 0} open balances`;
}

function memberLabel(member) {
  if (!member) return "";
  const user = member?.user || {};
  return user.fullName || user.contact || member?.phoneDisplay || member?.userId || member?.user_id || "Member";
}

function avatarMeta(member) {
  const avatar = member?.user?.avatarUrl || member?.user?.avatar_url || "";
  const imageUrl = safeImageUrl(avatar);
  if (imageUrl) {
    return { imageUrl, label: `${memberLabel(member)} avatar`, className: "avatar-image" };
  }
  const map = {
    "avatar:dog": { icon: "DOG", label: "Dog avatar", className: "avatar-dog" },
    "avatar:big-belly": { icon: "BB", label: "Big belly man", className: "avatar-belly" },
    "avatar:beard-guy": { icon: "BG", label: "Beard guy", className: "avatar-beard" },
    "avatar:it-guy": { icon: "IT", label: "IT guy", className: "avatar-it" },
    "avatar:normal": { icon: "NM", label: "Normal avatar", className: "avatar-normal" },
  };
  return map[avatar] || { icon: "FL", label: "Flatmate", className: "avatar-normal" };
}

function avatarMarkup(member) {
  const avatar = avatarMeta(member);
  if (avatar.imageUrl) {
    return `<span class="avatar ${escapeAttr(avatar.className)}" title="${escapeAttr(avatar.label)}"><img src="${escapeAttr(avatar.imageUrl)}" alt="${escapeAttr(avatar.label)}" /></span>`;
  }
  return `<span class="avatar ${escapeAttr(avatar.className)}" title="${escapeAttr(avatar.label)}">${escapeHtml(avatar.icon)}</span>`;
}

function expenseLabel(expense) {
  const date = expense.expenseDate || expense.expense_date || "";
  return `${expense.title || "Expense"}${date ? ` - ${date}` : ""} - ${money(expense.amountMinor)}`;
}

function getMemberById(userId) {
  return state.members.find((member) => (member.userId || member.user_id) === userId) || null;
}

function memberNameById(userId) {
  return memberLabel(getMemberById(userId)) || "Member";
}

function cashHeldByMember(userId) {
  const collectedMinor = state.payments
    .filter((payment) => payment.method === "cash" && payment.confirmationStatus === "confirmed" && payment.receiverUserId === userId)
    .reduce((sum, payment) => sum + (Number(payment.amountMinor) || 0), 0);
  const spentMinor = state.expenses
    .filter((expense) => expense.status === "approved")
    .reduce((sum, expense) => {
      const contribution = (expense.payerContributions || []).find((entry) => entry.userId === userId);
      if (contribution) return sum + (Number(contribution.amountMinor) || 0);
      return (expense.paidByUserId || expense.paid_by_user_id) === userId
        ? sum + (Number(expense.amountMinor) || 0)
        : sum;
    }, 0);
  return collectedMinor - spentMinor;
}

function populateExpenseSelectors(expenses = state.expenses) {
  const options = expenses.length
    ? expenses.map((expense) => optionHtml(expense.id, expenseLabel(expense))).join("")
    : `<option value="">No expenses available</option>`;
  [els.editExpenseId].forEach((select) => {
    if (select) select.innerHTML = options;
  });
}

function populateDisputeTargetSelectors() {
  const expenseOptions = state.expenses.map((expense) => optionHtml(`expense:${expense.id}`, `Expense - ${expenseLabel(expense)}`));
  const paymentOptions = state.payments.map((payment) => optionHtml(`payment:${payment.id}`, `Deposit - ${memberNameById(payment.payerUserId)} - ${money(payment.amountMinor)} - ${payment.confirmationStatus}`));
  const options = [...expenseOptions, ...paymentOptions].join("") || `<option value="">No expenses or deposits available</option>`;
  [els.disputeTarget, els.userDisputeTarget].forEach((select) => {
    if (select) select.innerHTML = options;
  });
}

function memberFinanceSummary(userId) {
  const paidExpenses = state.expenses.filter((expense) => {
    if ((expense.paidByUserId || expense.paid_by_user_id) === userId) return true;
    return (expense.payerContributions || []).some((entry) => entry.userId === userId);
  });
  const owedSplits = state.expenses.flatMap((expense) =>
    (expense.splits || [])
      .filter((split) => split.userId === userId)
      .map((split) => ({ expense, amountMinor: split.owedAmountMinor })),
  );
  const balance = state.balances.find((entry) => entry.userId === userId)?.balanceMinor || 0;
  const debtLines = state.balances
    .filter((entry) => entry.userId !== userId && entry.balanceMinor > 0 && balance < 0)
    .map((entry) => `Owes ${memberNameById(entry.userId)} up to ${money(Math.min(Math.abs(balance), entry.balanceMinor))}`);
  const creditLines = state.balances
    .filter((entry) => entry.userId !== userId && entry.balanceMinor < 0 && balance > 0)
    .map((entry) => `${memberNameById(entry.userId)} owes up to ${money(Math.min(balance, Math.abs(entry.balanceMinor)))}`);

  return { paidExpenses, owedSplits, balance, debtLines, creditLines };
}

function memberProfileHtml(member) {
  const userId = member.userId || member.user_id;
  const summary = memberFinanceSummary(userId);
  const paidTotal = summary.paidExpenses.reduce((sum, expense) => {
    const ownContribution = (expense.payerContributions || []).find((entry) => entry.userId === userId);
    return sum + (ownContribution?.amountMinor || expense.amountMinor || 0);
  }, 0);
  const owedTotal = summary.owedSplits.reduce((sum, split) => sum + split.amountMinor, 0);
  const relation = relationToCurrentUser(userId);
  const avatar = avatarMeta(member);
  const avatarImage = avatar.imageUrl
    ? `<img src="${escapeAttr(avatar.imageUrl)}" alt="${escapeAttr(avatar.label)}" />`
    : `<span class="member-profile-fallback ${escapeAttr(avatar.className)}">${escapeHtml(avatar.icon)}</span>`;

  return `
    <div class="member-profile-card">
      <button type="button" class="member-profile-close" data-close-member-profile aria-label="Close">×</button>
      <div class="member-profile-head">
        <div class="member-profile-photo">${avatarImage}</div>
        <div>
          <strong>${escapeHtml(memberLabel(member))}</strong>
          <span>${escapeHtml(member.role || "flatmate")}</span>
        </div>
      </div>
      <div class="member-profile-stats">
        <div><span>Paid</span><strong>${money(paidTotal)}</strong></div>
        <div><span>Share</span><strong>${money(owedTotal)}</strong></div>
        <div><span>Net</span><strong class="${balanceClass(summary.balance)}">${signedMoney(summary.balance)}</strong></div>
        ${relation ? `<div class="member-profile-relation"><span>${escapeHtml(relation.label)}</span><strong class="${escapeAttr(relation.className)}">${signedMoney(relation.amountMinor)}</strong></div>` : ""}
      </div>
      <div class="member-profile-section">
        <h4>Expenses Paid</h4>
        ${summary.paidExpenses.length ? summary.paidExpenses.slice(0, 5).map((expense) => `<p>${escapeHtml(expenseLabel(expense))}</p>`).join("") : "<p>No paid expenses yet.</p>"}
      </div>
      <div class="member-profile-section">
        <h4>Debts & Credits</h4>
        ${[...summary.debtLines, ...summary.creditLines].length ? [...summary.debtLines, ...summary.creditLines].map((line) => `<p>${escapeHtml(line)}</p>`).join("") : "<p>Settled for now.</p>"}
      </div>
    </div>
  `;
}

function showMemberProfile(member, anchor = null, pinned = false) {
  if (!els.memberProfilePopover || !member) return;
  const userId = member.userId || member.user_id;
  if (!pinned && els.memberProfilePopover.classList.contains("is-pinned")) return;
  els.memberProfilePopover.innerHTML = memberProfileHtml(member);
  els.memberProfilePopover.hidden = false;
  els.memberProfilePopover.classList.toggle("is-pinned", pinned);
  els.memberProfilePopover.dataset.memberProfileUser = userId;
  state.memberProfilePinnedId = pinned ? userId : "";
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    const left = Math.min(window.innerWidth - 340, Math.max(12, rect.left));
    const top = Math.min(window.innerHeight - 460, Math.max(12, rect.bottom + 10));
    els.memberProfilePopover.style.left = `${left}px`;
    els.memberProfilePopover.style.top = `${top}px`;
  }
}

function hideMemberProfile({ force = false } = {}) {
  if (!els.memberProfilePopover) return;
  if (!force && els.memberProfilePopover.classList.contains("is-pinned")) return;
  els.memberProfilePopover.hidden = true;
  els.memberProfilePopover.classList.remove("is-pinned");
  els.memberProfilePopover.dataset.memberProfileUser = "";
  state.memberProfilePinnedId = "";
}

function historyPreviewHtml(entry) {
  if (!entry) return "";
  const actorName = entry.actor?.fullName || entry.actor?.contact || "System";
  const timestamp = entry.createdAt ? new Date(entry.createdAt).toLocaleString("en-PK") : "Unknown";
  const metadata = entry.metadata && Object.keys(entry.metadata).length
    ? Object.entries(entry.metadata).slice(0, 4).map(([key, value]) => `
      <div><span>${escapeHtml(key)}</span><strong>${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</strong></div>
    `).join("")
    : `<div><span>Details</span><strong>No extra details</strong></div>`;

  return `
    <div class="history-preview-card">
      <strong>${escapeHtml(entry.actionType || "activity")}</strong>
      <p>${escapeHtml(actorName)} - ${escapeHtml(timestamp)}</p>
      ${metadata}
    </div>
  `;
}

function showHistoryPreview(entry, anchor) {
  if (!els.historyPreviewPopover || !entry || !anchor) return;
  els.historyPreviewPopover.innerHTML = historyPreviewHtml(entry);
  els.historyPreviewPopover.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const left = Math.min(window.innerWidth - 340, Math.max(12, rect.right - 320));
  const top = Math.min(window.innerHeight - 260, Math.max(12, rect.bottom + 8));
  els.historyPreviewPopover.style.left = `${left}px`;
  els.historyPreviewPopover.style.top = `${top}px`;
}

function hideHistoryPreview() {
  if (els.historyPreviewPopover) els.historyPreviewPopover.hidden = true;
}

function resolveUserId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  const exact = state.members.find((member) => {
    const user = member.user || {};
    return [
      member.userId,
      member.user_id,
      user.id,
      user.contact,
      user.fullName,
      member.phoneDisplay,
    ].filter(Boolean).map((item) => String(item).trim().toLowerCase()).includes(normalized);
  });
  return exact?.userId || exact?.user_id || "";
}

function renderMemberControls(members = []) {
  const activeMembers = newestFirst(
    members.filter((member) => member.status === "active"),
    ["joinedAt", "createdAt", "joined_at", "created_at"],
  );
  const options = activeMembers.map((member) => {
    const userId = member.userId || member.user_id;
    return optionHtml(userId, memberLabel(member));
  }).join("");

  els.managerPaidByUserId.innerHTML = options;
  els.managerSplitMembers.innerHTML = activeMembers.map((member) => {
    const userId = member.userId || member.user_id;
    return `
      <label>
        <input type="checkbox" name="splitMemberIds" value="${escapeAttr(userId)}" checked />
        <span>${escapeHtml(memberLabel(member))}</span>
      </label>
    `;
  }).join("");

  const currentUserOption = activeMembers.find((member) => (member.userId || member.user_id) === state.user?.id);
  if (currentUserOption) {
    els.managerPaidByUserId.value = state.user.id;
  } else if (activeMembers[0]) {
    els.managerPaidByUserId.value = activeMembers[0].userId || activeMembers[0].user_id;
  }

  const groupOptions = newestFirst(state.memberships, ["house.createdAt", "joinedAt", "createdAt", "joined_at", "created_at"]).map((membership) => {
    const groupId = membership.houseId || membership.house_id;
    const groupName = membership.house?.name || groupId;
    return optionHtml(groupId, groupName, { selected: groupId === state.houseId });
  }).join("");
  els.paymentGroupSelect.innerHTML = groupOptions;
  els.userPaymentGroupSelect.innerHTML = groupOptions;
  els.paymentPayerUserId.innerHTML = options;
  els.roleMemberUserId.innerHTML = options;
  els.paymentPayerUserId.value = currentUserOption ? state.user.id : activeMembers[0]?.userId || activeMembers[0]?.user_id || "";
}

function renderDashboardRoster(members = []) {
  const balanceFor = (member) => balanceByUserId(member.userId || member.user_id);
  const activeMembers = members
    .filter((member) => member.status === "active")
    .sort((left, right) => balanceFor(left) - balanceFor(right));
  els.dashboardRoster.innerHTML = activeMembers.length
    ? activeMembers.map((member) => {
        const userId = member.userId || member.user_id;
        const cashHeld = cashHeldByMember(userId);
        return `
          <button type="button" class="avatar-card" data-member-profile="${escapeAttr(userId)}" aria-label="View ${escapeAttr(memberLabel(member))} profile">
            ${avatarMarkup(member)}
            <div>
              <strong>${escapeHtml(memberLabel(member))}</strong>
              <span>${escapeHtml(member.role)} <b class="${balanceClass(balanceFor(member))}">${signedMoney(balanceFor(member))}</b></span>
              ${member.role === "manager" ? `<span>Cash with him <b class="${balanceClass(cashHeld)}">${signedMoney(cashHeld)}</b></span>` : ""}
            </div>
          </button>
        `;
      }).join("")
    : `<div class="list-item">No flatmates yet.</div>`;
}

function renderMembers(members = []) {
  state.members = members;
  renderMemberControls(members);
  renderDashboardRoster(members);
  els.memberCount.textContent = String(members.length);
  if (els.menuMemberCount) els.menuMemberCount.textContent = String(members.length);
}

function renderHistory(history = []) {
  const sortedHistory = newestFirst(history, ["createdAt", "created_at"]);
  state.history = sortedHistory;
  els.historyCount.textContent = `${sortedHistory.length} events`;
  if (els.menuHistoryCount) els.menuHistoryCount.textContent = String(sortedHistory.length);
  els.historyList.innerHTML = sortedHistory.length
    ? sortedHistory.map((entry, index) => {
        const actorName = entry.actor?.fullName || entry.actor?.contact || "System";
        const timestamp = entry.createdAt ? new Date(entry.createdAt).toLocaleString("en-PK") : "";
        const metadata = entry.metadata && Object.keys(entry.metadata).length
          ? Object.entries(entry.metadata).map(([key, value]) => `
            <div class="history-detail-row">
              <span>${escapeHtml(key)}</span>
              <strong>${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</strong>
            </div>
          `).join("")
          : `<div class="history-detail-row"><span>Details</span><strong>No extra details</strong></div>`;
        return `
          <details class="ledger-item history-item" data-history-index="${escapeAttr(index)}">
            <summary class="ledger-item-top">
              <div>
                <strong>${escapeHtml(entry.actionType || "activity")}</strong>
                <div class="list-item-meta">${escapeHtml(actorName)} - ${escapeHtml(timestamp)}</div>
              </div>
              <span class="status-pill">${escapeHtml(entry.entityType || "event")}</span>
            </summary>
            <div class="history-detail">
              <div class="history-detail-row"><span>Actor</span><strong>${escapeHtml(actorName)}</strong></div>
              <div class="history-detail-row"><span>Action</span><strong>${escapeHtml(entry.actionType || "activity")}</strong></div>
              <div class="history-detail-row"><span>Type</span><strong>${escapeHtml(entry.entityType || "event")}</strong></div>
              <div class="history-detail-row"><span>Time</span><strong>${escapeHtml(timestamp || "Unknown")}</strong></div>
              ${metadata}
            </div>
          </details>
        `;
      }).join("")
    : `<div class="ledger-item">No history yet.</div>`;
}

function balanceItem(balance) {
  const member = state.members.find((item) => (item.userId || item.user_id) === balance.userId);
  return `
    <div class="ledger-item">
      <div class="ledger-item-top">
        <div>
          <strong>${escapeHtml(memberLabel(member) || "Member")}</strong>
          <div class="list-item-meta">Member balance</div>
        </div>
        <strong class="${balanceClass(balance.balanceMinor)}">${signedMoney(balance.balanceMinor)}</strong>
      </div>
    </div>
  `;
}

function renderBalances(balances = []) {
  state.balances = balances;
  els.balanceList.innerHTML = balances.length ? balances.map(balanceItem).join("") : `<div class="ledger-item">No open balances.</div>`;
  const mine = balances.filter((balance) => balance.userId === state.user?.id);
  els.userBalanceLabel.textContent = `${mine.length} personal balance entries`;
  els.userBalanceList.innerHTML = mine.length ? mine.map(balanceItem).join("") : `<div class="ledger-item">You are settled for now.</div>`;
}

function parseLines(text, valueKey, { valueScale = "number" } = {}) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawUser, rawValue] = line.split("=").map((part) => part?.trim());
      const userId = resolveUserId(rawUser);
      const numericValue = Number(rawValue);
      if (!userId || !Number.isFinite(numericValue)) {
        throw new Error(`Could not parse line: ${line}`);
      }
      const value = valueScale === "pkr" ? pkrToMinor(numericValue) : numericValue;
      return { userId, [valueKey]: value };
    });
}

function selectedSplitMemberIds(form) {
  return [...form.querySelectorAll('input[name="splitMemberIds"]:checked')].map((input) => input.value);
}

function renderExpenses(expenses = []) {
  const sortedExpenses = newestFirst(expenses, ["createdAt", "updatedAt", "expenseDate", "created_at", "updated_at", "expense_date"]);
  state.expenses = sortedExpenses;
  renderSummary();
  populateExpenseSelectors(sortedExpenses);
  populateDisputeTargetSelectors();
  els.expenseCount.textContent = `${sortedExpenses.length} total`;
  if (els.menuExpenseCount) els.menuExpenseCount.textContent = String(sortedExpenses.length);
  els.expenseList.innerHTML = sortedExpenses.length
    ? sortedExpenses.map((expense) => {
        const payerSummary = expense.payerContributions?.length
          ? expense.payerContributions.map((entry) => {
              const member = state.members.find((item) => (item.userId || item.user_id) === entry.userId);
              return `${memberLabel(member)}: ${money(entry.amountMinor)}`;
            }).join(", ")
          : `${memberNameById(expense.paidByUserId || expense.paid_by_user_id)}: ${money(expense.amountMinor)}`;
        return `
          <div class="ledger-item">
            <div class="ledger-item-top">
              <div>
                <strong>${escapeHtml(payerSummary)}</strong>
                <div class="list-item-meta">${escapeHtml(expense.title || "Expense")}</div>
                <div class="list-item-meta">${escapeHtml(expense.expenseDate || "")} - ${escapeHtml(expense.splitType)} - ${escapeHtml(expense.status)}</div>
              </div>
              <div class="expense-actions">
                <strong>${money(expense.amountMinor)}</strong>
                ${isManagement() && expense.status === "pending_approval" ? `
                  <button type="button" data-approve-expense="${escapeAttr(expense.id)}">Approve</button>
                  <button type="button" class="danger-btn" data-reject-expense="${escapeAttr(expense.id)}">Reject</button>
                ` : ""}
              </div>
            </div>
          </div>
        `;
      }).join("")
    : `<div class="ledger-item">No expenses yet.</div>`;
}

function renderPayments(payments = []) {
  const sortedPayments = newestFirst(payments, ["createdAt", "paymentDate", "confirmedAt", "created_at", "payment_date", "confirmed_at"]);
  state.payments = sortedPayments;
  renderSummary();
  populateDisputeTargetSelectors();
  els.paymentCount.textContent = `${sortedPayments.length} total`;
  if (els.menuPaymentCount) els.menuPaymentCount.textContent = String(sortedPayments.length);
  els.paymentList.innerHTML = sortedPayments.length
    ? sortedPayments.map((payment) => {
        const payerName = memberNameById(payment.payerUserId);
        const receiverName = memberNameById(payment.receiverUserId);
        return `
          <div class="ledger-item">
            <div class="ledger-item-top">
              <div>
                <strong>${escapeHtml(payerName)}</strong>
                <div class="list-item-meta">${escapeHtml(payment.method)} deposit - ${escapeHtml(payment.confirmationStatus)} - ${escapeHtml(payment.paymentDate || "")}</div>
                <div class="list-item-meta">To ${escapeHtml(receiverName)}</div>
              </div>
              <div class="expense-actions">
                <strong>${money(payment.amountMinor)}</strong>
                ${isManagement() && payment.confirmationStatus === "pending" ? `
                  <button type="button" data-approve-payment="${escapeAttr(payment.id)}">Approve</button>
                  <button type="button" class="danger-btn" data-reject-payment="${escapeAttr(payment.id)}">Reject</button>
                ` : ""}
              </div>
            </div>
          </div>
        `;
      }).join("")
    : `<div class="ledger-item">No payments yet.</div>`;
}

function renderDisputes(disputes = []) {
  const sortedDisputes = newestFirst(disputes, ["createdAt", "resolvedAt", "created_at", "resolved_at"]);
  els.disputeList.innerHTML = sortedDisputes.length
    ? sortedDisputes.map((dispute) => {
        const expense = dispute.expense || null;
        const payment = dispute.payment || null;
        const openedBy = dispute.openedByUser?.fullName || dispute.openedByUser?.contact || "Member";
        const title = expense ? `Expense: ${expense.title}` : `Deposit: ${memberNameById(payment?.payerUserId)} - ${money(payment?.amountMinor || 0)}`;
        const selectedSplitIds = new Set((expense?.splits || []).map((split) => split.userId));
        const memberOptions = state.members.map((member) => {
          const userId = member.userId || member.user_id;
          return optionHtml(userId, memberLabel(member));
        }).join("");
        const splitChecks = state.members.map((member) => {
          const userId = member.userId || member.user_id;
          return `
            <label>
              <input type="checkbox" name="disputeSplitMemberIds" value="${escapeAttr(userId)}" ${selectedSplitIds.has(userId) ? "checked" : ""} />
              <span>${escapeHtml(memberLabel(member))}</span>
            </label>
          `;
        }).join("");
        return `
          <details class="ledger-item dispute-editor" data-dispute-editor data-expense-id="${escapeAttr(expense?.id || "")}" data-payment-id="${escapeAttr(payment?.id || "")}">
            <summary class="ledger-item-top">
              <div>
                <strong>${escapeHtml(dispute.reason)}</strong>
                <div class="list-item-meta">${escapeHtml(dispute.status)} - ${escapeHtml(title)} - opened by ${escapeHtml(openedBy)}</div>
              </div>
              <span class="status-pill">${escapeHtml(dispute.status)}</span>
            </summary>
            ${isManagement() && expense ? `
              <div class="dispute-edit-grid">
                <input name="amountPkr" value="${escapeAttr((expense.amountMinor || 0) / 100)}" placeholder="Amount in PKR" />
                <select name="splitType">
                  <option value="equal_all" ${expense.splitType === "equal_all" ? "selected" : ""}>Equal all</option>
                  <option value="equal_selected" ${expense.splitType === "equal_selected" ? "selected" : ""}>Equal selected</option>
                  <option value="percentage" ${expense.splitType === "percentage" ? "selected" : ""}>Percentage</option>
                  <option value="unequal" ${expense.splitType === "unequal" ? "selected" : ""}>Unequal</option>
                </select>
                <select name="paidByUserId">${memberOptions}</select>
                <div class="check-grid dispute-check-grid">${splitChecks}</div>
                <button type="button" data-update-dispute-expense>Update Disputed Expense</button>
              </div>
            ` : ""}
            ${isManagement() && payment ? `
              <div class="dispute-edit-grid">
                <select name="payerUserId">${memberOptions}</select>
                <input name="amountPkr" value="${escapeAttr((payment.amountMinor || 0) / 100)}" placeholder="Amount in PKR" />
                <button type="button" data-update-dispute-payment>Update Disputed Deposit</button>
              </div>
            ` : ""}
          </details>
        `;
      }).join("")
    : `<div class="ledger-item">No disputes open.</div>`;

  els.disputeList.querySelectorAll("[data-expense-id]").forEach((editor) => {
    const expense = state.expenses.find((item) => item.id === editor.dataset.expenseId);
    if (expense && editor.querySelector('[name="paidByUserId"]')) {
      editor.querySelector('[name="paidByUserId"]').value = expense.paidByUserId || "";
    }
  });
  els.disputeList.querySelectorAll("[data-payment-id]").forEach((editor) => {
    const payment = state.payments.find((item) => item.id === editor.dataset.paymentId);
    if (payment && editor.querySelector('[name="payerUserId"]')) {
      editor.querySelector('[name="payerUserId"]').value = payment.payerUserId || "";
    }
  });
}

function renderSettlements(settlements = []) {
  const sortedSettlements = newestFirst(settlements, ["generatedAt", "finalizedAt", "periodEnd", "periodStart", "generated_at", "finalized_at", "period_end", "period_start"]);
  els.settlementList.innerHTML = sortedSettlements.length
    ? sortedSettlements.map((settlement) => `
      <div class="ledger-item">
        <div class="ledger-item-top">
          <div>
            <strong>${escapeHtml(settlement.periodStart)} to ${escapeHtml(settlement.periodEnd)}</strong>
            <div class="list-item-meta">${escapeHtml(settlement.algorithmVersion)} - ${settlement.finalizedAt ? "finalized" : "open"}</div>
          </div>
          <span class="status-pill">${settlement.finalizedAt ? "Finalized" : "Open"}</span>
        </div>
      </div>
    `).join("")
    : `<div class="ledger-item">No settlements generated yet.</div>`;
}

async function hydrateSession() {
  if (!state.token) {
    setAppMode();
    return;
  }

  const me = await api("/me");
  state.user = me.user;
  state.memberships = me.memberships || [];
  state.isGlobalAdmin = Boolean(me.isGlobalAdmin);
  const membership = currentMembership();
  state.role = me.role || membership?.role || null;
  if (!membership && state.role === "admin") {
    state.currentPage = "groups";
  }
  setHouseId(membership ? membership.houseId || membership.house_id : "");
  setAppMode();
  await refreshHouse();
  scheduleSessionExpiry();
}

async function refreshHouse() {
  if (!state.token || !state.houseId) {
    if (els.houseSelect) {
      els.houseSelect.innerHTML = [
        `<option value="">Select group</option>`,
        ...newestFirst(state.memberships, ["house.createdAt", "joinedAt", "createdAt", "joined_at", "created_at"]).map((membership) => {
          const houseId = membership.houseId || membership.house_id;
          const houseName = membership.house?.name || houseId;
          return optionHtml(houseId, houseName);
        }),
      ].join("");
    }
    return;
  }

  const members = await api(`/houses/${state.houseId}/members`);
  state.members = members.members || [];
  if (isManagement()) {
    renderMembers(state.members);
  } else {
    renderMemberControls(state.members);
    renderDashboardRoster(state.members);
  }

  const summary = await api(`/houses/${state.houseId}`);
  state.currentHouse = summary;
  renderSummary(summary);
  renderBalances(summary.balances || []);
  renderDashboardRoster(state.members);

  const expenses = await api(`/houses/${state.houseId}/expenses`);
  renderExpenses(expenses.expenses || []);

  const payments = await api(`/houses/${state.houseId}/payments`);
  renderPayments(payments.payments || []);
  renderDashboardRoster(state.members);

  const activity = await api(`/houses/${state.houseId}/activity`);
  renderHistory(activity.history || []);

  if (isManagement()) {
    const disputes = await api(`/houses/${state.houseId}/disputes`);
    renderDisputes(disputes.disputes || []);
    const settlements = await api(`/houses/${state.houseId}/settlements`);
    renderSettlements(settlements.settlements || []);
  }

  els.houseSelect.innerHTML = [
    `<option value="">Select group</option>`,
    ...newestFirst(state.memberships, ["house.createdAt", "joinedAt", "createdAt", "joined_at", "created_at"]).map((membership) => {
      const houseId = membership.houseId || membership.house_id;
      const houseName = membership.house?.name || houseId;
      return optionHtml(houseId, houseName, { selected: houseId === state.houseId });
    }),
  ].join("");
}

async function refreshCurrentSession() {
  if (!state.token || document.hidden) return;
  if (!enforceSession()) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try {
      await hydrateSession();
    } catch (error) {
      clearSession({ message: error.message });
    }
  }, 80);
}

async function createUser(form) {
  if (!state.houseId) throw new Error("Select a group first");
  await api("/admin/users", {
    method: "POST",
    body: {
      fullName: form.fullName.value,
      contact: form.contact.value,
      password: form.password.value,
      role: form.role.value,
      houseId: state.houseId,
    },
  });
  showToast("Member account created and added.");
  await refreshHouse();
}

async function login(form) {
  const result = await api("/auth/login", {
    method: "POST",
    body: {
      contact: form.contact.value,
      password: form.password.value,
    },
  });
  setToken(result.token);
  showToast("Logged in");
  await hydrateSession();
}

async function createHouse(form) {
  const result = await api("/houses", {
    method: "POST",
    body: {
      name: form.name.value,
      city: form.city.value,
      address: form.address.value,
    },
  });
  setHouseId(result.house.id);
  await hydrateSession();
  showToast("Group created");
}

async function addMember(form) {
  await createUser(form);
}

async function assignRole(form) {
  if (!state.houseId) throw new Error("Select a group first");
  await api(`/houses/${state.houseId}/members/${form.memberUserId.value}`, {
    method: "PATCH",
    body: { role: form.role.value },
  });
  showToast("Member role updated");
  await refreshHouse();
}

async function createExpense(form) {
  if (!state.houseId) throw new Error("Select or create a house first");
  const splitType = form.splitType.value;
  const selectedUserIds = selectedSplitMemberIds(form);
  const percentageSplits = splitType === "percentage"
    ? parseLines(form.percentageSplits.value, "percent")
    : [];
  const unequalSplits = splitType === "unequal"
    ? parseLines(form.unequalSplits.value, "amount")
    : [];
  const payerContributions = form.payerContributions.value
    ? parseLines(form.payerContributions.value, "amountMinor", { valueScale: "pkr" })
    : [];

  await api(`/houses/${state.houseId}/expenses`, {
    method: "POST",
    body: {
      title: form.title.value === "Other" ? form.customTitle.value : form.title.value,
      amountPkr: Number(form.amountPkr.value),
      expenseDate: form.expenseDate.value,
      splitType,
      note: form.note.value,
      paidByUserId: form.paidByUserId.value || state.user.id,
      selectedUserIds,
      participantUserIds: selectedUserIds,
      percentageSplits,
      unequalSplits,
      payerContributions,
      requiresApproval: false,
    },
  });
  showToast("Expense created and approved");
  await refreshHouse();
}

async function submitUserExpense(form) {
  if (!state.houseId) throw new Error("Select or create a house first");
  await api(`/houses/${state.houseId}/expenses`, {
    method: "POST",
    body: {
      title: form.title.value === "Other" ? form.customTitle.value : form.title.value,
      amountPkr: Number(form.amountPkr.value),
      expenseDate: form.expenseDate.value,
      splitType: "equal_all",
      note: form.note.value,
      requiresApproval: true,
    },
  });
  showToast("Expense submitted for manager approval");
  await refreshHouse();
}

async function createPayment(form) {
  const groupId = form.groupId?.value || state.houseId;
  if (!groupId) throw new Error("Select a group first");
  const receiver = state.members.find((member) => member.role === "manager") || state.members.find((member) => member.isDefaultPayer);
  await api(`/houses/${groupId}/payments`, {
    method: "POST",
    body: {
      payerUserId: form.payerUserId?.value || state.user.id,
      receiverUserId: receiver?.userId || receiver?.user_id || state.user.id,
      amountPkr: Number(form.amountPkr.value),
      method: "cash",
      proofUrl: null,
    },
  });
  showToast("Cash deposit submitted");
  await refreshHouse();
}

async function editExpense(form) {
  if (!state.houseId) throw new Error("Select a group first");
  const body = {};
  if (form.title.value) body.title = form.title.value === "Other" ? form.customTitle.value : form.title.value;
  if (form.amountPkr.value) body.amountPkr = Number(form.amountPkr.value);
  if (form.splitType.value) body.splitType = form.splitType.value;
  const included = String(form.includedUsers.value || "")
    .split(",")
    .map((item) => resolveUserId(item))
    .filter(Boolean);
  if (included.length) {
    body.selectedUserIds = included;
    body.participantUserIds = included;
  }
  if (form.percentageSplits.value) body.percentageSplits = parseLines(form.percentageSplits.value, "percent");
  if (form.unequalSplits.value) body.unequalSplits = parseLines(form.unequalSplits.value, "amount");
  await api(`/houses/${state.houseId}/expenses/${form.expenseId.value}`, {
    method: "PATCH",
    body,
  });
  showToast("Expense updated");
  await refreshHouse();
}

async function changePassword(form) {
  await api("/me/password", {
    method: "POST",
    body: {
      currentPassword: form.currentPassword.value,
      newPassword: form.newPassword.value,
    },
  });
  clearSession({ message: "Password changed. Please login again." });
}

async function updateProfile(form) {
  const result = await api("/me/profile", {
    method: "PATCH",
    body: {
      fullName: form.fullName.value,
      contact: form.contact.value,
    },
  });
  state.user = result.user;
  populateSettings();
  showToast("Username updated");
  await hydrateSession();
}

async function updateAvatar(form) {
  const result = await api("/me/profile", {
    method: "PATCH",
    body: {
      avatarUrl: form.avatarUrl.value,
    },
  });
  state.user = result.user;
  populateSettings();
  showToast("Icon updated");
  await refreshHouse();
}

async function confirmPayment(form) {
  if (!state.houseId) throw new Error("Select or create a house first");
  await api(`/houses/${state.houseId}/payments/confirm`, {
    method: "POST",
    body: { paymentId: form.paymentId.value },
  });
  showToast("Payment confirmed");
  await refreshHouse();
}

async function confirmPaymentById(paymentId) {
  if (!state.houseId) throw new Error("Select or create a house first");
  await api(`/houses/${state.houseId}/payments/confirm`, {
    method: "POST",
    body: { paymentId },
  });
  showToast("Payment approved");
  await refreshHouse();
}

async function rejectPaymentById(paymentId) {
  if (!state.houseId) throw new Error("Select or create a house first");
  await api(`/houses/${state.houseId}/payments/reject`, {
    method: "POST",
    body: { paymentId, reason: "Rejected by manager" },
  });
  showToast("Payment rejected");
  await refreshHouse();
}

async function createDispute(form) {
  if (!state.houseId) throw new Error("Select or create a house first");
  const [targetType, targetId] = String(form.target?.value || "").split(":");
  await api(`/houses/${state.houseId}/disputes`, {
    method: "POST",
    body: {
      expenseId: targetType === "expense" ? targetId : null,
      paymentId: targetType === "payment" ? targetId : null,
      reason: form.reason.value,
    },
  });
  showToast("Dispute opened");
  await refreshHouse();
}

async function updateDisputedExpense(editor) {
  const selectedUserIds = [...editor.querySelectorAll('input[name="disputeSplitMemberIds"]:checked')].map((input) => input.value);
  await api(`/houses/${state.houseId}/expenses/${editor.dataset.expenseId}`, {
    method: "PATCH",
    body: {
      amountPkr: Number(editor.querySelector('[name="amountPkr"]').value),
      splitType: editor.querySelector('[name="splitType"]').value,
      paidByUserId: editor.querySelector('[name="paidByUserId"]').value,
      selectedUserIds,
      participantUserIds: selectedUserIds,
    },
  });
  showToast("Disputed expense updated");
  await refreshHouse();
}

async function updateDisputedPayment(editor) {
  await api(`/houses/${state.houseId}/payments/${editor.dataset.paymentId}`, {
    method: "PATCH",
    body: {
      payerUserId: editor.querySelector('[name="payerUserId"]').value,
      amountPkr: Number(editor.querySelector('[name="amountPkr"]').value),
    },
  });
  showToast("Disputed deposit updated");
  await refreshHouse();
}

async function generateSettlement() {
  if (!state.houseId) throw new Error("Select or create a house first");
  await api(`/houses/${state.houseId}/settlements/generate`, { method: "POST", body: {} });
  showToast("Settlement generated");
  await refreshHouse();
}

async function logout() {
  if (state.token) {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // Local cleanup still protects the browser when the server session is already expired.
    }
  }
  clearSession();
}

function bindForm(id, handler, options = {}) {
  const form = document.getElementById(id);
  if (!form) return;
  const shouldReset = options.reset !== false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await handler(form);
      if (shouldReset) {
        form.reset();
        syncOtherTitleField(form);
      }
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

function syncOtherTitleField(form) {
  const titleSelect = form?.querySelector('select[name="title"]');
  const customTitle = form?.querySelector('input[name="customTitle"]');
  if (!titleSelect || !customTitle) return;
  const showCustomTitle = titleSelect.value === "Other";
  customTitle.hidden = !showCustomTitle;
  customTitle.style.display = showCustomTitle ? "" : "none";
  customTitle.required = showCustomTitle;
  if (!showCustomTitle) customTitle.value = "";
}

function bindOtherTitleFields() {
  document.querySelectorAll("form").forEach((form) => {
    const titleSelect = form.querySelector('select[name="title"]');
    const customTitle = form.querySelector('input[name="customTitle"]');
    if (!titleSelect || !customTitle) return;
    syncOtherTitleField(form);
    titleSelect.addEventListener("change", () => syncOtherTitleField(form));
  });
}

bindForm("loginForm", login);
bindForm("passwordForm", changePassword);
bindForm("profileForm", updateProfile, { reset: false });
bindForm("avatarForm", updateAvatar, { reset: false });
bindForm("houseForm", createHouse);
bindForm("memberForm", addMember);
bindForm("roleForm", assignRole);
bindForm("expenseForm", createExpense);
bindForm("editExpenseForm", editExpense);
bindForm("userExpenseForm", submitUserExpense);
bindForm("paymentForm", createPayment);
bindForm("userPaymentForm", createPayment);
bindForm("disputeForm", createDispute);
bindForm("userDisputeForm", createDispute);
bindOtherTitleFields();
syncDashboardTimeFilter();

els.dashboardTimeWindow?.addEventListener("change", updateDashboardTimeFilter);
els.dashboardStartDate?.addEventListener("change", updateDashboardTimeFilter);
els.dashboardEndDate?.addEventListener("change", updateDashboardTimeFilter);

els.logoutBtn?.addEventListener("click", logout);
els.topLogoutBtn?.addEventListener("click", logout);

els.sidebarDisplayBtn?.addEventListener("click", () => {
  setSidebarCollapsed(!state.sidebarCollapsed);
});

els.menuToggle?.addEventListener("click", () => {
  showSettingsPage("profile");
  showAppPage("settings");
});

els.houseSelect.addEventListener("change", async () => {
  setHouseId(els.houseSelect.value);
  await refreshHouse();
});

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.getAttribute("data-jump");
    showAppPage(key);
  });
});

document.querySelectorAll("[data-settings-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    showSettingsPage(button.getAttribute("data-settings-tab"));
  });
});

document.getElementById("avatarForm")?.avatarUrl.addEventListener("change", (event) => {
  renderSettingsAvatarPreview(event.target.value || null);
});

els.generateSettlementBtn.addEventListener("click", async () => {
  try {
    await generateSettlement();
  } catch (error) {
    showToast(error.message, "error");
  }
});

els.refreshSettlementBtn.addEventListener("click", async () => {
  try {
    await refreshHouse();
  } catch (error) {
    showToast(error.message, "error");
  }
});

els.expenseList.addEventListener("click", async (event) => {
  const approveId = event.target.getAttribute("data-approve-expense");
  const rejectId = event.target.getAttribute("data-reject-expense");
  if (!approveId && !rejectId) return;

  try {
    if (approveId) {
      await api(`/houses/${state.houseId}/expenses/approve`, {
        method: "POST",
        body: { expenseId: approveId },
      });
      showToast("Expense approved");
    } else {
      await api(`/houses/${state.houseId}/expenses/reject`, {
        method: "POST",
        body: { expenseId: rejectId, reason: "Rejected by manager" },
      });
      showToast("Expense rejected");
    }
    await refreshHouse();
  } catch (error) {
    showToast(error.message, "error");
  }
});

els.paymentList.addEventListener("click", async (event) => {
  const approveId = event.target.getAttribute("data-approve-payment");
  const rejectId = event.target.getAttribute("data-reject-payment");
  if (!approveId && !rejectId) return;

  try {
    if (approveId) {
      await confirmPaymentById(approveId);
    } else {
      await rejectPaymentById(rejectId);
    }
  } catch (error) {
    showToast(error.message, "error");
  }
});

els.disputeList.addEventListener("click", async (event) => {
  const editor = event.target.closest("[data-dispute-editor]");
  if (!editor) return;
  try {
    if (event.target.closest("[data-update-dispute-expense]")) {
      await updateDisputedExpense(editor);
    }
    if (event.target.closest("[data-update-dispute-payment]")) {
      await updateDisputedPayment(editor);
    }
  } catch (error) {
    showToast(error.message, "error");
  }
});

els.dashboardRoster.addEventListener("mouseover", (event) => {
  const card = event.target.closest("[data-member-profile]");
  if (!card) return;
  const member = getMemberById(card.getAttribute("data-member-profile"));
  showMemberProfile(member, card, false);
});

els.dashboardRoster.addEventListener("mouseleave", () => {
  hideMemberProfile();
});

els.dashboardRoster.addEventListener("click", (event) => {
  const card = event.target.closest("[data-member-profile]");
  if (!card) return;
  const userId = card.getAttribute("data-member-profile");
  const member = getMemberById(userId);
  showMemberProfile(member, card, false);
});

els.memberProfilePopover?.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-member-profile]")) {
    hideMemberProfile({ force: true });
  }
});

els.historyList.addEventListener("mouseover", (event) => {
  const item = event.target.closest("[data-history-index]");
  if (!item) return;
  showHistoryPreview(state.history[Number(item.getAttribute("data-history-index"))], item);
});

els.historyList.addEventListener("mouseleave", hideHistoryPreview);

els.historyList.addEventListener("click", hideHistoryPreview);

ACTIVITY_EVENTS.forEach((eventName) => {
  window.addEventListener(eventName, recordUserActivity, { passive: true });
});

hydrateSession().catch((error) => {
  clearSession({ message: error.message });
});

document.querySelectorAll('input[type="date"]').forEach((input) => {
  if (!input.value) input.value = today();
});

setSidebarCollapsed(state.sidebarCollapsed);

window.addEventListener("focus", refreshCurrentSession);
window.addEventListener("pageshow", refreshCurrentSession);
document.addEventListener("visibilitychange", refreshCurrentSession);

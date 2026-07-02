const state = {
  token: localStorage.getItem("flatmateLedgerToken") || "",
  houseId: localStorage.getItem("flatmateLedgerHouseId") || "",
  user: null,
  role: null,
  memberships: [],
  members: [],
  currentHouse: null,
  sidebarCollapsed: localStorage.getItem("flatmateLedgerSidebarCollapsed") === "true",
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
  tokenState: $("#tokenState"),
  logoutBtn: $("#logoutBtn"),
  houseSelect: $("#houseSelect"),
  houseName: $("#houseName"),
  userHouseName: $("#userHouseName"),
  collectedMetric: $("#collectedMetric"),
  pendingMetric: $("#pendingMetric"),
  cashMetric: $("#cashMetric"),
  dashboardSummaryCards: $("#dashboardSummaryCards"),
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
  userPaymentPayerUserId: $("#userPaymentPayerUserId"),
  roleMemberUserId: $("#roleMemberUserId"),
  generateSettlementBtn: $("#generateSettlementBtn"),
  refreshSettlementBtn: $("#refreshSettlementBtn"),
  toast: $("#toast"),
};

let refreshTimer = null;

function money(minor) {
  const value = (Number(minor) || 0) / 100;
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(value);
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function pkrToMinor(value) {
  return Math.round(Number(value || 0) * 100);
}

function setToken(token) {
  state.token = token;
  if (token) {
    localStorage.setItem("flatmateLedgerToken", token);
  } else {
    localStorage.removeItem("flatmateLedgerToken");
  }
  els.tokenState.textContent = token ? token : "Not signed in";
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
    els.sidebarDisplayBtn.textContent = state.sidebarCollapsed ? "Show Sidebar Options" : "Hide Sidebar Options";
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
      <strong>${state.user?.fullName || "Not signed in"}</strong>
      <span>${avatarUrl || "Default avatar"}</span>
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

function setAppMode() {
  const signedIn = Boolean(state.token && state.user);
  els.loginView.hidden = signedIn;
  els.appView.hidden = !signedIn;
  if (!signedIn) return;

  const canManage = isManagement();
  els.adminView.hidden = !canManage;
  els.adminHousePanel.hidden = !isAdmin();
  if (els.groupsMenuItem) els.groupsMenuItem.hidden = !isAdmin();
  if (els.adminMemberPanel) els.adminMemberPanel.hidden = !isAdmin();
  if (els.adminEditExpensePanel) els.adminEditExpensePanel.hidden = !isAdmin();
  if (els.adminQuickActions) els.adminQuickActions.hidden = !canManage;
  els.userView.hidden = canManage;
  if (els.workspaceTitle) els.workspaceTitle.textContent = canManage ? "Group Console" : "My Ledger";
  els.viewEyebrow.textContent = canManage ? `${state.role} Workspace` : "Flatmate Workspace";
  els.viewHeadline.textContent = isAdmin()
    ? "Track groups, bills, cash, payments, and settlement."
    : "See your balance, group expenses, and payment status.";
  els.signedInUser.textContent = state.user.fullName || state.user.contact;
  els.signedInRole.textContent = state.role || "No house role";
  if (els.menuGroupCount) els.menuGroupCount.textContent = String(state.memberships.length || 0);
  populateSettings();
}

function renderSummary(summary) {
  const cards = [
    ["Group", summary.house?.name || "Unknown"],
    ["Total Expenses", money(summary.totalExpensesMinor)],
    ["Pending Expenses", money(summary.pendingExpenseMinor)],
    ["Collected", money(summary.totalCollectedMinor)],
    ["Pending", money(summary.totalPendingMinor)],
    ["Cash in Hand", money(summary.cashInHandMinor)],
  ];
  const html = cards.map(([label, value]) => `
    <div class="summary-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");

  if (els.dashboardSummaryCards) els.dashboardSummaryCards.innerHTML = html;
  if (els.summaryCards) els.summaryCards.innerHTML = html;
  if (els.userSummaryCards) els.userSummaryCards.innerHTML = html;
  els.collectedMetric.textContent = money(summary.totalCollectedMinor);
  els.pendingMetric.textContent = money(summary.totalPendingMinor);
  els.cashMetric.textContent = money(summary.cashInHandMinor);
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
  if (avatar && (avatar.startsWith("/avatars/") || avatar.startsWith("http://") || avatar.startsWith("https://"))) {
    return { imageUrl: avatar, label: `${memberLabel(member)} avatar`, className: "avatar-image" };
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
    return `<span class="avatar ${avatar.className}" title="${avatar.label}"><img src="${avatar.imageUrl}" alt="${avatar.label}" /></span>`;
  }
  return `<span class="avatar ${avatar.className}" title="${avatar.label}">${avatar.icon}</span>`;
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
  const activeMembers = members.filter((member) => member.status === "active");
  const options = activeMembers.map((member) => {
    const userId = member.userId || member.user_id;
    return `<option value="${userId}">${memberLabel(member)}</option>`;
  }).join("");

  els.managerPaidByUserId.innerHTML = options;
  els.managerSplitMembers.innerHTML = activeMembers.map((member) => {
    const userId = member.userId || member.user_id;
    return `
      <label>
        <input type="checkbox" name="splitMemberIds" value="${userId}" checked />
        <span>${memberLabel(member)}</span>
      </label>
    `;
  }).join("");

  const currentUserOption = activeMembers.find((member) => (member.userId || member.user_id) === state.user?.id);
  if (currentUserOption) {
    els.managerPaidByUserId.value = state.user.id;
  }

  const groupOptions = state.memberships.map((membership) => {
    const groupId = membership.houseId || membership.house_id;
    const groupName = membership.house?.name || groupId;
    return `<option value="${groupId}" ${groupId === state.houseId ? "selected" : ""}>${groupName}</option>`;
  }).join("");
  els.paymentGroupSelect.innerHTML = groupOptions;
  els.userPaymentGroupSelect.innerHTML = groupOptions;
  els.paymentPayerUserId.innerHTML = options;
  els.userPaymentPayerUserId.innerHTML = options;
  els.roleMemberUserId.innerHTML = options;
  els.paymentPayerUserId.value = state.user?.id || "";
  els.userPaymentPayerUserId.value = state.user?.id || "";
}

function renderDashboardRoster(members = []) {
  const balances = state.currentHouse?.balances || [];
  const balanceFor = (member) => balances.find((balance) => balance.userId === (member.userId || member.user_id))?.balanceMinor || 0;
  const activeMembers = members
    .filter((member) => member.status === "active")
    .sort((left, right) => balanceFor(left) - balanceFor(right));
  els.dashboardRoster.innerHTML = activeMembers.length
    ? activeMembers.map((member) => `
      <div class="avatar-card" data-tooltip="ID: ${member.userId || member.user_id} | Groups: ${state.memberships.length} | Balance: ${money(balanceFor(member))}">
        ${avatarMarkup(member)}
        <div>
          <strong>${memberLabel(member)}</strong>
          <span>${member.role} - ${money(balanceFor(member))}</span>
        </div>
      </div>
    `).join("")
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
  els.historyCount.textContent = `${history.length} events`;
  if (els.menuHistoryCount) els.menuHistoryCount.textContent = String(history.length);
  els.historyList.innerHTML = history.length
    ? history.slice(0, 12).map((entry) => {
        const actorName = entry.actor?.fullName || entry.actor?.contact || "System";
        const timestamp = entry.createdAt ? new Date(entry.createdAt).toLocaleString("en-PK") : "";
        return `
          <div class="ledger-item">
            <div class="ledger-item-top">
              <div>
                <strong>${entry.actionType || "activity"}</strong>
                <div class="list-item-meta">${actorName} - ${timestamp}</div>
              </div>
              <code>${entry.entityType || "event"}</code>
            </div>
          </div>
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
          <strong>${memberLabel(member) || balance.userId}</strong>
          <div class="list-item-meta">Member balance</div>
        </div>
        <strong class="${balance.balanceMinor >= 0 ? "positive" : "negative"}">${money(balance.balanceMinor)}</strong>
      </div>
    </div>
  `;
}

function renderBalances(balances = []) {
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
  els.expenseCount.textContent = `${expenses.length} total`;
  if (els.menuExpenseCount) els.menuExpenseCount.textContent = String(expenses.length);
  els.expenseList.innerHTML = expenses.length
    ? expenses.map((expense) => `
      <div class="ledger-item">
        <div class="ledger-item-top">
          <div>
            <strong>${expense.title}</strong>
            <div class="list-item-meta">${expense.expenseDate || ""} - ${expense.splitType} - ${expense.status}</div>
            <div class="list-item-meta">Expense ID: ${expense.id}</div>
            ${expense.payerContributions?.length ? `<div class="list-item-meta">Paid by ${expense.payerContributions.map((entry) => `${memberLabel(state.members.find((member) => (member.userId || member.user_id) === entry.userId))}: ${money(entry.amountMinor)}`).join(", ")}</div>` : ""}
          </div>
          <div class="expense-actions">
            <strong>${money(expense.amountMinor)}</strong>
            ${isManagement() && expense.status === "pending_approval" ? `
              <button type="button" data-approve-expense="${expense.id}">Approve</button>
              <button type="button" class="danger-btn" data-reject-expense="${expense.id}">Reject</button>
            ` : ""}
          </div>
        </div>
      </div>
    `).join("")
    : `<div class="ledger-item">No expenses yet.</div>`;
}

function renderPayments(payments = []) {
  els.paymentCount.textContent = `${payments.length} total`;
  if (els.menuPaymentCount) els.menuPaymentCount.textContent = String(payments.length);
  els.paymentList.innerHTML = payments.length
    ? payments.map((payment) => `
      <div class="ledger-item">
        <div class="ledger-item-top">
          <div>
            <strong>${payment.method}</strong>
            <div class="list-item-meta">${payment.confirmationStatus} - ${payment.paymentDate || ""}</div>
          </div>
          <strong>${money(payment.amountMinor)}</strong>
        </div>
      </div>
    `).join("")
    : `<div class="ledger-item">No payments yet.</div>`;
}

function renderDisputes(disputes = []) {
  els.disputeList.innerHTML = disputes.length
    ? disputes.map((dispute) => `
      <div class="ledger-item">
        <div class="ledger-item-top">
          <div>
            <strong>${dispute.reason}</strong>
            <div class="list-item-meta">${dispute.status} - ${dispute.expense?.title || "Expense"} - opened by ${dispute.openedByUser?.fullName || dispute.openedByUser?.contact || dispute.openedBy}</div>
            <div class="list-item-meta">Expense ID: ${dispute.expenseId}</div>
          </div>
          <code>${dispute.id}</code>
        </div>
      </div>
    `).join("")
    : `<div class="ledger-item">No disputes open.</div>`;
}

function renderSettlements(settlements = []) {
  els.settlementList.innerHTML = settlements.length
    ? settlements.map((settlement) => `
      <div class="ledger-item">
        <div class="ledger-item-top">
          <div>
            <strong>${settlement.periodStart} to ${settlement.periodEnd}</strong>
            <div class="list-item-meta">${settlement.algorithmVersion} - ${settlement.finalizedAt ? "finalized" : "open"}</div>
          </div>
          <code>${settlement.id}</code>
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
  const membership = currentMembership();
  state.role = membership?.role || null;
  setHouseId(membership ? membership.houseId || membership.house_id : "");
  setAppMode();
  await refreshHouse();
}

async function refreshHouse() {
  if (!state.token || !state.houseId) {
    if (els.houseSelect) {
      els.houseSelect.innerHTML = [
        `<option value="">Select group</option>`,
        ...state.memberships.map((membership) => {
          const houseId = membership.houseId || membership.house_id;
          const houseName = membership.house?.name || houseId;
          return `<option value="${houseId}">${houseName}</option>`;
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
    ...state.memberships.map((membership) => {
      const houseId = membership.houseId || membership.house_id;
      const houseName = membership.house?.name || houseId;
      return `<option value="${houseId}" ${houseId === state.houseId ? "selected" : ""}>${houseName}</option>`;
    }),
  ].join("");
}

async function refreshCurrentSession() {
  if (!state.token || document.hidden) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try {
      await hydrateSession();
    } catch (error) {
      showToast(error.message, "error");
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
      receiptUrl: form.receiptUrl.value || null,
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
      receiptUrl: form.receiptUrl.value || null,
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
      payerUserId: form.payerUserId.value,
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
  showToast("Password changed");
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

async function createDispute(form) {
  if (!state.houseId) throw new Error("Select or create a house first");
  await api(`/houses/${state.houseId}/disputes`, {
    method: "POST",
    body: {
      expenseId: form.expenseId.value,
      reason: form.reason.value,
    },
  });
  showToast("Dispute opened");
  await refreshHouse();
}

async function generateSettlement() {
  if (!state.houseId) throw new Error("Select or create a house first");
  await api(`/houses/${state.houseId}/settlements/generate`, { method: "POST", body: {} });
  showToast("Settlement generated");
  await refreshHouse();
}

function bindForm(id, handler, options = {}) {
  const form = document.getElementById(id);
  if (!form) return;
  const shouldReset = options.reset !== false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await handler(form);
      if (shouldReset) form.reset();
    } catch (error) {
      showToast(error.message, "error");
    }
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
bindForm("confirmPaymentForm", confirmPayment);
bindForm("disputeForm", createDispute);
bindForm("userDisputeForm", createDispute);

els.logoutBtn.addEventListener("click", () => {
  setToken("");
  setHouseId("");
  state.user = null;
  state.role = null;
  state.memberships = [];
  state.members = [];
  state.currentHouse = null;
  setAppMode();
});

els.sidebarDisplayBtn?.addEventListener("click", () => {
  setSidebarCollapsed(!state.sidebarCollapsed);
});

els.menuToggle?.addEventListener("click", () => {
  showSettingsPage("profile");
  els.settingsView?.scrollIntoView({ behavior: "smooth", block: "start" });
});

els.houseSelect.addEventListener("change", async () => {
  setHouseId(els.houseSelect.value);
  await refreshHouse();
});

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.getAttribute("data-jump");
    const targetMap = {
      dashboard: "dashboardView",
      groups: "adminHousePanel",
      members: "dashboardRoster",
      member: "memberForm",
      expense: isManagement() ? "expenseForm" : "userExpenseForm",
      payment: isManagement() ? "paymentForm" : "userPaymentForm",
      disputes: isManagement() ? "disputeForm" : "userDisputeForm",
      settlement: "settlementList",
      history: "historyList",
      settings: "settingsView",
    };
    document.getElementById(targetMap[key] || "dashboardView")?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.querySelectorAll(".menu-item").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
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

hydrateSession().catch((error) => {
  setToken("");
  setAppMode();
  showToast(error.message, "error");
});

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = button.parentElement.querySelector("input");
    const nextType = input.type === "password" ? "text" : "password";
    input.type = nextType;
    const icon = button.querySelector("img");
    const isVisible = nextType === "text";
    if (icon) {
      icon.src = isVisible ? "/icons/eye%20off.png" : "/icons/eye%20on.png";
    }
    button.setAttribute("aria-label", isVisible ? "Hide password" : "Show password");
  });
});

document.querySelectorAll('input[type="date"]').forEach((input) => {
  if (!input.value) input.value = today();
});

setSidebarCollapsed(state.sidebarCollapsed);

window.addEventListener("focus", refreshCurrentSession);
window.addEventListener("pageshow", refreshCurrentSession);
document.addEventListener("visibilitychange", refreshCurrentSession);

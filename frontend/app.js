const state = {
  token: localStorage.getItem("flatmateLedgerToken") || "",
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
  editExpenseId: $("#editExpenseId"),
  disputeExpenseId: $("#disputeExpenseId"),
  userDisputeExpenseId: $("#userDisputeExpenseId"),
  memberProfilePopover: $("#memberProfilePopover"),
  historyPreviewPopover: $("#historyPreviewPopover"),
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

function isPageAllowed(pageKey) {
  if (pageKey === "groups") return isAdmin();
  if (pageKey === "settlement") return isManagement();
  return true;
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
  if (els.menuGroupCount) els.menuGroupCount.textContent = String(state.memberships.length || 0);
  populateSettings();
  showAppPage(state.currentPage);
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

function populateExpenseSelectors(expenses = state.expenses) {
  const options = expenses.length
    ? expenses.map((expense) => `<option value="${expense.id}">${expenseLabel(expense)}</option>`).join("")
    : `<option value="">No expenses available</option>`;
  [els.editExpenseId, els.disputeExpenseId, els.userDisputeExpenseId].forEach((select) => {
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
  const avatar = avatarMeta(member);
  const avatarImage = avatar.imageUrl
    ? `<img src="${avatar.imageUrl}" alt="${avatar.label}" />`
    : `<span class="member-profile-fallback ${avatar.className}">${avatar.icon}</span>`;

  return `
    <div class="member-profile-card">
      <button type="button" class="member-profile-close" data-close-member-profile aria-label="Close">×</button>
      <div class="member-profile-head">
        <div class="member-profile-photo">${avatarImage}</div>
        <div>
          <strong>${memberLabel(member)}</strong>
          <span>${member.role || "flatmate"}</span>
        </div>
      </div>
      <div class="member-profile-stats">
        <div><span>Paid</span><strong>${money(paidTotal)}</strong></div>
        <div><span>Share</span><strong>${money(owedTotal)}</strong></div>
        <div><span>Net</span><strong class="${summary.balance >= 0 ? "positive" : "negative"}">${money(summary.balance)}</strong></div>
      </div>
      <div class="member-profile-section">
        <h4>Expenses Paid</h4>
        ${summary.paidExpenses.length ? summary.paidExpenses.slice(0, 5).map((expense) => `<p>${expenseLabel(expense)}</p>`).join("") : "<p>No paid expenses yet.</p>"}
      </div>
      <div class="member-profile-section">
        <h4>Debts & Credits</h4>
        ${[...summary.debtLines, ...summary.creditLines].length ? [...summary.debtLines, ...summary.creditLines].map((line) => `<p>${line}</p>`).join("") : "<p>Settled for now.</p>"}
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
      <div><span>${key}</span><strong>${typeof value === "object" ? JSON.stringify(value) : value}</strong></div>
    `).join("")
    : `<div><span>Details</span><strong>No extra details</strong></div>`;

  return `
    <div class="history-preview-card">
      <strong>${entry.actionType || "activity"}</strong>
      <p>${actorName} - ${timestamp}</p>
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
  } else if (activeMembers[0]) {
    els.managerPaidByUserId.value = activeMembers[0].userId || activeMembers[0].user_id;
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
  els.paymentPayerUserId.value = currentUserOption ? state.user.id : activeMembers[0]?.userId || activeMembers[0]?.user_id || "";
  els.userPaymentPayerUserId.value = currentUserOption ? state.user.id : activeMembers[0]?.userId || activeMembers[0]?.user_id || "";
}

function renderDashboardRoster(members = []) {
  const balances = state.currentHouse?.balances || [];
  const balanceFor = (member) => balances.find((balance) => balance.userId === (member.userId || member.user_id))?.balanceMinor || 0;
  const activeMembers = members
    .filter((member) => member.status === "active")
    .sort((left, right) => balanceFor(left) - balanceFor(right));
  els.dashboardRoster.innerHTML = activeMembers.length
    ? activeMembers.map((member) => `
      <button type="button" class="avatar-card" data-member-profile="${member.userId || member.user_id}" aria-label="View ${memberLabel(member)} profile">
        ${avatarMarkup(member)}
        <div>
          <strong>${memberLabel(member)}</strong>
          <span>${member.role} - ${money(balanceFor(member))}</span>
        </div>
      </button>
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
  state.history = history;
  els.historyCount.textContent = `${history.length} events`;
  if (els.menuHistoryCount) els.menuHistoryCount.textContent = String(history.length);
  els.historyList.innerHTML = history.length
    ? history.map((entry, index) => {
        const actorName = entry.actor?.fullName || entry.actor?.contact || "System";
        const timestamp = entry.createdAt ? new Date(entry.createdAt).toLocaleString("en-PK") : "";
        const metadata = entry.metadata && Object.keys(entry.metadata).length
          ? Object.entries(entry.metadata).map(([key, value]) => `
            <div class="history-detail-row">
              <span>${key}</span>
              <strong>${typeof value === "object" ? JSON.stringify(value) : value}</strong>
            </div>
          `).join("")
          : `<div class="history-detail-row"><span>Details</span><strong>No extra details</strong></div>`;
        return `
          <details class="ledger-item history-item" data-history-index="${index}">
            <summary class="ledger-item-top">
              <div>
                <strong>${entry.actionType || "activity"}</strong>
                <div class="list-item-meta">${actorName} - ${timestamp}</div>
              </div>
              <span class="status-pill">${entry.entityType || "event"}</span>
            </summary>
            <div class="history-detail">
              <div class="history-detail-row"><span>Actor</span><strong>${actorName}</strong></div>
              <div class="history-detail-row"><span>Action</span><strong>${entry.actionType || "activity"}</strong></div>
              <div class="history-detail-row"><span>Type</span><strong>${entry.entityType || "event"}</strong></div>
              <div class="history-detail-row"><span>Time</span><strong>${timestamp || "Unknown"}</strong></div>
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
          <strong>${memberLabel(member) || "Member"}</strong>
          <div class="list-item-meta">Member balance</div>
        </div>
        <strong class="${balance.balanceMinor >= 0 ? "positive" : "negative"}">${money(balance.balanceMinor)}</strong>
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
  state.expenses = expenses;
  populateExpenseSelectors(expenses);
  els.expenseCount.textContent = `${expenses.length} total`;
  if (els.menuExpenseCount) els.menuExpenseCount.textContent = String(expenses.length);
  els.expenseList.innerHTML = expenses.length
    ? expenses.map((expense) => `
      <div class="ledger-item">
        <div class="ledger-item-top">
          <div>
            <strong>${expense.title}</strong>
            <div class="list-item-meta">${expense.expenseDate || ""} - ${expense.splitType} - ${expense.status}</div>
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
  state.payments = payments;
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
          <div class="expense-actions">
            <strong>${money(payment.amountMinor)}</strong>
            ${isManagement() && payment.confirmationStatus === "pending" ? `
              <button type="button" data-approve-payment="${payment.id}">Approve</button>
              <button type="button" class="danger-btn" data-reject-payment="${payment.id}">Reject</button>
            ` : ""}
          </div>
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
          </div>
          <span class="status-pill">${dispute.status}</span>
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
  state.isGlobalAdmin = false;
  state.currentPage = "dashboard";
  setAppMode();
});

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

hydrateSession().catch((error) => {
  setToken("");
  setAppMode();
  showToast(error.message, "error");
});

document.querySelectorAll('input[type="date"]').forEach((input) => {
  if (!input.value) input.value = today();
});

setSidebarCollapsed(state.sidebarCollapsed);

window.addEventListener("focus", refreshCurrentSession);
window.addEventListener("pageshow", refreshCurrentSession);
document.addEventListener("visibilitychange", refreshCurrentSession);

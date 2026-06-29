const state = {
  token: localStorage.getItem("flatmateLedgerToken") || "",
  houseId: localStorage.getItem("flatmateLedgerHouseId") || "",
  user: null,
  role: null,
  memberships: [],
  members: [],
  currentHouse: null,
};

const $ = (selector) => document.querySelector(selector);

const els = {
  loginView: $("#loginView"),
  appView: $("#appView"),
  adminView: $("#adminView"),
  userView: $("#userView"),
  adminHousePanel: $("#adminHousePanel"),
  adminQuickActions: $("#adminQuickActions"),
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
  managerHostUserId: $("#managerHostUserId"),
  managerSplitMembers: $("#managerSplitMembers"),
  generateSettlementBtn: $("#generateSettlementBtn"),
  refreshSettlementBtn: $("#refreshSettlementBtn"),
  toast: $("#toast"),
};

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
  const headers = new Headers(options.headers || {});
  headers.set("content-type", "application/json");
  if (state.token) headers.set("authorization", `Bearer ${state.token}`);

  const response = await fetch(path, {
    ...options,
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
  els.houseSelect.value = state.houseId;
}

function setAppMode() {
  const signedIn = Boolean(state.token && state.user);
  els.loginView.hidden = signedIn;
  els.appView.hidden = !signedIn;
  if (!signedIn) return;

  const admin = isManagement();
  els.adminView.hidden = !admin;
  els.adminHousePanel.hidden = !admin;
  els.adminQuickActions.hidden = !admin;
  els.userView.hidden = admin;
  els.workspaceTitle.textContent = admin ? "Management Console" : "My Ledger";
  els.viewEyebrow.textContent = admin ? `${state.role} Workspace` : "Flatmate Workspace";
  els.viewHeadline.textContent = admin
    ? "Track bills, cash, payments, and settlement."
    : "See your balance, house expenses, and payment status.";
  els.signedInUser.textContent = state.user.fullName || state.user.contact;
  els.signedInRole.textContent = state.role || "No house role";
}

function renderSummary(summary) {
  const cards = [
    ["House", summary.house?.name || "Unknown"],
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

  els.dashboardSummaryCards.innerHTML = html;
  els.summaryCards.innerHTML = html;
  els.userSummaryCards.innerHTML = html;
  els.collectedMetric.textContent = money(summary.totalCollectedMinor);
  els.pendingMetric.textContent = money(summary.totalPendingMinor);
  els.cashMetric.textContent = money(summary.cashInHandMinor);
  els.houseName.textContent = summary.house?.name || "No house selected";
  els.userHouseName.textContent = summary.house?.name || "No house selected";
  els.balanceCount.textContent = `${summary.balances?.length || 0} open balances`;
}

function memberLabel(member) {
  if (!member) return "";
  const user = member?.user || {};
  return user.fullName || user.contact || member?.phoneDisplay || member?.userId || member?.user_id || "Member";
}

function avatarMeta(member) {
  const avatar = member?.user?.avatarUrl || member?.user?.avatar_url || "";
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
  els.managerHostUserId.innerHTML = `<option value="">Select host for guest split</option>${options}`;
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
}

function renderDashboardRoster(members = []) {
  const activeMembers = members.filter((member) => member.status === "active");
  els.dashboardRoster.innerHTML = activeMembers.length
    ? activeMembers.map((member) => `
      <div class="avatar-card">
        ${avatarMarkup(member)}
        <div>
          <strong>${memberLabel(member)}</strong>
          <span>${member.role}</span>
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
  els.memberList.innerHTML = members.length
    ? members.map((member) => `
      <div class="list-item">
        <div class="list-item-top">
          <div>
            <div class="member-inline">${avatarMarkup(member)}<strong>${memberLabel(member)}</strong></div>
            <div class="list-item-meta">${member.role} - ${member.status}</div>
          </div>
          <code>${member.user_id || member.userId}</code>
        </div>
      </div>
    `).join("")
    : `<div class="list-item">No members yet.</div>`;
}

function renderHistory(history = []) {
  els.historyCount.textContent = `${history.length} events`;
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
      const value = valueScale === "minor" ? Math.trunc(numericValue) : numericValue;
      return { userId, [valueKey]: value };
    });
}

function selectedSplitMemberIds(form) {
  return [...form.querySelectorAll('input[name="splitMemberIds"]:checked')].map((input) => input.value);
}

function renderExpenses(expenses = []) {
  els.expenseCount.textContent = `${expenses.length} total`;
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
  els.paymentCount.textContent = `${payments.length} total`;
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
            <div class="list-item-meta">${dispute.status} - ${dispute.expenseId}</div>
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

  if (!state.houseId && membership) {
    setHouseId(membership.houseId || membership.house_id);
  }
  setAppMode();
  await refreshHouse();
}

async function refreshHouse() {
  if (!state.token || !state.houseId) return;

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
    `<option value="">Select house</option>`,
    ...state.memberships.map((membership) => {
      const houseId = membership.houseId || membership.house_id;
      const houseName = membership.house?.name || houseId;
      return `<option value="${houseId}" ${houseId === state.houseId ? "selected" : ""}>${houseName}</option>`;
    }),
  ].join("");
}

async function createUser(form) {
  await api("/admin/users", {
    method: "POST",
    body: {
      fullName: form.fullName.value,
      contact: form.contact.value,
      password: form.password.value,
      role: form.role.value,
      setupKey: form.setupKey.value || null,
    },
  });
  showToast("Account created. It can log in now.");
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
  showToast("House created");
}

async function addMember(form) {
  if (!state.houseId) throw new Error("Select or create a house first");
  await api(`/houses/${state.houseId}/members`, {
    method: "POST",
    body: {
      role: form.role.value,
      user: {
        fullName: form.fullName.value,
        contact: form.contact.value,
      },
    },
  });
  showToast("Member added");
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
    ? parseLines(form.payerContributions.value, "amountMinor", { valueScale: "minor" })
    : [];

  await api(`/houses/${state.houseId}/expenses`, {
    method: "POST",
    body: {
      title: form.title.value,
      amountMinor: Number(form.amountMinor.value),
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
      hostUserId: form.hostUserId.value || null,
      guestShareMinor: Number(form.guestShareMinor.value || 0),
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
      title: form.title.value,
      amountMinor: Number(form.amountMinor.value),
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
  if (!state.houseId) throw new Error("Select or create a house first");
  await api(`/houses/${state.houseId}/payments`, {
    method: "POST",
    body: {
      payerUserId: form.payerUserId.value,
      receiverUserId: form.receiverUserId.value,
      amountMinor: Number(form.amountMinor.value),
      method: form.method.value,
      proofUrl: form.proofUrl.value || null,
    },
  });
  showToast("Payment created");
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

function bindForm(id, handler) {
  const form = document.getElementById(id);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await handler(form);
      form.reset();
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

bindForm("createUserForm", createUser);
bindForm("loginForm", login);
bindForm("houseForm", createHouse);
bindForm("memberForm", addMember);
bindForm("expenseForm", createExpense);
bindForm("userExpenseForm", submitUserExpense);
bindForm("paymentForm", createPayment);
bindForm("confirmPaymentForm", confirmPayment);
bindForm("disputeForm", createDispute);

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

els.houseSelect.addEventListener("change", async () => {
  setHouseId(els.houseSelect.value);
  await refreshHouse();
});

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.getAttribute("data-jump");
    document.getElementById(
      key === "expense" ? "expenseForm" : key === "payment" ? "paymentForm" : "memberForm",
    )?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
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

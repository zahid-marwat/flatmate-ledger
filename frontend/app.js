const state = {
  token: localStorage.getItem("flatmateLedgerToken") || "",
  houseId: localStorage.getItem("flatmateLedgerHouseId") || "",
  currentHouse: null,
};

const $ = (selector) => document.querySelector(selector);

const els = {
  tokenState: $("#tokenState"),
  houseSelect: $("#houseSelect"),
  houseName: $("#houseName"),
  collectedMetric: $("#collectedMetric"),
  pendingMetric: $("#pendingMetric"),
  cashMetric: $("#cashMetric"),
  summaryCards: $("#summaryCards"),
  memberList: $("#memberList"),
  balanceList: $("#balanceList"),
  expenseList: $("#expenseList"),
  paymentList: $("#paymentList"),
  disputeList: $("#disputeList"),
  settlementList: $("#settlementList"),
  memberCount: $("#memberCount"),
  balanceCount: $("#balanceCount"),
  expenseCount: $("#expenseCount"),
  paymentCount: $("#paymentCount"),
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
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with ${response.status}`);
  }
  return payload;
}

async function loadDisputes() {
  if (!state.houseId) return [];
  const result = await api(`/houses/${state.houseId}/disputes`);
  return result.disputes || [];
}

async function loadSettlements() {
  if (!state.houseId) return [];
  const result = await api(`/houses/${state.houseId}/settlements`);
  return result.settlements || [];
}

function setToken(token) {
  state.token = token;
  localStorage.setItem("flatmateLedgerToken", token);
  els.tokenState.textContent = token ? token : "Not signed in";
}

function setHouseId(houseId) {
  state.houseId = houseId;
  localStorage.setItem("flatmateLedgerHouseId", houseId);
  els.houseSelect.value = houseId;
}

function renderSummary(summary) {
  const cards = [
    ["House", summary.house?.name || "Unknown"],
    ["Collected", money(summary.totalCollectedMinor)],
    ["Pending", money(summary.totalPendingMinor)],
    ["Cash in Hand", money(summary.cashInHandMinor)],
  ];

  els.summaryCards.innerHTML = cards
    .map(([label, value]) => `
      <div class="summary-card">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `)
    .join("");

  els.collectedMetric.textContent = money(summary.totalCollectedMinor);
  els.pendingMetric.textContent = money(summary.totalPendingMinor);
  els.cashMetric.textContent = money(summary.cashInHandMinor);
  els.houseName.textContent = summary.house?.name || "No house selected";
  els.balanceCount.textContent = `${summary.balances?.length || 0} open balances`;
}

function renderMembers(members = []) {
  els.memberCount.textContent = String(members.length);
  els.memberList.innerHTML = members.length
    ? members.map((member) => `
      <div class="list-item">
        <div class="list-item-top">
          <div>
            <strong>${member.user_id || member.userId}</strong>
            <div class="list-item-meta">${member.role} - ${member.status}</div>
          </div>
          <code>${member.user_id || member.userId}</code>
        </div>
      </div>
    `).join("")
    : `<div class="list-item">No members yet.</div>`;
}

function renderBalances(balances = []) {
  els.balanceList.innerHTML = balances.length
    ? balances.map((balance) => `
      <div class="ledger-item">
        <div class="ledger-item-top">
          <div>
            <strong>${balance.userId}</strong>
            <div class="list-item-meta">Member balance</div>
          </div>
          <strong class="${balance.balanceMinor >= 0 ? "positive" : "negative"}">${money(balance.balanceMinor)}</strong>
        </div>
      </div>
    `).join("")
    : `<div class="ledger-item">No open balances.</div>`;
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
          </div>
          <strong>${money(expense.amountMinor)}</strong>
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

async function refreshHouseList() {
  if (!state.token) return;
  await api("/me");

  if (state.houseId) {
    try {
      const summary = await api(`/houses/${state.houseId}`);
      state.currentHouse = summary;
      renderSummary(summary);
      renderBalances(summary.balances || []);

      const members = await api(`/houses/${state.houseId}/members`);
      renderMembers(members.members || []);

      const expenses = await api(`/houses/${state.houseId}/expenses`);
      renderExpenses(expenses.expenses || []);

      const payments = await api(`/houses/${state.houseId}/payments`);
      renderPayments(payments.payments || []);

      renderDisputes(await loadDisputes());
      renderSettlements(await loadSettlements());
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  els.houseSelect.innerHTML = [
    `<option value="">Select house</option>`,
    state.houseId ? `<option value="${state.houseId}" selected>${state.houseId}</option>` : "",
  ].join("");
}

async function requestOtp(form) {
  const result = await api("/auth/request-otp", {
    method: "POST",
    body: {
      contact: form.contact.value,
      fullName: form.fullName.value || null,
    },
  });
  if (result.provider === "supabase") {
    showToast("OTP requested from Supabase Auth");
  } else {
    showToast(`OTP sent. Dev code: ${result.devCode}`);
  }
}

async function verifyOtp(form) {
  const result = await api("/auth/verify-otp", {
    method: "POST",
    body: {
      contact: form.contact.value,
      code: form.code.value,
    },
  });
  setToken(result.token);
  showToast("Session established");
  await refreshHouseList();
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
  showToast("House created");
  await refreshHouseList();
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
  const members = await api(`/houses/${state.houseId}/members`);
  renderMembers(members.members || []);
}

async function createExpense(form) {
  if (!state.houseId) throw new Error("Select or create a house first");

  await api(`/houses/${state.houseId}/expenses`, {
    method: "POST",
    body: {
      title: form.title.value,
      amountMinor: Number(form.amountMinor.value),
      expenseDate: form.expenseDate.value,
      splitType: form.splitType.value,
      note: form.note.value,
      receiptUrl: form.receiptUrl.value || null,
      requiresApproval: true,
    },
  });

  showToast("Expense created");
  const summary = await api(`/houses/${state.houseId}`);
  renderSummary(summary);
  renderBalances(summary.balances || []);
  const expenses = await api(`/houses/${state.houseId}/expenses`);
  renderExpenses(expenses.expenses || []);
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
  const payments = await api(`/houses/${state.houseId}/payments`);
  renderPayments(payments.payments || []);
}

async function confirmPayment(form) {
  if (!state.houseId) throw new Error("Select or create a house first");

  await api(`/houses/${state.houseId}/payments/confirm`, {
    method: "POST",
    body: {
      paymentId: form.paymentId.value,
    },
  });

  showToast("Payment confirmed");
  const summary = await api(`/houses/${state.houseId}`);
  renderSummary(summary);
  renderBalances(summary.balances || []);
  const payments = await api(`/houses/${state.houseId}/payments`);
  renderPayments(payments.payments || []);
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
  renderDisputes(await loadDisputes());
}

async function generateSettlement() {
  if (!state.houseId) throw new Error("Select or create a house first");

  await api(`/houses/${state.houseId}/settlements/generate`, {
    method: "POST",
    body: {},
  });

  showToast("Settlement generated");
  renderSettlements(await loadSettlements());
}

async function refreshSettlements() {
  if (!state.houseId) throw new Error("Select or create a house first");
  renderSettlements(await loadSettlements());
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

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.getAttribute("data-jump");
    document.getElementById(
      key === "expense" ? "expenseForm" : key === "payment" ? "paymentForm" : "memberForm",
    )?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
});

els.houseSelect.addEventListener("change", async () => {
  if (!els.houseSelect.value) return;
  setHouseId(els.houseSelect.value);
  await refreshHouseList();
});

bindForm("otpForm", requestOtp);
bindForm("verifyForm", verifyOtp);
bindForm("houseForm", createHouse);
bindForm("memberForm", addMember);
bindForm("expenseForm", createExpense);
bindForm("paymentForm", createPayment);
bindForm("confirmPaymentForm", confirmPayment);
bindForm("disputeForm", createDispute);

els.generateSettlementBtn.addEventListener("click", async () => {
  try {
    await generateSettlement();
  } catch (error) {
    showToast(error.message, "error");
  }
});

els.refreshSettlementBtn.addEventListener("click", async () => {
  try {
    await refreshSettlements();
  } catch (error) {
    showToast(error.message, "error");
  }
});

if (state.token) {
  setToken(state.token);
}

if (state.houseId) {
  setHouseId(state.houseId);
}

refreshHouseList().catch((error) => showToast(error.message, "error"));


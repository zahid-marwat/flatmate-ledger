import { ApiError } from "../errors.js";
import { createId } from "../id.js";

function hasManagementRole(store, houseId, userId) {
  const member = store.houseMembers.get(`${houseId}:${userId}`);
  return ["admin", "manager"].includes(member?.role) && member.status === "active";
}

function assertHouseMember(store, houseId, userId) {
  const member = store.houseMembers.get(`${houseId}:${userId}`);
  if (!member || member.status !== "active") {
    throw new ApiError(403, "House membership required");
  }
  return member;
}

export function createPaymentService(store, logActivity, expenseService, persistence) {
  return {
    async createPayment({ houseId, actorUserId, payload }) {
      assertHouseMember(store, houseId, actorUserId);

      const amountMinor = Math.trunc(Number(payload.amountMinor));
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        throw new ApiError(400, "amountMinor must be a positive integer");
      }

      assertHouseMember(store, houseId, payload.payerUserId);
      if (!payload.receiverUserId) {
        throw new ApiError(400, "receiverUserId is required");
      }
      assertHouseMember(store, houseId, payload.receiverUserId);
      const actorCanConfirm = hasManagementRole(store, houseId, actorUserId);

      const paymentId = createId();
      const payment = {
        id: paymentId,
        houseId,
        expenseId: payload.expenseId || null,
        payerUserId: payload.payerUserId,
        receiverUserId: payload.receiverUserId || null,
        amountMinor,
        currency: payload.currency || store.houses.get(houseId)?.baseCurrency || "PKR",
        method: payload.method || "cash",
        paymentDate: payload.paymentDate || new Date().toISOString().slice(0, 10),
        proofUrl: payload.proofUrl || null,
        confirmationStatus: actorCanConfirm ? "confirmed" : "pending",
        confirmedBy: actorCanConfirm ? actorUserId : null,
        confirmedAt: actorCanConfirm ? new Date().toISOString() : null,
        note: payload.note || null,
        createdAt: new Date().toISOString(),
      };

      store.payments.set(paymentId, payment);
      await persistence.savePayment(payment);
      if (payment.confirmationStatus === "confirmed" && payment.method === "cash") {
        await expenseService.recordPaymentConfirmation({
          houseId,
          actorUserId,
          payment,
          approved: true,
        });
      }
      logActivity(houseId, actorUserId, "payment.created", "payment", paymentId, { amountMinor, method: payment.method });
      return payment;
    },

    async confirmPayment({ houseId, actorUserId, paymentId }) {
      if (!hasManagementRole(store, houseId, actorUserId)) {
        throw new ApiError(403, "Only an admin or manager can confirm payments");
      }

      const payment = store.payments.get(paymentId);
      if (!payment || payment.houseId !== houseId) throw new ApiError(404, "Payment not found");

      const updated = {
        ...payment,
        confirmationStatus: "confirmed",
        confirmedBy: actorUserId,
        confirmedAt: new Date().toISOString(),
      };
      store.payments.set(paymentId, updated);
      await persistence.savePayment(updated);

      if (updated.method === "cash") {
        await expenseService.recordPaymentConfirmation({
          houseId,
          actorUserId,
          payment: updated,
          approved: true,
        });
      }

      logActivity(houseId, actorUserId, "payment.confirmed", "payment", paymentId, {});
      return updated;
    },

    async rejectPayment({ houseId, actorUserId, paymentId, reason }) {
      if (!hasManagementRole(store, houseId, actorUserId)) {
        throw new ApiError(403, "Only an admin or manager can reject payments");
      }

      const payment = store.payments.get(paymentId);
      if (!payment || payment.houseId !== houseId) throw new ApiError(404, "Payment not found");

      const updated = {
        ...payment,
        confirmationStatus: "rejected",
        confirmedBy: actorUserId,
        confirmedAt: new Date().toISOString(),
        rejectionReason: reason || null,
      };
      store.payments.set(paymentId, updated);
      await persistence.savePayment(updated);
      logActivity(houseId, actorUserId, "payment.rejected", "payment", paymentId, { reason });
      return updated;
    },

    listPayments(houseId) {
      return [...store.payments.values()].filter((payment) => payment.houseId === houseId);
    },
  };
}

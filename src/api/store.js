import { createId } from "./id.js";

export function createStore() {
  return {
    users: new Map(),
    usersByContact: new Map(),
    sessions: new Map(),
    otps: new Map(),
    houses: new Map(),
    houseMembers: new Map(),
    houseInvitations: new Map(),
    houseRules: new Map(),
    expenses: new Map(),
    expenseSplits: new Map(),
    payments: new Map(),
    cashLedger: new Map(),
    comments: new Map(),
    disputes: new Map(),
    settlements: new Map(),
    settlementLines: new Map(),
    activityLog: [],
    files: new Map(),
    createId,
  };
}

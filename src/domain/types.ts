export type CurrencyCode = string;

export type HouseRole = "manager" | "flatmate" | "viewer";

export type ExpenseSplitType =
  | "equal_all"
  | "equal_selected"
  | "percentage"
  | "unequal"
  | "guest_to_host";

export interface HouseMemberBalance {
  userId: string;
  displayName: string;
  balanceMinor: number;
  currency: CurrencyCode;
}

export interface SettlementTransfer {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  currency: CurrencyCode;
}


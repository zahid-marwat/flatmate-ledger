import { ApiError } from "./errors.js";

function toMinor(amount) {
  return Math.round(Number(amount) * 100);
}

function fromMinor(amountMinor) {
  return amountMinor / 100;
}

export function calculateExpenseSplits({
  amountMinor,
  splitType,
  paidByUserId,
  participantUserIds = [],
  selectedUserIds = [],
  percentageSplits = [],
  unequalSplits = [],
  guestShareMinor = 0,
  hostUserId = null,
  currency = "PKR",
}) {
  if (!paidByUserId) {
    throw new ApiError(400, "paidByUserId is required");
  }

  let targets = [];

  if (splitType === "equal_all") {
    targets = participantUserIds;
  } else if (splitType === "equal_selected") {
    targets = selectedUserIds;
  } else if (splitType === "percentage") {
    targets = percentageSplits.map((entry) => entry.userId);
  } else if (splitType === "unequal") {
    targets = unequalSplits.map((entry) => entry.userId);
  } else if (splitType === "guest_to_host") {
    targets = participantUserIds;
  } else {
    throw new ApiError(400, `Unsupported split type: ${splitType}`);
  }

  if (targets.length === 0) {
    throw new ApiError(400, "At least one participant is required");
  }

  const uniqueTargets = [...new Set(targets)];
  const splits = [];

  if (splitType === "equal_all" || splitType === "equal_selected") {
    const share = Math.floor(amountMinor / uniqueTargets.length);
    let remainder = amountMinor - share * uniqueTargets.length;

    uniqueTargets.forEach((userId) => {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder -= 1;
      splits.push({
        userId,
        owedAmountMinor: share + extra,
        splitMethod: splitType,
      });
    });
  }

  if (splitType === "percentage") {
    const totalPercent = percentageSplits.reduce((sum, entry) => sum + Number(entry.percent || 0), 0);
    if (Math.abs(totalPercent - 100) > 0.01) {
      throw new ApiError(400, "Percentage splits must total 100");
    }

    let allocated = 0;
    percentageSplits.forEach((entry, index) => {
      const raw = index === percentageSplits.length - 1
        ? amountMinor - allocated
        : Math.floor((amountMinor * Number(entry.percent)) / 100);
      allocated += raw;
      splits.push({
        userId: entry.userId,
        owedAmountMinor: raw,
        splitMethod: splitType,
      });
    });
  }

  if (splitType === "unequal") {
    const totalAssigned = unequalSplits.reduce((sum, entry) => sum + toMinor(entry.amount), 0);
    if (totalAssigned !== amountMinor) {
      throw new ApiError(400, "Unequal split amounts must equal the expense total");
    }

    unequalSplits.forEach((entry) => {
      splits.push({
        userId: entry.userId,
        owedAmountMinor: toMinor(entry.amount),
        splitMethod: splitType,
      });
    });
  }

  if (splitType === "guest_to_host") {
    if (!hostUserId) {
      throw new ApiError(400, "hostUserId is required for guest_to_host");
    }

    const guestChargeMinor = Math.max(0, Math.trunc(Number(guestShareMinor)));
    const houseShareMinor = amountMinor - guestChargeMinor;
    if (houseShareMinor < 0) {
      throw new ApiError(400, "Guest share cannot exceed the expense total");
    }

    const memberUserIds = participantUserIds.filter((userId) => userId !== hostUserId);
    const share = memberUserIds.length > 0 ? Math.floor(houseShareMinor / memberUserIds.length) : 0;
    let remainder = houseShareMinor - share * memberUserIds.length;

    memberUserIds.forEach((userId) => {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder -= 1;
      splits.push({
        userId,
        owedAmountMinor: share + extra,
        splitMethod: splitType,
      });
    });

    splits.push({
      userId: hostUserId,
      owedAmountMinor: guestChargeMinor,
      splitMethod: splitType,
    });
  }

  const splitTotal = splits.reduce((sum, entry) => sum + entry.owedAmountMinor, 0);
  if (splitTotal !== amountMinor) {
    throw new ApiError(400, `Split total mismatch: expected ${amountMinor}, got ${splitTotal}`);
  }

  return splits.map((entry) => ({
    ...entry,
    amountMinor: entry.owedAmountMinor,
    currency,
    isPaidByUser: entry.userId === paidByUserId,
  }));
}

export function toMoneyMinor(amount) {
  return toMinor(amount);
}

export function fromMoneyMinor(amountMinor) {
  return fromMinor(amountMinor);
}


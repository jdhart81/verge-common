// Receipt totals describe recorded external activity, never a live bank balance.
// Historical allocations may have no disbursements array.
const bucket = (allocatedCents, receipts) => {
  const reviewedReceiptCents = receipts
    .filter((receipt) => receipt.status === 'reviewed')
    .reduce((sum, receipt) => sum + receipt.cents, 0);
  const pendingReceiptCents = receipts
    .filter((receipt) => receipt.status === 'submitted')
    .reduce((sum, receipt) => sum + receipt.cents, 0);
  return {
    allocatedCents,
    reviewedReceiptCents,
    pendingReceiptCents,
    remainingUnrecordedCents:
      allocatedCents - reviewedReceiptCents - pendingReceiptCents,
  };
};

export function allocationReconciliation(allocation) {
  const disbursements = allocation.disbursements ?? [];
  const stewardship = bucket(
    allocation.amounts.stewardshipCents,
    disbursements.filter((receipt) => receipt.budget === 'stewardship'),
  );
  const treasury = bucket(
    allocation.amounts.treasuryCents,
    disbursements.filter((receipt) => receipt.budget === 'treasury'),
  );
  const memberPool = bucket(
    allocation.amounts.memberPoolCents,
    allocation.payments ?? [],
  );
  const total = {
    allocatedCents: stewardship.allocatedCents + treasury.allocatedCents + memberPool.allocatedCents,
    reviewedReceiptCents: stewardship.reviewedReceiptCents + treasury.reviewedReceiptCents + memberPool.reviewedReceiptCents,
    pendingReceiptCents: stewardship.pendingReceiptCents + treasury.pendingReceiptCents + memberPool.pendingReceiptCents,
    remainingUnrecordedCents: stewardship.remainingUnrecordedCents + treasury.remainingUnrecordedCents + memberPool.remainingUnrecordedCents,
  };
  return { stewardship, treasury, memberPool, total };
}

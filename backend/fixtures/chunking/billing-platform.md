# Subscription upgrades

An upgrade takes effect immediately after the payment authorization succeeds. The account receives a prorated charge for the unused portion of the previous plan and the remaining portion of the new plan. The invoice records both the credit and the new line item so that support can explain the total.

When an upgrade payment fails, the account stays on its previous plan until the payment method is corrected. A failed upgrade does not silently grant the higher plan. Support should first inspect the payment error code, then ask the customer to update the stored payment method before retrying the upgrade.

The upgrade workflow is idempotent for a single request key. Retrying the same request key returns the original billing operation instead of creating a second charge. A new request key starts a separate operation and must be used only after the first operation has been confirmed as failed.

## Refund handling

Duplicate-charge reports are eligible for review for 30 calendar days after the charge appears. The reviewer checks the invoice ID, payment provider reference, and account history before approving a refund. Refund approval does not automatically cancel an active subscription.

## Upgrade troubleshooting

The troubleshooting team owns payment failures during an upgrade. The billing team owns invoice corrections after a successful charge. These teams use different queues even though both queues may mention an upgrade in their title.

## Release notes

The 2026.08 release changed invoice presentation only. It did not change the proration calculation or the idempotency rules described above.

## Upgrade investigation notes

Support begins an upgrade investigation by recording the workspace, subscription identifier, request key, invoice identifier, and the UTC time of the customer report. These values let Billing compare the customer-visible invoice with the internal operation log. The request key is especially important because a browser retry can occur after a network timeout even though the first operation is still processing. A support engineer should describe what the customer saw, rather than assuming that a timeout means that the charge was reversed. The previous plan, requested plan, payment method state, and final operation state should be recorded as separate observations.

The invoice timeline is read from oldest to newest. First confirm whether authorization succeeded, then check whether the proration line item was created, and finally check whether the subscription transition was committed. An authorization without a committed transition is a payment investigation, while a committed transition with a missing line item is an invoice investigation. This distinction keeps the support queue focused and prevents a second retry from masking the original failure. If a duplicate operation appears, compare request keys before proposing a refund, because two different request keys may represent two intentional attempts rather than an accidental duplicate.

For a complete customer explanation, Support should state the previous plan, the requested plan, the authorization result, the invoice line items, and the next safe action. The next safe action after a failed authorization is to update the payment method and retry once. The next safe action after a successful authorization with an invoice display issue is to open an invoice-correction task. The next safe action after an already completed upgrade is not to submit another upgrade request. These statements are deliberately kept together in the investigation notes so a retrieved answer can include the condition and its corresponding action.

During a long-running investigation, the timeline may contain several customer reports, browser retries, payment-provider callbacks, and invoice refreshes that appear to describe the same upgrade. The investigator correlates each observation with the request key before deciding whether it is a new operation. A browser timeout is only a transport observation; it does not prove that authorization failed, that the subscription remained on the previous plan, or that a charge was reversed. The payment-provider result is the authority for authorization, the billing operation is the authority for the plan transition, and the invoice ledger is the authority for line items. When those authorities disagree, Support records the disagreement and routes it to Billing instead of attempting another upgrade. The final note should preserve the sequence in plain language: the customer requested the higher plan, the system accepted or rejected authorization, the account either remained on the previous plan or transitioned, and the invoice either contains or lacks the expected prorated line. If authorization failed, the safe remediation is to update the stored payment method and retry the upgrade once after confirming the first operation is not still processing. If authorization succeeded but the invoice is incomplete, the safe remediation is an invoice-correction task. If the transition already completed, a second request is not a remediation. This sequence also helps a later reviewer distinguish a legitimate second attempt, identified by a new request key, from a duplicate charge caused by replaying the same request key. The investigation should end with the current subscription state, the invoice identifier, the payment-provider reference, the request key, the owner queue, and the next action so that the customer receives one consistent explanation even when the underlying logs are distributed across services.

import type { ICurrencyResponse } from "@badger/types";
import type { ToastMessageOptions } from "primevue/toast";
import type { ToastServiceMethods } from "primevue/toastservice";
import { formatCurrency } from "./currency";
import type { CashFollowup } from "./transactionForm";

/** Shows the "Moved X to <wallet> · Record a cash payment" toast (rendered by CashFollowupToast). */
export function showCashFollowupToast(
    toast: ToastServiceMethods,
    followup: CashFollowup,
    currencies: Pick<ICurrencyResponse, "id" | "code">[] | undefined,
) {
    const code = currencies?.find((c) => c.id === followup.currencyId)?.code;
    toast.add({
        group: "cash-followup",
        severity: "success",
        summary: `Moved ${formatCurrency(followup.amount, code)} to ${followup.accountName}`,
        data: followup,
        life: 8000,
    } as ToastMessageOptions & { data: CashFollowup });
}

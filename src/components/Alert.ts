export type AlertVariant = "info" | "error";

const VARIANT_TO_LABEL: Record<AlertVariant, string> = {
  info: "Information",
  error: "Error"
};

export const createAlert = (message: string, variant: AlertVariant = "info"): HTMLElement => {
  const alert = document.createElement("div");
  alert.className = `alert alert--${variant}`;
  alert.setAttribute("role", variant === "error" ? "alert" : "status");
  alert.setAttribute("aria-label", VARIANT_TO_LABEL[variant]);
  alert.textContent = message;
  return alert;
};

export const WHATSAPP_EMOJIS = {
  flor: "\u{1F338}",
  compras: "\u{1F6CD}\u{FE0F}",
  paquete: "\u{1F4E6}",
  tarjeta: "\u{1F4B3}",
  telefono: "\u{1F4F1}",
  efectivo: "\u{1F4B5}",
  entrega: "\u{1F69A}",
  ubicacion: "\u{1F4CD}",
  agradecimiento: "\u{1F49D}",
} as const;

const costaRicaCountryCode = "506";

export function normalizeWhatsAppPhone(phone: string): string | null {
  const trimmedPhone = phone.trim();
  if (!trimmedPhone || !/^\+?[\d\s().-]+$/.test(trimmedPhone)) return null;

  const hasInternationalPrefix = trimmedPhone.startsWith("+") || trimmedPhone.startsWith("00");
  let digits = trimmedPhone.replace(/\D/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("506506") && digits.length === 14) {
    digits = `${costaRicaCountryCode}${digits.slice(6)}`;
  }
  if (digits.length === 8 && !hasInternationalPrefix) {
    digits = `${costaRicaCountryCode}${digits}`;
  }

  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function createOrderWhatsAppMessage(
  orderNumber: string,
  items: readonly { quantity: number; product_name_snapshot: string }[],
): string {
  const productLines = items.map((item) => `• ${item.quantity} × ${item.product_name_snapshot}`).join("\n");

  return `${WHATSAPP_EMOJIS.flor} Muchas gracias por escribirnos y por tu interés en Alma Esencia CR.
Te compartimos nuestra información para que podás realizar tu compra:

${WHATSAPP_EMOJIS.paquete} Pedido: ${orderNumber}

${WHATSAPP_EMOJIS.compras} Productos:
${productLines}

${WHATSAPP_EMOJIS.tarjeta} Métodos de pago:
• SINPE Móvil ${WHATSAPP_EMOJIS.telefono}
• Efectivo ${WHATSAPP_EMOJIS.efectivo}

${WHATSAPP_EMOJIS.entrega} Entregas y envíos:
Somos de ${WHATSAPP_EMOJIS.ubicacion} Venecia de San Carlos, por lo que podés coordinar para retirar tu pedido personalmente. Si necesitás envío, también podemos coordinarlo; este tiene un costo adicional según el lugar de entrega.
${WHATSAPP_EMOJIS.agradecimiento} ¡Gracias por apoyar a Alma Esencia CR y ser parte de nuestra comunidad!`;
}

export function createWhatsAppUrl(phone: string, message: string): string | null {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  if (!normalizedPhone) return null;

  const url = new URL("https://api.whatsapp.com/send");
  url.searchParams.set("phone", normalizedPhone);
  url.searchParams.set("text", message);
  return url.toString();
}

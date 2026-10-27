import assert from "node:assert/strict";
import test from "node:test";
import {
  createOrderWhatsAppMessage,
  createWhatsAppUrl,
  normalizeWhatsAppPhone,
  WHATSAPP_EMOJIS,
} from "../src/lib/whatsapp.ts";

test("normalizes local Costa Rican and international numbers without duplicating 506", () => {
  assert.equal(normalizeWhatsAppPhone("8888-1234"), "50688881234");
  assert.equal(normalizeWhatsAppPhone("+506 8888-1234"), "50688881234");
  assert.equal(normalizeWhatsAppPhone("506 8888-1234"), "50688881234");
  assert.equal(normalizeWhatsAppPhone("00506 (8888) 1234"), "50688881234");
  assert.equal(normalizeWhatsAppPhone("+506 506 8888-1234"), "50688881234");
  assert.equal(normalizeWhatsAppPhone("+1 (650) 555-1234"), "16505551234");
});

test("rejects phone numbers that cannot safely form a WhatsApp destination", () => {
  assert.equal(normalizeWhatsAppPhone(""), null);
  assert.equal(normalizeWhatsAppPhone("123"), null);
  assert.equal(normalizeWhatsAppPhone("8888-ABCD"), null);
  assert.equal(normalizeWhatsAppPhone("1234567890123456"), null);
  assert.equal(createWhatsAppUrl("invalid", "Hola"), null);
});

test("keeps order details, commercial terms, Unicode and line breaks in the generated message", () => {
  const message = createOrderWhatsAppMessage("AE-000025", [
    { quantity: 1, product_name_snapshot: "Anillo Corazón Plateado" },
    { quantity: 2, product_name_snapshot: "Vela artesanal" },
  ]);

  assert.ok(message.includes("AE-000025"));
  assert.ok(message.includes("1 × Anillo Corazón Plateado"));
  assert.ok(message.includes("2 × Vela artesanal"));
  assert.ok(message.includes("SINPE Móvil"));
  assert.ok(message.includes("Efectivo"));
  assert.ok(message.includes("Venecia de San Carlos"));
  assert.ok(message.includes("costo adicional según el lugar de entrega"));
  assert.ok(message.includes("\n"));
  assert.equal(message.includes("\uFFFD"), false);

  for (const emoji of Object.values(WHATSAPP_EMOJIS)) {
    assert.ok(message.includes(emoji));
  }
});

test("creates api.whatsapp.com links that decode exactly once", () => {
  const message = `${createOrderWhatsAppMessage("AE-000026", [{ quantity: 1, product_name_snapshot: "Producto" }])}\n₡1 250,50 & # + % áéíóú ñ`;
  const link = createWhatsAppUrl("8888 1234", message);
  assert.ok(link);

  const url = new URL(link);
  assert.equal(url.origin, "https://api.whatsapp.com");
  assert.equal(url.pathname, "/send");
  assert.equal(url.searchParams.get("phone"), "50688881234");
  assert.equal(url.searchParams.get("text"), message);
  assert.ok(url.searchParams.get("text")?.includes("₡1 250,50 & # + % áéíóú ñ"));
});

test("preserves long WhatsApp messages", () => {
  const longMessage = `Pedido AE-000027\n${"Detalle con ñ, ₡ y 🌸. ".repeat(500)}`;
  const link = createWhatsAppUrl("+506 8888 1234", longMessage);
  assert.ok(link);
  assert.equal(new URL(link).searchParams.get("text"), longMessage);
});

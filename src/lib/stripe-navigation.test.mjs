import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStripeNavigation as normalize } from "./stripe-navigation.ts";

test("all Stripe marketing, docs, payment and demo destinations become local 404 paths", () => {
  for (const host of ["stripe.com", "www.stripe.com", "docs.stripe.com", "support.stripe.com", "buy.stripe.com", "checkout.stripe.com", "billing.stripe.com", "connect.stripe.com", "example.stripedemos.com", "stripe.link", "link.com"]) {
    assert.equal(normalize(`https://${host}/example?return=https://stripe.com#jump`), `/unavailable/stripe/${host}/example`);
  }
});
test("local login/signup replace dashboard authentication, without forwarding external return URLs", () => {
  for (const value of ["https://dashboard.stripe.com/login", "https://dashboard.stripe.com/signin", "https://dashboard.stripe.com/login/oauth/google/init?redirect=https://stripe.com"]) assert.equal(normalize(value), "/login");
  for (const value of ["https://dashboard.stripe.com/register", "https://dashboard.stripe.com/signup?return_url=https://stripe.com"]) assert.equal(normalize(value), "/signup");
  assert.equal(normalize("https://dashboard.stripe.com/payments"), "/unavailable/stripe/dashboard.stripe.com/payments");
});
test("browser URL variants cannot retain an external Stripe destination", () => {
  for (const value of ["//stripe.com/docs", "\\\\stripe.com/docs", " HTTPS://STRIPE.COM/docs ", "https://stripe.com.:443/docs", "https://%73tripe.com/docs", "https%3A%2F%2Fstripe.com%2Fdocs", "%2F%2Fstripe.com%2Fdocs", "https://unrelated.com@stripe.com/docs", "https:\n//stripe.com/docs"]) {
    assert.equal(normalize(value), "/unavailable/stripe/stripe.com/docs", value);
  }
});
test("local routes and unrelated hosts retain their existing destinations", () => {
  for (const value of ["/", "/billing", "/payments/checkout?tab=one", "/personalize?section=run", "/login", "#pricing", "https://stripe.com.evil.example/docs", "https://stripecom.example", "https://github.com/stripe/stripe-node", "mailto:help@example.com"]) assert.equal(normalize(value), value);
});
test("policy is idempotent and encoded segments cannot become an external authority", () => {
  const value = normalize("https://docs.stripe.com/a%2fb/%2F%2Fevil.com?next=https://stripe.com");
  assert.equal(value, "/unavailable/stripe/docs.stripe.com/a%2Fb/%2F%2Fevil.com");
  assert.equal(normalize(value), value);
});

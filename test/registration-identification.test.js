const assert = require("node:assert/strict");
const test = require("node:test");
const { validateRegistrationIdentification } = require("../lib/registration-identification");

test("accepts a formatted Ghana Card number without a document upload", () => {
  assert.deepEqual(
    validateRegistrationIdentification("Ghana Card", " gha-123456789-0 ", false),
    { identificationNumber: "GHA-123456789-0" }
  );
});

test("requires a formatted number and rejects a Ghana Card upload", () => {
  assert.equal(
    validateRegistrationIdentification("Ghana Card", "GHA-123456789", false).error,
    "Enter a Ghana Card number in the format GHA-XXXXXXXXX-X."
  );
  assert.equal(
    validateRegistrationIdentification("Ghana Card", "GHA-123456789-0", true).error,
    "Enter the Ghana Card number instead of uploading a Ghana Card image."
  );
});

test("requires an uploaded document for other identification types", () => {
  assert.equal(
    validateRegistrationIdentification("Birth certificate", "", false).error,
    "Upload the selected identification document."
  );
  assert.deepEqual(
    validateRegistrationIdentification("Health insurance", "", true),
    { identificationNumber: "" }
  );
});

test("rejects identification data without a matching type", () => {
  assert.equal(
    validateRegistrationIdentification("", "GHA-123456789-0", false).error,
    "Choose an identification type before entering or uploading identification."
  );
});

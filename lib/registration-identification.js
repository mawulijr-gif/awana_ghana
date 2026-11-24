const validIdentificationTypes = new Set(["Ghana Card", "Birth certificate", "Health insurance", "Passport"]);

function normalizeGhanaCardNumber(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^GHA-[0-9]{9}-[0-9]$/.test(normalized) ? normalized : null;
}

function validateRegistrationIdentification(type, rawNumber, hasDocument) {
  if (type && !validIdentificationTypes.has(type)) {
    return { error: "Choose a valid identification type." };
  }
  if (type === "Ghana Card") {
    if (hasDocument) {
      return { error: "Enter the Ghana Card number instead of uploading a Ghana Card image." };
    }
    const identificationNumber = normalizeGhanaCardNumber(rawNumber);
    if (!identificationNumber) {
      return { error: "Enter a Ghana Card number in the format GHA-XXXXXXXXX-X." };
    }
    return { identificationNumber };
  }
  if (type) {
    if (rawNumber) {
      return { error: "A Ghana Card number can only be entered when Ghana Card is selected." };
    }
    if (!hasDocument) {
      return { error: "Upload the selected identification document." };
    }
    return { identificationNumber: "" };
  }
  if (hasDocument || rawNumber) {
    return { error: "Choose an identification type before entering or uploading identification." };
  }
  return { identificationNumber: "" };
}

module.exports = { validateRegistrationIdentification };

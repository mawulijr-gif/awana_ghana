const menuButton = document.querySelector(".menu-button");
const nav = document.querySelector(".nav");
menuButton?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(open));
});
document.querySelectorAll(".nav a").forEach(link => link.addEventListener("click", () => {
  nav.classList.remove("open");
  menuButton?.setAttribute("aria-expanded", "false");
}));

function renderManagedHeading(element, value) {
  const [before, after] = value.split("|", 2);
  element.replaceChildren(document.createTextNode(before));
  if (after !== undefined) {
    const accent = document.createElement("em");
    accent.textContent = after;
    element.append(accent);
  }
}

function renderManagedItems(items) {
  const programmes = items.filter(item => item.type === "programmes").sort((a, b) => a.sort_order - b.sort_order);
  const programmeGrid = document.querySelector("#programmeGrid");
  if (programmeGrid) {
    programmeGrid.innerHTML = programmes.map((item, index) => {
      const style = ["puggles", "cubbies", "sparks", "tt"][index % 4];
      return `<article class="programme-card ${style}">
        <span class="age">${escapeHtml(item.body || item.category)}</span><div class="programme-icon">${escapeHtml(item.title.slice(0, 3))}</div>
        <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>
        <a href="/programmes/${encodeURIComponent(item.slug)}" aria-label="Learn about ${escapeHtml(item.title)}">Explore <span>→</span></a>
      </article>`;
    }).join("") || '<p class="empty-state">Programme information will be added soon.</p>';
  }

  const events = items.filter(item => item.type === "events" && item.event_date).sort((a, b) => a.event_date.localeCompare(b.event_date));
  const eventGrid = document.querySelector("#eventGrid");
  if (eventGrid) {
    eventGrid.innerHTML = events.slice(0, 4).map(item => {
      const date = new Date(`${item.event_date}T00:00:00`);
      const day = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "2-digit" });
      const month = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
      const meta = [item.event_time, item.venue].filter(Boolean).join(" · ");
      return `<article class="event-card"><div class="date"><strong>${day}</strong><span>${month}</span></div><div>
        <small>${escapeHtml(meta || "Awana Clubs Ghana")}</small><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>
        ${item.link_url ? `<a class="text-link" href="${escapeHtml(item.link_url)}">More details <span>→</span></a>` : ""}
      </div></article>`;
    }).join("") || '<p class="empty-state">No events are scheduled right now. Please check back soon.</p>';
  }

  const resources = items.filter(item => item.type === "resources").sort((a, b) => a.sort_order - b.sort_order);
  const resourceList = document.querySelector(".resource-list");
  if (resourceList) {
    resourceList.innerHTML = resources.slice(0, 6).map((item, index) =>
      `<a href="${escapeHtml(item.link_url || "/resources")}"><span class="resource-no">${String(index + 1).padStart(2, "0")}</span><div><small>${escapeHtml(item.category)}</small><strong>${escapeHtml(item.title)}</strong></div><i>→</i></a>`
    ).join("") || '<p class="empty-state">Resources will be added soon.</p>';
  }

  const announcements = items.filter(item => item.type === "announcements");
  const banner = document.querySelector("#announcementBanner");
  if (banner) {
    const announcement = announcements[0];
    if (announcement) {
      banner.innerHTML = `${escapeHtml(announcement.title)}${announcement.summary ? ` — ${escapeHtml(announcement.summary)}` : ""}${announcement.link_url ? ` <a href="${escapeHtml(announcement.link_url)}">Learn more →</a>` : ""}`;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

async function loadManagedContent() {
  try {
    const response = await fetch("/api/site/content");
    if (!response.ok) throw new Error("Unable to load site content.");
    const { settings, items } = await response.json();
    document.querySelectorAll("[data-cms-key]").forEach(element => {
      const value = settings[element.dataset.cmsKey];
      if (typeof value === "string") element.textContent = value;
    });
    document.querySelectorAll("[data-cms-heading]").forEach(element => {
      const value = settings[element.dataset.cmsHeading];
      if (typeof value === "string") renderManagedHeading(element, value);
    });
    document.querySelectorAll("[data-cms-image]").forEach(element => {
      const value = settings[element.dataset.cmsImage];
      if (typeof value === "string" && value) element.src = value;
    });
    document.querySelectorAll("[data-cms-href]").forEach(element => {
      const value = settings[element.dataset.cmsHref];
      if (typeof value === "string" && (/^\//.test(value) || /^https?:\/\//i.test(value))) element.href = value;
    });
    const email = settings["contact.email"];
    document.querySelectorAll("[data-cms-email]").forEach(element => {
      if (email) {
        element.textContent = email;
        element.href = `mailto:${email}`;
      }
    });
    renderManagedItems(items);
  } catch (error) {
    console.error(error);
  }
}

async function submitJson(form, url, successMessage = "Thank you! Your submission has been received.") {
  const message = form.querySelector(".form-message");
  const data = Object.fromEntries(new FormData(form).entries());
  data.consent = form.elements.consent?.checked || false;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Please check your details.");
    message.textContent = successMessage;
    form.reset();
  } catch (error) {
    message.textContent = error.message;
  }
}

async function submitRegistration(form) {
  const message = form.querySelector(".form-message");
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const formData = new FormData(form);
    formData.delete("childPhotos");
    selectedPhotos.forEach(file => formData.append("childPhotos", file, file.name));
    formData.delete("childIdentification");
    if (selectedIdentification) formData.append("childIdentification", selectedIdentification, selectedIdentification.name);
    const response = await fetch("/api/registrations", {
      method: "POST",
      body: formData
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Please check your registration details.");
    message.textContent = "Thank you. The child registration has been received.";
    form.reset();
    resetPhotoSelection();
    selectedIdentification = null;
    updateIdentificationFields();
    identificationFeedback.textContent = "";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

const identificationInput = document.querySelector("#childIdentification");
const identificationFeedback = document.querySelector("#identificationFeedback");
const identificationTypeInput = document.querySelector("#childIdentificationType");
const identificationUpload = document.querySelector("#identificationUpload");
const identificationNumberField = document.querySelector("#ghanaCardNumberField");
const identificationNumberInput = document.querySelector("#childIdentificationNumber");
let selectedIdentification = null;

function updateIdentificationFields() {
  const type = identificationTypeInput.value;
  const isGhanaCard = type === "Ghana Card";
  const requiresDocument = type !== "" && !isGhanaCard;
  identificationNumberField.hidden = !isGhanaCard;
  identificationNumberInput.required = isGhanaCard;
  identificationUpload.hidden = !requiresDocument;
  identificationInput.required = requiresDocument;
}

if (identificationInput && identificationFeedback) {
  identificationInput.addEventListener("change", () => {
    const file = identificationInput.files[0] || null;
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    if (file && !allowedTypes.includes(file.type)) {
      identificationFeedback.textContent = "Use a JPG, PNG, GIF, WebP or PDF file.";
      selectedIdentification = null;
      identificationInput.value = "";
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      identificationFeedback.textContent = "The identification file must be 5 MB or smaller.";
      selectedIdentification = null;
      identificationInput.value = "";
      return;
    }
    selectedIdentification = file;
    identificationFeedback.textContent = file ? `Selected: ${file.name}` : "";
  });
}

if (identificationTypeInput && identificationInput && identificationFeedback &&
    identificationUpload && identificationNumberField && identificationNumberInput) {
  identificationTypeInput.addEventListener("change", () => {
    identificationInput.value = "";
    selectedIdentification = null;
    identificationNumberInput.value = "";
    identificationFeedback.textContent = "";
    updateIdentificationFields();
  });
  identificationNumberInput.addEventListener("input", () => {
    const start = identificationNumberInput.selectionStart;
    const end = identificationNumberInput.selectionEnd;
    const uppercaseValue = identificationNumberInput.value.toUpperCase();
    if (identificationNumberInput.value !== uppercaseValue) {
      identificationNumberInput.value = uppercaseValue;
      identificationNumberInput.setSelectionRange(start, end);
    }
  });
  updateIdentificationFields();
}

const photoInput = document.querySelector("#childPhotos");
const photoDropZone = document.querySelector("#photoDropZone");
const photoPreviewList = document.querySelector("#photoPreviewList");
const photoFeedback = document.querySelector("#photoFeedback");
let selectedPhotos = [];
let photoObjectUrls = [];

function renderPhotoPreviews() {
  photoObjectUrls.forEach(url => URL.revokeObjectURL(url));
  photoObjectUrls = [];
  photoPreviewList.replaceChildren();
  selectedPhotos.forEach((file, index) => {
    const card = document.createElement("div");
    card.className = "photo-preview";
    const image = document.createElement("img");
    image.src = URL.createObjectURL(file);
    image.alt = `Selected child photo ${index + 1}`;
    photoObjectUrls.push(image.src);
    const details = document.createElement("div");
    const name = document.createElement("span");
    name.textContent = file.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${file.name}`);
    remove.addEventListener("click", () => {
      selectedPhotos = selectedPhotos.filter((_, photoIndex) => photoIndex !== index);
      renderPhotoPreviews();
      photoFeedback.textContent = "";
    });
    details.append(name, remove);
    card.append(image, details);
    photoPreviewList.append(card);
  });
}

function addSelectedPhotos(files, append) {
  const incoming = Array.from(files);
  const next = append ? [...selectedPhotos, ...incoming] : incoming;
  const unique = next.filter((file, index) =>
    next.findIndex(candidate => candidate.name === file.name && candidate.size === file.size && candidate.lastModified === file.lastModified) === index
  );
  if (unique.length > 3) {
    photoFeedback.textContent = "Choose no more than 3 photos.";
    return;
  }
  if (unique.some(file => !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type))) {
    photoFeedback.textContent = "Use JPG, PNG, GIF or WebP image files.";
    return;
  }
  if (unique.some(file => file.size > 5 * 1024 * 1024)) {
    photoFeedback.textContent = "Each photo must be 5 MB or smaller.";
    return;
  }
  selectedPhotos = unique;
  photoFeedback.textContent = "";
  renderPhotoPreviews();
}

function resetPhotoSelection() {
  selectedPhotos = [];
  photoInput.value = "";
  photoFeedback.textContent = "";
  renderPhotoPreviews();
}

if (photoInput && photoDropZone) {
  photoInput.addEventListener("change", () => addSelectedPhotos(photoInput.files, false));
  photoDropZone.addEventListener("dragover", event => {
    event.preventDefault();
    photoDropZone.classList.add("drag-over");
  });
  photoDropZone.addEventListener("dragleave", () => photoDropZone.classList.remove("drag-over"));
  photoDropZone.addEventListener("drop", event => {
    event.preventDefault();
    photoDropZone.classList.remove("drag-over");
    addSelectedPhotos(event.dataTransfer.files, true);
  });
}

document.addEventListener("submit", event => {
  const form = event.target;
  if (form.matches("#contactForm")) {
    event.preventDefault();
    submitJson(form, "/api/enquiries");
  } else if (form.matches("#newsletterForm")) {
    event.preventDefault();
    submitJson(form, "/api/newsletter");
  } else if (form.matches("#registrationForm")) {
    event.preventDefault();
    submitRegistration(form);
  }
});

const dateOfBirthInput = document.querySelector("#childDateOfBirth");
if (dateOfBirthInput) dateOfBirthInput.max = new Date().toISOString().slice(0, 10);

loadManagedContent();

"use strict";

/* =========================================================
   EGIVEAWAYS — PUBLIC ENTRY PAGE
   Standalone script for entry.html
   Talks to the same backend as the main app.
========================================================= */


/* =========================================================
   CONFIG
========================================================= */

const ENTRY_API_BASE = "/api";


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = (selector) =>
  document.querySelector(selector);

const $$ = (selector) =>
  [...document.querySelectorAll(selector)];


/* =========================================================
   STATE
========================================================= */

let entryForm = null;

let isSubmitting = false;

let hasSubmitted = false;

let statusTimer = null;


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   GET FORM ID FROM URL
========================================================= */

function getFormIdFromUrl() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  return (
    params.get("id") ||
    params.get("formId") ||
    ""
  ).trim();
}


/* =========================================================
   API REQUEST
========================================================= */

async function apiRequest(
  endpoint,
  options = {}
) {
  const response = await fetch(
    `${ENTRY_API_BASE}${endpoint}`,
    {
      ...options,

      headers: {
        "Content-Type":
          "application/json",

        ...(options.headers || {})
      }
    }
  );

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error =
      new Error(
        data?.message ||
        data?.error ||
        `Request failed (${response.status})`
      );

    error.status = response.status;

    error.data = data;

    throw error;
  }

  return data;
}


/* =========================================================
   DATE HELPERS
========================================================= */

function formatDate(date) {
  if (!date) {
    return "—";
  }

  const parsed =
    new Date(date);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return "—";
  }

  return parsed.toLocaleString(
    undefined,
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  );
}


function getEntryStatus(form) {
  const now =
    Date.now();

  const start =
    new Date(
      form?.startTime
    ).getTime();

  const end =
    new Date(
      form?.endTime
    ).getTime();

  if (
    Number.isNaN(start) ||
    Number.isNaN(end)
  ) {
    return "closed";
  }

  if (now < start) {
    return "upcoming";
  }

  if (
    now >= start &&
    now <= end
  ) {
    return "open";
  }

  return "closed";
}


function getStatusLabel(status) {
  const labels = {
    upcoming: "Upcoming",
    open: "Open",
    closed: "Closed"
  };

  return (
    labels[status] ||
    "Closed"
  );
}


function getStatusMessage(status, form) {
  if (status === "upcoming") {
    return `This giveaway opens on ${formatDate(
      form.startTime
    )}.`;
  }

  if (status === "closed") {
    return `This giveaway closed on ${formatDate(
      form.endTime
    )}.`;
  }

  return `This giveaway closes on ${formatDate(
    form.endTime
  )}.`;
}


/* =========================================================
   TOAST
========================================================= */

function showToast(
  message,
  type = "info"
) {
  let container =
    $("#toastContainer");

  if (!container) {
    container =
      document.createElement("div");

    container.id = "toastContainer";

    container.className =
      "toast-container";

    document.body.appendChild(
      container
    );
  }

  const toast =
    document.createElement("div");

  toast.className =
    `toast ${type}`;

  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("visible");
  }, 10);

  setTimeout(() => {
    toast.classList.remove(
      "visible"
    );

    setTimeout(
      () => toast.remove(),
      300
    );
  }, 3200);
}


/* =========================================================
   MAIN RENDER HELPERS
========================================================= */

function showLoading() {
  const app =
    $("#entryApp");

  if (!app) return;

  app.innerHTML = `
    <div class="entry-state entry-state-loading">

      <div class="entry-loading-spinner"></div>

      <h2>
        Loading giveaway...
      </h2>

      <p>
        Please wait a moment.
      </p>

    </div>
  `;
}


function showError(
  title,
  message,
  options = {}
) {
  const app =
    $("#entryApp");

  if (!app) return;

  const {
    retry = false,
    icon = "⚠️"
  } = options;

  app.innerHTML = `
    <div class="entry-state entry-state-error">

      <div class="entry-state-icon">
        ${escapeHTML(icon)}
      </div>

      <h2>
        ${escapeHTML(title)}
      </h2>

      <p>
        ${escapeHTML(message)}
      </p>

      ${
        retry
          ? `
            <button
              type="button"
              class="primary-button"
              id="retryLoadButton"
            >
              ↻ Try Again
            </button>
          `
          : ""
      }

    </div>
  `;

  if (retry) {
    $("#retryLoadButton")
      ?.addEventListener(
        "click",
        loadEntryForm
      );
  }
}


/* =========================================================
   LOAD ENTRY FORM
========================================================= */

async function loadEntryForm() {
  const formId =
    getFormIdFromUrl();

  if (!formId) {
    showError(
      "Missing Entry Form",
      "This link does not contain a valid entry form ID. Please check the URL and try again.",
      { icon: "🔗" }
    );

    return;
  }

  showLoading();

  try {
    const data =
      await apiRequest(
        `/entry-forms/${encodeURIComponent(
          formId
        )}`
      );

    entryForm =
      data?.entryForm ||
      data?.form ||
      data;

    if (!entryForm?.id) {
      throw new Error(
        "Entry form data is invalid."
      );
    }

    renderEntryForm();

    startStatusWatcher();

  } catch (error) {
    console.error(
      "Could not load entry form:",
      error
    );

    if (error.status === 404) {
      showError(
        "Giveaway Not Found",
        "This giveaway does not exist or has been removed.",
        { icon: "🔍" }
      );

      return;
    }

    showError(
      "Could Not Load Giveaway",
      error.message ||
        "Please check your connection and try again.",
      {
        retry: true,
        icon: "📡"
      }
    );
  }
}


/* =========================================================
   RENDER ENTRY FORM
========================================================= */

function renderEntryForm() {
  const app =
    $("#entryApp");

  if (!app || !entryForm) {
    return;
  }

  const status =
    getEntryStatus(entryForm);

  const isOpen =
    status === "open";

  const entryType =
    entryForm.entryType ===
    "number"
      ? "number"
      : "name";

  const inputType =
    entryType === "number"
      ? "number"
      : "text";

  const placeholder =
    entryType === "number"
      ? "Enter your number"
      : "Enter your name";

  const inputLabel =
    entryType === "number"
      ? "Your Number"
      : "Your Name";

  const inputHint =
    entryType === "number"
      ? "Numbers only, please."
      : "We'll use this to announce the winner.";

  const icon =
    entryType === "number"
      ? "🔢"
      : "👤";

  app.innerHTML = `
    <div class="entry-header">

      <div class="entry-header-icon">
        🎁
      </div>

      <div class="entry-header-text">

        <span class="entry-brand">
          EGiveaways
        </span>

        <h1>
          ${escapeHTML(
            entryForm.giveawayName ||
              "Giveaway"
          )}
        </h1>

        <p>
          Submit your entry below for a chance to win.
        </p>

      </div>

    </div>


    <div class="entry-status-card">

      <span
        class="entry-status ${escapeHTML(
          status
        )}"
      >
        ${escapeHTML(
          getStatusLabel(status)
        )}
      </span>

      <div class="entry-status-info">

        <div class="entry-status-row">

          <span class="entry-status-label">
            Opens
          </span>

          <span class="entry-status-value">
            ${escapeHTML(
              formatDate(
                entryForm.startTime
              )
            )}
          </span>

        </div>

        <div class="entry-status-row">

          <span class="entry-status-label">
            Closes
          </span>

          <span class="entry-status-value">
            ${escapeHTML(
              formatDate(
                entryForm.endTime
              )
            )}
          </span>

        </div>

      </div>

    </div>


    <div class="entry-card">

      ${
        isOpen
          ? `
            <form
              id="publicEntryForm"
              class="entry-form"
              novalidate
            >

              <div class="entry-form-header">

                <div class="entry-form-icon">
                  ${escapeHTML(icon)}
                </div>

                <div>

                  <h3>
                    ${escapeHTML(
                      inputLabel
                    )}
                  </h3>

                  <p>
                    ${escapeHTML(
                      inputHint
                    )}
                  </p>

                </div>

              </div>


              <div class="entry-input-group">

                <input
                  type="${escapeHTML(
                    inputType
                  )}"
                  id="entryValue"
                  name="entryValue"
                  class="entry-input"
                  placeholder="${escapeHTML(
                    placeholder
                  )}"
                  autocomplete="off"
                  ${
                    entryType ===
                    "number"
                      ? 'inputmode="numeric" pattern="[0-9]*" min="0"'
                      : ""
                  }
                  maxlength="${
                    entryType ===
                    "number"
                      ? "20"
                      : "100"
                  }"
                  required
                >

                <button
                  type="submit"
                  class="primary-button entry-submit-button"
                  id="entrySubmitButton"
                >
                  🎟️ Submit Entry
                </button>

              </div>


              <p
                class="entry-error-message"
                id="entryErrorMessage"
                role="alert"
                aria-live="polite"
              ></p>

            </form>
          `
          : `
            <div class="entry-state entry-state-${escapeHTML(
              status
            )}">

              <div class="entry-state-icon">
                ${
                  status === "upcoming"
                    ? "⏳"
                    : "🔒"
                }
              </div>

              <h2>
                ${
                  status === "upcoming"
                    ? "Entries Have Not Opened Yet"
                    : "Entries Are Closed"
                }
              </h2>

              <p>
                ${escapeHTML(
                  getStatusMessage(
                    status,
                    entryForm
                  )
                )}
              </p>

            </div>
          `
      }

    </div>


    <div class="entry-footer">

      <p>
        Powered by
        <strong>
          EGiveaways
        </strong>
      </p>

    </div>
  `;

  if (isOpen) {
    bindFormEvents();
  }
}


/* =========================================================
   BIND FORM EVENTS
========================================================= */

function bindFormEvents() {
  const form =
    $("#publicEntryForm");

  const input =
    $("#entryValue");

  const errorEl =
    $("#entryErrorMessage");

  if (!form || !input) {
    return;
  }

  /*
    Clear error while typing.
  */
  input.addEventListener(
    "input",
    () => {
      if (
        errorEl?.textContent
      ) {
        errorEl.textContent = "";

        input.classList.remove(
          "error"
        );
      }

      if (
        entryForm?.entryType ===
        "number"
      ) {
        input.value =
          input.value.replace(
            /[^0-9]/g,
            ""
          );
      }
    }
  );

  /*
    Enter key submits (default form behavior).
  */
  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();

      submitEntry();
    }
  );

  /*
    Focus input on load.
  */
  setTimeout(
    () => input.focus(),
    100
  );
}


/* =========================================================
   VALIDATION
========================================================= */

function validateEntryValue(value) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return {
      valid: false,
      message:
        entryForm?.entryType ===
        "number"
          ? "Please enter a number."
          : "Please enter your name."
    };
  }

  const cleanValue =
    String(value).trim();

  if (
    entryForm?.entryType ===
    "number"
  ) {
    if (
      !/^[0-9]+$/.test(
        cleanValue
      )
    ) {
      return {
        valid: false,
        message:
          "Please enter a valid number using digits only."
      };
    }
  } else {
    if (cleanValue.length < 1) {
      return {
        valid: false,
        message:
          "Please enter your name."
      };
    }

    if (cleanValue.length > 100) {
      return {
        valid: false,
        message:
          "Your name is too long."
      };
    }
  }

  return {
    valid: true,
    value: cleanValue
  };
}


/* =========================================================
   SUBMIT ENTRY
========================================================= */

async function submitEntry() {
  if (
    isSubmitting ||
    hasSubmitted
  ) {
    return;
  }

  if (!entryForm?.id) {
    return;
  }

  const input =
    $("#entryValue");

  const errorEl =
    $("#entryErrorMessage");

  const submitButton =
    $("#entrySubmitButton");

  if (
    !input ||
    !submitButton
  ) {
    return;
  }

  const value =
    input.value.trim();

  const validation =
    validateEntryValue(value);

  if (!validation.valid) {
    if (errorEl) {
      errorEl.textContent =
        validation.message;
    }

    input.classList.add("error");

    input.focus();

    return;
  }

  /*
    Guard against multiple submissions.
  */
  isSubmitting = true;

  if (errorEl) {
    errorEl.textContent = "";
  }

  input.classList.remove(
    "error"
  );

  const originalText =
    submitButton.innerHTML;

  submitButton.disabled = true;

  submitButton.innerHTML =
    "Submitting...";

  try {
    await apiRequest(
      `/entry-forms/${encodeURIComponent(
        entryForm.id
      )}/entries`,
      {
        method: "POST",

        body: JSON.stringify({
          value: validation.value
        })
      }
    );

    hasSubmitted = true;

    showSuccessState(
      validation.value
    );

  } catch (error) {
    console.error(
      "Submit entry failed:",
      error
    );

    submitButton.disabled =
      false;

    submitButton.innerHTML =
      originalText;

    /*
      Re-check status on specific errors.
    */
    if (
      error.status === 403
    ) {
      /*
        Entries closed or not opened yet.
        Reload the form to show the correct state.
      */
      showToast(
        error.message ||
          "Entries are not currently open.",
        "error"
      );

      await loadEntryForm();

      return;
    }

    if (error.status === 404) {
      showError(
        "Giveaway Not Found",
        "This giveaway does not exist or has been removed.",
        { icon: "🔍" }
      );

      return;
    }

    if (errorEl) {
      errorEl.textContent =
        error.message ||
        "Could not submit your entry. Please try again.";
    }

    input.classList.add("error");

    showToast(
      error.message ||
        "Could not submit your entry.",
      "error"
    );

  } finally {
    isSubmitting = false;
  }
}


/* =========================================================
   SUCCESS STATE
========================================================= */

function showSuccessState(value) {
  const app =
    $("#entryApp");

  if (!app) return;

  const entryType =
    entryForm?.entryType ===
    "number"
      ? "number"
      : "name";

  app.innerHTML = `
    <div class="entry-state entry-state-success">

      <div class="entry-state-icon success-icon">
        ✅
      </div>

      <h2>
        Entry Submitted!
      </h2>

      <p class="entry-success-message">
        Your ${
          entryType === "number"
            ? "number"
            : "name"
        } has been entered into the giveaway.
      </p>

      <div class="entry-success-value">

        <span class="entry-success-label">
          ${
            entryType === "number"
              ? "Your Number"
              : "Your Name"
          }
        </span>

        <strong>
          ${escapeHTML(value)}
        </strong>

      </div>

      <p class="entry-success-hint">
        Winners will be announced by the giveaway host.
        You can safely close this page.
      </p>

      <button
        type="button"
        class="entry-done-button"
        id="closePageButton"
      >
        Done
      </button>

    </div>
  `;

  $("#closePageButton")
    ?.addEventListener(
      "click",
      () => {
        window.close();

        /*
          If the browser blocks window.close(),
          show a friendly message instead.
        */
        setTimeout(() => {
          showToast(
            "You may now close this tab.",
            "info"
          );
        }, 150);
      }
    );

  createConfetti();
}


/* =========================================================
   CONFETTI
========================================================= */

function createConfetti() {
  const existing =
    $("#confettiContainer");

  if (existing) {
    existing.remove();
  }

  const container =
    document.createElement("div");

  container.id =
    "confettiContainer";

  container.className =
    "confetti-container";

  document.body.appendChild(
    container
  );

  for (
    let i = 0;
    i < 60;
    i++
  ) {
    const piece =
      document.createElement(
        "span"
      );

    piece.className =
      "confetti-piece";

    piece.style.left =
      `${Math.random() * 100}%`;

    piece.style.animationDelay =
      `${Math.random() * 0.6}s`;

    piece.style.animationDuration =
      `${1.5 + Math.random() * 1.5}s`;

    piece.style.background =
      getRandomColor();

    container.appendChild(piece);
  }

  setTimeout(() => {
    container.remove();
  }, 4000);
}


function getRandomColor() {
  const colors = [
    "#6d5ef0",
    "#a78bfa",
    "#2ecc71",
    "#f39c12",
    "#e74c3c",
    "#3498db",
    "#f472b6"
  ];

  return colors[
    Math.floor(
      Math.random() *
        colors.length
    )
  ];
}


/* =========================================================
   STATUS WATCHER
   Auto-flips the page between open/closed
   if the user keeps it open across a boundary.
========================================================= */

function startStatusWatcher() {
  stopStatusWatcher();

  statusTimer = setInterval(
    () => {
      if (!entryForm) {
        return;
      }

      /*
        Don't do anything after a successful
        submission.
      */
      if (hasSubmitted) {
        return;
      }

      const status =
        getEntryStatus(entryForm);

      const badge =
        $(".entry-status");

      if (!badge) {
        return;
      }

      const currentStatus =
        badge.classList.contains(
          "open"
        )
          ? "open"
          : badge.classList.contains(
                "upcoming"
              )
            ? "upcoming"
            : "closed";

      if (
        currentStatus !== status
      ) {
        /*
          State changed (opened or closed).
          Re-render the whole page.
        */
        renderEntryForm();
      }
    },
    15000
  );
}


function stopStatusWatcher() {
  if (statusTimer) {
    clearInterval(statusTimer);

    statusTimer = null;
  }
}


/* =========================================================
   CLEANUP
========================================================= */

window.addEventListener(
  "beforeunload",
  stopStatusWatcher
);


/* =========================================================
   INIT
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    loadEntryForm();
  }
);
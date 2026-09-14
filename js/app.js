"use strict";

/* =========================================================
   EGIVEAWAYS
   MAIN APPLICATION
========================================================= */

const STORAGE_KEY = "egiveaways_v1";

const defaultState = {
  giveawayName: "My Awesome Giveaway",

  participants: [],

  rewards: [],

  mode: "random-winner",

  winnerCount: 1,

  winners: [],

  history: [],

  settings: {
    spinSpeed: "normal",
    animationDuration: "normal",
    soundEnabled: true,
    confettiEnabled: true,
    preventRepeat: true,
    autoRemoveWinners: true,
    duplicateHandling: "remove"
  },

  giveawayStarted: false,

  completed: false,

  createdAt: null
};

let state = loadState();

let isSpinning = false;

let currentWinner = null;

let currentReward = null;


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = (selector) =>
  document.querySelector(selector);

const $$ = (selector) =>
  [...document.querySelectorAll(selector)];


/* =========================================================
   STORAGE
========================================================= */

function loadState() {
  try {
    const saved =
      localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return structuredClone(defaultState);
    }

    const parsed =
      JSON.parse(saved);

    return {
      ...structuredClone(defaultState),

      ...parsed,

      settings: {
        ...defaultState.settings,
        ...(parsed.settings || {})
      },

      participants:
        Array.isArray(parsed.participants)
          ? parsed.participants
          : [],

      rewards:
        Array.isArray(parsed.rewards)
          ? parsed.rewards
          : [],

      winners:
        Array.isArray(parsed.winners)
          ? parsed.winners
          : [],

      history:
        Array.isArray(parsed.history)
          ? parsed.history
          : []
    };
  } catch (error) {
    console.error(
      "Could not load saved data:",
      error
    );

    return structuredClone(defaultState);
  }
}


function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state)
    );
  } catch (error) {
    console.error(
      "Could not save data:",
      error
    );
  }
}


/* =========================================================
   ID
========================================================= */

function createId(prefix = "id") {
  return (
    `${prefix}_${Date.now()}_` +
    Math.random()
      .toString(36)
      .slice(2, 9)
  );
}


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
   NAVIGATION
========================================================= */

function showPage(pageName) {
  $$(".page").forEach((page) => {
    page.classList.toggle(
      "active",
      page.id === `page-${pageName}`
    );
  });

  $$(".nav-item").forEach((item) => {
    item.classList.toggle(
      "active",
      item.dataset.page === pageName
    );
  });

  closeSidebar();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (pageName === "draw") {
    prepareSpinner();
  }

  if (pageName === "results") {
    renderResults();
  }

  if (pageName === "history") {
    renderHistory();
  }
}


document.addEventListener(
  "click",
  (event) => {
    const button =
      event.target.closest("[data-page]");

    if (!button) return;

    const page =
      button.dataset.page;

    if (!page) return;

    event.preventDefault();

    showPage(page);
  }
);


/* =========================================================
   SIDEBAR
========================================================= */

const sidebar =
  $("#sidebar");

const sidebarOverlay =
  $("#sidebarOverlay");

const menuButton =
  $("#menuButton");


function closeSidebar() {
  sidebar?.classList.remove("open");

  sidebarOverlay?.classList.remove("active");
}


menuButton?.addEventListener(
  "click",
  () => {
    sidebar?.classList.add("open");

    sidebarOverlay?.classList.add("active");
  }
);


sidebarOverlay?.addEventListener(
  "click",
  closeSidebar
);


/* =========================================================
   TOAST
========================================================= */

function showToast(
  message,
  type = "info"
) {
  const container =
    $("#toastContainer");

  if (!container) return;

  const toast =
    document.createElement("div");

  toast.className =
    `toast ${type}`;

  toast.textContent =
    message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3200);
}


/* =========================================================
   PARTICIPANTS
========================================================= */

function cleanName(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ");
}


function parseNames(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map(cleanName)
    .filter(Boolean);
}


function normalizeName(name) {
  return cleanName(name).toLowerCase();
}


function addParticipantsFromInput() {
  const input =
    $("#participantInput");

  if (!input) return;

  const names =
    parseNames(input.value);

  if (!names.length) {
    showToast(
      "Enter at least one participant name.",
      "error"
    );

    return;
  }

  let incoming = names;

  if (
    state.settings.duplicateHandling ===
    "remove"
  ) {
    const existing =
      new Set(
        state.participants.map(
          (person) =>
            normalizeName(person.name)
        )
      );

    const uniqueIncoming = [];

    for (const name of incoming) {
      const key =
        normalizeName(name);

      if (!existing.has(key)) {
        existing.add(key);

        uniqueIncoming.push(name);
      }
    }

    incoming = uniqueIncoming;
  }

  if (!incoming.length) {
    showToast(
      "All those names already exist.",
      "error"
    );

    return;
  }

  state.participants.push(
    ...incoming.map((name) => ({
      id: createId("person"),
      name
    }))
  );

  input.value = "";

  if ($("#participantInputCount")) {
    $("#participantInputCount")
      .textContent =
      "0 names detected";
  }

  saveState();

  renderParticipants();

  updateEverything();

  showToast(
    `${incoming.length} participant${
      incoming.length === 1 ? "" : "s"
    } added.`,
    "success"
  );
}


$("#addParticipants")
  ?.addEventListener(
    "click",
    addParticipantsFromInput
  );


$("#participantInput")
  ?.addEventListener(
    "input",
    () => {
      const names =
        parseNames(
          $("#participantInput").value
        );

      if ($("#participantInputCount")) {
        $("#participantInputCount")
          .textContent =
          `${names.length} name${
            names.length === 1
              ? ""
              : "s"
          } detected`;
      }
    }
  );


function renderParticipants() {
  const list =
    $("#participantList");

  const empty =
    $("#participantEmptyState");

  if (!list) return;

  const search =
    $("#participantSearch")
      ?.value
      .trim()
      .toLowerCase() || "";

  const filtered =
    state.participants.filter(
      (person) =>
        String(person.name ?? "")
          .toLowerCase()
          .includes(search)
    );

  list.innerHTML = "";

  if (!state.participants.length) {
    empty?.classList.add("visible");

    if ($("#participantListCount")) {
      $("#participantListCount")
        .textContent = "0";
    }

    return;
  }

  empty?.classList.remove("visible");

  if (!filtered.length) {
    list.innerHTML = `
      <div class="empty-state visible">
        <div class="empty-icon">⌕</div>
        <h4>No matches</h4>
        <p>No participant matches your search.</p>
      </div>
    `;

    return;
  }

  filtered.forEach((person) => {
    const item =
      document.createElement("div");

    item.className =
      "participant-item";

    item.innerHTML = `
      <div class="participant-avatar">
        ${escapeHTML(
          person.name
            .charAt(0)
            .toUpperCase()
        )}
      </div>

      <div class="participant-name">
        ${escapeHTML(person.name)}
      </div>

      <button
        class="remove-participant"
        data-remove-person="${escapeHTML(
          person.id
        )}"
        type="button"
      >
        ×
      </button>
    `;

    list.appendChild(item);
  });

  if ($("#participantListCount")) {
    $("#participantListCount")
      .textContent =
      state.participants.length;
  }
}


$("#participantSearch")
  ?.addEventListener(
    "input",
    renderParticipants
  );


$("#participantList")
  ?.addEventListener(
    "click",
    (event) => {
      const button =
        event.target.closest(
          "[data-remove-person]"
        );

      if (!button) return;

      state.participants =
        state.participants.filter(
          (person) =>
            person.id !==
            button.dataset.removePerson
        );

      saveState();

      renderParticipants();

      updateEverything();

      showToast(
        "Participant removed.",
        "success"
      );
    }
  );


$("#clearParticipants")
  ?.addEventListener(
    "click",
    () => {
      if (!state.participants.length) {
        showToast(
          "There are no participants to clear.",
          "error"
        );

        return;
      }

      if (
        !confirm(
          "Remove all participants from this giveaway?"
        )
      ) {
        return;
      }

      state.participants = [];

      state.winners = [];

      saveState();

      renderParticipants();

      updateEverything();

      showToast(
        "All participants removed.",
        "success"
      );
    }
  );


$("#shuffleParticipants")
  ?.addEventListener(
    "click",
    () => {
      shuffleArray(
        state.participants
      );

      saveState();

      renderParticipants();

      showToast(
        "Participants shuffled.",
        "success"
      );
    }
  );


/* =========================================================
   REWARDS
========================================================= */

function addReward(data) {
  state.rewards.push({
    id: createId("reward"),

    name: cleanName(data.name),

    emoji:
      data.emoji?.trim() || "🎁",

    quantity:
      Math.max(
        1,
        Number(data.quantity) || 1
      ),

    distributed: 0
  });

  saveState();

  renderRewards();

  updateEverything();
}


function updateReward(id, data) {
  const reward =
    state.rewards.find(
      (item) =>
        item.id === id
    );

  if (!reward) return;

  reward.name =
    cleanName(data.name);

  reward.emoji =
    data.emoji?.trim() || "🎁";

  reward.quantity =
    Math.max(
      1,
      Number(data.quantity) || 1
    );

  saveState();

  renderRewards();

  updateEverything();
}


function deleteReward(id) {
  state.rewards =
    state.rewards.filter(
      (reward) =>
        reward.id !== id
    );

  saveState();

  renderRewards();

  updateEverything();

  showToast(
    "Reward deleted.",
    "success"
  );
}


function renderRewards() {
  const grid =
    $("#rewardsGrid");

  const empty =
    $("#rewardEmptyState");

  if (!grid) return;

  grid.innerHTML = "";

  if (!state.rewards.length) {
    empty?.classList.add("visible");

    updateRewardSummary();

    return;
  }

  empty?.classList.remove("visible");

  state.rewards.forEach((reward) => {
    const remaining =
      Math.max(
        0,
        reward.quantity -
          (reward.distributed || 0)
      );

    const card =
      document.createElement("div");

    card.className =
      "reward-card";

    card.innerHTML = `
      <div class="reward-top">

        <div class="reward-emoji">
          ${escapeHTML(reward.emoji)}
        </div>

        <div class="reward-actions">

          <button
            class="reward-action"
            data-edit-reward="${escapeHTML(
              reward.id
            )}"
            type="button"
          >
            ✎
          </button>

          <button
            class="reward-action"
            data-delete-reward="${escapeHTML(
              reward.id
            )}"
            type="button"
          >
            ×
          </button>

        </div>

      </div>

      <h4>
        ${escapeHTML(reward.name)}
      </h4>

      <p>
        ${
          reward.distributed || 0
        } distributed
        · ${remaining} remaining
      </p>

      <span class="reward-quantity">
        ${reward.quantity} slot${
          reward.quantity === 1
            ? ""
            : "s"
        }
      </span>
    `;

    grid.appendChild(card);
  });

  updateRewardSummary();
}


function updateRewardSummary() {
  const total =
    state.rewards.reduce(
      (sum, reward) =>
        sum +
        Number(
          reward.quantity || 0
        ),
      0
    );

  const distributed =
    state.rewards.reduce(
      (sum, reward) =>
        sum +
        Number(
          reward.distributed || 0
        ),
      0
    );

  if ($("#rewardTypeCount")) {
    $("#rewardTypeCount")
      .textContent =
      state.rewards.length;
  }

  if ($("#rewardSlotCount")) {
    $("#rewardSlotCount")
      .textContent = total;
  }

  if ($("#distributedRewardCount")) {
    $("#distributedRewardCount")
      .textContent = distributed;
  }
}


/* =========================================================
   REWARD MODAL
========================================================= */

function openRewardModal(id = null) {
  const modal =
    $("#rewardModal");

  const form =
    $("#rewardForm");

  if (!modal || !form) return;

  form.reset();

  if ($("#editingRewardId")) {
    $("#editingRewardId")
      .value = id || "";
  }

  if ($("#rewardQuantity")) {
    $("#rewardQuantity")
      .value = 1;
  }

  if (id) {
    const reward =
      state.rewards.find(
        (item) =>
          item.id === id
      );

    if (!reward) return;

    if ($("#rewardModalTitle")) {
      $("#rewardModalTitle")
        .textContent =
        "Edit Reward";
    }

    if ($("#rewardName")) {
      $("#rewardName")
        .value =
        reward.name;
    }

    if ($("#rewardEmoji")) {
      $("#rewardEmoji")
        .value =
        reward.emoji;
    }

    if ($("#rewardQuantity")) {
      $("#rewardQuantity")
        .value =
        reward.quantity;
    }
  } else {
    if ($("#rewardModalTitle")) {
      $("#rewardModalTitle")
        .textContent =
        "Add Reward";
    }
  }

  modal.classList.add("active");
}


function closeRewardModal() {
  $("#rewardModal")
    ?.classList.remove("active");
}


$("#addRewardButton")
  ?.addEventListener(
    "click",
    () => openRewardModal()
  );


$("#emptyAddReward")
  ?.addEventListener(
    "click",
    () => openRewardModal()
  );


$("#rewardForm")
  ?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();

      const name =
        $("#rewardName")
          ?.value
          .trim() || "";

      const emoji =
        $("#rewardEmoji")
          ?.value
          .trim() || "";

      const quantity =
        Number(
          $("#rewardQuantity")
            ?.value
        );

      const id =
        $("#editingRewardId")
          ?.value || "";

      if (!name) {
        showToast(
          "Enter a reward name.",
          "error"
        );

        return;
      }

      if (id) {
        updateReward(
          id,
          {
            name,
            emoji,
            quantity
          }
        );
      } else {
        addReward({
          name,
          emoji,
          quantity
        });
      }

      closeRewardModal();
    }
  );


$("#rewardsGrid")
  ?.addEventListener(
    "click",
    (event) => {
      const edit =
        event.target.closest(
          "[data-edit-reward]"
        );

      const del =
        event.target.closest(
          "[data-delete-reward]"
        );

      if (edit) {
        openRewardModal(
          edit.dataset.editReward
        );
      }

      if (del) {
        deleteReward(
          del.dataset.deleteReward
        );
      }
    }
  );


/* =========================================================
   GIVEAWAY MODES
========================================================= */

$$(".mode-card")
  .forEach((card) => {
    card.addEventListener(
      "click",
      () => {
        state.mode =
          card.dataset.mode;

        $$(".mode-card")
          .forEach((item) => {
            item.classList.toggle(
              "selected",
              item.dataset.mode ===
                state.mode
            );
          });

        saveState();

        updateEverything();
      }
    );
  });


/* =========================================================
   WINNER COUNT
========================================================= */

function setWinnerCount(value) {
  let count =
    Math.max(
      1,
      Math.floor(
        Number(value) || 1
      )
    );

  if (state.participants.length) {
    count =
      Math.min(
        count,
        state.participants.length
      );
  }

  state.winnerCount =
    count;

  if ($("#winnerCount")) {
    $("#winnerCount")
      .value = count;
  }

  saveState();

  updateDrawStats();
}


$("#winnerCount")
  ?.addEventListener(
    "change",
    (event) =>
      setWinnerCount(
        event.target.value
      )
  );


$("#increaseWinners")
  ?.addEventListener(
    "click",
    () =>
      setWinnerCount(
        state.winnerCount + 1
      )
  );


$("#decreaseWinners")
  ?.addEventListener(
    "click",
    () =>
      setWinnerCount(
        state.winnerCount - 1
      )
  );


/* =========================================================
   SETTINGS
========================================================= */

function loadSettingsUI() {
  if ($("#spinSpeed")) {
    $("#spinSpeed")
      .value =
      state.settings.spinSpeed;
  }

  if ($("#animationDuration")) {
    $("#animationDuration")
      .value =
      state.settings.animationDuration;
  }

  if ($("#soundEnabled")) {
    $("#soundEnabled")
      .checked =
      state.settings.soundEnabled;
  }

  if ($("#confettiEnabled")) {
    $("#confettiEnabled")
      .checked =
      state.settings.confettiEnabled;
  }

  if ($("#preventRepeat")) {
    $("#preventRepeat")
      .checked =
      state.settings.preventRepeat;
  }

  if ($("#autoRemoveWinners")) {
    $("#autoRemoveWinners")
      .checked =
      state.settings.autoRemoveWinners;
  }

  if ($("#duplicateHandling")) {
    $("#duplicateHandling")
      .value =
      state.settings.duplicateHandling;
  }
}


$("#spinSpeed")
  ?.addEventListener(
    "change",
    (event) => {
      state.settings.spinSpeed =
        event.target.value;

      saveState();
    }
  );


$("#animationDuration")
  ?.addEventListener(
    "change",
    (event) => {
      state.settings.animationDuration =
        event.target.value;

      saveState();
    }
  );


$("#soundEnabled")
  ?.addEventListener(
    "change",
    (event) => {
      state.settings.soundEnabled =
        event.target.checked;

      saveState();
    }
  );


$("#confettiEnabled")
  ?.addEventListener(
    "change",
    (event) => {
      state.settings.confettiEnabled =
        event.target.checked;

      saveState();
    }
  );


$("#preventRepeat")
  ?.addEventListener(
    "change",
    (event) => {
      state.settings.preventRepeat =
        event.target.checked;

      saveState();
    }
  );


$("#autoRemoveWinners")
  ?.addEventListener(
    "change",
    (event) => {
      state.settings.autoRemoveWinners =
        event.target.checked;

      saveState();
    }
  );


$("#duplicateHandling")
  ?.addEventListener(
    "change",
    (event) => {
      state.settings.duplicateHandling =
        event.target.value;

      saveState();
    }
  );


/* =========================================================
   GIVEAWAY NAME
========================================================= */

function saveGiveawayName() {
  const input =
    $("#giveawayName");

  if (!input) return;

  const name =
    input.value.trim();

  if (!name) {
    showToast(
      "Enter a giveaway name.",
      "error"
    );

    return;
  }

  state.giveawayName =
    name;

  saveState();

  updateEverything();

  showToast(
    "Giveaway name saved.",
    "success"
  );
}


$("#saveGiveawayName")
  ?.addEventListener(
    "click",
    saveGiveawayName
  );


/* =========================================================
   SPINNER HELPERS
========================================================= */

function getAvailableParticipants() {
  let available =
    [...state.participants];

  if (
    state.settings.preventRepeat &&
    state.winners.length
  ) {
    const winnerIds =
      new Set(
        state.winners.map(
          (winner) =>
            winner.participantId
        )
      );

    available =
      available.filter(
        (person) =>
          !winnerIds.has(
            person.id
          )
      );
  }

  return available;
}


function getSpinnerTrack() {
  return (
    $("#spinnerTrack") ||
    $(".spinner-track")
  );
}


function getSpinnerItemHeight() {
  const track =
    getSpinnerTrack();

  if (!track) {
    return 74;
  }

  const item =
    track.querySelector(
      ".spinner-item"
    );

  if (!item) {
    return 74;
  }

  return (
    item.getBoundingClientRect()
      .height || 74
  );
}


function positionSpinnerAt(
  targetIndex,
  itemHeight,
  transition = "none"
) {
  const track =
    getSpinnerTrack();

  if (!track) return;

  const offset =
    targetIndex *
      itemHeight +
    itemHeight / 2;

  track.style.transition =
    transition;

  track.style.transform =
    `translateY(-${offset}px)`;
}


/* =========================================================
   PREPARE SPINNER
========================================================= */

function prepareSpinner() {
  const track =
    getSpinnerTrack();

  const container =
    $(".spinner-container");

  if (!track) return;

  container?.classList.remove(
    "spinning-fast",
    "spinning-slow",
    "locked"
  );

  const available =
    getAvailableParticipants();

  if (!available.length) {
    track.innerHTML = `
      <div
        class="spinner-item spinner-name active"
      >
        No participants
      </div>
    `;

    requestAnimationFrame(() => {
      positionSpinnerAt(
        0,
        getSpinnerItemHeight()
      );
    });

    if ($("#spinnerStatus")) {
      $("#spinnerStatus")
        .textContent =
        "Add participants to spin";
    }

    return;
  }

  const first =
    available[0];

  track.innerHTML = `
    <div
      class="spinner-item spinner-name active"
      data-participant-id="${escapeHTML(
        first.id
      )}"
    >
      ${escapeHTML(first.name)}
    </div>
  `;

  requestAnimationFrame(() => {
    positionSpinnerAt(
      0,
      getSpinnerItemHeight()
    );
  });

  if ($("#spinnerStatus")) {
    $("#spinnerStatus")
      .textContent =
      "Ready to spin";
  }
}


/* =========================================================
   SPINNER TRACK GENERATOR
========================================================= */

function createSpinnerNames(
  available
) {
  const names = [];

  let lastId = null;

  const rounds =
    Math.max(
      10,
      Math.ceil(
        available.length / 2
      )
    );

  for (
    let round = 0;
    round < rounds;
    round++
  ) {
    const shuffled =
      [...available];

    shuffleArray(shuffled);

    for (
      const person of shuffled
    ) {
      if (
        person.id === lastId &&
        shuffled.length > 1
      ) {
        continue;
      }

      names.push(person);

      lastId =
        person.id;
    }
  }

  const extraCount =
    Math.max(
      15,
      available.length * 3
    );

  for (
    let i = 0;
    i < extraCount;
    i++
  ) {
    let candidates =
      available.filter(
        (person) =>
          person.id !== lastId
      );

    if (!candidates.length) {
      candidates =
        available;
    }

    const person =
      candidates[
        Math.floor(
          Math.random() *
            candidates.length
        )
      ];

    names.push(person);

    lastId =
      person.id;
  }

  return names;
}


/* =========================================================
   FIND ACTUAL CENTER ITEM
========================================================= */

function findCenterSpinnerItem(
  container,
  items
) {
  const containerRect =
    container.getBoundingClientRect();

  const centerY =
    containerRect.top +
    containerRect.height / 2;

  let closestItem = null;

  let smallestDistance =
    Infinity;

  items.forEach((item) => {
    const rect =
      item.getBoundingClientRect();

    const itemCenter =
      rect.top +
      rect.height / 2;

    const distance =
      Math.abs(
        itemCenter - centerY
      );

    if (
      distance <
      smallestDistance
    ) {
      smallestDistance =
        distance;

      closestItem =
        item;
    }
  });

  return closestItem;
}


/* =========================================================
   WAIT FOR CSS TRANSITION
========================================================= */

function waitForTransformEnd(
  track,
  timeout
) {
  return new Promise(
    (resolve) => {
      let finished = false;

      const finish = () => {
        if (finished) {
          return;
        }

        finished = true;

        track.removeEventListener(
          "transitionend",
          onTransitionEnd
        );

        resolve();
      };

      const onTransitionEnd =
        (event) => {
          if (
            event.target === track &&
            event.propertyName ===
              "transform"
          ) {
            finish();
          }
        };

      track.addEventListener(
        "transitionend",
        onTransitionEnd
      );

      setTimeout(
        finish,
        timeout + 200
      );
    }
  );
}


/* =========================================================
   MAIN SPIN
========================================================= */

async function spin() {
  if (isSpinning) {
    return;
  }

  const available =
    getAvailableParticipants();

  if (!available.length) {
    showToast(
      "There are no participants available to pick.",
      "error"
    );

    return;
  }

  const container =
    $(".spinner-container");

  const track =
    getSpinnerTrack();

  const button =
    $("#spinButton");

  if (
    !container ||
    !track ||
    !button
  ) {
    return;
  }

  isSpinning = true;

  button.disabled = true;

  button.innerHTML = `
    <span class="spin-icon">⚡</span>
    <span>SPINNING...</span>
  `;

  container.classList.remove(
    "locked",
    "spinning-slow"
  );

  container.classList.add(
    "spinning-fast"
  );

  if ($("#spinnerStatus")) {
    $("#spinnerStatus")
      .textContent =
      "Spinning...";
  }

  /* =======================================================
     BUILD TRACK
  ======================================================= */

  const names =
    createSpinnerNames(
      available
    );

  const targetIndex =
    names.length - 1;

  /* =======================================================
     BUILD DOM
  ======================================================= */

  track.innerHTML =
    names
      .map(
        (person) => `
          <div
            class="spinner-item spinner-name"
            data-participant-id="${escapeHTML(
              person.id
            )}"
          >
            ${escapeHTML(
              person.name
            )}
          </div>
        `
      )
      .join("");

  const items =
    [
      ...track.querySelectorAll(
        ".spinner-item"
      )
    ];

  if (!items.length) {
    isSpinning = false;

    button.disabled = false;

    return;
  }

  const itemHeight =
    getSpinnerItemHeight();

  /* =======================================================
     START AT FIRST ITEM
  ======================================================= */

  positionSpinnerAt(
    0,
    itemHeight,
    "none"
  );

  track.offsetHeight;

  playSpinSound();

  /* =======================================================
     FAST PHASE
  ======================================================= */

  const fastIndex =
    Math.max(
      5,
      Math.floor(
        targetIndex * 0.72
      )
    );

  const fastDuration = 650;

  positionSpinnerAt(
    fastIndex,
    itemHeight,
    `transform ${fastDuration}ms cubic-bezier(0.06, 0.92, 0.12, 1)`
  );

  await wait(fastDuration);

  /* =======================================================
     BRAKING PHASE
  ======================================================= */

  container.classList.remove(
    "spinning-fast"
  );

  container.classList.add(
    "spinning-slow"
  );

  if ($("#spinnerStatus")) {
    $("#spinnerStatus")
      .textContent =
      "Slowing down...";
  }

  const remaining =
    targetIndex -
    fastIndex;

  const finalDuration =
    Math.max(
      1300,
      remaining * 50
    );

  const transitionPromise =
    waitForTransformEnd(
      track,
      finalDuration
    );

  positionSpinnerAt(
    targetIndex,
    itemHeight,
    `transform ${finalDuration}ms cubic-bezier(0.07, 0.60, 0.03, 1)`
  );

  await transitionPromise;

  /* =======================================================
     STOP
  ======================================================= */

  container.classList.remove(
    "spinning-fast",
    "spinning-slow"
  );

  container.classList.add(
    "locked"
  );

  const landedItem =
    findCenterSpinnerItem(
      container,
      items
    );

  if (!landedItem) {
    isSpinning = false;

    button.disabled = false;

    button.innerHTML = `
      <span class="spin-icon">⚡</span>
      <span>SPIN</span>
    `;

    return;
  }

  /* =======================================================
     HIGHLIGHT ACTUAL CENTER ITEM
  ======================================================= */

  items.forEach((item) => {
    item.classList.remove(
      "active"
    );
  });

  landedItem.classList.add(
    "active"
  );

  /* =======================================================
     GET ACTUAL CENTER PARTICIPANT
  ======================================================= */

  const landedId =
    landedItem.dataset
      .participantId;

  const landedParticipant =
    available.find(
      (person) =>
        person.id === landedId
    );

  if (!landedParticipant) {
    isSpinning = false;

    button.disabled = false;

    button.innerHTML = `
      <span class="spin-icon">⚡</span>
      <span>SPIN</span>
    `;

    return;
  }

  /* =======================================================
     ABSOLUTE SOURCE OF TRUTH
  ======================================================= */

  currentWinner =
    landedParticipant;

  if ($("#spinnerStatus")) {
    $("#spinnerStatus")
      .textContent =
      `Winner: ${landedParticipant.name}`;
  }

  playWinnerSound();

  await wait(350);

  isSpinning = false;

  button.disabled = false;

  button.innerHTML = `
    <span class="spin-icon">⚡</span>
    <span>SPIN</span>
  `;

  revealWinner(
    landedParticipant
  );
}


$("#spinButton")
  ?.addEventListener(
    "click",
    spin
  );


/* =========================================================
   REWARD SELECTION
========================================================= */

function getAvailableRewardSlots() {
  const slots = [];

  state.rewards.forEach(
    (reward) => {
      const remaining =
        Math.max(
          0,
          reward.quantity -
            (reward.distributed || 0)
        );

      for (
        let i = 0;
        i < remaining;
        i++
      ) {
        slots.push(reward);
      }
    }
  );

  return slots;
}


function chooseReward() {
  const slots =
    getAvailableRewardSlots();

  if (!slots.length) {
    return null;
  }

  return slots[
    Math.floor(
      Math.random() *
        slots.length
    )
  ];
}


/* =========================================================
   WINNER REVEAL
========================================================= */

function revealWinner(winner) {
  if (!winner) return;

  currentReward =
    chooseReward();

  if ($("#revealedWinner")) {
    $("#revealedWinner")
      .textContent =
      winner.name;
  }

  if ($("#revealedReward")) {
    $("#revealedReward")
      .textContent =
      currentReward
        ? `${currentReward.emoji} ${currentReward.name}`
        : "🎁 Winner";
  }

  const overlay =
    $("#winnerOverlay");

  if (!overlay) return;

  overlay.classList.add(
    "active"
  );

  overlay.setAttribute(
    "aria-hidden",
    "false"
  );

  if (
    state.settings.confettiEnabled
  ) {
    createConfetti();
  }
}


function closeWinnerOverlay() {
  $("#winnerOverlay")
    ?.classList.remove("active");

  $("#winnerOverlay")
    ?.setAttribute(
      "aria-hidden",
      "true"
    );
}


/* =========================================================
   FINALIZE WINNER
========================================================= */

function finalizeCurrentWinner() {
  if (!currentWinner) {
    return;
  }

  const winner = {
    id:
      createId("winner"),

    participantId:
      currentWinner.id,

    name:
      currentWinner.name,

    rewardId:
      currentReward?.id || null,

    rewardName:
      currentReward?.name ||
      "Winner",

    rewardEmoji:
      currentReward?.emoji ||
      "🎁",

    position:
      state.winners.length + 1,

    createdAt:
      new Date().toISOString()
  };

  state.winners.push(winner);

  if (currentReward) {
    const reward =
      state.rewards.find(
        (item) =>
          item.id ===
          currentReward.id
      );

    if (reward) {
      reward.distributed =
        (reward.distributed || 0) +
        1;
    }
  }

  if (
    state.settings.autoRemoveWinners
  ) {
    state.participants =
      state.participants.filter(
        (person) =>
          person.id !==
          currentWinner.id
      );
  }

  saveState();

  currentWinner = null;

  currentReward = null;

  renderParticipants();

  renderRewards();

  updateEverything();
}


/* =========================================================
   WINNER ACTIONS
========================================================= */

$("#continueAfterWinner")
  ?.addEventListener(
    "click",
    () => {
      finalizeCurrentWinner();

      closeWinnerOverlay();

      if (
        state.winners.length <
        state.winnerCount
      ) {
        prepareSpinner();

        showToast(
          "Next winner — spin again!",
          "success"
        );

        return;
      }

      completeGiveaway();
    }
  );


$("#pickAnother")
  ?.addEventListener(
    "click",
    () => {
      currentWinner = null;

      currentReward = null;

      closeWinnerOverlay();

      prepareSpinner();

      showToast(
        "Choose another winner.",
        "success"
      );
    }
  );


/* =========================================================
   COMPLETE GIVEAWAY
========================================================= */

function completeGiveaway() {
  if (!state.winners.length) {
    showToast(
      "Select at least one winner.",
      "error"
    );

    return;
  }

  state.completed = true;

  state.giveawayStarted = false;

  state.history.unshift({
    id:
      createId("giveaway"),

    giveawayName:
      state.giveawayName,

    date:
      new Date().toISOString(),

    mode:
      state.mode,

    participants:
      state.participants.map(
        (person) => ({
          ...person
        })
      ),

    winners:
      state.winners.map(
        (winner) => ({
          ...winner
        })
      ),

    rewards:
      state.rewards.map(
        (reward) => ({
          ...reward
        })
      )
  });

  saveState();

  renderResults();

  renderHistory();

  updateEverything();

  showPage("results");

  showToast(
    "Giveaway completed! 🎉",
    "success"
  );
}


/* =========================================================
   RESULTS
========================================================= */

function getModeLabel(mode) {
  const labels = {
    "random-winner":
      "Random Winner",

    "random-prizes":
      "Random Prizes",

    "ranked-winners":
      "Ranked Winners",

    "winner-nothing":
      "Winner or Nothing",

    "multiple-gifts":
      "Multiple Gifts"
  };

  return (
    labels[mode] ||
    "Random Winner"
  );
}


function renderResults() {
  const list =
    $("#winnerList");

  if ($("#resultsGiveawayName")) {
    $("#resultsGiveawayName")
      .textContent =
      state.giveawayName;
  }

  if ($("#resultsMode")) {
    $("#resultsMode")
      .textContent =
      getModeLabel(
        state.mode
      );
  }

  if ($("#resultsDate")) {
    $("#resultsDate")
      .textContent =
      new Date()
        .toLocaleString(
          undefined,
          {
            dateStyle:
              "medium",

            timeStyle:
              "short"
          }
        );
  }

  if (!list) return;

  list.innerHTML = "";

  state.winners.forEach(
    (winner, index) => {
      const item =
        document.createElement(
          "div"
        );

      item.className =
        "result-winner";

      item.innerHTML = `
        <div class="result-rank">
          ${
            ["🥇", "🥈", "🥉"][index] ||
            `#${index + 1}`
          }
        </div>

        <div class="result-name">
          ${escapeHTML(winner.name)}
        </div>

        <div class="result-reward">
          ${escapeHTML(
            winner.rewardEmoji || "🎁"
          )}
          ${escapeHTML(
            winner.rewardName || "Winner"
          )}
        </div>
      `;

      list.appendChild(item);
    }
  );
}


function buildResultText() {
  const lines = [
    "🎁 EGIVEAWAYS RESULTS",
    "",
    state.giveawayName,
    getModeLabel(state.mode),
    ""
  ];

  state.winners.forEach(
    (winner, index) => {
      lines.push(
        `${
          ["🥇", "🥈", "🥉"][index] ||
          `#${index + 1}`
        } ${winner.name} — ${
          winner.rewardEmoji || "🎁"
        } ${
          winner.rewardName || "Winner"
        }`
      );
    }
  );

  lines.push(
    "",
    "Pick. Spin. Win. 🎁"
  );

  return lines.join("\n");
}


$("#copyResults")
  ?.addEventListener(
    "click",
    async () => {
      try {
        await navigator.clipboard.writeText(
          buildResultText()
        );

        showToast(
          "Results copied to clipboard.",
          "success"
        );
      } catch {
        showToast(
          "Could not copy results.",
          "error"
        );
      }
    }
  );


$("#downloadResults")
  ?.addEventListener(
    "click",
    () => {
      const blob =
        new Blob(
          [buildResultText()],
          {
            type:
              "text/plain;charset=utf-8"
          }
        );

      const url =
        URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      link.href = url;

      link.download =
        `${sanitizeFilename(
          state.giveawayName
        )}-results.txt`;

      link.click();

      URL.revokeObjectURL(url);

      showToast(
        "Results downloaded.",
        "success"
      );
    }
  );


$("#shareResults")
  ?.addEventListener(
    "click",
    async () => {
      const text =
        buildResultText();

      if (navigator.share) {
        try {
          await navigator.share({
            title:
              state.giveawayName,

            text
          });

          return;
        } catch {
          // Continue to clipboard.
        }
      }

      try {
        await navigator.clipboard.writeText(
          text
        );

        showToast(
          "Results copied.",
          "success"
        );
      } catch {
        showToast(
          "Sharing is unavailable.",
          "error"
        );
      }
    }
  );


/* =========================================================
   HISTORY
========================================================= */

function renderHistory() {
  const list =
    $("#historyList");

  const empty =
    $("#historyEmptyState");

  if (!list) return;

  list.innerHTML = "";

  if (!state.history.length) {
    empty?.classList.add("visible");

    saveState();

    return;
  }

  empty?.classList.remove("visible");

  let changed = false;

  state.history.forEach(
    (entry, index) => {
      /*
        Some old history records may not have an ID.
        Give them one so the delete button always has
        a valid identifier.
      */
      if (!entry.id) {
        entry.id =
          createId("giveaway");

        changed = true;
      }

      const item =
        document.createElement("div");

      item.className =
        "history-item";

      const winnerCount =
        Array.isArray(entry.winners)
          ? entry.winners.length
          : 0;

      item.innerHTML = `
        <div class="history-main">

          <h4>
            ${escapeHTML(
              entry.giveawayName ||
                "Untitled Giveaway"
            )}
          </h4>

          <p>
            ${escapeHTML(
              getModeLabel(entry.mode)
            )}
            ·
            ${
              entry.date
                ? new Date(
                    entry.date
                  ).toLocaleString()
                : "Unknown date"
            }
          </p>

        </div>

        <div class="history-meta">

          <span>
            ${winnerCount}
            winner${
              winnerCount === 1
                ? ""
                : "s"
            }
          </span>

          <button
            type="button"
            class="history-delete"
            data-delete-history="${escapeHTML(
              entry.id
            )}"
            aria-label="Delete giveaway history"
            title="Delete history"
          >
            ×
          </button>

        </div>
      `;

      list.appendChild(item);
    }
  );

  if (changed) {
    saveState();
  }
}


/* =========================================================
   DELETE ONE HISTORY ITEM
========================================================= */

document.addEventListener(
  "click",
  (event) => {
    const button =
      event.target.closest(
        "[data-delete-history]"
      );

    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    const historyId =
      button.dataset.deleteHistory;

    if (!historyId) {
      showToast(
        "Could not identify this history item.",
        "error"
      );

      return;
    }

    const historyIndex =
      state.history.findIndex(
        (entry) =>
          String(entry.id) ===
          String(historyId)
      );

    if (historyIndex === -1) {
      renderHistory();

      showToast(
        "History item was not found.",
        "error"
      );

      return;
    }

    const entry =
      state.history[historyIndex];

    const giveawayName =
      entry?.giveawayName ||
      "this giveaway";

    const confirmed =
      confirm(
        `Delete "${giveawayName}" from history?`
      );

    if (!confirmed) {
      return;
    }

    state.history.splice(
      historyIndex,
      1
    );

    saveState();

    renderHistory();

    updateEverything();

    showToast(
      "History deleted.",
      "success"
    );
  }
);


/* =========================================================
   CLEAR ALL HISTORY
   IMPORTANT FIX
========================================================= */

function clearAllHistory() {
  /*
    Never clear anything else here.
    This only removes completed giveaway history.
  */

  if (!Array.isArray(state.history)) {
    state.history = [];
  }

  if (!state.history.length) {
    showToast(
      "There is no history to clear.",
      "error"
    );

    renderHistory();

    updateEverything();

    return;
  }

  const confirmed =
    confirm(
      `Clear all giveaway history?\n\nThis will permanently remove ${state.history.length} saved giveaway${
        state.history.length === 1
          ? ""
          : "s"
      } from history.`
    );

  if (!confirmed) {
    return;
  }

  /*
    THIS IS THE IMPORTANT PART:
    Replace the history array itself.
  */
  state.history = [];

  /*
    Save immediately to localStorage.
  */
  saveState();

  /*
    Re-render the history screen.
  */
  renderHistory();

  /*
    Update dashboard/sidebar counters.
  */
  updateEverything();

  showToast(
    "All giveaway history cleared.",
    "success"
  );
}


/*
  Support all common button IDs/data attributes.
  This also uses delegation so it works even when the
  history page is rendered dynamically.
*/
document.addEventListener(
  "click",
  (event) => {
    const button =
      event.target.closest(
        "#clearHistory, #clearHistoryButton, [data-clear-history]"
      );

    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    clearAllHistory();
  }
);


/* =========================================================
   START GIVEAWAY
========================================================= */

function startGiveaway() {
  if (!state.participants.length) {
    showToast(
      "Add participants before starting.",
      "error"
    );

    showPage("participants");

    return;
  }

  state.giveawayStarted = true;

  state.completed = false;

  state.winners = [];

  state.rewards.forEach(
    (reward) => {
      reward.distributed = 0;
    }
  );

  saveState();

  updateEverything();

  showPage("draw");

  prepareSpinner();

  showToast(
    "Giveaway started! 🎉",
    "success"
  );
}


$("#startGiveawayButton")
  ?.addEventListener(
    "click",
    startGiveaway
  );


/* =========================================================
   NEW GIVEAWAY
========================================================= */

$("#newGiveaway")
  ?.addEventListener(
    "click",
    () => {
      const history =
        state.history;

      const settings =
        state.settings;

      state =
        structuredClone(
          defaultState
        );

      state.history =
        history;

      state.settings =
        settings;

      saveState();

      loadAllUI();

      showPage("home");

      showToast(
        "New giveaway ready.",
        "success"
      );
    }
  );


/* =========================================================
   RESTART GIVEAWAY
========================================================= */

$("#restartGiveaway")
  ?.addEventListener(
    "click",
    () => {
      state.winners = [];

      state.completed = false;

      state.giveawayStarted = true;

      state.rewards.forEach(
        (reward) => {
          reward.distributed = 0;
        }
      );

      saveState();

      currentWinner = null;

      currentReward = null;

      renderParticipants();

      renderRewards();

      updateEverything();

      showPage("draw");

      prepareSpinner();
    }
  );


/* =========================================================
   RESET GIVEAWAY
========================================================= */

$("#resetGiveawayButton")
  ?.addEventListener(
    "click",
    () => {
      if (
        !confirm(
          "Reset the current giveaway?"
        )
      ) {
        return;
      }

      const history =
        state.history;

      state =
        structuredClone(
          defaultState
        );

      state.history =
        history;

      saveState();

      currentWinner = null;

      currentReward = null;

      loadAllUI();

      showPage("home");

      showToast(
        "Giveaway reset.",
        "success"
      );
    }
  );


/* =========================================================
   DRAW STATS
========================================================= */

function updateDrawStats() {
  const count =
    getAvailableParticipants()
      .length;

  if ($("#drawParticipantCount")) {
    $("#drawParticipantCount")
      .textContent = count;
  }

  if ($("#drawWinnerProgress")) {
    $("#drawWinnerProgress")
      .textContent =
      `${state.winners.length} / ${
        state.winnerCount
      }`;
  }

  if ($("#drawRewardCount")) {
    $("#drawRewardCount")
      .textContent =
      getAvailableRewardSlots()
        .length;
  }
}


/* =========================================================
   HOME STATS
========================================================= */

function updateHomeStats() {
  if ($("#homeParticipantCount")) {
    $("#homeParticipantCount")
      .textContent =
      state.participants.length;
  }

  if ($("#homeRewardCount")) {
    $("#homeRewardCount")
      .textContent =
      state.rewards.reduce(
        (sum, reward) =>
          sum +
          Number(
            reward.quantity || 0
          ),
        0
      );
  }

  if ($("#homeWinnerCount")) {
    $("#homeWinnerCount")
      .textContent =
      state.winners.length;
  }

  if ($("#homeHistoryCount")) {
    $("#homeHistoryCount")
      .textContent =
      state.history.length;
  }

  if ($("#sidebarParticipantCount")) {
    $("#sidebarParticipantCount")
      .textContent =
      state.participants.length;
  }

  if ($("#sidebarRewardCount")) {
    $("#sidebarRewardCount")
      .textContent =
      state.rewards.reduce(
        (sum, reward) =>
          sum +
          Number(
            reward.quantity || 0
          ),
        0
      );
  }
}


function updateSetupProgress() {
  let progress = 0;

  if (state.participants.length) {
    progress += 35;
  }

  if (state.rewards.length) {
    progress += 35;
  }

  progress += 30;

  if ($("#setupProgressBar")) {
    $("#setupProgressBar")
      .style.width =
      `${progress}%`;
  }

  if ($("#setupProgressText")) {
    $("#setupProgressText")
      .textContent =
      `${progress}%`;
  }
}


function updateEverything() {
  updateHomeStats();

  updateSetupProgress();

  updateDrawStats();

  if ($("#giveawayName")) {
    $("#giveawayName")
      .value =
      state.giveawayName;
  }

  if ($("#winnerCount")) {
    $("#winnerCount")
      .value =
      state.winnerCount;
  }

  updateRewardSummary();
}


/* =========================================================
   UTILITIES
========================================================= */

function shuffleArray(array) {
  for (
    let i = array.length - 1;
    i > 0;
    i--
  ) {
    const j =
      Math.floor(
        Math.random() *
          (i + 1)
      );

    [
      array[i],
      array[j]
    ] = [
      array[j],
      array[i]
    ];
  }

  return array;
}


function wait(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}


function sanitizeFilename(name) {
  return (
    String(name ?? "")
      .replace(
        /[^a-z0-9]+/gi,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .toLowerCase() ||
    "giveaway"
  );
}


/* =========================================================
   SOUND
========================================================= */

let audioContext = null;


function getAudioContext() {
  if (
    !state.settings.soundEnabled
  ) {
    return null;
  }

  if (!audioContext) {
    try {
      audioContext =
        new (
          window.AudioContext ||
          window.webkitAudioContext
        )();
    } catch {
      return null;
    }
  }

  return audioContext;
}


function beep(
  frequency,
  duration,
  type = "sine",
  volume = 0.035
) {
  const ctx =
    getAudioContext();

  if (!ctx) return;

  try {
    const oscillator =
      ctx.createOscillator();

    const gain =
      ctx.createGain();

    oscillator.type =
      type;

    oscillator.frequency.value =
      frequency;

    gain.gain.setValueAtTime(
      volume,
      ctx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime +
        duration
    );

    oscillator.connect(gain);

    gain.connect(
      ctx.destination
    );

    oscillator.start();

    oscillator.stop(
      ctx.currentTime +
        duration
    );
  } catch {
    // Ignore audio errors.
  }
}


function playSpinSound() {
  if (
    !state.settings.soundEnabled
  ) {
    return;
  }

  beep(
    180,
    0.07,
    "square",
    0.025
  );

  setTimeout(
    () =>
      beep(
        250,
        0.07,
        "square",
        0.02
      ),
    80
  );
}


function playWinnerSound() {
  if (
    !state.settings.soundEnabled
  ) {
    return;
  }

  beep(
    523,
    0.13,
    "sine",
    0.045
  );

  setTimeout(
    () =>
      beep(
        659,
        0.13,
        "sine",
        0.045
      ),
    110
  );

  setTimeout(
    () =>
      beep(
        784,
        0.22,
        "sine",
        0.05
      ),
    220
  );
}


/* =========================================================
   CONFETTI
========================================================= */

function createConfetti() {
  const container =
    $("#confettiContainer");

  if (!container) return;

  container.innerHTML = "";

  for (
    let i = 0;
    i < 65;
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

    container.appendChild(
      piece
    );
  }
}


/* =========================================================
   KEYBOARD
========================================================= */

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape") {
      closeRewardModal();

      closeWinnerOverlay();

      closeSidebar();
    }

    if (
      event.code === "Space" &&
      !isSpinning
    ) {
      const activePage =
        $(".page.active");

      const target =
        document.activeElement;

      if (
        activePage?.id ===
          "page-draw" &&
        target?.tagName !== "INPUT" &&
        target?.tagName !== "TEXTAREA"
      ) {
        event.preventDefault();

        spin();
      }
    }
  }
);


/* =========================================================
   INITIALIZE
========================================================= */

function loadAllUI() {
  if ($("#giveawayName")) {
    $("#giveawayName")
      .value =
      state.giveawayName;
  }

  renderParticipants();

  renderRewards();

  renderHistory();

  $$(".mode-card")
    .forEach((card) => {
      card.classList.toggle(
        "selected",
        card.dataset.mode ===
          state.mode
      );
    });

  loadSettingsUI();

  if ($("#winnerCount")) {
    $("#winnerCount")
      .value =
      state.winnerCount;
  }

  updateEverything();

  prepareSpinner();
}


document.addEventListener(
  "DOMContentLoaded",
  () => {
    loadAllUI();

    console.log(
      "🎁 EGiveaways initialized."
    );
  }
);


/* =========================================================
   PUBLIC ENTRIES SYSTEM
   DO NOT MODIFY SPINNER LOGIC
========================================================= */

const ENTRY_API_BASE = "/api";


/* =========================================================
   ENTRY STATE
========================================================= */

let entryForms = [];

let activeEntryForm = null;

let activeEntrySubmissions = [];


/* =========================================================
   ENTRY API
========================================================= */

async function entryApiRequest(
  endpoint,
  options = {}
) {
  const response = await fetch(
    `${ENTRY_API_BASE}${endpoint}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
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
    throw new Error(
      data?.message ||
      data?.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}


/* =========================================================
   ENTRY DATE HELPERS
========================================================= */

function getLocalDateTimeValue(
  dateInput,
  timeInput
) {
  const date =
    $(dateInput)?.value || "";

  const time =
    $(timeInput)?.value || "";

  if (!date || !time) {
    return null;
  }

  /*
    datetime-local values represent local device time.
    Convert them to ISO only when sending to backend.
  */
  const localDate =
    new Date(`${date}T${time}`);

  if (
    Number.isNaN(
      localDate.getTime()
    )
  ) {
    return null;
  }

  return localDate.toISOString();
}


function formatEntryDate(date) {
  if (!date) {
    return "Not set";
  }

  const parsed =
    new Date(date);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return "Invalid date";
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
      form.startTime
    ).getTime();

  const end =
    new Date(
      form.endTime
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

  if (now >= start && now <= end) {
    return "open";
  }

  return "closed";
}


function getEntryStatusLabel(status) {
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


/* =========================================================
   ENTRY LINK
========================================================= */

function getPublicEntryUrl(formId) {
  const base =
    window.location.origin;

  return `${base}/entry.html?id=${encodeURIComponent(
    formId
  )}`;
}


async function copyEntryLink(formId) {
  const url =
    getPublicEntryUrl(formId);

  try {
    await navigator.clipboard.writeText(
      url
    );

    showToast(
      "Public entry link copied.",
      "success"
    );
  } catch {
    /*
      Fallback for browsers where
      navigator.clipboard is unavailable.
    */

    const textarea =
      document.createElement("textarea");

    textarea.value = url;

    textarea.style.position =
      "fixed";

    textarea.style.opacity =
      "0";

    document.body.appendChild(
      textarea
    );

    textarea.select();

    try {
      document.execCommand("copy");

      showToast(
        "Public entry link copied.",
        "success"
      );
    } catch {
      showToast(
        "Could not copy the public link.",
        "error"
      );
    }

    textarea.remove();
  }
}


/* =========================================================
   ENTRY FORM STATUS
========================================================= */

function getEntryStatusClass(status) {
  return `entry-status ${status}`;
}


/* =========================================================
   LOAD ENTRY FORMS
========================================================= */

async function loadEntryForms() {
  const list =
    $("#entryFormsList");

  if (!list) {
    return;
  }

  try {
    list.innerHTML = `
      <div class="entry-loading">
        <div class="entry-loading-spinner"></div>
        <span>Loading entry forms...</span>
      </div>
    `;

    const data =
      await entryApiRequest(
        "/entry-forms"
      );

    entryForms =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.entryForms)
          ? data.entryForms
          : [];

    renderEntryForms();

  } catch (error) {
    console.error(
      "Could not load entry forms:",
      error
    );

    list.innerHTML = `
      <div class="entry-error">
        <div class="empty-icon">⚠️</div>

        <h4>
          Could not load entry forms
        </h4>

        <p>
          Make sure the EGiveaways backend is running.
        </p>

        <button
          type="button"
          class="secondary-button"
          id="retryEntryForms"
        >
          ↻ Try Again
        </button>
      </div>
    `;

    updateEntryStats();
  }
}


/* =========================================================
   RENDER ENTRY FORMS
========================================================= */

function renderEntryForms() {
  const list =
    $("#entryFormsList");

  const empty =
    $("#entryFormsEmptyState");

  if (!list) {
    return;
  }

  list.innerHTML = "";

  if (!entryForms.length) {
    empty?.classList.add(
      "visible"
    );

    updateEntryStats();

    return;
  }

  empty?.classList.remove(
    "visible"
  );

  entryForms.forEach(
    (form) => {
      const status =
        getEntryStatus(form);

      const card =
        document.createElement(
          "div"
        );

      card.className =
        "entry-form-card";

      const entryType =
        form.entryType === "number"
          ? "Number"
          : "Name";

      const count =
        Number(
          form.entryCount ?? 
          form.entries?.length ??
          0
        );

      card.innerHTML = `
        <div class="entry-form-card-header">

          <div class="entry-form-card-title">

            <div class="entry-form-title-icon">
              ${
                form.entryType ===
                "number"
                  ? "🔢"
                  : "👤"
              }
            </div>

            <div>

              <h3>
                ${escapeHTML(
                  form.giveawayName ||
                    "Untitled Giveaway"
                )}
              </h3>

              <p>
                Public entry form
              </p>

            </div>

          </div>

          <span
            class="${getEntryStatusClass(
              status
            )}"
          >
            ${getEntryStatusLabel(
              status
            )}
          </span>

        </div>


        <div class="entry-form-badges">

          <span class="entry-type-badge">
            ${
              form.entryType ===
              "number"
                ? "🔢 Number"
                : "👤 Name"
            }
          </span>

          <span class="entry-count-badge">
            🎟️ ${count} ${
              count === 1
                ? "entry"
                : "entries"
            }
          </span>

        </div>


        <div class="entry-form-meta">

          <div class="entry-meta-item">

            <span>
              Opens
            </span>

            <strong>
              ${escapeHTML(
                formatEntryDate(
                  form.startTime
                )
              )}
            </strong>

          </div>


          <div class="entry-meta-item">

            <span>
              Closes
            </span>

            <strong>
              ${escapeHTML(
                formatEntryDate(
                  form.endTime
                )
              )}
            </strong>

          </div>

        </div>


        <div class="entry-form-link">

          <span>
            Public link
          </span>

          <code>
            ${escapeHTML(
              getPublicEntryUrl(
                form.id
              )
            )}
          </code>

        </div>


        <div class="entry-form-actions">

          <button
            type="button"
            class="secondary-button"
            data-view-entries="${escapeHTML(
              form.id
            )}"
          >
            👥 View Entries
          </button>


          <button
            type="button"
            class="secondary-button"
            data-copy-entry-link="${escapeHTML(
              form.id
            )}"
          >
            🔗 Copy Link
          </button>


          <button
            type="button"
            class="primary-button"
            data-use-entry-form="${escapeHTML(
              form.id
            )}"
          >
            🎟️ Use Entries
          </button>


          <button
            type="button"
            class="secondary-button"
            data-edit-entry-form="${escapeHTML(
              form.id
            )}"
          >
            ✎ Edit
          </button>


          <button
            type="button"
            class="danger-button"
            data-delete-entry-form="${escapeHTML(
              form.id
            )}"
          >
            Delete
          </button>

        </div>
      `;

      list.appendChild(card);
    }
  );

  updateEntryStats();
}


/* =========================================================
   ENTRY STATS
========================================================= */

function updateEntryStats() {
  const formCount =
    entryForms.length;

  const totalEntries =
    entryForms.reduce(
      (total, form) =>
        total +
        Number(
          form.entryCount ??
          form.entries?.length ??
          0
        ),
      0
    );

  const openCount =
    entryForms.filter(
      (form) =>
        getEntryStatus(form) ===
        "open"
    ).length;

  if ($("#entryFormCount")) {
    $("#entryFormCount")
      .textContent =
      formCount;
  }

  if ($("#totalEntryCount")) {
    $("#totalEntryCount")
      .textContent =
      totalEntries;
  }

  if ($("#openEntryFormCount")) {
    $("#openEntryFormCount")
      .textContent =
      openCount;
  }

  if ($("#publicLinkCount")) {
    $("#publicLinkCount")
      .textContent =
      formCount;
  }
}


/* =========================================================
   CREATE / EDIT ENTRY FORM MODAL
========================================================= */

function openEntryFormModal(editId = null) {
  const modal =
    $("#entryFormModal");

  const form =
    $("#entryForm");

  if (!modal || !form) {
    return;
  }

  form.reset();

  const title =
    $("#entryFormModalTitle");

  const submitButton =
    $("#entryFormSubmitButton");

  /* =======================================================
     EDIT MODE
  ======================================================= */

  if (editId) {
    const target =
      entryForms.find(
        (item) =>
          String(item.id) ===
          String(editId)
      );

    if (!target) {
      showToast(
        "Entry form not found.",
        "error"
      );

      return;
    }

    if ($("#editingEntryFormId")) {
      $("#editingEntryFormId")
        .value = target.id;
    }

    if (title) {
      title.textContent =
        "Edit Entry Form";
    }

    if (submitButton) {
      submitButton.textContent =
        "Save Changes";
    }

    if ($("#entryGiveawayName")) {
      $("#entryGiveawayName")
        .value =
        target.giveawayName || "";
    }

    const typeRadio =
      document.querySelector(
        `input[name="entryType"][value="${target.entryType}"]`
      );

    if (typeRadio) {
      typeRadio.checked = true;
    }

    const startDate =
      new Date(target.startTime);

    const endDate =
      new Date(target.endTime);

    if ($("#entryStartDate")) {
      $("#entryStartDate")
        .value =
        formatDateInput(startDate);
    }

    if ($("#entryStartTime")) {
      $("#entryStartTime")
        .value =
        formatTimeInput(startDate);
    }

    if ($("#entryEndDate")) {
      $("#entryEndDate")
        .value =
        formatDateInput(endDate);
    }

    if ($("#entryEndTime")) {
      $("#entryEndTime")
        .value =
        formatTimeInput(endDate);
    }

    modal.classList.add("active");

    modal.setAttribute(
      "aria-hidden",
      "false"
    );

    return;
  }

  /* =======================================================
     CREATE MODE
  ======================================================= */

  if ($("#editingEntryFormId")) {
    $("#editingEntryFormId")
      .value = "";
  }

  if (title) {
    title.textContent =
      "Create Entry Form";
  }

  if (submitButton) {
    submitButton.textContent =
      "Create Entry Form";
  }

  const now =
    new Date();

  const startDate =
    new Date(
      now.getTime() +
      5 * 60 * 1000
    );

  const endDate =
    new Date(
      now.getTime() +
      24 * 60 * 60 * 1000
    );

  if ($("#entryStartDate")) {
    $("#entryStartDate")
      .value =
      formatDateInput(startDate);
  }

  if ($("#entryStartTime")) {
    $("#entryStartTime")
      .value =
      formatTimeInput(startDate);
  }

  if ($("#entryEndDate")) {
    $("#entryEndDate")
      .value =
      formatDateInput(endDate);
  }

  if ($("#entryEndTime")) {
    $("#entryEndTime")
      .value =
      formatTimeInput(endDate);
  }

  if ($("#entryGiveawayName")) {
    $("#entryGiveawayName")
      .value =
      state.giveawayName || "";
  }

  const nameRadio =
    document.querySelector(
      'input[name="entryType"][value="name"]'
    );

  if (nameRadio) {
    nameRadio.checked = true;
  }

  modal.classList.add("active");

  modal.setAttribute(
    "aria-hidden",
    "false"
  );
}


function formatDateInput(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function formatTimeInput(date) {
  const hours =
    String(
      date.getHours()
    ).padStart(2, "0");

  const minutes =
    String(
      date.getMinutes()
    ).padStart(2, "0");

  return `${hours}:${minutes}`;
}


function closeEntryFormModal() {
  const modal =
    $("#entryFormModal");

  if (!modal) return;

  modal.classList.remove(
    "active"
  );

  modal.setAttribute(
    "aria-hidden",
    "true"
  );
}


/* =========================================================
   CREATE / UPDATE ENTRY FORM
========================================================= */

async function createEntryForm(event) {
  event.preventDefault();

  const editingId =
    $("#editingEntryFormId")
      ?.value || "";

  const isEdit = Boolean(editingId);

  const giveawayName =
    $("#entryGiveawayName")
      ?.value
      .trim() || "";

  const entryType =
    document.querySelector(
      'input[name="entryType"]:checked'
    )?.value || "name";

  const startTime =
    getLocalDateTimeValue(
      "#entryStartDate",
      "#entryStartTime"
    );

  const endTime =
    getLocalDateTimeValue(
      "#entryEndDate",
      "#entryEndTime"
    );

  if (!giveawayName) {
    showToast(
      "Enter a giveaway name.",
      "error"
    );

    return;
  }

  if (!startTime || !endTime) {
    showToast(
      "Choose the opening and closing date and time.",
      "error"
    );

    return;
  }

  const start =
    new Date(startTime);

  const end =
    new Date(endTime);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    showToast(
      "The selected date or time is invalid.",
      "error"
    );

    return;
  }

  if (
    end.getTime() <=
    start.getTime()
  ) {
    showToast(
      "Closing time must be after opening time.",
      "error"
    );

    return;
  }

  const submitButton =
    event.submitter;

  if (submitButton) {
    submitButton.disabled = true;

    submitButton.dataset.originalText =
      submitButton.innerHTML;

    submitButton.innerHTML =
      isEdit ? "Saving..." : "Creating...";
  }

  try {
    const endpoint =
      isEdit
        ? `/entry-forms/${encodeURIComponent(
            editingId
          )}`
        : "/entry-forms";

    const method =
      isEdit ? "PATCH" : "POST";

    const result =
      await entryApiRequest(
        endpoint,
        {
          method,

          body: JSON.stringify({
            giveawayName,
            entryType,
            startTime,
            endTime
          })
        }
      );

    if (isEdit) {
      const updated =
        result?.entryForm ||
        result?.form ||
        result;

      const index =
        entryForms.findIndex(
          (item) =>
            String(item.id) ===
            String(editingId)
        );

      if (index !== -1 && updated?.id) {
        entryForms[index] = {
          ...entryForms[index],
          ...updated
        };
      } else {
        await loadEntryForms();
      }

      showToast(
        "Entry form updated.",
        "success"
      );

    } else {
      const created =
        result?.entryForm ||
        result?.form ||
        result;

      if (created?.id) {
        entryForms.unshift(created);
      } else {
        await loadEntryForms();
      }

      showToast(
        "Public entry form created.",
        "success"
      );
    }

    closeEntryFormModal();

    renderEntryForms();

  } catch (error) {
    console.error(
      isEdit
        ? "Update entry form failed:"
        : "Create entry form failed:",
      error
    );

    showToast(
      error.message ||
        (isEdit
          ? "Could not update entry form."
          : "Could not create entry form."),
      "error"
    );

  } finally {
    if (submitButton) {
      submitButton.disabled = false;

      submitButton.innerHTML =
        submitButton.dataset
          .originalText ||
        (isEdit
          ? "Save Changes"
          : "Create Entry Form");
    }
  }
}


/* =========================================================
   VIEW SUBMISSIONS
========================================================= */

async function openEntriesModal(
  formId
) {
  const modal =
    $("#viewEntriesModal");

  const list =
    $("#submittedEntriesList");

  const empty =
    $("#submittedEntriesEmptyState");

  if (!modal || !list) {
    return;
  }

  const form =
    entryForms.find(
      (item) =>
        String(item.id) ===
        String(formId)
    );

  if (!form) {
    showToast(
      "Entry form not found.",
      "error"
    );

    return;
  }

  activeEntryForm =
    form;

  if ($("#viewEntriesTitle")) {
    $("#viewEntriesTitle")
      .textContent =
      form.giveawayName ||
      "Giveaway Entries";
  }

  if ($("#useEntriesButton")) {
    $("#useEntriesButton")
      .dataset.formId =
      form.id;
  }

  modal.classList.add(
    "active"
  );

  modal.setAttribute(
    "aria-hidden",
    "false"
  );

  list.innerHTML = `
    <div class="entry-loading">
      <div class="entry-loading-spinner"></div>
      <span>Loading submissions...</span>
    </div>
  `;

  empty?.classList.remove(
    "visible"
  );

  try {
    const data =
      await entryApiRequest(
        `/entry-forms/${encodeURIComponent(
          form.id
        )}/entries`
      );

    activeEntrySubmissions =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.entries)
          ? data.entries
          : [];

    renderSubmittedEntries();

  } catch (error) {
    console.error(
      "Could not load entries:",
      error
    );

    list.innerHTML = `
      <div class="entry-error">
        <div class="empty-icon">⚠️</div>

        <h4>
          Could not load entries
        </h4>

        <p>
          ${escapeHTML(
            error.message ||
              "Something went wrong."
          )}
        </p>
      </div>
    `;
  }
}


function closeEntriesModal() {
  const modal =
    $("#viewEntriesModal");

  if (!modal) return;

  modal.classList.remove(
    "active"
  );

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

  activeEntryForm =
    null;

  activeEntrySubmissions =
    [];
}


/* =========================================================
   RENDER SUBMISSIONS
========================================================= */

function renderSubmittedEntries() {
  const list =
    $("#submittedEntriesList");

  const empty =
    $("#submittedEntriesEmptyState");

  if (!list) return;

  list.innerHTML = "";

  const count =
    activeEntrySubmissions.length;

  if ($("#viewEntriesCount")) {
    $("#viewEntriesCount")
      .textContent =
      `${count} ${
        count === 1
          ? "Entry"
          : "Entries"
      }`;
  }

  if (!count) {
    empty?.classList.add(
      "visible"
    );

    return;
  }

  empty?.classList.remove(
    "visible"
  );

  activeEntrySubmissions.forEach(
    (entry, index) => {
      const item =
        document.createElement(
          "div"
        );

      item.className =
        "submitted-entry-item";

      item.dataset.entryId =
        entry.id;

      const value =
        entry.value ??
        entry.name ??
        entry.number ??
        "";

      item.innerHTML = `
        <div class="submitted-entry-number">
          ${index + 1}
        </div>

        <div class="submitted-entry-content">

          <strong class="submitted-entry-value">
            ${escapeHTML(value)}
          </strong>

          <span class="submitted-entry-time">
            ${
              entry.submittedAt
                ? escapeHTML(
                    formatEntryDate(
                      entry.submittedAt
                    )
                  )
                : "Submission time unavailable"
            }
            ${
              entry.updatedAt
                ? ` · edited ${escapeHTML(
                    formatEntryDate(
                      entry.updatedAt
                    )
                  )}`
                : ""
            }
          </span>

        </div>

        <div class="submitted-entry-actions">

          <button
            type="button"
            class="entry-edit-button"
            data-edit-entry="${escapeHTML(
              entry.id
            )}"
            title="Edit entry"
            aria-label="Edit entry"
          >
            ✎
          </button>

          <button
            type="button"
            class="entry-delete-button"
            data-delete-entry="${escapeHTML(
              entry.id
            )}"
            title="Delete entry"
            aria-label="Delete entry"
          >
            ×
          </button>

        </div>
      `;

      list.appendChild(item);
    }
  );
}


/* =========================================================
   DELETE SUBMISSION
========================================================= */

async function deleteSubmittedEntry(
  entryId
) {
  if (
    !activeEntryForm ||
    !entryId
  ) {
    return;
  }

  const entry =
    activeEntrySubmissions.find(
      (item) =>
        String(item.id) ===
        String(entryId)
    );

  if (!entry) {
    showToast(
      "Entry not found.",
      "error"
    );

    return;
  }

  const value =
    entry.value ??
    entry.name ??
    entry.number ??
    "this entry";

  const confirmed =
    confirm(
      `Delete "${value}" from the submitted entries?`
    );

  if (!confirmed) {
    return;
  }

  try {
    await entryApiRequest(
      `/entry-forms/${encodeURIComponent(
        activeEntryForm.id
      )}/entries/${encodeURIComponent(
        entryId
      )}`,
      {
        method: "DELETE"
      }
    );

    activeEntrySubmissions =
      activeEntrySubmissions.filter(
        (item) =>
          String(item.id) !==
          String(entryId)
      );

    renderSubmittedEntries();

    /*
      Update the corresponding form count.
    */
    const form =
      entryForms.find(
        (item) =>
          String(item.id) ===
          String(activeEntryForm.id)
      );

    if (form) {
      form.entryCount =
        activeEntrySubmissions.length;
    }

    updateEntryStats();

    showToast(
      "Entry deleted.",
      "success"
    );

  } catch (error) {
    console.error(
      "Delete entry failed:",
      error
    );

    showToast(
      error.message ||
        "Could not delete entry.",
      "error"
    );
  }
}


/* =========================================================
   START EDITING ENTRY
========================================================= */

function startEditingEntry(entryId) {
  if (!entryId) return;

  const item =
    document.querySelector(
      `.submitted-entry-item[data-entry-id="${CSS.escape(
        entryId
      )}"]`
    );

  if (!item) return;

  const entry =
    activeEntrySubmissions.find(
      (e) =>
        String(e.id) ===
        String(entryId)
    );

  if (!entry) return;

  const currentValue =
    entry.value ??
    entry.name ??
    entry.number ??
    "";

  const content =
    item.querySelector(
      ".submitted-entry-content"
    );

  if (!content) return;

  content.innerHTML = `
    <input
      type="${
        activeEntryForm?.entryType ===
        "number"
          ? "number"
          : "text"
      }"
      class="submitted-entry-edit-input"
      data-entry-id="${escapeHTML(
        entry.id
      )}"
      value="${escapeHTML(
        currentValue
      )}"
      autocomplete="off"
      ${
        activeEntryForm?.entryType ===
        "number"
          ? 'inputmode="numeric" pattern="[0-9]*" min="0"'
          : ""
      }
    >

    <span class="submitted-entry-time">
      Editing...
    </span>
  `;

  const actions =
    item.querySelector(
      ".submitted-entry-actions"
    );

  if (actions) {
    actions.innerHTML = `
      <button
        type="button"
        class="entry-save-button"
        data-save-entry="${escapeHTML(
          entry.id
        )}"
        title="Save"
        aria-label="Save"
      >
        ✓
      </button>

      <button
        type="button"
        class="entry-cancel-button"
        data-cancel-entry="${escapeHTML(
          entry.id
        )}"
        title="Cancel"
        aria-label="Cancel"
      >
        ×
      </button>
    `;
  }

  const input =
    content.querySelector(
      ".submitted-entry-edit-input"
    );

  input?.focus();

  input?.select();
}


/* =========================================================
   SAVE EDITED ENTRY
========================================================= */

async function saveEditedEntry(
  entryId,
  newValue
) {
  if (
    !activeEntryForm ||
    !entryId
  ) {
    return;
  }

  const cleanValue =
    String(newValue ?? "").trim();

  if (!cleanValue) {
    showToast(
      "Entry cannot be empty.",
      "error"
    );

    return;
  }

  if (
    activeEntryForm.entryType ===
    "number"
  ) {
    if (
      !/^[0-9]+$/.test(
        cleanValue
      )
    ) {
      showToast(
        "Please enter a valid number.",
        "error"
      );

      return;
    }
  }

  try {
    const result =
      await entryApiRequest(
        `/entry-forms/${encodeURIComponent(
          activeEntryForm.id
        )}/entries/${encodeURIComponent(
          entryId
        )}`,
        {
          method: "PATCH",

          body: JSON.stringify({
            value: cleanValue
          })
        }
      );

    const updated =
      result?.entry;

    const local =
      activeEntrySubmissions.find(
        (e) =>
          String(e.id) ===
          String(entryId)
      );

    if (local) {
      local.value =
        updated?.value ??
        cleanValue;

      local.updatedAt =
        updated?.updatedAt ||
        new Date().toISOString();
    }

    renderSubmittedEntries();

    showToast(
      "Entry updated.",
      "success"
    );

  } catch (error) {
    console.error(
      "Update entry failed:",
      error
    );

    showToast(
      error.message ||
        "Could not update entry.",
      "error"
    );
  }
}


/* =========================================================
   USE ENTRIES
========================================================= */

async function useCollectedEntries(
  formId
) {
  const form =
    entryForms.find(
      (item) =>
        String(item.id) ===
        String(formId)
    );

  if (!form) {
    showToast(
      "Entry form not found.",
      "error"
    );

    return;
  }

  let entries = [];

  try {
    const data =
      await entryApiRequest(
        `/entry-forms/${encodeURIComponent(
          form.id
        )}/entries`
      );

    entries =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.entries)
          ? data.entries
          : [];

  } catch (error) {
    console.error(
      "Could not fetch collected entries:",
      error
    );

    showToast(
      error.message ||
        "Could not load collected entries.",
      "error"
    );

    return;
  }

  const values =
    entries
      .map(
        (entry) =>
          cleanName(
            entry.value ??
            entry.name ??
            entry.number ??
            ""
          )
      )
      .filter(Boolean);

  if (!values.length) {
    showToast(
      "This entry form has no submissions yet.",
      "error"
    );

    return;
  }

  const confirmed =
    confirm(
      `Use ${values.length} collected ${
        values.length === 1
          ? "entry"
          : "entries"
      } as participants?\n\nThis will replace the current participant list.`
    );

  if (!confirmed) {
    return;
  }

  let finalValues =
    values;

  /*
    Respect the existing duplicate setting.
  */
  if (
    state.settings.duplicateHandling ===
    "remove"
  ) {
    const seen =
      new Set();

    finalValues =
      values.filter(
        (value) => {
          const key =
            normalizeName(value);

          if (seen.has(key)) {
            return false;
          }

          seen.add(key);

          return true;
        }
      );
  }

  state.participants =
    finalValues.map(
      (value) => ({
        id:
          createId("person"),

        name:
          value
      })
    );

  /*
    A new participant pool means
    previous winners should not remain
    in the active giveaway.
  */
  state.winners = [];

  state.completed = false;

  state.giveawayStarted = false;

  saveState();

  renderParticipants();

  updateEverything();

  closeEntriesModal();

  showPage(
    "participants"
  );

  showToast(
    `${finalValues.length} ${
      finalValues.length === 1
        ? "participant"
        : "participants"
    } imported from Entries.`,
    "success"
  );
}


/* =========================================================
   DELETE ENTRY FORM
========================================================= */

async function deleteEntryForm(
  formId
) {
  const form =
    entryForms.find(
      (item) =>
        String(item.id) ===
        String(formId)
    );

  if (!form) {
    showToast(
      "Entry form not found.",
      "error"
    );

    return;
  }

  const confirmed =
    confirm(
      `Delete "${form.giveawayName || "this entry form"}"?\n\nAll submitted entries for this form will also be removed.`
    );

  if (!confirmed) {
    return;
  }

  try {
    await entryApiRequest(
      `/entry-forms/${encodeURIComponent(
        form.id
      )}`,
      {
        method: "DELETE"
      }
    );

    entryForms =
      entryForms.filter(
        (item) =>
          String(item.id) !==
          String(form.id)
      );

    renderEntryForms();

    showToast(
      "Entry form deleted.",
      "success"
    );

  } catch (error) {
    console.error(
      "Delete entry form failed:",
      error
    );

    showToast(
      error.message ||
        "Could not delete entry form.",
      "error"
    );
  }
}


/* =========================================================
   ENTRY BUTTON EVENTS
========================================================= */

$("#createEntryFormButton")
  ?.addEventListener(
    "click",
    () => openEntryFormModal()
  );


$("#emptyCreateEntryForm")
  ?.addEventListener(
    "click",
    () => openEntryFormModal()
  );


$("#entryForm")
  ?.addEventListener(
    "submit",
    createEntryForm
  );


$("#entryFormsList")
  ?.addEventListener(
    "click",
    async (event) => {
      const viewButton =
        event.target.closest(
          "[data-view-entries]"
        );

      const copyButton =
        event.target.closest(
          "[data-copy-entry-link]"
        );

      const useButton =
        event.target.closest(
          "[data-use-entry-form]"
        );

      const editButton =
        event.target.closest(
          "[data-edit-entry-form]"
        );

      const deleteButton =
        event.target.closest(
          "[data-delete-entry-form]"
        );

      if (viewButton) {
        await openEntriesModal(
          viewButton.dataset
            .viewEntries
        );

        return;
      }

      if (copyButton) {
        await copyEntryLink(
          copyButton.dataset
            .copyEntryLink
        );

        return;
      }

      if (useButton) {
        await useCollectedEntries(
          useButton.dataset
            .useEntryForm
        );

        return;
      }

      if (editButton) {
        openEntryFormModal(
          editButton.dataset
            .editEntryForm
        );

        return;
      }

      if (deleteButton) {
        await deleteEntryForm(
          deleteButton.dataset
            .deleteEntryForm
        );
      }
    }
  );


/* =========================================================
   SUBMITTED ENTRIES LIST — CLICK
========================================================= */

$("#submittedEntriesList")
  ?.addEventListener(
    "click",
    async (event) => {
      const editButton =
        event.target.closest(
          "[data-edit-entry]"
        );

      if (editButton) {
        startEditingEntry(
          editButton.dataset
            .editEntry
        );

        return;
      }

      const saveButton =
        event.target.closest(
          "[data-save-entry]"
        );

      if (saveButton) {
        const input =
          saveButton
            .closest(
              ".submitted-entry-item"
            )
            ?.querySelector(
              ".submitted-entry-edit-input"
            );

        if (input) {
          await saveEditedEntry(
            saveButton.dataset
              .saveEntry,
            input.value
          );
        }

        return;
      }

      const cancelButton =
        event.target.closest(
          "[data-cancel-entry]"
        );

      if (cancelButton) {
        renderSubmittedEntries();

        return;
      }

      const deleteButton =
        event.target.closest(
          "[data-delete-entry]"
        );

      if (deleteButton) {
        await deleteSubmittedEntry(
          deleteButton.dataset
            .deleteEntry
        );
      }
    }
  );


/* =========================================================
   SUBMITTED ENTRIES LIST — KEYBOARD
========================================================= */

$("#submittedEntriesList")
  ?.addEventListener(
    "keydown",
    async (event) => {
      const input =
        event.target.closest(
          ".submitted-entry-edit-input"
        );

      if (!input) return;

      if (event.key === "Enter") {
        event.preventDefault();

        await saveEditedEntry(
          input.dataset.entryId,
          input.value
        );
      }

      if (event.key === "Escape") {
        event.preventDefault();

        renderSubmittedEntries();
      }
    }
  );


$("#useEntriesButton")
  ?.addEventListener(
    "click",
    async () => {
      const formId =
        $("#useEntriesButton")
          ?.dataset
          .formId;

      if (!formId) {
        showToast(
          "No entry form selected.",
          "error"
        );

        return;
      }

      await useCollectedEntries(
        formId
      );
    }
  );


$("#retryEntryForms")
  ?.addEventListener(
    "click",
    loadEntryForms
  );


/* =========================================================
   GENERIC MODAL CLOSE
========================================================= */

document.addEventListener(
  "click",
  (event) => {
    const closeButton =
      event.target.closest(
        "[data-close-modal]"
      );

    if (closeButton) {
      const modalId =
        closeButton.dataset
          .closeModal;

      if (
        modalId ===
        "entryFormModal"
      ) {
        closeEntryFormModal();
      }

      if (
        modalId ===
        "viewEntriesModal"
      ) {
        closeEntriesModal();
      }

      if (
        modalId ===
        "rewardModal"
      ) {
        closeRewardModal();
      }

      return;
    }

    /*
      Clicking the dark backdrop itself
      closes the Entries modals.
    */
    if (
      event.target.classList.contains(
        "modal-backdrop"
      )
    ) {
      if (
        event.target.id ===
        "entryFormModal"
      ) {
        closeEntryFormModal();
      }

      if (
        event.target.id ===
        "viewEntriesModal"
      ) {
        closeEntriesModal();
      }

      if (
        event.target.id ===
        "rewardModal"
      ) {
        closeRewardModal();
      }
    }
  }
);


/* =========================================================
   ENTRY PAGE NAVIGATION
========================================================= */

const originalShowPage =
  showPage;


/*
  We don't replace showPage.
  We simply listen for navigation and
  refresh Entries when the page is opened.
*/
document.addEventListener(
  "click",
  (event) => {
    const button =
      event.target.closest(
        '[data-page="entries"]'
      );

    if (!button) {
      return;
    }

    setTimeout(
      () => {
        loadEntryForms();
      },
      0
    );
  }
);


/* =========================================================
   AUTO REFRESH ENTRY STATUS
========================================================= */

setInterval(
  () => {
    if (!entryForms.length) {
      return;
    }

    updateEntryStats();

    const page =
      $("#page-entries");

    if (
      page?.classList.contains(
        "active"
      )
    ) {
      renderEntryForms();
    }
  },
  30000
);


/* =========================================================
   INITIAL ENTRY LOAD
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    /*
      Delay slightly so the original
      application initialization finishes
      first.
    */
    setTimeout(
      () => {
        loadEntryForms();
      },
      250
    );
  }
);
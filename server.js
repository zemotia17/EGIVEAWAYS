const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "giveaways.json");

/* =========================================================
   GIST BACKUP CONFIG
========================================================= */

const GIST_ID = process.env.GIST_ID || "";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

const GIST_ENABLED =
  Boolean(GIST_ID) && Boolean(GITHUB_TOKEN);

const GIST_FILENAME = "egiveaways-backup.json";

const GIST_API_BASE = "https://api.github.com/gists";

let gistBackupInFlight = false;

let gistBackupQueued = false;

/* =========================================================
   BOOT: ENSURE LOCAL FILE EXISTS
========================================================= */

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({ entryForms: [] }, null, 2)
  );
}

/* =========================================================
   STORAGE
========================================================= */

function readData() {
  try {
    return JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch (error) {
    return {
      entryForms: []
    };
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2)
    );
  } catch (error) {
    console.error(
      "Could not write local data file:",
      error
    );

    return;
  }

  /*
    Fire-and-forget backup.
    Never blocks the request response.
  */
  backupToGist(data);
}

/* =========================================================
   GIST BACKUP
========================================================= */

async function backupToGist(data) {
  if (!GIST_ENABLED) {
    return;
  }

  /*
    Coalesce rapid writes into a single backup.
    If a backup is already in progress, mark that
    another one is needed as soon as it finishes.
  */
  if (gistBackupInFlight) {
    gistBackupQueued = true;

    return;
  }

  gistBackupInFlight = true;

  try {
    const body = JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(data, null, 2)
        }
      }
    });

    const response = await fetch(
      `${GIST_API_BASE}/${GIST_ID}`,
      {
        method: "PATCH",

        headers: {
          "Authorization": `Bearer ${GITHUB_TOKEN}`,

          "Accept": "application/vnd.github+json",

          "Content-Type": "application/json",

          "User-Agent": "EGiveaways"
        },

        body
      }
    );

    if (!response.ok) {
      const text = await response.text();

      console.error(
        "Gist backup failed:",
        response.status,
        text
      );

      return;
    }

    console.log(
      `Gist backup OK (${new Date().toISOString()})`
    );
  } catch (error) {
    console.error(
      "Gist backup error:",
      error.message
    );
  } finally {
    gistBackupInFlight = false;

    if (gistBackupQueued) {
      gistBackupQueued = false;

      /*
        Another write happened during the last
        backup. Push the latest local state up.
      */
      backupToGist(readData());
    }
  }
}

/* =========================================================
   GIST RESTORE
========================================================= */

async function restoreFromGist() {
  if (!GIST_ENABLED) {
    console.log(
      "Gist backup disabled (no GIST_ID / GITHUB_TOKEN)."
    );

    return;
  }

  try {
    const response = await fetch(
      `${GIST_API_BASE}/${GIST_ID}`,
      {
        headers: {
          "Authorization": `Bearer ${GITHUB_TOKEN}`,

          "Accept": "application/vnd.github+json",

          "User-Agent": "EGiveaways"
        }
      }
    );

    if (!response.ok) {
      console.error(
        "Gist restore failed:",
        response.status
      );

      return;
    }

    const payload = await response.json();

    const file = payload?.files?.[GIST_FILENAME];

    if (!file) {
      console.error(
        `Gist file "${GIST_FILENAME}" not found.`
      );

      return;
    }

    const raw = file.truncated
      ? await fetchGistFileRaw(file.raw_url)
      : file.content;

    if (!raw || String(raw).trim() === "") {
      console.log(
        "Gist backup is empty. Skipping restore."
      );

      return;
    }

    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error(
        "Gist content is not valid JSON. Skipping restore."
      );

      return;
    }

    if (
      !parsed ||
      !Array.isArray(parsed.entryForms)
    ) {
      console.error(
        "Gist content has unexpected shape. Skipping restore."
      );

      return;
    }

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(parsed, null, 2)
    );

    console.log(
      `Restored ${parsed.entryForms.length} entry form(s) from Gist.`
    );
  } catch (error) {
    console.error(
      "Gist restore error:",
      error.message
    );
  }
}

async function fetchGistFileRaw(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "EGiveaways"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Could not fetch raw gist file (${response.status})`
    );
  }

  return response.text();
}

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(express.json());

app.use(express.static(__dirname));

/* =========================================================
   IDS
========================================================= */

function createId() {
  return (
    Date.now().toString(36) +
    Math.random()
      .toString(36)
      .substring(2, 10)
  );
}

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "EGiveaways API is running",
    gistBackup: GIST_ENABLED ? "enabled" : "disabled"
  });
});

/* =========================================================
   CREATE ENTRY FORM
========================================================= */

app.post("/api/entry-forms", (req, res) => {
  const {
    giveawayName,
    entryType,
    startTime,
    endTime
  } = req.body;

  if (!giveawayName) {
    return res.status(400).json({
      success: false,
      message: "Giveaway name is required."
    });
  }

  if (
    entryType !== "name" &&
    entryType !== "number"
  ) {
    return res.status(400).json({
      success: false,
      message: "Entry type must be name or number."
    });
  }

  if (!startTime || !endTime) {
    return res.status(400).json({
      success: false,
      message:
        "Start time and end time are required."
    });
  }

  const data = readData();

  const entryForm = {
    id: createId(),
    giveawayName: String(giveawayName).trim(),
    entryType,
    startTime,
    endTime,
    entries: [],
    createdAt: new Date().toISOString()
  };

  data.entryForms.push(entryForm);

  writeData(data);

  res.status(201).json({
    success: true,
    entryForm
  });
});

/* =========================================================
   GET ALL ENTRY FORMS
========================================================= */

app.get("/api/entry-forms", (req, res) => {
  const data = readData();

  res.json({
    success: true,
    entryForms: data.entryForms
  });
});

/* =========================================================
   GET ONE ENTRY FORM
========================================================= */

app.get("/api/entry-forms/:id", (req, res) => {
  const data = readData();

  const entryForm =
    data.entryForms.find(
      form => form.id === req.params.id
    );

  if (!entryForm) {
    return res.status(404).json({
      success: false,
      message: "Entry form not found."
    });
  }

  res.json({
    success: true,
    entryForm: {
      ...entryForm,
      entries: undefined,
      entryCount: entryForm.entries.length
    }
  });
});

/* =========================================================
   UPDATE ENTRY FORM
========================================================= */

app.patch("/api/entry-forms/:id", (req, res) => {
  const data = readData();

  const entryForm =
    data.entryForms.find(
      form => form.id === req.params.id
    );

  if (!entryForm) {
    return res.status(404).json({
      success: false,
      message: "Entry form not found."
    });
  }

  const {
    giveawayName,
    entryType,
    startTime,
    endTime
  } = req.body || {};

  if (
    giveawayName !== undefined &&
    String(giveawayName).trim() === ""
  ) {
    return res.status(400).json({
      success: false,
      message: "Giveaway name cannot be empty."
    });
  }

  if (
    entryType !== undefined &&
    entryType !== "name" &&
    entryType !== "number"
  ) {
    return res.status(400).json({
      success: false,
      message: "Entry type must be name or number."
    });
  }

  if (giveawayName !== undefined) {
    entryForm.giveawayName =
      String(giveawayName).trim();
  }

  if (entryType !== undefined) {
    entryForm.entryType = entryType;
  }

  if (startTime !== undefined) {
    entryForm.startTime = startTime;
  }

  if (endTime !== undefined) {
    entryForm.endTime = endTime;
  }

  const start =
    new Date(entryForm.startTime).getTime();

  const end =
    new Date(entryForm.endTime).getTime();

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    end <= start
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Closing time must be after opening time."
    });
  }

  entryForm.updatedAt =
    new Date().toISOString();

  writeData(data);

  res.json({
    success: true,
    message: "Entry form updated.",
    entryForm: {
      ...entryForm,
      entries: undefined,
      entryCount: entryForm.entries.length
    }
  });
});

/* =========================================================
   SUBMIT PUBLIC ENTRY
========================================================= */

app.post(
  "/api/entry-forms/:id/entries",
  (req, res) => {
    const { value } = req.body;

    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Entry is required."
      });
    }

    const data = readData();

    const entryForm =
      data.entryForms.find(
        form => form.id === req.params.id
      );

    if (!entryForm) {
      return res.status(404).json({
        success: false,
        message: "Entry form not found."
      });
    }

    const now = Date.now();

    const start =
      new Date(entryForm.startTime).getTime();

    const end =
      new Date(entryForm.endTime).getTime();

    if (Number.isNaN(start) || Number.isNaN(end)) {
      return res.status(500).json({
        success: false,
        message: "Invalid entry form time."
      });
    }

    if (now < start) {
      return res.status(403).json({
        success: false,
        message: "Entries have not opened yet."
      });
    }

    if (now >= end) {
      return res.status(403).json({
        success: false,
        message: "Entries are closed."
      });
    }

    const cleanValue =
      String(value).trim();

    if (entryForm.entryType === "number") {
      if (!/^[0-9]+$/.test(cleanValue)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid number."
        });
      }
    }

    const entry = {
      id: createId(),
      value: cleanValue,
      submittedAt: new Date().toISOString()
    };

    entryForm.entries.push(entry);

    writeData(data);

    res.status(201).json({
      success: true,
      message: "Entry submitted successfully.",
      entry
    });
  }
);

/* =========================================================
   GET ENTRIES FOR ADMIN
========================================================= */

app.get(
  "/api/entry-forms/:id/entries",
  (req, res) => {
    const data = readData();

    const entryForm =
      data.entryForms.find(
        form => form.id === req.params.id
      );

    if (!entryForm) {
      return res.status(404).json({
        success: false,
        message: "Entry form not found."
      });
    }

    res.json({
      success: true,
      entries: entryForm.entries,
      count: entryForm.entries.length
    });
  }
);

/* =========================================================
   UPDATE ENTRY
========================================================= */

app.patch(
  "/api/entry-forms/:id/entries/:entryId",
  (req, res) => {
    const data = readData();

    const entryForm =
      data.entryForms.find(
        form => form.id === req.params.id
      );

    if (!entryForm) {
      return res.status(404).json({
        success: false,
        message: "Entry form not found."
      });
    }

    const entry =
      entryForm.entries.find(
        item =>
          item.id === req.params.entryId
      );

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Entry not found."
      });
    }

    const { value } = req.body;

    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Entry value is required."
      });
    }

    const cleanValue =
      String(value).trim();

    if (entryForm.entryType === "number") {
      if (!/^[0-9]+$/.test(cleanValue)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid number."
        });
      }
    }

    entry.value = cleanValue;

    entry.updatedAt =
      new Date().toISOString();

    writeData(data);

    res.json({
      success: true,
      message: "Entry updated.",
      entry
    });
  }
);

/* =========================================================
   DELETE ENTRY
========================================================= */

app.delete(
  "/api/entry-forms/:id/entries/:entryId",
  (req, res) => {
    const data = readData();

    const entryForm =
      data.entryForms.find(
        form => form.id === req.params.id
      );

    if (!entryForm) {
      return res.status(404).json({
        success: false,
        message: "Entry form not found."
      });
    }

    const index =
      entryForm.entries.findIndex(
        entry =>
          entry.id === req.params.entryId
      );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Entry not found."
      });
    }

    entryForm.entries.splice(index, 1);

    writeData(data);

    res.json({
      success: true,
      message: "Entry deleted."
    });
  }
);

/* =========================================================
   DELETE ENTRY FORM
========================================================= */

app.delete("/api/entry-forms/:id", (req, res) => {
  const data = readData();

  const index = data.entryForms.findIndex(
    (form) =>
      String(form.id) ===
      String(req.params.id)
  );

  if (index === -1) {
    return res.status(404).json({
      message: "Entry form not found."
    });
  }

  data.entryForms.splice(index, 1);

  writeData(data);

  res.json({
    success: true,
    message: "Entry form deleted."
  });
});

/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, "0.0.0.0", async () => {
  console.log(
    `EGiveaways server running on port ${PORT}`
  );

  /*
    Restore from Gist on startup.
    This must happen BEFORE we accept real traffic
    to avoid a race where a request reads an empty file.
  */
  await restoreFromGist();

  console.log("EGiveaways ready.");
});
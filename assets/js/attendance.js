let projectChoices;

function updateClock() {
  const now = new Date();
  const timeString = now.toLocaleTimeString();
  const clockElement = document.getElementById("liveClock");
  if (clockElement) clockElement.textContent = timeString;
}
setInterval(updateClock, 1000);

async function checkCurrentStatus() {
  const btn = document.getElementById("attendanceBtn");
  const projectSelect = document.getElementById("projectSelect");
  const punchInDisplay = document.getElementById("punchInTimeDisplay");

  try {
    const res = await fetch(`${API_URL}/attendance/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await res.json();

    if (res.ok && result.active) {
      isPunchedIn = true;
      btn.innerText = "Punch Out";
      btn.className = "btn btn-danger btn-lg";

      // Prefill and lock the project
      projectSelect.value = result.data.project;
      projectSelect.disabled = true;
      btn.disabled = false;

      // FIX: Restore the Punch In time display from the database result
      const time = new Date(result.data.punchIn).toLocaleTimeString();
      punchInDisplay.innerHTML = `<strong>Punch In:</strong> ${time}`;

      if (projectChoices) {
        // This maps the ID from the database to the name in the dropdown
        projectChoices.setChoiceByValue(result.data.project);
        projectChoices.disable();
      }
    } else {
      projectChoices.enable();
      checkLockout();
    }
  } catch (err) {
    console.error("Status check failed", err);
    checkLockout();
  }
}

function startLockdown(lockUntil) {
  const btn = document.getElementById("attendanceBtn");

  // Disable both
  if (projectChoices) projectChoices.disable();
  btn.disabled = true;

  const timer = setInterval(() => {
    const now = Date.now();
    const timeLeft = lockUntil - now;

    if (timeLeft <= 0) {
      clearInterval(timer);
      btn.disabled = false;

      // --- RE-ENABLE SEARCHABLE SELECTOR ---
      if (projectChoices) {
        projectChoices.enable();
        projectChoices.setChoiceByValue(""); // Reset to placeholder
      }

      btn.innerText = "Punch In";
      btn.className = "btn btn-success btn-lg";
      localStorage.removeItem("attendanceLock");

      document.getElementById("punchInTimeDisplay").innerText =
        "Punch In: --:--";
      document.getElementById("punchOutTimeDisplay").innerText =
        "Punch Out: --:--";
    } else {
      const seconds = Math.ceil(timeLeft / 1000);
      btn.innerText = `Locked (${seconds}s)`;
    }
  }, 1000);
}

// Check for existing lock on page load/modal open
function checkLockout() {
  const lockUntil = localStorage.getItem("attendanceLock");
  if (lockUntil && Date.now() < lockUntil) {
    startLockdown(parseInt(lockUntil));
  }
}

// 2. Load Projects into Dropdown (Call this when modal opens)
// const attendanceModal = document.getElementById("attendanceModal");
// if (attendanceModal) {
//   attendanceModal.addEventListener("show.bs.modal", checkCurrentStatus);
//   attendanceModal.addEventListener("show.bs.modal", checkLockout);
//   attendanceModal.addEventListener("show.bs.modal", async () => {
//     const projectSelect = document.getElementById("projectSelect");

//     // Destroy previous instance if it exists to avoid duplication
//     if (projectChoices) projectChoices.destroy();

//     try {
//       const res = await fetch(`${API_URL}/projects/list`, {
//         headers: { Authorization: `Bearer ${token}` },
//       });
//       const data = await res.json();

//       // Map projects for Choices.js
//       const projectOptions = data.projects.map((p) => ({
//         value: p._id,
//         label: p.projectNo,
//         selected: false,
//         disabled: false,
//       }));

//       // Initialize Choices.js with search enabled
//       projectChoices = new Choices(projectSelect, {
//         searchEnabled: true,
//         itemSelectText: "",
//         choices: [
//           // {
//           //   value: "",
//           //   label: "-- Choose Project --",
//           //   selected: true,
//           //   disabled: false,
//           // },
//           ...projectOptions,
//         ],
//       });

//       await checkCurrentStatus();
//     } catch (err) {
//       console.error("Searchable dropdown failed", err);
//     }
//   });
// }
let projectsLoaded = false;

const attendanceModal = document.getElementById("attendanceModal");

if (attendanceModal) {
  // Check Status and Lockout every time modal opens
  attendanceModal.addEventListener("show.bs.modal", () => {
    checkCurrentStatus();
    checkLockout();
  });

  // Only fetch and initialize Choices.js if not already done
  attendanceModal.addEventListener("show.bs.modal", async () => {
    // If we already loaded the projects, don't fetch again.
    // Just update the status (handled above).
    if (projectsLoaded && projectChoices) {
      return;
    }

    const projectSelect = document.getElementById("projectSelect");

    // Clean up if it exists partially
    if (projectChoices) {
      projectChoices.destroy();
      projectChoices = null;
    }

    try {
      // 1. Fetch Data
      const res = await fetch(`${API_URL}/projects/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      // 2. Clear existing options in the DOM element to be safe
      projectSelect.innerHTML =
        '<option value="">-- Choose Project --</option>';

      // 3. Map projects for Choices.js
      const projectOptions = data.projects.map((p) => ({
        value: p._id,
        label: `${p.projectNo}`, // Added Client Name for better visibility
        selected: false,
        disabled: false,
      }));

      // 4. Initialize Choices.js
      projectChoices = new Choices(projectSelect, {
        searchEnabled: true,
        itemSelectText: "",
        shouldSort: false, // Optional: keeps list in order of API response
        choices: projectOptions, // Load data directly here
      });

      // 5. Mark as loaded so we don't do this again next time modal opens
      projectsLoaded = true;

      // 6. Check status again to lock the dropdown if user is already punched in
      await checkCurrentStatus();
    } catch (err) {
      console.error("Searchable dropdown failed", err);
    }
  });
}

let isPunchedIn = false; // You should ideally fetch this state from the server on page load
async function handleAttendance() {
  const projectSelect = document.getElementById("projectSelect");
  const projectId = projectSelect.value;
  const btn = document.getElementById("attendanceBtn");

  if (!isPunchedIn && !projectId) {
    Swal.fire("Wait!", "Please select a project first.", "warning");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/attendance/toggle-punch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ projectId }),
    });

    const result = await response.json();

    if (response.ok) {
      if (result.action === "in") {
        isPunchedIn = true;
        btn.innerText = "Punch Out";
        btn.className = "btn btn-danger btn-lg";

        // --- DISABLE SEARCHABLE SELECTOR ---
        if (projectChoices) projectChoices.disable();

        document.getElementById("punchInTimeDisplay").innerHTML =
          `<strong>Punch In:</strong> ${new Date(
            result.data.punchIn,
          ).toLocaleTimeString()}`;
      } else {
        isPunchedIn = false;

        // --- ENABLE SEARCHABLE SELECTOR ---
        // Note: We keep it disabled during the 10s lockdown via startLockdown
        const lockUntil = Date.now() + 10 * 1000;
        localStorage.setItem("attendanceLock", lockUntil);
        startLockdown(lockUntil);

        document.getElementById("punchOutTimeDisplay").innerHTML =
          `<strong>Punch Out:</strong> ${new Date(
            result.data.punchOut,
          ).toLocaleTimeString()}`;

        Swal.fire(
          "Success",
          "Punched out! System locked for 10 seconds.",
          "success",
        );
      }
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

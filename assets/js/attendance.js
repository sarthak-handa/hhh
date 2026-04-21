let projectChoices;

function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const clockElement = document.getElementById("liveClock");
    if (clockElement) clockElement.textContent = timeString;
}
setInterval(updateClock, 1000);

async function checkCurrentStatus() {
    console.log("Attendance status check disabled in serverless mode.");
}

function checkLockout() {
    const lockUntil = localStorage.getItem("attendanceLock");
    if (lockUntil && Date.now() < lockUntil) {
        // Simple mock of lockdown if needed
    }
}

const attendanceModal = document.getElementById("attendanceModal");

if (attendanceModal) {
    attendanceModal.addEventListener("show.bs.modal", () => {
        const projectSelect = document.getElementById("projectSelect");
        if (projectSelect) {
            projectSelect.innerHTML = '<option value="">Attendance disabled in serverless mode</option>';
            projectSelect.disabled = true;
        }
        const btn = document.getElementById("attendanceBtn");
        if (btn) {
            btn.disabled = true;
            btn.innerText = "Disabled";
        }
    });
}

async function handleAttendance() {
    Swal.fire("Note", "Attendance functionality requires a dedicated backend and has been disabled in this serverless version.", "info");
}

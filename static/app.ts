// Interfaces

interface Employee {
  username: string;
  name: string;
  surname: string;
  visible: boolean;
  team?: string;
  department?: string;
  pair?: string;
}

interface DayOffTypeConfig {
  background: string;
  foreground: string;
}

// Non-holiday day-off entries.
interface DayOffEntry {
  date: string; // ISO date e.g. "2025-04-15"
  type: string;
  note?: string;
}

interface DaysOffData {
  [username: string]: DayOffEntry[];
}

// Holiday entries (predefined or user-added).
interface Holiday {
  date: string;
  name: string;
}

interface HolidaysData {
  holidays: Holiday[];
}

interface EmployeesData {
  config: {
    displayType: "fullname" | "surname" | "username";
  };
  dayOffTypes: { [type: string]: DayOffTypeConfig };
  employees: Employee[];
  teams?: string[];    // New: list of teams
  departments?: string[]; // New: list of departments
}

interface ModalContext {
  username: string;
  isoDate: string;
  cell: HTMLDivElement;
}

interface BackupConfig {
  maxBackups: number;
  enabled: boolean;
  backupFolder?: string;
}

// When the DOM content is loaded, initialize the app
document.addEventListener("DOMContentLoaded", initApp);

interface EmployeesData {
  config: {
    displayType: "fullname" | "surname" | "username";
  };
  dayOffTypes: { [type: string]: DayOffTypeConfig };
  employees: Employee[];
  teams?: string[];    // New: list of teams
  departments?: string[]; // New: list of departments
}
interface DayOffTypeConfig {
  background: string;
  foreground: string;
}
// Global state variables.
let employeesData: EmployeesData;
let daysOffData: DaysOffData;
let holidaysData: HolidaysData;
let currentYear: number;
let currentMonth: number; // 0-indexed

// Filter state
let currentNameFilter: string = '';
let currentTeamFilter: string = '';

// Get DOM elements once data has loaded
let monthSelect: HTMLSelectElement;
let yearSelect: HTMLSelectElement;
let employeeListDiv: HTMLDivElement;
let modal: HTMLDivElement;
let dayOffTypeSelect: HTMLSelectElement;
let dayOffNoteInput: HTMLInputElement;
let cancelButton: HTMLButtonElement;
let saveButton: HTMLButtonElement;
let removeButton: HTMLButtonElement;
let holidayInfo: HTMLDivElement;
let editableArea: HTMLDivElement;
let themeToggle: HTMLDivElement;

// New filter controls
let employeeFilter: HTMLInputElement;
let teamFilter: HTMLSelectElement;

// Quick actions elements
let quickActions: HTMLDivElement;
let actionShowToday: HTMLDivElement;
let actionToggleTheme: HTMLDivElement;
let actionExportData: HTMLDivElement;

// User statistics modal elements
let userStatsModal: HTMLDivElement;
let userStatsName: HTMLDivElement;
let userStatsContent: HTMLDivElement;
let userStatsCloseButton: HTMLButtonElement;

// Modal context.
let modalContext: { username: string; isoDate: string; cell: HTMLDivElement } | null = null;

// Drag and drop variables
let draggedCell: HTMLDivElement | null = null;
let draggedUsername: string | null = null;
let draggedDayOffEntry: DayOffEntry | null = null;
let draggedIndex: number = -1;

const backupConfig = {
  maxBackups: 3,  // Maximum number of backups to keep for each file type
  enabled: true  // Whether backups are enabled
};

/**
 * Close the modal.
 */
function closeModal() {
  modal.style.display = "none";
  modalContext = null;
  console.log("Modal closed");
}

/**
 * Save modal changes.
 */
function saveModal() {
  if (!modalContext) return;
  const { username, isoDate, cell } = modalContext;

  if (getHoliday(isoDate)) {
    closeModal();
    return;
  }

  // Check if it's a weekend
  if (isWeekend(isoDate)) {
    closeModal();
    return;
  }

  // Check if paired employee has day off
  const pairedUsername = getPairedUsername(username);
  if (pairedUsername && hasUserDayOff(pairedUsername, isoDate)) {
    showNotification("Cannot save: Your pair already has this day off", "error");
    closeModal();
    return;
  }

  const selectedType = dayOffTypeSelect.value;
  const note = dayOffNoteInput.value.trim();

  if (selectedType === "Holiday") {
    let existingHoliday = holidaysData.holidays.find((h) => h.date === isoDate);
    if (!existingHoliday) {
      existingHoliday = {
        date: isoDate,
        name: note || "Holiday"
      };
      holidaysData.holidays.push(existingHoliday);
    } else {
      existingHoliday.name = note || "Holiday";
    }
    cell.style.backgroundColor = employeesData.dayOffTypes["Holiday"].background;
    cell.style.color = employeesData.dayOffTypes["Holiday"].foreground;
    cell.classList.add("holiday");
    cell.classList.remove("day-off");
    cell.removeAttribute("draggable");

    // Set tooltip for holiday
    cell.title = note || "Holiday";
    cell.setAttribute('data-tooltip', note || "Holiday"); // Add this line
  } else {
    if (!daysOffData[username]) {
      daysOffData[username] = [];
    }
    const userDaysOff = daysOffData[username];
    const existingIndex = userDaysOff.findIndex((entry) => entry.date === isoDate);

    if (selectedType === "") {
      if (existingIndex !== -1) {
        userDaysOff.splice(existingIndex, 1);
        cell.style.backgroundColor = "";
        cell.style.color = "";
        cell.classList.remove("day-off");
        cell.removeAttribute("draggable");
        delete cell.dataset.type;

        // Clear tooltip when removing day off
        cell.title = "";
        cell.removeAttribute('data-tooltip'); // Add this line
      }
    } else {
      const dayOffEntry: DayOffEntry = { date: isoDate, type: selectedType};
      if (note !== "") {
        dayOffEntry.note = note;
      }
      if (existingIndex === -1) {
        userDaysOff.push(dayOffEntry);
      } else {
        userDaysOff[existingIndex] = dayOffEntry;
      }
      const typeConfig = employeesData.dayOffTypes[selectedType] || employeesData.dayOffTypes["Normal"];
      cell.style.backgroundColor = typeConfig.background;
      cell.style.color = typeConfig.foreground;
      cell.classList.add("day-off");
      cell.classList.remove("holiday");
      cell.dataset.type = selectedType;
      cell.setAttribute("draggable", "true");

      // Set tooltip for day off with type and note information
      if (note) {
        cell.title = `${selectedType}: ${note}`;
        cell.setAttribute('data-tooltip', `${selectedType}: ${note}`); // Add this line
      } else {
        cell.title = selectedType;
        cell.setAttribute('data-tooltip', selectedType); // Add this line
      }

      setupDragEvents(cell, username, dayOffEntry);
    }
  }

  console.log("Saving modal data for user:", username, "for date:", isoDate);
  closeModal();
  saveData(username);

  // Update paired employee's calendar
  updatePairedEmployeeCalendar(username, isoDate);
}

/**
 * Remove a non-holiday day-off entry.
 */
function removeDayOff() {
  if (!modalContext) return;
  const { username, isoDate, cell } = modalContext;
  const userDaysOff = daysOffData[username] || [];
  const index = userDaysOff.findIndex((entry) => entry.date === isoDate);

  if (index !== -1) {
    userDaysOff.splice(index, 1);
    cell.style.backgroundColor = "";
    cell.style.color = "";
    cell.classList.remove("day-off");
    cell.removeAttribute("draggable");
    delete cell.dataset.type;

    // Clear tooltip when removing day off
    cell.title = "";
    cell.removeAttribute('data-tooltip'); // Add this line
  }

  console.log("Removed day off for", username, "date:", isoDate);
  closeModal();
  saveData(username);

  // Update paired employee's calendar
  updatePairedEmployeeCalendar(username, isoDate);
}

function updatePairedEmployeeCalendar(username: string, isoDate: string) {
  const pairedUsername = getPairedUsername(username);
  if (!pairedUsername) return;

  // Check if the user has this day off
  const hasDayOff = hasUserDayOff(username, isoDate);

  // Find all cells for the paired user with the same date
  const pairedCells = document.querySelectorAll(`.day-cell[data-username="${pairedUsername}"][data-date="${isoDate}"]`);

  pairedCells.forEach(cell => {
    const htmlCell = cell as HTMLElement;

    if (hasDayOff) {
      // If user has day off, mark the paired user's cell as unavailable
      if (!cell.classList.contains('day-off') && !cell.classList.contains('holiday') && !cell.classList.contains('weekend')) {
        cell.classList.add('pair-day-off');

        // Find the employee who has the day off
        const employee = employeesData.employees.find(emp => emp.username === username);
        let employeeName = username;
        if (employee) {
          switch (employeesData.config.displayType) {
            case "surname":
              employeeName = employee.surname;
              break;
            case "username":
              employeeName = employee.username;
              break;
            case "fullname":
            default:
              employeeName = `${employee.name} ${employee.surname}`;
              break;
          }
        }

        // Find the day off entry to get type and note
        const dayOffEntry = daysOffData[username]?.find(entry => entry.date === isoDate);
        let typeInfo = "";
        if (dayOffEntry) {
          typeInfo = dayOffEntry.type;
          if (dayOffEntry.note) {
            typeInfo += `: ${dayOffEntry.note}`;
          }
        }

        // Set informative tooltip
        const tooltipMessage = `Unavailable: Your pair (${employeeName}) has time off this day${typeInfo ? ` - ${typeInfo}` : ''}`;
        htmlCell.title = tooltipMessage;
        htmlCell.setAttribute('data-tooltip', tooltipMessage);
      }
    } else {
      // If user doesn't have day off, remove the pair-day-off class
      cell.classList.remove('pair-day-off');
      if (htmlCell.title === "Unavailable: Your pair has time off this day" ||
          htmlCell.title.startsWith("Unavailable: Your pair")) {
        htmlCell.title = "";
        htmlCell.removeAttribute('data-tooltip');
      }
    }
  });
}

/**
 * Save data to the server
 */
async function saveData(username) {
  try {
    console.log(`Saving data for ${username}...`);

    // Only send backup config if backups are enabled
    const maxBackupsHeader = backupConfig.enabled ? backupConfig.maxBackups.toString() : "0";

    const daysOffResponse = await fetch("/api/daysOff.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Max-Backups": maxBackupsHeader
      },
      body: JSON.stringify(daysOffData)
    });

    const holidaysResponse = await fetch("/api/holidays.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Max-Backups": maxBackupsHeader
      },
      body: JSON.stringify(holidaysData)
    });

    if (!daysOffResponse.ok || !holidaysResponse.ok) {
      throw new Error("Failed to save data to server");
    }

    console.log(`Data saved successfully for ${username}`);
    showNotification("Changes saved successfully", "success");
  } catch (error) {
    console.error("Error saving data:", error);
    showNotification("Failed to save changes. Please try again.", "error");
  }
}

async function loadBackupSettings() {
  try {
    const response = await fetch("/api/backup-settings");
    if (!response.ok) {
      throw new Error("Failed to load backup settings");
    }

    const settings = await response.json();
    if (settings.maxBackups) {
      backupConfig.maxBackups = settings.maxBackups;
    }

    // Also check local storage for user preferences
    const savedConfig = localStorage.getItem("backupConfig");
    if (savedConfig) {
      try {
        const parsedConfig = JSON.parse(savedConfig);
        backupConfig.enabled = parsedConfig.enabled !== undefined ? parsedConfig.enabled : true;
        backupConfig.maxBackups = parsedConfig.maxBackups || backupConfig.maxBackups;
      } catch (error) {
        console.error("Error parsing backup config from localStorage:", error);
      }
    }

    console.log("Loaded backup configuration:", backupConfig);
  } catch (error) {
    console.error("Error loading backup settings:", error);
  }
}

// Function to list available backups for a file
async function listBackups(filePrefix) {
  try {
    const response = await fetch(`/api/backups?prefix=${filePrefix}`);
    if (!response.ok) {
      throw new Error("Failed to list backups");
    }

    return await response.json();
  } catch (error) {
    console.error("Error listing backups:", error);
    return [];
  }
}

function saveBackupConfig() {
  localStorage.setItem("backupConfig", JSON.stringify(backupConfig));
  showNotification("Backup settings saved", "success");
}

function createSettingsModal() {
  // Check if the modal already exists
  if (document.getElementById("settingsModal")) {
    return;
  }

  const modal = document.createElement("div");
  modal.id = "settingsModal";
  modal.className = "modal";

  modal.innerHTML = `
    <div class="modal-content">
      <h3>App Settings</h3>
      <div class="settings-section">
        <h4>Backup Settings</h4>
        <div class="form-group">
          <label for="backupEnabled">Enable Backups:</label>
          <input type="checkbox" id="backupEnabled" ${backupConfig.enabled ? 'checked' : ''}>
        </div>
        <div class="form-group">
          <label for="maxBackups">Max Backups to Keep:</label>
          <input type="number" id="maxBackups" min="1" max="100" value="${backupConfig.maxBackups}">
        </div>
      </div>
      <div class="modal-buttons">
        <button id="settingsCancelButton">Cancel</button>
        <button id="settingsSaveButton">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Add event listeners
  const cancelButton = document.getElementById("settingsCancelButton");
  const saveButton = document.getElementById("settingsSaveButton");
  const backupEnabledInput = document.getElementById("backupEnabled");
  const maxBackupsInput = document.getElementById("maxBackups");

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      if (modal) {
        modal.style.display = "none";
      }
    });
  }

  if (saveButton && backupEnabledInput && maxBackupsInput && modal) {
    saveButton.addEventListener("click", () => {
      // Cast to appropriate HTML input element types
      const enabledInput = backupEnabledInput as HTMLInputElement;
      const maxInput = maxBackupsInput as HTMLInputElement;

      // Update the backup config
      backupConfig.enabled = enabledInput.checked;
      backupConfig.maxBackups = parseInt(maxInput.value, 10) || 10;

      saveBackupConfig();
      modal.style.display = "none";
      showNotification("Settings saved successfully", "success");
    });
  }

  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });

  // Close with ESC key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.style.display === "flex") {
      modal.style.display = "none";
    }
  });

  return modal;
}

// Function to show the settings modal
function showSettingsModal() {
  const modal = document.getElementById("settingsModal") || createSettingsModal();

  // Type assertions to tell TypeScript these are input elements
  const backupEnabledElement = document.getElementById("backupEnabled") as HTMLInputElement;
  const maxBackupsElement = document.getElementById("maxBackups") as HTMLInputElement;

  // Check if elements exist before accessing properties
  if (backupEnabledElement) {
    backupEnabledElement.checked = backupConfig.enabled;
  }

  if (maxBackupsElement) {
    maxBackupsElement.value = backupConfig.maxBackups.toString();
  }

  // Make sure modal is defined before using it
  if (modal) {
    modal.style.display = "flex";
  }
}

// Add settings button to the actions menu
function addSettingsMenuItem() {
  const actionsMenu = document.getElementById("actionsMenu");
  if (!actionsMenu) return;

  const settingsButton = document.createElement("div");
  settingsButton.id = "actionSettings";
  settingsButton.className = "action-button";
  settingsButton.textContent = "Settings";

  settingsButton.addEventListener("click", () => {
    actionsMenu.classList.remove("visible");
    const backdrop = document.querySelector(".menu-backdrop");
    if (backdrop) backdrop.classList.remove("visible");

    showSettingsModal();
  });

  // Add after export data button if it exists, otherwise at the end
  const exportButton = document.getElementById("actionExportData");
  if (exportButton) {
    actionsMenu.insertBefore(settingsButton, exportButton.nextSibling);
  } else {
    actionsMenu.appendChild(settingsButton);
  }
}


// Function to delete a specific backup
async function deleteBackup(filename) {
  try {
    const response = await fetch("/api/backups", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ filename })
    });

    if (!response.ok) {
      throw new Error("Failed to delete backup");
    }

    return true;
  } catch (error) {
    console.error("Error deleting backup:", error);
    return false;
  }
}

async function createBackup(filename, data) {
  try {
    // Create the new backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilename = `${filename.replace('.json', '')}-${timestamp}.json`;
    const backupPath = `${(backupConfig as BackupConfig).backupFolder ?? 'defaultFolder'}/${backupFilename}`;

    console.log(`Creating backup: ${backupPath}`);

    // Save the backup
    const backupResponse = await fetch(`/api/backup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Backup-Filename": backupPath
      },
      body: JSON.stringify(data)
    });

    if (!backupResponse.ok) {
      throw new Error(`Failed to create backup: ${backupPath}`);
    }

    // Get list of existing backups for this file type
    const backupListResponse = await fetch(`/api/list-backups?prefix=${filename.replace('.json', '')}`);
    if (!backupListResponse.ok) {
      throw new Error("Failed to list backups");
    }

    const backupList = await backupListResponse.json();
    console.log(`Found ${backupList.length} backups, limit is ${backupConfig.maxBackups}`);

    // If we have more backups than the configured maximum, delete the oldest ones
    if (backupList.length > backupConfig.maxBackups) {
      // Sort backups by creation date (newest first)
      backupList.sort((a, b) => {
        // Extract timestamps from filenames and compare them
        const timestampA = a.match(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/)[0];
        const timestampB = b.match(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/)[0];
        return timestampB.localeCompare(timestampA); // Newest first
      });

      // Keep only the most recent maxBackups, delete the rest
      const backupsToKeep = backupList.slice(0, backupConfig.maxBackups);
      const backupsToDelete = backupList.slice(backupConfig.maxBackups);

      console.log(`Keeping ${backupsToKeep.length} recent backups, deleting ${backupsToDelete.length} old backups`);

      // Delete old backups
      for (const fileToDelete of backupsToDelete) {
        console.log(`Deleting old backup: ${fileToDelete}`);

        const deleteResponse = await fetch(`/api/delete-backup`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ filename: fileToDelete })
        });

        if (!deleteResponse.ok) {
          console.warn(`Failed to delete backup: ${fileToDelete}`);
        }
      }
    }

    console.log(`Backup created successfully: ${backupPath}`);
    return true;
  } catch (error) {
    console.error("Error creating backup:", error);
    return false;
  }
}

/**
 * Load JSON data from the server.
 */
async function loadData() {
  try {
    const [employeesRes, daysOffRes, holidaysRes] = await Promise.all([
      fetch("/api/employees.json"),
      fetch("/api/daysOff.json"),
      fetch("/api/holidays.json")
    ]);

    // Check if responses are OK
    if (!employeesRes.ok || !daysOffRes.ok || !holidaysRes.ok) {
      throw new Error("Failed to load data from server");
    }

    employeesData = await employeesRes.json();
    daysOffData = await daysOffRes.json();
    holidaysData = await holidaysRes.json();

    console.log("Data loaded successfully:", {
      employeesCount: employeesData.employees.length,
      dayOffTypesCount: Object.keys(employeesData.dayOffTypes).length,
      holidaysCount: holidaysData.holidays.length
    });
    return true;
  } catch (error) {
    console.error("Error loading data", error);
    showNotification("Error loading data. Please refresh the page or contact support.", "error");
    return false;
  }
}

/**
 * Show notification to the user
 */
function showNotification(message: string, type: "success" | "error" | "info" = "info") {
  // Create notification element if it doesn't exist
  let notification = document.getElementById("notification");
  if (!notification) {
    notification = document.createElement("div");
    notification.id = "notification";
    document.body.appendChild(notification);
  }

  // Set notification content and style
  notification.textContent = message;
  notification.className = `notification ${type}`;

  // Show notification
  notification.style.display = "block";

  // Auto-hide after 3 seconds
  setTimeout(() => {
    notification.style.display = "none";
  }, 3000);
}

/**
 * Set up quick action handlers
 */
function setupQuickActions() {
  // Check if quick action elements exist
  if (!actionShowToday || !actionToggleTheme || !actionExportData) {
    console.error("Quick action elements not found");
    return;
  }

  // Show Today action
  actionShowToday.addEventListener("click", () => {
    const today = new Date();
    currentMonth = today.getMonth();
    currentYear = today.getFullYear();

    // Update the dropdowns
    monthSelect.value = currentMonth.toString();
    yearSelect.value = currentYear.toString();

    // Rebuild the calendar
    buildCalendar(currentYear, currentMonth);

    showNotification("Calendar set to current month", "info");
  });

  // Toggle Theme action
  actionToggleTheme.addEventListener("click", () => {
    if (document.body.classList.contains("dark")) {
      document.body.classList.remove("dark");
      document.body.classList.add("light");
    } else {
      document.body.classList.remove("light");
      document.body.classList.add("dark");
    }
    updateThemeToggleText();
  });

  // Export Data action
  actionExportData.addEventListener("click", () => {
    exportCalendarData();
  });
}

/**
 * Export calendar data
 */
function exportCalendarData() {
  try {
    // Create export data object
    const exportData = {
      month: currentMonth,
      year: currentYear,
      employeesData: employeesData,
      daysOffData: daysOffData,
      holidaysData: holidaysData,
      exportDate: new Date().toISOString()
    };

    // Convert to JSON
    const dataStr = JSON.stringify(exportData, null, 2);

    // Create download link
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = `calendar-export-${currentYear}-${currentMonth + 1}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    showNotification("Calendar data exported successfully", "success");
  } catch (error) {
    console.error("Error exporting data:", error);
    showNotification("Failed to export data", "error");
  }
}

/**
 * Set up event listeners for buttons and controls
 */
function setupEventListeners() {
  cancelButton.addEventListener("click", closeModal);
  saveButton.addEventListener("click", saveModal);
  removeButton.addEventListener("click", removeDayOff);
  userStatsCloseButton.addEventListener("click", closeUserStatsModal);

  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  userStatsModal.addEventListener("click", (e) => {
    if (e.target === userStatsModal) {
      closeUserStatsModal();
    }
  });

  // Close modal with ESC key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (modal.style.display === "flex") {
        closeModal();
      }
      if (userStatsModal.style.display === "flex") {
        closeUserStatsModal();
      }
    }
  });

  themeToggle.addEventListener("click", () => {
    if (document.body.classList.contains("dark")) {
      document.body.classList.remove("dark");
      document.body.classList.add("light");
    } else {
      document.body.classList.remove("light");
      document.body.classList.add("dark");
    }
    updateThemeToggleText();
    console.log("Theme toggled. Current theme:", document.body.classList.contains("dark") ? "dark" : "light");
  });

  setupActionHandlers();
  console.log("All event listeners set up");
}


/**
 * Set up touch event handlers for mobile devices
 */
function setupTouchEvents() {
  console.log("Setting up touch event handlers");

  // Prevent browser context menu on right-click for mobile
  document.addEventListener('contextmenu', (e) => {
    // Allow default context menu only for debugging in development environments
    const allowBrowserContextMenu = false; // Set to true for debugging
    if (!allowBrowserContextMenu) {
      e.preventDefault();
    }
  });

  // Long press detection on cells for mobile context menu equivalent
  const LONG_PRESS_DURATION = 700; // milliseconds
  let longPressTimer: number | null = null;
  let longPressElement: HTMLElement | null = null;
  let touchMoved = false;

  document.addEventListener('touchstart', (e) => {
    const target = e.target as HTMLElement;
    touchMoved = false;

    // Only apply to day-cell or employee-name elements
    if (!target.classList.contains('day-cell') && !target.classList.contains('employee-name')) {
      return;
    }

    longPressElement = target;

    longPressTimer = window.setTimeout(() => {
      if (!touchMoved && longPressElement) {
        // Trigger the equivalent of a right-click event
        if (longPressElement.classList.contains('day-cell')) {
          // For day-cell elements, simulate context menu
          const username = longPressElement.dataset.username || '';
          const isoDate = longPressElement.dataset.date || '';
          if (username && isoDate) {
            console.log("Long press detected on day cell");
            // Add a visual feedback for the long press
            longPressElement.classList.add('long-press-active');
            setTimeout(() => {
              longPressElement?.classList.remove('long-press-active');
              openModal(username, isoDate, longPressElement as HTMLDivElement);
            }, 150);
          }
        } else if (longPressElement.classList.contains('employee-name')) {
          // For employee-name elements, show user statistics
          const username = longPressElement.dataset.username || '';
          if (username) {
            console.log("Long press detected on employee name");
            // Add visual feedback
            longPressElement.classList.add('long-press-active');
            setTimeout(() => {
              longPressElement?.classList.remove('long-press-active');
              // Create a mock MouseEvent for the showUserStatistics function
              const mockEvent = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: e.touches[0].clientX,
                clientY: e.touches[0].clientY
              });
              showUserStatistics(username, mockEvent);
            }, 150);
          }
        }

        longPressTimer = null;
      }
    }, LONG_PRESS_DURATION);
  }, { passive: true });

  document.addEventListener('touchmove', () => {
    touchMoved = true;

    // Cancel long press if touch moved
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (longPressElement) {
      longPressElement.classList.remove('long-press-active');
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    // Cancel long press timer if touch ended
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (longPressElement) {
      longPressElement.classList.remove('long-press-active');
      longPressElement = null;
    }
  }, { passive: true });

  // Double-tap detection for mobile
  const DOUBLE_TAP_DELAY = 300; // milliseconds
  let lastTapTime = 0;
  let lastTapElement: HTMLElement | null = null;

  document.addEventListener('touchend', (e) => {
    const target = e.target as HTMLElement;

    // Only apply to day-cell elements that aren't weekends or holidays
    if (!target.classList.contains('day-cell') ||
      target.classList.contains('weekend') ||
      target.classList.contains('holiday') ||
      target.classList.contains('day-off')) {
      return;
    }

    const currentTime = new Date().getTime();
    const tapDuration = currentTime - lastTapTime;

    if (lastTapElement === target && tapDuration < DOUBLE_TAP_DELAY && !touchMoved) {
      // Double tap detected
      e.preventDefault();

      const username = target.dataset.username || '';
      const isoDate = target.dataset.date || '';

      if (username && isoDate) {
        console.log("Double tap detected on day cell");
        addQuickDayOff(username, isoDate, target as HTMLDivElement);
      }

      lastTapElement = null;
      lastTapTime = 0;
    } else {
      // Single tap - record for potential double tap
      lastTapTime = currentTime;
      lastTapElement = target;
    }
  }, { passive: false });

  // Enhanced drag and drop for touch devices
  document.addEventListener('touchstart', (e) => {
    const target = e.target as HTMLElement;

    // Only apply to draggable day-off cells
    if (!target.classList.contains('day-cell') ||
      !target.classList.contains('day-off') ||
      target.getAttribute('draggable') !== 'true') {
      return;
    }

    // Add a visual indicator that the element is draggable
    target.classList.add('touch-draggable');
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    // Remove draggable indicators
    document.querySelectorAll('.touch-draggable').forEach(element => {
      element.classList.remove('touch-draggable');
    });
  }, { passive: true });

  // Enhance swipe for action menu for touch devices
  const actionsMenu = document.getElementById('actionsMenu') as HTMLDivElement;
  const backdrop = document.querySelector('.menu-backdrop') as HTMLDivElement;

  if (actionsMenu) {
    // Allow swiping down to close the menu
    let touchStartY = 0;
    let touchMoveY = 0;

    actionsMenu.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    actionsMenu.addEventListener('touchmove', (e) => {
      touchMoveY = e.touches[0].clientY;
      const diffY = touchMoveY - touchStartY;

      // Only allow swiping down, not up
      if (diffY > 0) {
        actionsMenu.style.transform = `translateY(${diffY}px)`;
      }
    }, { passive: true });

    actionsMenu.addEventListener('touchend', () => {
      const diffY = touchMoveY - touchStartY;

      // If swiped down enough, close the menu
      if (diffY > 100) {
        actionsMenu.classList.remove('visible');
        if (backdrop) backdrop.classList.remove('visible');
      }

      // Reset transform
      actionsMenu.style.transform = '';

      // Reset touch values
      touchStartY = 0;
      touchMoveY = 0;
    }, { passive: true });
  }
}

/**
 * Set up action handlers for the unified action button and menu
 */
function setupActionHandlers() {
  // Get DOM elements
  const actionFab = document.getElementById('actionFab') as HTMLDivElement;
  const actionsMenu = document.getElementById('actionsMenu') as HTMLDivElement;
  const actionShowToday = document.getElementById('actionShowToday') as HTMLDivElement;
  const actionToggleTheme = document.getElementById('actionToggleTheme') as HTMLDivElement;
  const actionExportData = document.getElementById('actionExportData') as HTMLDivElement;

  // Check if elements exist
  if (!actionFab || !actionsMenu) {
    console.error("Action elements not found");
    return;
  }

  // Create backdrop for menu
  const backdrop = document.createElement('div');
  backdrop.className = 'menu-backdrop';
  document.body.appendChild(backdrop);

  // Open menu when clicking the FAB
  actionFab.addEventListener('click', () => {
    actionsMenu.classList.add('visible');
    backdrop.classList.add('visible');
  });

  // Close menu when clicking the handle
  const closeHandle = actionsMenu.querySelector('.action-close-handle') as HTMLElement;
  if (closeHandle) {
    closeHandle.addEventListener('click', () => {
      actionsMenu.classList.remove('visible');
      backdrop.classList.remove('visible');
    });
  }

  // Close menu when clicking the backdrop
  backdrop.addEventListener('click', () => {
    actionsMenu.classList.remove('visible');
    backdrop.classList.remove('visible');
  });

  // Handle action buttons
  if (actionShowToday) {
    actionShowToday.addEventListener('click', () => {
      const today = new Date();
      currentMonth = today.getMonth();
      currentYear = today.getFullYear();

      // Update the dropdowns
      monthSelect.value = currentMonth.toString();
      yearSelect.value = currentYear.toString();

      // Rebuild the calendar
      buildCalendar(currentYear, currentMonth);

      // Hide menu
      actionsMenu.classList.remove('visible');
      backdrop.classList.remove('visible');

      showNotification("Calendar set to current month", "info");
    });
  }

  if (actionToggleTheme) {
    actionToggleTheme.addEventListener('click', () => {
      if (document.body.classList.contains("dark")) {
        document.body.classList.remove("dark");
        document.body.classList.add("light");
      } else {
        document.body.classList.remove("light");
        document.body.classList.add("dark");
      }
      updateThemeToggleText();

      // Hide menu
      actionsMenu.classList.remove('visible');
      backdrop.classList.remove('visible');
    });
  }

  if (actionExportData) {
    actionExportData.addEventListener('click', () => {
      exportCalendarData();

      // Hide menu
      actionsMenu.classList.remove('visible');
      backdrop.classList.remove('visible');
    });
  }

  // Handle ESC key to close menu
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && actionsMenu.classList.contains('visible')) {
      actionsMenu.classList.remove('visible');
      backdrop.classList.remove('visible');
    }
  });
}

/**
 * Initialize the application.
 */
async function initApp() {
  console.log("Initializing application...");

  // First get DOM elements
  getDOMElements();

  // Load backup settings before loading data
  await loadBackupSettings();

  // Then load data
  const dataLoaded = await loadData();
  if (!dataLoaded) {
    console.error("Failed to load data, cannot initialize application");
    return;
  }

  // Set up controls
  initControls();

  // Set up event listeners
  setupEventListeners();

  // Set up touch events
  setupTouchEvents();

  // Set up cutom tooltip system
  initTooltipSystem()

  // Update theme toggle text
  updateThemeToggleText();

  // Initialize calendar with current month/year
  buildCalendar(currentYear, currentMonth);

    // Add settings to action menu
    addSettingsMenuItem();

  console.log("Application initialized successfully");
}

/**
 * Update theme toggle button text based on current theme
 */
function updateThemeToggleText() {
  if (themeToggle) {
    themeToggle.textContent = document.body.classList.contains("dark") ? "light" : "dark";
  }
}

/**
 * Helper: Parse a date string "YYYY-MM-DD" from the JSON as a local Date.
 */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  // Month is 0-indexed in the Date constructor.
  return new Date(year, month - 1, day);
}

/**
 * Helper: Generate a local date string ("YYYY-MM-DD") from a Date object.
 */
function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Modified getHoliday that compares the JSON date (parsed as local) with the cell date.
 */
function getHoliday(isoDate: string): Holiday | null {
  const targetDate = parseLocalDate(isoDate);
  for (const holiday of holidaysData.holidays) {
    const holidayDate = parseLocalDate(holiday.date);
    if (
      holidayDate.getFullYear() === targetDate.getFullYear() &&
      holidayDate.getMonth() === targetDate.getMonth() &&
      holidayDate.getDate() === targetDate.getDate()
    ) {
      return holiday;
    }
  }
  return null;
}

/**
 * Get all DOM elements after ensuring the document is loaded.
 */
function getDOMElements() {
  console.log("Getting DOM elements");

  // These elements should all exist now
  monthSelect = document.getElementById("monthSelect") as HTMLSelectElement;
  yearSelect = document.getElementById("yearSelect") as HTMLSelectElement;
  employeeListDiv = document.getElementById("employeeList") as HTMLDivElement;
  modal = document.getElementById("modal") as HTMLDivElement;
  dayOffTypeSelect = document.getElementById("dayOffType") as HTMLSelectElement;
  dayOffNoteInput = document.getElementById("dayOffNote") as HTMLInputElement;
  cancelButton = document.getElementById("cancelButton") as HTMLButtonElement;
  saveButton = document.getElementById("saveButton") as HTMLButtonElement;
  removeButton = document.getElementById("removeButton") as HTMLButtonElement;
  holidayInfo = document.getElementById("holidayInfo") as HTMLDivElement;
  editableArea = document.getElementById("editableArea") as HTMLDivElement;
  themeToggle = document.getElementById("themeToggle") as HTMLDivElement;

  // New filter controls
  employeeFilter = document.getElementById("employeeFilter") as HTMLInputElement;
  teamFilter = document.getElementById("teamFilter") as HTMLSelectElement;

  // Quick actions elements
  quickActions = document.getElementById("quickActions") as HTMLDivElement;
  actionShowToday = document.getElementById("actionShowToday") as HTMLDivElement;
  actionToggleTheme = document.getElementById("actionToggleTheme") as HTMLDivElement;
  actionExportData = document.getElementById("actionExportData") as HTMLDivElement;

  // User stats modal elements
  userStatsModal = document.getElementById("userStatsModal") as HTMLDivElement;
  userStatsName = document.getElementById("userStatsName") as HTMLDivElement;
  userStatsContent = document.getElementById("userStatsContent") as HTMLDivElement;
  userStatsCloseButton = document.getElementById("userStatsCloseButton") as HTMLButtonElement;

  // Verify that the elements were found
  if (!monthSelect || !yearSelect || !employeeListDiv) {
    console.error("Critical DOM elements not found!", {
      monthSelect,
      yearSelect,
      employeeListDiv
    });
  } else {
    console.log("All critical DOM elements found");
  }

  // Check that we found filter elements
  if (!employeeFilter || !teamFilter) {
    console.error("Filter elements not found!");
  }

  // Check that we found user stats elements
  if (!userStatsModal || !userStatsName || !userStatsContent || !userStatsCloseButton) {
    console.error("User stats modal elements not found!");
  }
}

/**
 * Initialize the month and year selectors.
 * Loads the last saved selection from local storage (if available) or uses today's date.
 */
function initControls() {
  const today = new Date();
  // Temporarily ignore localStorage.
  currentYear = today.getFullYear();
  currentMonth = today.getMonth();

  console.log("Init Controls (no localStorage): currentYear =", currentYear, "currentMonth =", currentMonth);

  // Clear existing options first to avoid duplicates when reinitializing
  monthSelect.innerHTML = "";
  yearSelect.innerHTML = "";

  // Populate month selector.
  for (let m = 0; m < 12; m++) {
    const option = document.createElement("option");
    option.value = m.toString();
    option.text = new Date(0, m).toLocaleString("default", { month: "long" });
    if (m === currentMonth) {
      option.selected = true;
    }
    monthSelect.appendChild(option);
  }

  // Populate year selector.
  for (let y = today.getFullYear() - 5; y <= today.getFullYear() + 5; y++) {
    const option = document.createElement("option");
    option.value = y.toString();
    option.text = y.toString();
    if (y === currentYear) {
      option.selected = true;
    }
    yearSelect.appendChild(option);
  }

  // Initialize the team/department filter dropdown
  initTeamFilter();

  // Remove any existing event listeners (to prevent duplicates)
  monthSelect.removeEventListener("change", handleMonthChange);
  yearSelect.removeEventListener("change", handleYearChange);
  employeeFilter.removeEventListener("input", handleFilterChange);
  teamFilter.removeEventListener("change", handleTeamFilterChange);

  // Attach event listeners.
  monthSelect.addEventListener("change", handleMonthChange);
  yearSelect.addEventListener("change", handleYearChange);
  employeeFilter.addEventListener("input", handleFilterChange);
  teamFilter.addEventListener("change", handleTeamFilterChange);

  console.log("Event listeners attached to dropdowns");
}

/**
 * Initialize the team/department filter dropdown
 */
function initTeamFilter() {
  // Clear existing options first (keeping the "All Teams/Depts" option)
  teamFilter.innerHTML = '<option value="">All Teams/Depts</option>';

  // Create sets to track unique teams and departments
  const teams = new Set<string>();
  const departments = new Set<string>();

  // Collect all teams and departments from employees
  employeesData.employees.forEach(employee => {
    if (employee.team) teams.add(employee.team);
    if (employee.department) departments.add(employee.department);
  });

  // Add teams section if there are teams
  if (teams.size > 0) {
    const teamsOptgroup = document.createElement('optgroup');
    teamsOptgroup.label = 'Teams';

    // Sort teams alphabetically
    Array.from(teams).sort().forEach(team => {
      const option = document.createElement('option');
      option.value = `team:${team}`;
      option.text = team;
      teamsOptgroup.appendChild(option);
    });

    teamFilter.appendChild(teamsOptgroup);
  }

  // Add departments section if there are departments
  if (departments.size > 0) {
    const deptsOptgroup = document.createElement('optgroup');
    deptsOptgroup.label = 'Departments';

    // Sort departments alphabetically
    Array.from(departments).sort().forEach(dept => {
      const option = document.createElement('option');
      option.value = `dept:${dept}`;
      option.text = dept;
      deptsOptgroup.appendChild(option);
    });

    teamFilter.appendChild(deptsOptgroup);
  }
}

/**
 * Handle month selection change
 */
function handleMonthChange() {
  console.log("Month dropdown change triggered. New value:", monthSelect.value);
  currentMonth = parseInt(monthSelect.value, 10);
  buildCalendar(currentYear, currentMonth);
}

/**
 * Handle year selection change
 */
function handleYearChange() {
  console.log("Year dropdown change triggered. New value:", yearSelect.value);
  currentYear = parseInt(yearSelect.value, 10);
  buildCalendar(currentYear, currentMonth);
}

/**
 * Handle employee name filter change
 */
function handleFilterChange() {
  console.log("Employee filter changed. New value:", employeeFilter.value);
  currentNameFilter = employeeFilter.value.trim().toLowerCase();
  buildCalendar(currentYear, currentMonth);
}

/**
 * Handle team/department filter change
 */
function handleTeamFilterChange() {
  console.log("Team filter changed. New value:", teamFilter.value);
  currentTeamFilter = teamFilter.value;
  buildCalendar(currentYear, currentMonth);
}

/**
 * Check if an employee matches the current filters
 */
function employeeMatchesFilters(employee: Employee): boolean {
  // First check name filter
  const nameMatch = currentNameFilter === '' ||
    employee.name.toLowerCase().includes(currentNameFilter) ||
    employee.surname.toLowerCase().includes(currentNameFilter) ||
    employee.username.toLowerCase().includes(currentNameFilter);

  if (!nameMatch) return false;

  // Then check team/department filter
  if (currentTeamFilter === '') {
    return true; // No team filter applied
  }

  if (currentTeamFilter.startsWith('team:')) {
    const team = currentTeamFilter.substring(5); // Remove 'team:' prefix
    return employee.team === team;
  }

  if (currentTeamFilter.startsWith('dept:')) {
    const dept = currentTeamFilter.substring(5); // Remove 'dept:' prefix
    return employee.department === dept;
  }

  return true; // Shouldn't reach here but just in case
}

/**
 * Build the calendar grid based on the selected month and year.
 */
function buildCalendar(year, month) {
  console.log("Building calendar for Year:", year, "Month:", month);
  if (!employeesData || !employeesData.employees || !employeeListDiv) {
    console.error("Missing required data or DOM elements for building calendar", {
      hasEmployeesData: !!employeesData,
      hasEmployees: !!(employeesData && employeesData.employees),
      hasEmployeeListDiv: !!employeeListDiv
    });
    return;
  }

  employeeListDiv.innerHTML = "";
  console.log(`Building calendar with year=${year}, month=${month} (${new Date(year, month, 1).toLocaleString("default", { month: "long" })})`);

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Create header row
  const headerRow = document.createElement("div");
  headerRow.classList.add("row");

  const emptyCell = document.createElement("div");
  emptyCell.classList.add("employee-name");
  emptyCell.textContent = "";
  headerRow.appendChild(emptyCell);

  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const isoDate = getLocalDateString(cellDate);
    const cell = document.createElement("div");
    cell.classList.add("day-cell", "header-cell");
    cell.textContent = day.toString();
    if (cellDate.getDay() === 0 || cellDate.getDay() === 6) {
      cell.classList.add("weekend");
    }
    headerRow.appendChild(cell);
  }

  employeeListDiv.appendChild(headerRow);

  const filteredEmployees = employeesData.employees.filter((employee) => employee.visible && employeeMatchesFilters(employee));

  if (filteredEmployees.length === 0) {
    const noResultsDiv = document.createElement("div");
    noResultsDiv.classList.add("no-results-message");
    noResultsDiv.textContent = "No employees match the current filters";
    employeeListDiv.appendChild(noResultsDiv);
    return;
  }

  filteredEmployees.forEach((employee) => {
    const row = document.createElement("div");
    row.classList.add("row");
    row.dataset.username = employee.username;

    let displayName;
    switch (employeesData.config.displayType) {
      case "surname":
        displayName = employee.surname;
        break;
      case "username":
        displayName = employee.username;
        break;
      case "fullname":
      default:
        displayName = `${employee.name} ${employee.surname}`;
        break;
    }

    const nameDiv = document.createElement("div");
    nameDiv.classList.add("employee-name");
    nameDiv.textContent = displayName;
    nameDiv.dataset.username = employee.username;

    const tooltipParts: string[] = [];
    if (employee.team) tooltipParts.push(`Team: ${employee.team}`);
    if (employee.department) tooltipParts.push(`Department: ${employee.department}`);
    if (employee.pair) {
      const pairedEmployee = employeesData.employees.find(emp => emp.username === employee.pair);
      let pairedName = employee.pair;
      if (pairedEmployee) {
        switch (employeesData.config.displayType) {
          case "surname":
            pairedName = pairedEmployee.surname;
            break;
          case "username":
            pairedName = pairedEmployee.username;
            break;
          case "fullname":
          default:
            pairedName = `${pairedEmployee.name} ${pairedEmployee.surname}`;
            break;
        }
      }
      tooltipParts.push(`Pair: ${pairedName}`);
    }

    if (tooltipParts.length > 0) {
      nameDiv.title = tooltipParts.join("\n");
    }

    nameDiv.addEventListener("contextmenu", (e) => {
      showUserStatistics(employee.username, e);
    });

    row.appendChild(nameDiv);

    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement("div");
      cell.classList.add("day-cell");
      const cellDate = new Date(year, month, day);
      const isoDate = getLocalDateString(cellDate);
      cell.dataset.date = isoDate;
      cell.dataset.username = employee.username;
      cell.textContent = "";

      if (cellDate.getDay() === 0 || cellDate.getDay() === 6) {
        cell.classList.add("weekend");
      }

      const holiday = getHoliday(isoDate);
      if (holiday) {
        cell.style.backgroundColor = employeesData.dayOffTypes["Holiday"].background;
        cell.style.color = employeesData.dayOffTypes["Holiday"].foreground;
        cell.title = holiday.name;
        cell.setAttribute('data-tooltip', holiday.name); // Add this line
        cell.classList.add("holiday");
      } else {
        const userDaysOff = daysOffData[employee.username] || [];
        const dayOffEntry = userDaysOff.find((entry) => entry.date === isoDate);

        // Check if paired employee has day off
        const pairedUsername = getPairedUsername(employee.username);
        const isPairedDayOff = pairedUsername ? hasUserDayOff(pairedUsername, isoDate) : false;

        if (dayOffEntry) {
          // User has day off
          const typeConfig = employeesData.dayOffTypes[dayOffEntry.type] || employeesData.dayOffTypes["Normal"];
          cell.style.backgroundColor = typeConfig.background;
          cell.style.color = typeConfig.foreground;

          // Set tooltip with data-tooltip attribute
          if (dayOffEntry.note) {
            cell.setAttribute('data-tooltip', `${dayOffEntry.type}: ${dayOffEntry.note}`);
            cell.title = `${dayOffEntry.type}: ${dayOffEntry.note}`; // Keep this for backward compatibility
          } else {
            cell.setAttribute('data-tooltip', dayOffEntry.type);
            cell.title = dayOffEntry.type; // Keep this for backward compatibility
          }

          cell.classList.add("day-off");
          cell.dataset.type = dayOffEntry.type;
          cell.setAttribute("draggable", "true");
          setupDragEvents(cell, employee.username, dayOffEntry);

          // Check for conflicts
          if (isPairedDayOff) {
            cell.classList.add('pair-conflict');
            cell.title = "Warning: Both you and your pair have this day off";
            cell.setAttribute('data-tooltip', "Warning: Both you and your pair have this day off");
          }
        } else if (isPairedDayOff) {
          // Paired employee has day off
          cell.classList.add('pair-day-off');
          const pairedEmployee = employeesData.employees.find(emp => emp.username === pairedUsername);
          let pairedName = pairedUsername;
          if (pairedEmployee) {
            switch (employeesData.config.displayType) {
              case "surname":
                pairedName = pairedEmployee.surname;
                break;
              case "username":
                pairedName = pairedEmployee.username;
                break;
              case "fullname":
              default:
                pairedName = `${pairedEmployee.name} ${pairedEmployee.surname}`;
                break;
            }
          }

          // Enhanced tooltip for paired employee day off
          // Get the day off entry of the paired employee to include its type and note
          const pairedDayOff = daysOffData[pairedUsername as keyof typeof daysOffData]?.find(entry => entry.date === isoDate);

          let typeInfo = "";
          if (pairedDayOff) {
            typeInfo = pairedDayOff.type;
            if (pairedDayOff.note) {
              typeInfo += `: ${pairedDayOff.note}`;
            }
          }

          const tooltipMessage = `Unavailable: Your pair (${pairedName}) has time off this day${typeInfo ? ` - ${typeInfo}` : ''}`;
          cell.title = tooltipMessage;
          cell.setAttribute('data-tooltip', tooltipMessage);
        } else {
          // No conflicts, regular cell
          if (cellDate.getDay() !== 0 && cellDate.getDay() !== 6) {
            setupDropTarget(cell, employee.username, isoDate);
          }
        }
      }

      cell.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        console.log("Opening modal for", employee.username, isoDate);
        openModal(employee.username, isoDate, cell);
      });

      cell.addEventListener("dblclick", (e) => {
        e.preventDefault();
        if (!cell.classList.contains("weekend") &&
          !cell.classList.contains("holiday") &&
          !cell.classList.contains("day-off") &&
          !cell.classList.contains("pair-day-off")) {
          console.log("Double-click adding day off for", employee.username, isoDate);
          addQuickDayOff(employee.username, isoDate, cell);
        }
      });

      row.appendChild(cell);
    }

    employeeListDiv.appendChild(row);
  });

  console.log("Calendar built successfully for", year, month);
}

/**
 * Show user statistics when right-clicking on an employee name
 */
function showUserStatistics(username, event) {
  event.preventDefault();
  const employee = employeesData.employees.find((emp) => emp.username === username);
  if (!employee) {
    console.error("Employee not found:", username);
    return;
  }

  let displayName;
  switch (employeesData.config.displayType) {
    case "surname":
      displayName = employee.surname;
      break;
    case "username":
      displayName = employee.username;
      break;
    case "fullname":
    default:
      displayName = `${employee.name} ${employee.surname}`;
      break;
  }

  userStatsName.textContent = displayName;

  const teamInfo: string[] = [];
  if (employee.team) teamInfo.push(`Team: ${employee.team}`);
  if (employee.department) teamInfo.push(`Department: ${employee.department}`);

  // Add pair information if available
  if (employee.pair) {
    const pairedEmployee = employeesData.employees.find(emp => emp.username === employee.pair);
    if (pairedEmployee) {
      let pairedFullName = `${pairedEmployee.name} ${pairedEmployee.surname}`;
      teamInfo.push(`Paired with: ${pairedFullName}`);
    }
  }

  if (teamInfo.length > 0) {
    const teamInfoDiv = document.createElement("div");
    teamInfoDiv.classList.add("user-team-info");
    teamInfoDiv.textContent = teamInfo.join(" | ");
    userStatsName.appendChild(teamInfoDiv);
  }

  const currentYearStats = calculateYearlyStats(username, currentYear);
  let statsHtml = `<h4>${currentYear} Statistics</h4>`;
  statsHtml += '<div class="stats-table">';
  const dayOffTypes = Object.keys(employeesData.dayOffTypes).sort((a, b) => a.localeCompare(b));
  statsHtml += "<table>";
  statsHtml += "<tr><th>Day Off Type</th><th>Days</th></tr>";

  let totalDays = 0;
  dayOffTypes.forEach((type) => {
    const count = currentYearStats[type] || 0;
    if (count > 0) {
      statsHtml += `<tr>
      <td>
        <span class="color-dot" style="background-color: ${employeesData.dayOffTypes[type].background};"></span>
        ${type}
      </td>
      <td>${count}</td>
    </tr>`;
      totalDays += count;
    }
  });

  statsHtml += `<tr class="total-row">
  <td>Total</td>
  <td>${totalDays}</td>
</tr>`;
  statsHtml += "</table>";
  statsHtml += "</div>";

  statsHtml += `<h4>Monthly Distribution</h4>`;
  statsHtml += '<div class="monthly-stats">';
  const monthlyStats = calculateMonthlyStats(username, currentYear);
  const monthNames = Array.from(
    { length: 12 },
    (_, i) => new Date(0, i).toLocaleString("default", { month: "short" })
  );

  statsHtml += '<div class="month-bars">';
  monthNames.forEach((month, index) => {
    const monthCount = Object.values(monthlyStats[index] || {}).reduce((sum, count) => sum + count, 0);
    const heightPercent = Math.min(100, monthCount * 10);
    statsHtml += `<div class="month-column">
    <div class="month-bar-container">
      <div class="month-bar" style="height: ${heightPercent}%" title="${monthCount} days in ${month}"></div>
      <div class="month-count">${monthCount || ""}</div>
    </div>
    <div class="month-name">${month}</div>
  </div>`;
  });
  statsHtml += "</div>";
  statsHtml += "</div>";

  userStatsContent.innerHTML = statsHtml;
  userStatsModal.style.display = "flex";
}

function calculatePairConflicts(
  username1: string,
  username2: string,
  year: number
): { date: string; user1Type: string; user2Type: string }[] {
  const user1DaysOff: DayOffEntry[] = daysOffData[username1] || [];
  const user2DaysOff: DayOffEntry[] = daysOffData[username2] || [];

  const conflicts: { date: string; user1Type: string; user2Type: string }[] = [];

  user1DaysOff.forEach(dayOff1 => {
    const date = parseLocalDate(dayOff1.date);
    if (date.getFullYear() === year) {
      const conflictingDayOff = user2DaysOff.find(dayOff2 => dayOff2.date === dayOff1.date);
      if (conflictingDayOff) {
        conflicts.push({
          date: dayOff1.date,
          user1Type: dayOff1.type,
          user2Type: conflictingDayOff.type
        });
      }
    }
  });

  return conflicts;
}

/**
 * Close the user stats modal
 */
function closeUserStatsModal() {
  userStatsModal.style.display = 'none';
}

/**
 * Calculate yearly statistics for a user
 */
function calculateYearlyStats(username: string, year: number): { [type: string]: number } {
  const userDaysOff = daysOffData[username] || [];
  const stats: { [type: string]: number } = {};

  userDaysOff.forEach(dayOff => {
    // Parse the date to check if it's in the selected year
    const dayOffDate = parseLocalDate(dayOff.date);
    if (dayOffDate.getFullYear() === year) {
      stats[dayOff.type] = (stats[dayOff.type] || 0) + 1;
    }
  });

  return stats;
}

/**
 * Calculate monthly statistics for a user
 */
function calculateMonthlyStats(username: string, year: number): { [month: number]: { [type: string]: number } } {
  const userDaysOff = daysOffData[username] || [];
  const monthlyStats: { [month: number]: { [type: string]: number } } = {};

  // Initialize all months
  for (let i = 0; i < 12; i++) {
    monthlyStats[i] = {};
  }

  userDaysOff.forEach(dayOff => {
    // Parse the date to check if it's in the selected year
    const dayOffDate = parseLocalDate(dayOff.date);
    if (dayOffDate.getFullYear() === year) {
      const month = dayOffDate.getMonth();
      monthlyStats[month][dayOff.type] = (monthlyStats[month][dayOff.type] || 0) + 1;
    }
  });

  return monthlyStats;
}

/**
 * Set up drag event listeners for a day-off cell
 */
function setupDragEvents(cell, username, dayOffEntry) {
  cell.addEventListener("dragstart", (e) => {
    // Only allow dragging if it's a regular day off (not a holiday)
    if (cell.classList.contains("holiday") || cell.classList.contains("weekend")) {
      e.preventDefault();
      return;
    }

    draggedCell = cell;
    draggedUsername = username;
    draggedDayOffEntry = dayOffEntry;

    // Store the index for later removal if the drag succeeds
    const userDaysOff = daysOffData[username] || [];
    draggedIndex = userDaysOff.findIndex(entry => entry.date === dayOffEntry.date);

    // Visual feedback during drag
    setTimeout(() => {
      cell.classList.add("dragging");
    }, 0);

    console.log("Drag started:", username, dayOffEntry.date);
  });

  cell.addEventListener("dragend", (e) => {
    cell.classList.remove("dragging");
    console.log("Drag ended");
  });

  // Set correct tooltip content
  if (dayOffEntry.note) {
    cell.title = `${dayOffEntry.type}: ${dayOffEntry.note}`;
  } else {
    cell.title = dayOffEntry.type;
  }

  // Add custom tooltip functionality
  attachTooltipToDayOffCell(cell);
}


/**
 * Set up drop target for empty cells
 */
function setupDropTarget(cell, username, isoDate) {
  cell.addEventListener("dragover", (e) => {
    if (!draggedUsername ||
      draggedUsername !== username ||
      cell.classList.contains("day-off") ||
      cell.classList.contains("holiday") ||
      cell.classList.contains("weekend") ||
      cell.classList.contains("pair-day-off")) {
      return;
    }
    e.preventDefault();
    cell.classList.add("drag-over");
  });

  cell.addEventListener("dragleave", (e) => {
    cell.classList.remove("drag-over");
  });

  cell.addEventListener("drop", (e) => {
    e.preventDefault();
    cell.classList.remove("drag-over");

    if (!draggedCell || !draggedUsername || !draggedDayOffEntry || draggedIndex === -1) {
      console.log("Invalid drag data");
      return;
    }

    if (draggedUsername !== username) {
      console.log("Cannot drop across different employees");
      return;
    }

    console.log("Dropped on", username, isoDate);
    const userDaysOff = daysOffData[username] || [];

    if (draggedIndex !== -1) {
      // Get the old date before we remove it from the array
      const oldDate = draggedDayOffEntry.date;

      // Remove the old entry
      userDaysOff.splice(draggedIndex, 1);

      // Create a new entry for the drop target
      const newEntry: DayOffEntry = {
        date: isoDate,
        type: draggedDayOffEntry.type
      };
      if (draggedDayOffEntry.note) {
        newEntry.note = draggedDayOffEntry.note;
      }
      userDaysOff.push(newEntry);

      // Update the drop target cell
      const typeConfig = employeesData.dayOffTypes[newEntry.type] || employeesData.dayOffTypes["Normal"];
      cell.style.backgroundColor = typeConfig.background;
      cell.style.color = typeConfig.foreground;

      // Set tooltip after drag and drop
      if (newEntry.note) {
        cell.title = `${newEntry.type}: ${newEntry.note}`;
        cell.setAttribute('data-tooltip', `${newEntry.type}: ${newEntry.note}`); // Add this line
      } else {
        cell.title = newEntry.type;
        cell.setAttribute('data-tooltip', newEntry.type); // Add this line
      }

      cell.classList.add("day-off");
      cell.dataset.type = newEntry.type;
      cell.setAttribute("draggable", "true");
      setupDragEvents(cell, username, newEntry);

      // Completely reset the original cell
      draggedCell.style.backgroundColor = "";
      draggedCell.style.color = "";
      draggedCell.title = ""; // Clear the tooltip from original cell
      draggedCell.removeAttribute('data-tooltip'); // Add this line
      draggedCell.classList.remove("day-off");
      draggedCell.removeAttribute("draggable");
      delete draggedCell.dataset.type;

      // Critical fix: Setup the original cell as a drop target again
      setupDropTarget(draggedCell, username, oldDate);

      saveData(username);
      console.log("Day off moved successfully");

      // Update the paired employee's calendar for both the old and new dates
      updatePairedEmployeeCalendar(username, oldDate);
      updatePairedEmployeeCalendar(username, isoDate);
    }

    draggedCell = null;
    draggedUsername = null;
    draggedDayOffEntry = null;
    draggedIndex = -1;
  });
}

/**
 * Add a day off with "Normal" type on double-click
 */
function addQuickDayOff(username, isoDate, cell) {
  if (cell.classList.contains("weekend") ||
    cell.classList.contains("holiday") ||
    cell.classList.contains("day-off") ||
    cell.classList.contains("pair-day-off")) {
    return;
  }

  const pairedUsername = getPairedUsername(username);
  if (pairedUsername && hasUserDayOff(pairedUsername, isoDate)) {
    // Show notification that paired employee has time off
    const pairedEmployee = employeesData.employees.find(emp => emp.username === pairedUsername);
    let pairedName = pairedUsername;
    if (pairedEmployee) {
      switch (employeesData.config.displayType) {
        case "surname":
          pairedName = pairedEmployee.surname;
          break;
        case "username":
          pairedName = pairedUsername;
          break;
        case "fullname":
        default:
          pairedName = `${pairedEmployee.name} ${pairedEmployee.surname}`;
          break;
      }
    }
    showNotification(`Cannot book time off: Your pair (${pairedName}) already has this day off`, "error");
    return;
  }

  if (!daysOffData[username]) {
    daysOffData[username] = [];
  }

  const dayOffEntry = {
    date: isoDate,
    type: "Normal"
  };

  daysOffData[username].push(dayOffEntry);

  const typeConfig = employeesData.dayOffTypes["Normal"];
  cell.style.backgroundColor = typeConfig.background;
  cell.style.color = typeConfig.foreground;
  cell.classList.add("day-off");
  cell.dataset.type = "Normal";
  cell.setAttribute("draggable", "true");
  setupDragEvents(cell, username, dayOffEntry);

  // Set tooltip for quick added day off
  cell.title = "Normal";
  cell.setAttribute('data-tooltip', "Normal"); // Add this line

  console.log("Quick day off added for", username, "on", isoDate);
  saveData(username);

  // Update any paired employee's calendar to show this day as unavailable
  updatePairedEmployeeCalendar(username, isoDate);
}

/**
 * Set up mobile action handlers
 */
function setupMobileActions() {
  // Check if mobile elements exist
  const mobileFab = document.getElementById('mobileFab') as HTMLDivElement;
  const mobileActions = document.getElementById('mobileActions') as HTMLDivElement;
  const mobileShowToday = document.getElementById('mobileShowToday') as HTMLDivElement;
  const mobileToggleTheme = document.getElementById('mobileToggleTheme') as HTMLDivElement;
  const mobileExportData = document.getElementById('mobileExportData') as HTMLDivElement;

  if (!mobileFab || !mobileActions) {
    console.error("Mobile action elements not found");
    return;
  }

  // Toggle mobile actions panel visibility
  mobileFab.addEventListener('click', () => {
    mobileActions.classList.add('visible');
  });

  // Close mobile actions when clicking the close handle
  const mobileActionClose = document.querySelector('.mobile-action-close') as HTMLElement;
  if (mobileActionClose) {
    mobileActionClose.addEventListener('click', () => {
      mobileActions.classList.remove('visible');
    });
  }

  // Close mobile actions when clicking outside
  document.addEventListener('click', (e) => {
    if (mobileActions.classList.contains('visible') &&
      !mobileActions.contains(e.target as Node) &&
      e.target !== mobileFab) {
      mobileActions.classList.remove('visible');
    }
  });

  // Mobile action button handlers
  if (mobileShowToday) {
    mobileShowToday.addEventListener('click', () => {
      const today = new Date();
      currentMonth = today.getMonth();
      currentYear = today.getFullYear();

      // Update the dropdowns
      monthSelect.value = currentMonth.toString();
      yearSelect.value = currentYear.toString();

      // Rebuild the calendar
      buildCalendar(currentYear, currentMonth);

      // Hide mobile actions
      mobileActions.classList.remove('visible');

      showNotification("Calendar set to current month", "info");
    });
  }

  if (mobileToggleTheme) {
    mobileToggleTheme.addEventListener('click', () => {
      if (document.body.classList.contains("dark")) {
        document.body.classList.remove("dark");
        document.body.classList.add("light");
      } else {
        document.body.classList.remove("light");
        document.body.classList.add("dark");
      }
      updateThemeToggleText();

      // Hide mobile actions
      mobileActions.classList.remove('visible');
    });
  }

  if (mobileExportData) {
    mobileExportData.addEventListener('click', () => {
      exportCalendarData();

      // Hide mobile actions
      mobileActions.classList.remove('visible');
    });
  }
}

/**
 * Open the modal for adding or editing an entry.
 */
function openModal(username, isoDate, cell) {
  modalContext = { username, isoDate, cell };
  const date = parseLocalDate(isoDate);
  const isWeekendDay = date.getDay() === 0 || date.getDay() === 6;

  const holiday = getHoliday(isoDate);
  if (holiday) {
    holidayInfo.style.display = "block";
    holidayInfo.textContent = `Holiday: ${holiday.name}`;
    editableArea.style.display = "none";
    saveButton.style.display = "none";
    removeButton.style.display = "none";
  } else if (isWeekendDay) {
    // Don't show weekend as an option
    holidayInfo.style.display = "block";
    holidayInfo.textContent = "Weekend: Time off not available";
    editableArea.style.display = "none";
    saveButton.style.display = "none";
    removeButton.style.display = "none";
  } else {
    holidayInfo.style.display = "none";
    editableArea.style.display = "block";
    saveButton.style.display = "inline-block";
    dayOffTypeSelect.innerHTML = "";
    Object.keys(employeesData.dayOffTypes).forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.text = type;
      dayOffTypeSelect.appendChild(option);
    });
    const userDaysOff = daysOffData[username] || [];
    const existingEntry = userDaysOff.find((entry) => entry.date === isoDate);
    if (existingEntry) {
      if (existingEntry.type === "Holiday") {
        holidayInfo.style.display = "block";
        holidayInfo.textContent = `Holiday: ${existingEntry.note || "Holiday"}`;
        editableArea.style.display = "none";
        saveButton.style.display = "none";
        removeButton.style.display = "none";
      } else {
        dayOffTypeSelect.value = existingEntry.type;
        dayOffNoteInput.value = existingEntry.note || "";
        removeButton.style.display = "inline-block";
      }
    } else {
      dayOffTypeSelect.value = "Normal";
      dayOffNoteInput.value = "";
      removeButton.style.display = "none";
    }
  }
  cancelButton.style.display = "inline-block";
  modal.style.display = "flex";
  console.log("Modal opened for user:", username, "date:", isoDate);
}

// Helper function to check if a user has a paired employee
function getPairedUsername(username) {
  const employee = employeesData.employees.find(emp => emp.username === username);
  return employee && employee.pair ? employee.pair : null;
}

// Check if a date has a day off for a specific user
function hasUserDayOff(username, isoDate) {
  if (!username || !daysOffData[username]) return false;
  return daysOffData[username].some(entry => entry.date === isoDate);
}

// Helper function to check if the date is a weekend
function isWeekend(isoDate) {
  const date = parseLocalDate(isoDate);
  return date.getDay() === 0 || date.getDay() === 6;
}

// Create the tooltip element (call this once when the app loads)
function createTooltip() {
  const tooltip = document.createElement('div');
  tooltip.id = 'customTooltip';
  tooltip.className = 'custom-tooltip';
  document.body.appendChild(tooltip);
  return tooltip;
}

// Attach tooltip functionality to a cell
function attachTooltipToDayOffCell(cell) {
  // Get the tooltip element or create it if it doesn't exist
  let tooltip = document.getElementById('customTooltip');
  if (!tooltip) {
    tooltip = createTooltip();
  }

  cell.addEventListener('mouseenter', () => {
    // Get the tooltip content from the title attribute
    const content = cell.getAttribute('title');
    if (!content) return;

    // Position the tooltip
    const rect = cell.getBoundingClientRect();
    tooltip.textContent = content;
    tooltip.style.left = rect.left + rect.width / 2 + 'px';
    tooltip.style.top = rect.top - 5 + 'px';
    tooltip.classList.add('visible');

    // Adjust for potential overflow
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.left < 0) {
      tooltip.style.left = '5px';
    } else if (tooltipRect.right > window.innerWidth) {
      tooltip.style.left = (window.innerWidth - tooltipRect.width - 5) + 'px';
    }
  });

  cell.addEventListener('mouseleave', () => {
    tooltip.classList.remove('visible');
  });
}

function initTooltipSystem() {
  // Create tooltip element
  createTooltip();

  // Find all existing day-off cells and attach tooltips
  document.querySelectorAll('.day-off[draggable="true"]').forEach(cell => {
    attachTooltipToDayOffCell(cell);
  });
}

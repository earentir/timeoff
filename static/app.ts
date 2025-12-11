// Interfaces

interface Employee {
  username: string;
  name: string;
  surname: string;
  visible: boolean;
  team?: string;
  department?: string;
  pair?: string;
  annualAllowance?: number; // optional: total allowed days per year
  carryoverAvailable?: number; // optional: unused from previous year available to use this year
  allowances?: { [year: string]: number }; // per-year allowance
}

interface DayOffTypeConfig {
  background: string;
  foreground: string;
  fromPool?: boolean;
}

// Non-holiday day-off entries.
interface DayOffEntry {
  date: string; // ISO date e.g. "2025-04-15"
  type: string;
  note?: string;
  useCarryover?: boolean;
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
  fromPool?: boolean;
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

function isFromPoolType(type: string): boolean {
  if (!employeesData || !employeesData.dayOffTypes) return false;
  const config = employeesData.dayOffTypes[type];
  return Boolean(config && config.fromPool);
}

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
    // Allow override with confirmation and note
    const confirmOverride = confirm("Your pair already has this day off. Override? (This will mark a conflict)");
    if (!confirmOverride) {
      closeModal();
      return;
    }
    if (dayOffNoteInput && !dayOffNoteInput.value.trim()) {
      dayOffNoteInput.value = "Override: pair conflict approved";
    }
  }

  const selectedType = dayOffTypeSelect.value;
  const note = dayOffNoteInput.value.trim();
  // Disallow user from setting reserved types via UI
  const disallowedTypes = new Set(["Holiday", "Sunday", "Saturday", "Friday"]);
  if (disallowedTypes.has(selectedType)) {
    showNotification("This type is managed by JSON and cannot be set manually.", "error");
    closeModal();
    return;
  }

  {
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
      const isCarryoverSelection = selectedType === "Normal__carryover";
      const baseType = isCarryoverSelection ? "Normal" : selectedType;
      const dayOffEntry: DayOffEntry = { date: isoDate, type: baseType };
      if (note !== "") {
        dayOffEntry.note = note;
      }
      if (isCarryoverSelection) {
        dayOffEntry.useCarryover = true;
      } else {
        delete dayOffEntry.useCarryover;
      }
      if (existingIndex === -1) {
        userDaysOff.push(dayOffEntry);
      } else {
        userDaysOff[existingIndex] = dayOffEntry;
      }
      const typeConfig = employeesData.dayOffTypes[baseType] || employeesData.dayOffTypes["Normal"];
      cell.style.backgroundColor = typeConfig.background;
      cell.style.color = typeConfig.foreground;
      cell.classList.add("day-off");
      cell.classList.remove("holiday");
      cell.dataset.type = baseType;
      cell.setAttribute("draggable", "true");

      // Set tooltip for day off with type and note information
      const carry = dayOffEntry.useCarryover ? " (carryover)" : "";
      if (note) {
        cell.setAttribute('data-tooltip', `${selectedType}: ${note}${carry}`);
      } else {
        cell.setAttribute('data-tooltip', `${selectedType}${carry}`);
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
      htmlCell.removeAttribute('data-tooltip');
    }
  });
}

/**
 * Save data to the server
 * 
 * This function fetches the latest data from the server and merges only the
 * current user's changes before saving. This prevents overwriting other users'
 * changes that may have occurred since the page was loaded.
 */
async function saveData(username) {
  try {
    console.log(`Saving data for ${username}...`);

    // Only send backup config if backups are enabled
    const maxBackupsHeader = backupConfig.enabled ? backupConfig.maxBackups.toString() : "0";

    // Fetch latest data from server to merge with our changes
    // This prevents overwriting other users' changes made since page load
    const [latestDaysOffRes, latestHolidaysRes] = await Promise.all([
      fetch('/api/daysOff.json'),
      fetch('/api/holidays.json')
    ]);

    if (!latestDaysOffRes.ok || !latestHolidaysRes.ok) {
      throw new Error("Failed to fetch latest data from server");
    }

    const etagDays = latestDaysOffRes.headers.get('ETag') || '';
    const etagHol = latestHolidaysRes.headers.get('ETag') || '';

    // Parse the latest server data
    const latestDaysOff = await latestDaysOffRes.json();
    const latestHolidays = await latestHolidaysRes.json();

    // Merge: apply ONLY the current user's changes to the latest server data
    // This preserves other users' changes while applying our own
    const mergedDaysOff = { ...latestDaysOff };
    mergedDaysOff[username] = daysOffData[username] || [];

    // Also update our local cache with other users' changes we just fetched
    // This keeps our local state in sync for the next operation
    for (const otherUser of Object.keys(latestDaysOff)) {
      if (otherUser !== username) {
        daysOffData[otherUser] = latestDaysOff[otherUser];
      }
    }

    // For holidays, merge new holidays added locally that don't exist on server
    // and preserve server holidays that we don't have locally
    const mergedHolidays = { ...latestHolidays };
    if (holidaysData.holidays && Array.isArray(holidaysData.holidays)) {
      const serverHolidayDates = new Set(
        (latestHolidays.holidays || []).map((h: any) => h.date)
      );
      const localHolidayDates = new Set(
        holidaysData.holidays.map((h: any) => h.date)
      );
      
      // Combine holidays: keep server holidays, add any local-only holidays
      mergedHolidays.holidays = [
        ...(latestHolidays.holidays || []),
        ...holidaysData.holidays.filter((h: any) => !serverHolidayDates.has(h.date))
      ];
      
      // Update local cache with server holidays we didn't have
      holidaysData.holidays = mergedHolidays.holidays;
    }

    const [daysOffResponse, holidaysResponse] = await Promise.all([
      fetch("/api/daysOff.json", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Max-Backups": maxBackupsHeader,
          "If-Match": etagDays
        },
        body: JSON.stringify(mergedDaysOff)
      }),
      fetch("/api/holidays.json", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Max-Backups": maxBackupsHeader,
          "If-Match": etagHol
        },
        body: JSON.stringify(mergedHolidays)
      })
    ]);

    if (!daysOffResponse.ok) {
      const txt = await daysOffResponse.text();
      // If we get a conflict (412), retry once with fresh data
      if (daysOffResponse.status === 412) {
        console.log("Concurrent modification detected, retrying...");
        return saveData(username);
      }
      throw new Error(`daysOff save failed (${daysOffResponse.status}): ${txt}`);
    }
    if (!holidaysResponse.ok) {
      const txt = await holidaysResponse.text();
      if (holidaysResponse.status === 412) {
        console.log("Concurrent modification detected, retrying...");
        return saveData(username);
      }
      throw new Error(`holidays save failed (${holidaysResponse.status}): ${txt}`);
    }

    console.log(`Data saved successfully for ${username}`);
    showNotification("Changes saved successfully", "success");
  } catch (error) {
    console.error("Error saving data:", error);
    showNotification(`Failed to save changes: ${error instanceof Error ? error.message : error}` as any, "error");
  }
}

/**
 * Save employees data (used when updating per-year allowances)
 */
async function saveEmployeesData() {
  try {
    console.log("Saving employees data (allowances)...");
    const response = await fetch("/api/employees.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(employeesData)
    });
    if (!response.ok) {
      throw new Error("Failed to save employees.json");
    }
    showNotification("Allowances saved", "success");
  } catch (error) {
    console.error("Error saving employees.json", error);
    showNotification("Failed to save allowances", "error");
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
    const existing = document.getElementById("settingsModal") as HTMLDivElement;
    if (existing && existing.parentElement) existing.parentElement.removeChild(existing);
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

  // We no longer use this legacy settings modal; keep function for compatibility
  // but do not append to DOM.
  // document.body.appendChild(modal);

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
  // Redirect to unified Operations dialog Backups tab
  showOperationsDialog("backups");
  return;

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
    // Open unified dialog on Backups tab instead of legacy settings modal
    showOperationsDialog("backups");
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

  // Export/Backup/Restore unified dialog
  actionExportData.addEventListener("click", () => {
    showOperationsDialog("export");
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

    // Instead of exporting immediately, open the unified dialog
    showOperationsDialog("export");
  } catch (error) {
    console.error("Error opening export dialog:", error);
    showNotification("Failed to export data", "error");
  }
}

// Export in selected format: json | xml | csv
function exportCalendarDataAs(format: "json" | "xml" | "csv") {
  try {
    const exportObj = {
      month: currentMonth,
      year: currentYear,
      employeesData,
      daysOffData,
      holidaysData,
      exportDate: new Date().toISOString()
    };

    let dataStr = "";
    let mime = "application/octet-stream";
    let filename = `calendar-export-${currentYear}-${currentMonth + 1}.${format}`;

    if (format === "json") {
      dataStr = JSON.stringify(exportObj, null, 2);
      mime = "application/json";
    } else if (format === "xml") {
      dataStr = convertExportToXML(exportObj);
      mime = "application/xml";
    } else if (format === "csv") {
      dataStr = convertExportToCSV(exportObj);
      mime = "text/csv";
    }

    const dataUri = `data:${mime};charset=utf-8,` + encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', filename);
    linkElement.click();
    showNotification(`Exported ${format.toUpperCase()} successfully`, "success");
  } catch (error) {
    console.error("Error exporting data:", error);
    showNotification("Failed to export data", "error");
  }
}

// Generate a single ICS for the current month for all visible employees
function exportIcsForVisible() {
  try {
    const now = new Date();
    const dtstamp = toIcsDateTime(now);
    const monthStart = new Date(currentYear, currentMonth, 1);
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    let ics = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//timeoff//calendar//EN\nCALSCALE:GREGORIAN\n";

    const visibleUsers = employeesData.employees.filter(e => e.visible);
    for (const emp of visibleUsers) {
      const entries = (daysOffData[emp.username] || []);
      for (const entry of entries) {
        const d = parseLocalDate(entry.date);
        if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) continue;
        const dt = toIcsDate(entry.date); // all-day
        const uid = `${emp.username}-${entry.date}@timeoff`;
        const type = entry.type || "Day Off";
        const note = entry.note ? ` (${entry.note})` : "";
        const summary = `${emp.username}: ${type}${note}`;
        const desc = summary;
        ics += `BEGIN:VEVENT\nUID:${uid}\nDTSTAMP:${dtstamp}\nDTSTART;VALUE=DATE:${dt}\nDTEND;VALUE=DATE:${nextIcsDate(entry.date)}\nSUMMARY:${escapeIcs(summary)}\nDESCRIPTION:${escapeIcs(desc)}\nEND:VEVENT\n`;
      }
    }
    ics += "END:VCALENDAR\n";

    const dataUri = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
    const fname = `calendar-${currentYear}-${currentMonth + 1}.ics`;
    const a = document.createElement('a');
    a.setAttribute('href', dataUri);
    a.setAttribute('download', fname);
    a.click();
    showNotification("Exported ICS successfully", "success");
  } catch (e) {
    console.error("ICS export error", e);
    showNotification("Failed to export ICS", "error");
  }
}

function toIcsDate(isoDate: string): string {
  // YYYY-MM-DD -> YYYYMMDD in local time context
  return isoDate.replaceAll('-', '');
}

function nextIcsDate(isoDate: string): string {
  const d = parseLocalDate(isoDate);
  const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}`;
}

function toIcsDateTime(d: Date): string {
  // UTC timestamp YYYYMMDDTHHMMSSZ
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${day}T${hh}${mm}${ss}Z`;
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function convertExportToXML(obj: any): string {
  // Minimal XML conversion tailored to known structure
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const employeeXml = obj.employeesData.employees.map((e: any) => {
    const attrs = ["username","name","surname","visible","team","department","pair"].map(k => e[k] !== undefined ? `<${k}>${esc(String(e[k]))}</${k}>` : "").join("");
    return `<employee>${attrs}</employee>`;
  }).join("");
  const dayOffUsers = Object.keys(obj.daysOffData || {});
  const daysOffXml = dayOffUsers.map(u => {
    const entries = (obj.daysOffData[u] || []).map((d: any) => {
      const note = d.note ? `<note>${esc(String(d.note))}</note>` : "";
      const carry = d.useCarryover ? `<useCarryover>true</useCarryover>` : "";
      return `<entry><date>${esc(d.date)}</date><type>${esc(d.type)}</type>${note}${carry}</entry>`;
    }).join("");
    return `<user username="${esc(u)}">${entries}</user>`;
  }).join("");
  const holidaysXml = (obj.holidaysData.holidays || []).map((h: any) => `<holiday><date>${esc(h.date)}</date><name>${esc(h.name)}</name></holiday>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<calendarExport>\n  <month>${obj.month}</month>\n  <year>${obj.year}</year>\n  <exportDate>${esc(obj.exportDate)}</exportDate>\n  <employees>${employeeXml}</employees>\n  <daysOff>${daysOffXml}</daysOff>\n  <holidays>${holidaysXml}</holidays>\n</calendarExport>`;
}

function convertExportToCSV(obj: any): string {
  // Create three CSV sections separated by blank lines
  const csvEsc = (v: any) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  // Employees
  const empHeaders = ["username","name","surname","visible","team","department","pair"];
  const empRows = obj.employeesData.employees.map((e: any) => empHeaders.map(h => csvEsc(e[h])).join(","));
  const employeesCsv = [empHeaders.join(","), ...empRows].join("\n");
  // DaysOff
  const dayOffHeaders = ["username","date","type","note","useCarryover"];
  const dayOffRows: string[] = [];
  Object.keys(obj.daysOffData || {}).forEach(u => {
    (obj.daysOffData[u] || []).forEach((d: any) => {
      dayOffRows.push([csvEsc(u), csvEsc(d.date), csvEsc(d.type), csvEsc(d.note ?? ""), csvEsc(d.useCarryover ? "true" : "false")].join(","));
    });
  });
  const daysOffCsv = [dayOffHeaders.join(","), ...dayOffRows].join("\n");
  // Holidays
  const holHeaders = ["date","name"];
  const holRows = (obj.holidaysData.holidays || []).map((h: any) => [csvEsc(h.date), csvEsc(h.name)].join(","));
  const holidaysCsv = [holHeaders.join(","), ...holRows].join("\n");
  return `# Employees\n${employeesCsv}\n\n# DaysOff\n${daysOffCsv}\n\n# Holidays\n${holidaysCsv}\n`;
}

// Unified operations dialog (Export, Backups)
function showOperationsDialog(initialTab: "export" | "backups" = "export") {
  let dlg = document.getElementById("exportDialog") as HTMLDivElement | null;
  if (!dlg) {
    dlg = document.createElement("div");
    dlg.id = "exportDialog";
    dlg.className = "modal";
    dlg.innerHTML = `
      <div class="modal-content">
        <h3>Operations</h3>
        <div class="ops-tabs" style="display:flex; gap:8px; margin-bottom:10px;">
          <button id="tabExport" class="ops-tab active">Export</button>
          <button id="tabBackups" class="ops-tab">Backups</button>
          <button id="tabRestore" class="ops-tab">Restore</button>
        </div>
        <div id="opsExport" style="display:none;">
          <div class="form-group">
            <label>Select format:</label>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button id="btnExportJson">JSON</button>
              <button id="btnExportXml">XML</button>
              <button id="btnExportCsv">CSV</button>
              <button id="btnExportIcs">ICS</button>
            </div>
          </div>
        </div>
        <div id="opsBackups" style="display:none;">
          <div class="form-group">
            <label>File:</label>
            <select id="backupFileSelect">
              <option value="employees">employees.json</option>
              <option value="daysOff">daysOff.json</option>
              <option value="holidays">holidays.json</option>
            </select>
          </div>
          <div class="form-group">
            <label>Available backups:</label>
            <div id="backupList" style="max-height:200px; overflow:auto; border:1px solid #ccc; padding:6px;"></div>
          </div>
          <div class="form-group">
            <label>Preview:</label>
            <div id="backupMeta" class="form-help"></div>
            <textarea id="backupPreview" style="width:100%; height:180px;"></textarea>
            <div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">
              <button id="btnBackupNow">Backup now</button>
            </div>
          </div>
        </div>
        <div id="opsRestore" style="display:none;">
          <div class="form-group">
            <label>Target file:</label>
            <select id="restoreFileSelect">
              <option value="employees">employees.json</option>
              <option value="daysOff">daysOff.json</option>
              <option value="holidays">holidays.json</option>
            </select>
          </div>
          <div class="form-group">
            <label>Upload file:</label>
            <input type="file" id="restoreFileInput" accept=".json,application/json" />
          </div>
          <div class="form-group">
            <label>Or paste JSON content:</label>
            <textarea id="restorePaste" style="width:100%; height:180px;"></textarea>
          </div>
          <div class="form-group" style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="btnDoRestore">Restore</button>
          </div>
        </div>
        <div class="modal-buttons">
          <button id="exportCancel">Close</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);

    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) dlg!.style.display = "none";
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dlg && dlg.style.display === "flex") dlg.style.display = "none";
    });
  }
  const tabExport = document.getElementById("tabExport") as HTMLButtonElement;
  const tabBackups = document.getElementById("tabBackups") as HTMLButtonElement;
  const tabRestore = document.getElementById("tabRestore") as HTMLButtonElement;
  const panelExport = document.getElementById("opsExport") as HTMLDivElement;
  const panelBackups = document.getElementById("opsBackups") as HTMLDivElement;
  const panelRestore = document.getElementById("opsRestore") as HTMLDivElement;
  const showTab = (tab: "export" | "backups") => {
    const setActive = (btn?: HTMLButtonElement) => {
      document.querySelectorAll('.ops-tab').forEach(el => el.classList.remove('active'));
      if (btn) btn.classList.add('active');
    };
    panelExport.style.display = "none";
    panelBackups.style.display = "none";
    panelRestore.style.display = "none";
    if (tab === "export") { panelExport.style.display = "block"; setActive(tabExport); }
    else if (tab === "backups") { panelBackups.style.display = "block"; setActive(tabBackups); refreshBackupsList(); }
    else { panelRestore.style.display = "block"; setActive(tabRestore); }
  };
  if (tabExport) tabExport.onclick = () => showTab("export");
  if (tabBackups) tabBackups.onclick = () => showTab("backups");
  if (tabRestore) tabRestore.onclick = () => showTab("restore" as any);

  const btnJson = document.getElementById("btnExportJson");
  const btnXml = document.getElementById("btnExportXml");
  const btnCsv = document.getElementById("btnExportCsv");
  const btnIcs = document.getElementById("btnExportIcs");
  const btnCancel = document.getElementById("exportCancel");
  if (btnJson) btnJson.onclick = () => { exportCalendarDataAs("json"); };
  if (btnXml) btnXml.onclick = () => { exportCalendarDataAs("xml"); };
  if (btnCsv) btnCsv.onclick = () => { exportCalendarDataAs("csv"); };
  if (btnIcs) btnIcs.onclick = () => { exportIcsForVisible(); };
  if (btnCancel) btnCancel.onclick = () => { (document.getElementById("exportDialog") as HTMLDivElement).style.display = "none"; };

  // Backups wiring
  const sel = document.getElementById("backupFileSelect") as HTMLSelectElement;
  if (sel) sel.onchange = () => refreshBackupsList();
  async function refreshBackupsList() {
    const list = document.getElementById("backupList") as HTMLDivElement;
    const meta = document.getElementById("backupMeta") as HTMLDivElement;
    const preview = document.getElementById("backupPreview") as HTMLTextAreaElement;
    const btnBackupNow = document.getElementById("btnBackupNow") as HTMLButtonElement;
    if (!list || !sel) return;
    list.innerHTML = "Loading...";
    const prefix = (sel.value || "");
    try {
      // Always load current file content into preview first
      const currentPath = prefix === 'employees' ? '/api/employees.json' : (prefix === 'daysOff' ? '/api/daysOff.json' : '/api/holidays.json');
      const curRes = await fetch(currentPath);
      if (curRes.ok) {
        const curText = await curRes.text();
        preview.value = curText;
        meta.textContent = 'current';
      }

      const res = await fetch(`/api/backups?prefix=${prefix}`);
      const rawText = await res.text();
      if (!res.ok) {
        throw new Error(`Failed to list backups (${res.status}): ${rawText}`);
      }
      let files: any;
      try { files = JSON.parse(rawText); } catch (e) {
        throw new Error(`Server returned non-JSON: ${rawText}`);
      }
      if (!Array.isArray(files)) {
        throw new Error(`Unexpected response (not array): ${rawText}`);
      }
      if (files.length === 0) { list.innerHTML = "No backups."; return; }
      list.innerHTML = "";
      files.forEach(fn => {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = fn;
        a.style.display = 'block';
        a.onclick = async (e) => {
          e.preventDefault();
          const r = await fetch(`/api/backups?filename=${encodeURIComponent(fn)}`);
          if (!r.ok) { meta.textContent = "Failed to load"; return; }
          const j = await r.json();
          meta.textContent = `checksum: ${j.checksum}`;
          preview.value = j.content || '';
        };
        list.appendChild(a);
      });

      if (btnBackupNow) {
        btnBackupNow.onclick = () => handleBackupNow(prefix);
      }
    } catch (err: any) {
      list.innerHTML = `Error loading backups: ${err?.message ?? err}`;
    }
  }

  async function handleRestore(which: string, content: string) {
    if (!confirm(`Restore ${which}.json from selected backup? This will overwrite current data.`)) return;
    const path = which === 'employees' ? '/api/employees.json' : (which === 'daysOff' ? '/api/daysOff.json' : '/api/holidays.json');
    try {
      // fetch current ETag
      const head = await fetch(path, { method: 'GET' });
      const etag = head.headers.get('ETag') || '';
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': etag,
        },
        body: content,
      });
      if (res.status === 412) {
        const current = res.headers.get('ETag') || '';
        showNotification('Restore failed due to concurrent changes. Please retry.', 'error');
        return;
      }
      if (!res.ok) throw new Error('Restore failed');
      showNotification('Restore completed.', 'success');
      // refresh in-memory data
      await loadData();
      buildCalendar(currentYear, currentMonth);
    } catch (e) {
      console.error(e);
      showNotification('Restore error', 'error');
    }
  }

  async function handleBackupNow(which: string) {
    const path = which === 'employees' ? '/api/employees.json' : (which === 'daysOff' ? '/api/daysOff.json' : '/api/holidays.json');
    try {
      const getRes = await fetch(path);
      const etag = getRes.headers.get('ETag') || '';
      const body = await getRes.text();
      // POST same content to trigger backup creation
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': etag, 'X-Max-Backups': String((backupConfig as any)?.maxBackups || 10) }, body });
      if (!res.ok) throw new Error(`Backup failed (${res.status})`);
      showNotification('Backup created', 'success');
      await refreshBackupsList();
    } catch (e) {
      console.error(e);
      showNotification('Backup failed', 'error');
    }
  }

  // Restore tab wiring
  const restoreSelect = document.getElementById('restoreFileSelect') as HTMLSelectElement;
  const restoreFileInput = document.getElementById('restoreFileInput') as HTMLInputElement;
  const restorePaste = document.getElementById('restorePaste') as HTMLTextAreaElement;
  const btnDoRestore = document.getElementById('btnDoRestore') as HTMLButtonElement;
  if (restoreFileInput) {
    restoreFileInput.onchange = async () => {
      const f = restoreFileInput.files && restoreFileInput.files[0];
      if (!f) return;
      const text = await f.text();
      restorePaste.value = text;
    };
  }
  if (btnDoRestore) {
    btnDoRestore.onclick = async () => {
      const which = restoreSelect?.value || 'daysOff';
      const content = restorePaste?.value || '';
      if (!content.trim()) { showNotification('Paste JSON or upload a file first', 'error'); return; }
      // Validate JSON before POST
      try { JSON.parse(content); } catch { showNotification('Invalid JSON provided', 'error'); return; }
      await handleRestore(which, content);
    };
  }

  // Show requested tab
  showTab(initialTab);
  dlg!.style.display = "flex";
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

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ignore when typing in inputs
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    // Go to today
    if (e.key === 't') {
      const today = new Date();
      currentMonth = today.getMonth();
      currentYear = today.getFullYear();
      monthSelect.value = currentMonth.toString();
      yearSelect.value = currentYear.toString();
      buildCalendar(currentYear, currentMonth);
      showNotification("Today", "info");
      return;
    }
    // Prev/Next month
    if (e.key === 'ArrowLeft') {
      const d = new Date(currentYear, currentMonth - 1, 1);
      currentYear = d.getFullYear();
      currentMonth = d.getMonth();
      monthSelect.value = currentMonth.toString();
      yearSelect.value = currentYear.toString();
      buildCalendar(currentYear, currentMonth);
      return;
    }
    if (e.key === 'ArrowRight') {
      const d = new Date(currentYear, currentMonth + 1, 1);
      currentYear = d.getFullYear();
      currentMonth = d.getMonth();
      monthSelect.value = currentMonth.toString();
      yearSelect.value = currentYear.toString();
      buildCalendar(currentYear, currentMonth);
      return;
    }
    // Quick search focus
    if (e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
      employeeFilter.focus();
      e.preventDefault();
      return;
    }
  });
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

  // Ensure horizontal pan inside grid stays within the grid scrolling
  const grid = document.getElementById('employeeList');
  if (grid) {
    grid.addEventListener('touchstart', () => { /* noop */ }, { passive: true });
    // Using CSS touch-action: pan-x on #employeeList handles horizontal panning;
    // we keep JS here minimal to avoid interfering with native scroll.
  }

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
  const todayBtn = document.getElementById('todayBtn') as HTMLButtonElement;
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
  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
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

      // Keep menu state unchanged; this is a header control
    });
  }

  if (actionExportData) {
    actionExportData.addEventListener('click', () => {
      // Open unified operations dialog (default to export)
      showOperationsDialog("export");
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

    // Remove legacy settings button injection (unified dialog handles everything)

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

  // Move the action FAB into the controls bar, left of the month selector
  const actionFabEl = document.getElementById('actionFab') as HTMLDivElement | null;
  const controls = document.getElementById('controls') as HTMLDivElement | null;
  if (actionFabEl && controls && monthSelect) {
    actionFabEl.classList.add('inline-action-fab');
    // Clear any inline/fallback positioning that might keep it fixed
    actionFabEl.style.position = 'static';
    actionFabEl.style.bottom = '';
    actionFabEl.style.right = '';
    actionFabEl.style.left = '';
    actionFabEl.style.top = '';
    (actionFabEl as any).style.inset = '';
    // Insert before monthSelect
    // Place action button at the far left, before month; Today button should come immediately after the FAB
    controls.insertBefore(actionFabEl, monthSelect);
    const todayBtn = document.getElementById('todayBtn');
    if (todayBtn) {
      controls.insertBefore(todayBtn, monthSelect);
    }
  }
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

  // Precompute percent off per day for visible employees
  const percentByDay: number[] = [];
  const visibleUsers = employeesData.employees.filter(e => e.visible).map(e => e.username);
  for (let day = 1; day <= daysInMonth; day++) {
    const isoDate = getLocalDateString(new Date(year, month, day));
    const total = visibleUsers.length;
    let off = 0;
    visibleUsers.forEach(u => {
      const arr = daysOffData[u] || [];
      if (arr.some(e => e.date === isoDate)) off += 1;
    });
    percentByDay.push(total > 0 ? Math.round((off / total) * 100) : 0);
  }

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
    const now = new Date();
    if (cellDate.getFullYear() === now.getFullYear() && cellDate.getMonth() === now.getMonth() && cellDate.getDate() === now.getDate()) {
      cell.classList.add('today');
    }
    if (cellDate.getDay() === 0 || cellDate.getDay() === 6) {
      cell.classList.add("weekend");
    }
    // Add capacity info as a tooltip on header cell
    const pct = percentByDay[day - 1] || 0;
    cell.setAttribute('data-tooltip', `Capacity: ${pct}% off`);
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
      nameDiv.setAttribute('data-tooltip', tooltipParts.join("\n"));
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
        cell.setAttribute('data-tooltip', holiday.name);
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
          } else {
            cell.setAttribute('data-tooltip', dayOffEntry.type);
          }

          cell.classList.add("day-off");
          cell.dataset.type = dayOffEntry.type;
          cell.setAttribute("draggable", "true");
          setupDragEvents(cell, employee.username, dayOffEntry);

          // Check for conflicts
          if (isPairedDayOff) {
            cell.classList.add('pair-conflict');
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
  // Compute monthly carryover usage (Normal with useCarryover=true)
  const monthlyCarry: number[] = Array.from({ length: 12 }, () => 0);
  const userDaysForYear = (daysOffData[username] || []).filter(e => parseLocalDate(e.date).getFullYear() === currentYear);
  userDaysForYear.forEach(e => {
    const d = parseLocalDate(e.date);
    if (isFromPoolType(e.type) && (e as any).useCarryover) {
      monthlyCarry[d.getMonth()] += 1;
    }
  });
  const monthNames = Array.from(
    { length: 12 },
    (_, i) => new Date(0, i).toLocaleString("default", { month: "short" })
  );

  statsHtml += '<div class="month-bars">';
  monthNames.forEach((month, index) => {
    const monthCount = Object.values(monthlyStats[index] || {}).reduce((sum, count) => sum + count, 0);
    const carryCount = monthlyCarry[index] || 0;
    const heightPercent = Math.min(100, monthCount * 10);
    const baseColor = '#5aa0ff';
    const carryColor = '#ffb74d';
    const carryPctOfBar = monthCount > 0 ? Math.round((carryCount / monthCount) * 100) : 0;
    const bg = carryPctOfBar > 0
      ? `linear-gradient(to top, ${carryColor} 0% ${carryPctOfBar}%, ${baseColor} ${carryPctOfBar}% 100%)`
      : baseColor;
    statsHtml += `<div class="month-column">
    <div class="month-bar-container">
      <div class="month-bar" style="height: ${heightPercent}%; background: ${bg}" title="${monthCount} days in ${month}${carryCount ? ` (carryover: ${carryCount})` : ''}"></div>
      <div class="month-count">${monthCount || ""}</div>
    </div>
    <div class="month-name">${month}</div>
  </div>`;
  });
  statsHtml += "</div>";
  statsHtml += "</div>";

  // Allowance button and balances (no inline inputs)
  const prevYear = currentYear - 1;
  const employeeAllowances = employee.allowances || {};
  const allowancePrev = employeeAllowances[String(prevYear)];
  const allowanceCurrMaybe = employeeAllowances[String(currentYear)];

  const usedPrev = calculateUsedDays(username, prevYear);
  const usedCurr = calculateUsedDays(username, currentYear);
  const effPrevAllowance = Number(allowancePrev) || 0;
  const effCurrAllowance = (allowanceCurrMaybe !== undefined)
    ? (Number(allowanceCurrMaybe) || 0)
    : (Number(allowancePrev) || 0);
  // Previous year remaining must also subtract any carryover used this year
  const prevUnused = Math.max(0, effPrevAllowance - usedPrev.total - usedCurr.carryover);
  // Current year remaining subtracts base used this year and any of this year's allocation used next year as carryover
  const currRemaining = Math.max(0, effCurrAllowance - usedCurr.base - usedCurr.nextYearCarryFromThisYear);
  const availableNow = Math.max(0, currRemaining + prevUnused);

  statsHtml += `<h4>Allowance & Balance</h4>`;
  statsHtml += '<div class="stats-table">';
  statsHtml += `<div class="form-group">
    <button id="openAllowanceDialogBtn">Set Allowance for ${currentYear}</button>
    <div class="form-help"></div>
    <div class="allowance-block">
      <div class="allowance-year carry">${prevYear}: ${effPrevAllowance}</div>
      <div class="allowance-line">Used: ${usedPrev.total}</div>
      <div class="allowance-line">Used in ${currentYear} (Carry): ${usedCurr.carryover}</div>
      <div class="allowance-line">Remaining: ${prevUnused}</div>
    </div>
    <div class="allowance-block" style="margin-top:6px;">
      <div class="allowance-year base">${currentYear}: ${effCurrAllowance}</div>
      <div class="allowance-line">Used: ${usedCurr.base}</div>
      <div class="allowance-line">Used in ${currentYear + 1} (Carry): ${usedCurr.nextYearCarryFromThisYear}</div>
      <div class="allowance-line">Remaining: ${currRemaining}</div>
    </div>
  </div>`;
  statsHtml += "</div>";

  userStatsContent.innerHTML = statsHtml;
  userStatsModal.style.display = "flex";

  const openAllowanceDialogBtn = document.getElementById("openAllowanceDialogBtn");
  if (openAllowanceDialogBtn) {
    openAllowanceDialogBtn.addEventListener("click", () => {
      showAllowanceDialog(username, currentYear);
    });
  }
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
 * Calculate used days per year broken down by carryover vs current-year allowance
 */
function calculateUsedDays(username: string, year: number): { total: number; carryover: number; base: number; nextYearCarryFromThisYear: number } {
  const userDaysOff = daysOffData[username] || [];
  let total = 0;
  let carryover = 0; // used in 'year' from last year's allowance
  let base = 0;      // used in 'year' from this year's allowance
  let nextYearCarryFromThisYear = 0; // consumed next year but originating from this year's allowance
  userDaysOff.forEach((entry) => {
    if (!isFromPoolType(entry.type)) return; // only from-pool types affect allowance
    const d = parseLocalDate(entry.date);
    const y = d.getFullYear();
    if (y === year) {
      total += 1;
      if ((entry as any).useCarryover) carryover += 1; else base += 1;
    } else if (y === year + 1 && (entry as any).useCarryover) {
      // This is a carryover usage in next year; it should reduce this year's remaining base
      nextYearCarryFromThisYear += 1;
    }
  });
  return { total, carryover, base, nextYearCarryFromThisYear };
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
  const carry = dayOffEntry.useCarryover ? " (carryover)" : "";
  if (dayOffEntry.note) {
    cell.setAttribute('data-tooltip', `${dayOffEntry.type}: ${dayOffEntry.note}${carry}`);
  } else {
    cell.setAttribute('data-tooltip', `${dayOffEntry.type}${carry}`);
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
      if (draggedDayOffEntry.useCarryover) {
        newEntry.useCarryover = true;
      }
      userDaysOff.push(newEntry);

      // Update the drop target cell
      const typeConfig = employeesData.dayOffTypes[newEntry.type] || employeesData.dayOffTypes["Normal"];
      cell.style.backgroundColor = typeConfig.background;
      cell.style.color = typeConfig.foreground;

      // Set tooltip after drag and drop
      const carry = newEntry.useCarryover ? " (carryover)" : "";
      if (newEntry.note) {
        cell.setAttribute('data-tooltip', `${newEntry.type}: ${newEntry.note}${carry}`);
      } else {
        cell.setAttribute('data-tooltip', `${newEntry.type}${carry}`);
      }

      cell.classList.add("day-off");
      cell.dataset.type = newEntry.type;
      cell.setAttribute("draggable", "true");
      setupDragEvents(cell, username, newEntry);

      // Completely reset the original cell
      draggedCell.style.backgroundColor = "";
      draggedCell.style.color = "";
      draggedCell.removeAttribute('data-tooltip');
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
  cell.setAttribute('data-tooltip', "Normal");

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
    const disallowedTypes = new Set(["Holiday", "Sunday", "Saturday", "Friday"]);
    Object.keys(employeesData.dayOffTypes).forEach((type) => {
      if (disallowedTypes.has(type)) return;
      const option = document.createElement("option");
      option.value = type;
      option.text = type;
      dayOffTypeSelect.appendChild(option);
      // After adding Normal, add a carryover variant
      if (type === "Normal") {
        const carryOption = document.createElement("option");
        carryOption.value = "Normal__carryover";
        const prevYear = date.getFullYear() - 1;
        carryOption.text = `Normal (${prevYear})`;
        dayOffTypeSelect.appendChild(carryOption);
      }
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
        if (existingEntry.type === "Normal" && existingEntry.useCarryover) {
          dayOffTypeSelect.value = "Normal__carryover";
        } else {
          dayOffTypeSelect.value = existingEntry.type;
        }
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

function showAllowanceDialog(username: string, year: number) {
  let dlg = document.getElementById("allowanceDialog") as HTMLDivElement | null;
  if (!dlg) {
    dlg = document.createElement("div");
    dlg.id = "allowanceDialog";
    dlg.className = "modal";
    dlg.innerHTML = `
      <div class="modal-content">
        <h3>Set Allowance for <span id="allowanceYear"></span></h3>
        <div class="form-group">
          <label for="allowanceInput">Allowance (days):</label>
          <input type="number" id="allowanceInput" min="0" step="1" />
        </div>
        <div class="modal-buttons">
          <button id="allowanceCancel">Cancel</button>
          <button id="allowanceClear">Clear</button>
          <button id="allowanceSet">Set</button>
        </div>
      </div>
    `;
    document.body.appendChild(dlg);

    // Close when clicking outside
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) {
        dlg!.style.display = "none";
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dlg && dlg.style.display === "flex") {
        dlg.style.display = "none";
      }
    });
  }

  const yearSpan = document.getElementById("allowanceYear") as HTMLSpanElement | null;
  const input = document.getElementById("allowanceInput") as HTMLInputElement | null;
  const btnCancel = document.getElementById("allowanceCancel");
  const btnClear = document.getElementById("allowanceClear");
  const btnSet = document.getElementById("allowanceSet");

  if (yearSpan) yearSpan.textContent = String(year);

  const emp = employeesData.employees.find(e => e.username === username);
  const existingVal = emp?.allowances?.[String(year)] ?? "";
  if (input) input.value = existingVal === "" ? "" : String(existingVal);

  if (btnCancel) btnCancel.onclick = () => { if (dlg) dlg.style.display = "none"; };
  if (btnClear) btnClear.onclick = async () => {
    const e = employeesData.employees.find(x => x.username === username);
    if (!e) return;
    if (!e.allowances) e.allowances = {};
    delete e.allowances[String(year)];
    await saveEmployeesData();
    if (dlg) dlg.style.display = "none";
    // Refresh stats modal to reflect changes
    showUserStatistics(username, new MouseEvent('contextmenu'));
  };
  if (btnSet) btnSet.onclick = async () => {
    const raw = input ? input.value.trim() : "";
    const val = Math.max(0, Math.floor(Number(raw) || 0));
    const e = employeesData.employees.find(x => x.username === username);
    if (!e) return;
    if (!e.allowances) e.allowances = {};
    e.allowances[String(year)] = val;
    await saveEmployeesData();
    if (dlg) dlg.style.display = "none";
    showUserStatistics(username, new MouseEvent('contextmenu'));
  };

  if (dlg) dlg.style.display = "flex";
}

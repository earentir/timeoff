(() => {
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // app.ts
  document.addEventListener("DOMContentLoaded", initApp);
  var employeesData;
  var daysOffData;
  var holidaysData;
  var currentYear;
  var currentMonth;
  var currentNameFilter = "";
  var currentTeamFilter = "";
  var monthSelect;
  var yearSelect;
  var employeeListDiv;
  var modal;
  var dayOffTypeSelect;
  var dayOffNoteInput;
  var cancelButton;
  var saveButton;
  var removeButton;
  var holidayInfo;
  var editableArea;
  var themeToggle;
  var employeeFilter;
  var teamFilter;
  var quickActions;
  var actionShowToday;
  var actionToggleTheme;
  var actionExportData;
  var userStatsModal;
  var userStatsName;
  var userStatsContent;
  var userStatsCloseButton;
  var modalContext = null;
  var draggedCell = null;
  var draggedUsername = null;
  var draggedDayOffEntry = null;
  var draggedIndex = -1;
  var backupConfig = {
    maxBackups: 3,
    // Maximum number of backups to keep for each file type
    enabled: true
    // Whether backups are enabled
  };
  function closeModal() {
    modal.style.display = "none";
    modalContext = null;
    console.log("Modal closed");
  }
  function saveModal() {
    if (!modalContext) return;
    const { username, isoDate, cell } = modalContext;
    if (getHoliday(isoDate)) {
      closeModal();
      return;
    }
    if (isWeekend(isoDate)) {
      closeModal();
      return;
    }
    const pairedUsername = getPairedUsername(username);
    if (pairedUsername && hasUserDayOff(pairedUsername, isoDate)) {
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
    const disallowedTypes = /* @__PURE__ */ new Set(["Holiday", "Sunday", "Saturday", "Friday"]);
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
          cell.title = "";
          cell.removeAttribute("data-tooltip");
        }
      } else {
        const isCarryoverSelection = selectedType === "Normal__carryover";
        const baseType = isCarryoverSelection ? "Normal" : selectedType;
        const dayOffEntry = { date: isoDate, type: baseType };
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
        const carry = dayOffEntry.useCarryover ? " (carryover)" : "";
        if (note) {
          cell.title = `${selectedType}: ${note}${carry}`;
          cell.setAttribute("data-tooltip", `${selectedType}: ${note}${carry}`);
        } else {
          cell.title = `${selectedType}${carry}`;
          cell.setAttribute("data-tooltip", `${selectedType}${carry}`);
        }
        setupDragEvents(cell, username, dayOffEntry);
      }
    }
    console.log("Saving modal data for user:", username, "for date:", isoDate);
    closeModal();
    saveData(username);
    updatePairedEmployeeCalendar(username, isoDate);
  }
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
      cell.title = "";
      cell.removeAttribute("data-tooltip");
    }
    console.log("Removed day off for", username, "date:", isoDate);
    closeModal();
    saveData(username);
    updatePairedEmployeeCalendar(username, isoDate);
  }
  function updatePairedEmployeeCalendar(username, isoDate) {
    const pairedUsername = getPairedUsername(username);
    if (!pairedUsername) return;
    const hasDayOff = hasUserDayOff(username, isoDate);
    const pairedCells = document.querySelectorAll(`.day-cell[data-username="${pairedUsername}"][data-date="${isoDate}"]`);
    pairedCells.forEach((cell) => {
      var _a;
      const htmlCell = cell;
      if (hasDayOff) {
        if (!cell.classList.contains("day-off") && !cell.classList.contains("holiday") && !cell.classList.contains("weekend")) {
          cell.classList.add("pair-day-off");
          const employee = employeesData.employees.find((emp) => emp.username === username);
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
          const dayOffEntry = (_a = daysOffData[username]) == null ? void 0 : _a.find((entry) => entry.date === isoDate);
          let typeInfo = "";
          if (dayOffEntry) {
            typeInfo = dayOffEntry.type;
            if (dayOffEntry.note) {
              typeInfo += `: ${dayOffEntry.note}`;
            }
          }
          const tooltipMessage = `Unavailable: Your pair (${employeeName}) has time off this day${typeInfo ? ` - ${typeInfo}` : ""}`;
          htmlCell.title = tooltipMessage;
          htmlCell.setAttribute("data-tooltip", tooltipMessage);
        }
      } else {
        cell.classList.remove("pair-day-off");
        if (htmlCell.title === "Unavailable: Your pair has time off this day" || htmlCell.title.startsWith("Unavailable: Your pair")) {
          htmlCell.title = "";
          htmlCell.removeAttribute("data-tooltip");
        }
      }
    });
  }
  function saveData(username) {
    return __async(this, null, function* () {
      try {
        console.log(`Saving data for ${username}...`);
        const maxBackupsHeader = backupConfig.enabled ? backupConfig.maxBackups.toString() : "0";
        const [etagDaysRes, etagHolRes] = yield Promise.all([
          fetch("/api/daysOff.json"),
          fetch("/api/holidays.json")
        ]);
        const etagDays = etagDaysRes.headers.get("ETag") || "";
        const etagHol = etagHolRes.headers.get("ETag") || "";
        const [daysOffResponse, holidaysResponse] = yield Promise.all([
          fetch("/api/daysOff.json", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Max-Backups": maxBackupsHeader,
              "If-Match": etagDays
            },
            body: JSON.stringify(daysOffData)
          }),
          fetch("/api/holidays.json", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Max-Backups": maxBackupsHeader,
              "If-Match": etagHol
            },
            body: JSON.stringify(holidaysData)
          })
        ]);
        if (!daysOffResponse.ok) {
          const txt = yield daysOffResponse.text();
          throw new Error(`daysOff save failed (${daysOffResponse.status}): ${txt}`);
        }
        if (!holidaysResponse.ok) {
          const txt = yield holidaysResponse.text();
          throw new Error(`holidays save failed (${holidaysResponse.status}): ${txt}`);
        }
        console.log(`Data saved successfully for ${username}`);
        showNotification("Changes saved successfully", "success");
      } catch (error) {
        console.error("Error saving data:", error);
        showNotification(`Failed to save changes: ${error instanceof Error ? error.message : error}`, "error");
      }
    });
  }
  function saveEmployeesData() {
    return __async(this, null, function* () {
      try {
        console.log("Saving employees data (allowances)...");
        const response = yield fetch("/api/employees.json", {
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
    });
  }
  function loadBackupSettings() {
    return __async(this, null, function* () {
      try {
        const response = yield fetch("/api/backup-settings");
        if (!response.ok) {
          throw new Error("Failed to load backup settings");
        }
        const settings = yield response.json();
        if (settings.maxBackups) {
          backupConfig.maxBackups = settings.maxBackups;
        }
        const savedConfig = localStorage.getItem("backupConfig");
        if (savedConfig) {
          try {
            const parsedConfig = JSON.parse(savedConfig);
            backupConfig.enabled = parsedConfig.enabled !== void 0 ? parsedConfig.enabled : true;
            backupConfig.maxBackups = parsedConfig.maxBackups || backupConfig.maxBackups;
          } catch (error) {
            console.error("Error parsing backup config from localStorage:", error);
          }
        }
        console.log("Loaded backup configuration:", backupConfig);
      } catch (error) {
        console.error("Error loading backup settings:", error);
      }
    });
  }
  function loadData() {
    return __async(this, null, function* () {
      try {
        const [employeesRes, daysOffRes, holidaysRes] = yield Promise.all([
          fetch("/api/employees.json"),
          fetch("/api/daysOff.json"),
          fetch("/api/holidays.json")
        ]);
        if (!employeesRes.ok || !daysOffRes.ok || !holidaysRes.ok) {
          throw new Error("Failed to load data from server");
        }
        employeesData = yield employeesRes.json();
        daysOffData = yield daysOffRes.json();
        holidaysData = yield holidaysRes.json();
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
    });
  }
  function showNotification(message, type = "info") {
    let notification = document.getElementById("notification");
    if (!notification) {
      notification = document.createElement("div");
      notification.id = "notification";
      document.body.appendChild(notification);
    }
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = "block";
    setTimeout(() => {
      notification.style.display = "none";
    }, 3e3);
  }
  function exportCalendarDataAs(format) {
    try {
      const exportObj = {
        month: currentMonth,
        year: currentYear,
        employeesData,
        daysOffData,
        holidaysData,
        exportDate: (/* @__PURE__ */ new Date()).toISOString()
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
      const linkElement = document.createElement("a");
      linkElement.setAttribute("href", dataUri);
      linkElement.setAttribute("download", filename);
      linkElement.click();
      showNotification(`Exported ${format.toUpperCase()} successfully`, "success");
    } catch (error) {
      console.error("Error exporting data:", error);
      showNotification("Failed to export data", "error");
    }
  }
  function exportIcsForVisible() {
    try {
      const now = /* @__PURE__ */ new Date();
      const dtstamp = toIcsDateTime(now);
      const monthStart = new Date(currentYear, currentMonth, 1);
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      let ics = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//timeoff//calendar//EN\nCALSCALE:GREGORIAN\n";
      const visibleUsers = employeesData.employees.filter((e) => e.visible);
      for (const emp of visibleUsers) {
        const entries = daysOffData[emp.username] || [];
        for (const entry of entries) {
          const d = parseLocalDate(entry.date);
          if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) continue;
          const dt = toIcsDate(entry.date);
          const uid = `${emp.username}-${entry.date}@timeoff`;
          const type = entry.type || "Day Off";
          const note = entry.note ? ` (${entry.note})` : "";
          const summary = `${emp.username}: ${type}${note}`;
          const desc = summary;
          ics += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstamp}
DTSTART;VALUE=DATE:${dt}
DTEND;VALUE=DATE:${nextIcsDate(entry.date)}
SUMMARY:${escapeIcs(summary)}
DESCRIPTION:${escapeIcs(desc)}
END:VEVENT
`;
        }
      }
      ics += "END:VCALENDAR\n";
      const dataUri = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
      const fname = `calendar-${currentYear}-${currentMonth + 1}.ics`;
      const a = document.createElement("a");
      a.setAttribute("href", dataUri);
      a.setAttribute("download", fname);
      a.click();
      showNotification("Exported ICS successfully", "success");
    } catch (e) {
      console.error("ICS export error", e);
      showNotification("Failed to export ICS", "error");
    }
  }
  function toIcsDate(isoDate) {
    return isoDate.replaceAll("-", "");
  }
  function nextIcsDate(isoDate) {
    const d = parseLocalDate(isoDate);
    const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, "0")}${String(n.getDate()).padStart(2, "0")}`;
  }
  function toIcsDateTime(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    const ss = String(d.getUTCSeconds()).padStart(2, "0");
    return `${y}${m}${day}T${hh}${mm}${ss}Z`;
  }
  function escapeIcs(s) {
    return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  }
  function convertExportToXML(obj) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    const employeeXml = obj.employeesData.employees.map((e) => {
      const attrs = ["username", "name", "surname", "visible", "team", "department", "pair"].map((k) => e[k] !== void 0 ? `<${k}>${esc(String(e[k]))}</${k}>` : "").join("");
      return `<employee>${attrs}</employee>`;
    }).join("");
    const dayOffUsers = Object.keys(obj.daysOffData || {});
    const daysOffXml = dayOffUsers.map((u) => {
      const entries = (obj.daysOffData[u] || []).map((d) => {
        const note = d.note ? `<note>${esc(String(d.note))}</note>` : "";
        const carry = d.useCarryover ? `<useCarryover>true</useCarryover>` : "";
        return `<entry><date>${esc(d.date)}</date><type>${esc(d.type)}</type>${note}${carry}</entry>`;
      }).join("");
      return `<user username="${esc(u)}">${entries}</user>`;
    }).join("");
    const holidaysXml = (obj.holidaysData.holidays || []).map((h) => `<holiday><date>${esc(h.date)}</date><name>${esc(h.name)}</name></holiday>`).join("");
    return `<?xml version="1.0" encoding="UTF-8"?>
<calendarExport>
  <month>${obj.month}</month>
  <year>${obj.year}</year>
  <exportDate>${esc(obj.exportDate)}</exportDate>
  <employees>${employeeXml}</employees>
  <daysOff>${daysOffXml}</daysOff>
  <holidays>${holidaysXml}</holidays>
</calendarExport>`;
  }
  function convertExportToCSV(obj) {
    const csvEsc = (v) => {
      const s = String(v != null ? v : "");
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const empHeaders = ["username", "name", "surname", "visible", "team", "department", "pair"];
    const empRows = obj.employeesData.employees.map((e) => empHeaders.map((h) => csvEsc(e[h])).join(","));
    const employeesCsv = [empHeaders.join(","), ...empRows].join("\n");
    const dayOffHeaders = ["username", "date", "type", "note", "useCarryover"];
    const dayOffRows = [];
    Object.keys(obj.daysOffData || {}).forEach((u) => {
      (obj.daysOffData[u] || []).forEach((d) => {
        var _a;
        dayOffRows.push([csvEsc(u), csvEsc(d.date), csvEsc(d.type), csvEsc((_a = d.note) != null ? _a : ""), csvEsc(d.useCarryover ? "true" : "false")].join(","));
      });
    });
    const daysOffCsv = [dayOffHeaders.join(","), ...dayOffRows].join("\n");
    const holHeaders = ["date", "name"];
    const holRows = (obj.holidaysData.holidays || []).map((h) => [csvEsc(h.date), csvEsc(h.name)].join(","));
    const holidaysCsv = [holHeaders.join(","), ...holRows].join("\n");
    return `# Employees
${employeesCsv}

# DaysOff
${daysOffCsv}

# Holidays
${holidaysCsv}
`;
  }
  function showOperationsDialog(initialTab = "export") {
    let dlg = document.getElementById("exportDialog");
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
        if (e.target === dlg) dlg.style.display = "none";
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && dlg && dlg.style.display === "flex") dlg.style.display = "none";
      });
    }
    const tabExport = document.getElementById("tabExport");
    const tabBackups = document.getElementById("tabBackups");
    const tabRestore = document.getElementById("tabRestore");
    const panelExport = document.getElementById("opsExport");
    const panelBackups = document.getElementById("opsBackups");
    const panelRestore = document.getElementById("opsRestore");
    const showTab = (tab) => {
      const setActive = (btn) => {
        document.querySelectorAll(".ops-tab").forEach((el) => el.classList.remove("active"));
        if (btn) btn.classList.add("active");
      };
      panelExport.style.display = "none";
      panelBackups.style.display = "none";
      panelRestore.style.display = "none";
      if (tab === "export") {
        panelExport.style.display = "block";
        setActive(tabExport);
      } else if (tab === "backups") {
        panelBackups.style.display = "block";
        setActive(tabBackups);
        refreshBackupsList();
      } else {
        panelRestore.style.display = "block";
        setActive(tabRestore);
      }
    };
    if (tabExport) tabExport.onclick = () => showTab("export");
    if (tabBackups) tabBackups.onclick = () => showTab("backups");
    if (tabRestore) tabRestore.onclick = () => showTab("restore");
    const btnJson = document.getElementById("btnExportJson");
    const btnXml = document.getElementById("btnExportXml");
    const btnCsv = document.getElementById("btnExportCsv");
    const btnIcs = document.getElementById("btnExportIcs");
    const btnCancel = document.getElementById("exportCancel");
    if (btnJson) btnJson.onclick = () => {
      exportCalendarDataAs("json");
    };
    if (btnXml) btnXml.onclick = () => {
      exportCalendarDataAs("xml");
    };
    if (btnCsv) btnCsv.onclick = () => {
      exportCalendarDataAs("csv");
    };
    if (btnIcs) btnIcs.onclick = () => {
      exportIcsForVisible();
    };
    if (btnCancel) btnCancel.onclick = () => {
      document.getElementById("exportDialog").style.display = "none";
    };
    const sel = document.getElementById("backupFileSelect");
    if (sel) sel.onchange = () => refreshBackupsList();
    function refreshBackupsList() {
      return __async(this, null, function* () {
        var _a;
        const list = document.getElementById("backupList");
        const meta = document.getElementById("backupMeta");
        const preview = document.getElementById("backupPreview");
        const btnBackupNow = document.getElementById("btnBackupNow");
        if (!list || !sel) return;
        list.innerHTML = "Loading...";
        const prefix = sel.value || "";
        try {
          const currentPath = prefix === "employees" ? "/api/employees.json" : prefix === "daysOff" ? "/api/daysOff.json" : "/api/holidays.json";
          const curRes = yield fetch(currentPath);
          if (curRes.ok) {
            const curText = yield curRes.text();
            preview.value = curText;
            meta.textContent = "current";
          }
          const res = yield fetch(`/api/backups?prefix=${prefix}`);
          const rawText = yield res.text();
          if (!res.ok) {
            throw new Error(`Failed to list backups (${res.status}): ${rawText}`);
          }
          let files;
          try {
            files = JSON.parse(rawText);
          } catch (e) {
            throw new Error(`Server returned non-JSON: ${rawText}`);
          }
          if (!Array.isArray(files)) {
            throw new Error(`Unexpected response (not array): ${rawText}`);
          }
          if (files.length === 0) {
            list.innerHTML = "No backups.";
            return;
          }
          list.innerHTML = "";
          files.forEach((fn) => {
            const a = document.createElement("a");
            a.href = "#";
            a.textContent = fn;
            a.style.display = "block";
            a.onclick = (e) => __async(this, null, function* () {
              e.preventDefault();
              const r = yield fetch(`/api/backups?filename=${encodeURIComponent(fn)}`);
              if (!r.ok) {
                meta.textContent = "Failed to load";
                return;
              }
              const j = yield r.json();
              meta.textContent = `checksum: ${j.checksum}`;
              preview.value = j.content || "";
            });
            list.appendChild(a);
          });
          if (btnBackupNow) {
            btnBackupNow.onclick = () => handleBackupNow(prefix);
          }
        } catch (err) {
          list.innerHTML = `Error loading backups: ${(_a = err == null ? void 0 : err.message) != null ? _a : err}`;
        }
      });
    }
    function handleRestore(which, content) {
      return __async(this, null, function* () {
        if (!confirm(`Restore ${which}.json from selected backup? This will overwrite current data.`)) return;
        const path = which === "employees" ? "/api/employees.json" : which === "daysOff" ? "/api/daysOff.json" : "/api/holidays.json";
        try {
          const head = yield fetch(path, { method: "GET" });
          const etag = head.headers.get("ETag") || "";
          const res = yield fetch(path, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "If-Match": etag
            },
            body: content
          });
          if (res.status === 412) {
            const current = res.headers.get("ETag") || "";
            showNotification("Restore failed due to concurrent changes. Please retry.", "error");
            return;
          }
          if (!res.ok) throw new Error("Restore failed");
          showNotification("Restore completed.", "success");
          yield loadData();
          buildCalendar(currentYear, currentMonth);
        } catch (e) {
          console.error(e);
          showNotification("Restore error", "error");
        }
      });
    }
    function handleBackupNow(which) {
      return __async(this, null, function* () {
        const path = which === "employees" ? "/api/employees.json" : which === "daysOff" ? "/api/daysOff.json" : "/api/holidays.json";
        try {
          const getRes = yield fetch(path);
          const etag = getRes.headers.get("ETag") || "";
          const body = yield getRes.text();
          const res = yield fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "If-Match": etag, "X-Max-Backups": String((backupConfig == null ? void 0 : backupConfig.maxBackups) || 10) }, body });
          if (!res.ok) throw new Error(`Backup failed (${res.status})`);
          showNotification("Backup created", "success");
          yield refreshBackupsList();
        } catch (e) {
          console.error(e);
          showNotification("Backup failed", "error");
        }
      });
    }
    const restoreSelect = document.getElementById("restoreFileSelect");
    const restoreFileInput = document.getElementById("restoreFileInput");
    const restorePaste = document.getElementById("restorePaste");
    const btnDoRestore = document.getElementById("btnDoRestore");
    if (restoreFileInput) {
      restoreFileInput.onchange = () => __async(this, null, function* () {
        const f = restoreFileInput.files && restoreFileInput.files[0];
        if (!f) return;
        const text = yield f.text();
        restorePaste.value = text;
      });
    }
    if (btnDoRestore) {
      btnDoRestore.onclick = () => __async(this, null, function* () {
        const which = (restoreSelect == null ? void 0 : restoreSelect.value) || "daysOff";
        const content = (restorePaste == null ? void 0 : restorePaste.value) || "";
        if (!content.trim()) {
          showNotification("Paste JSON or upload a file first", "error");
          return;
        }
        try {
          JSON.parse(content);
        } catch (e) {
          showNotification("Invalid JSON provided", "error");
          return;
        }
        yield handleRestore(which, content);
      });
    }
    showTab(initialTab);
    dlg.style.display = "flex";
  }
  function setupEventListeners() {
    cancelButton.addEventListener("click", closeModal);
    saveButton.addEventListener("click", saveModal);
    removeButton.addEventListener("click", removeDayOff);
    userStatsCloseButton.addEventListener("click", closeUserStatsModal);
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
    document.addEventListener("keydown", (e) => {
      var _a, _b;
      const tag = (_b = (_a = e.target) == null ? void 0 : _a.tagName) == null ? void 0 : _b.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "t") {
        const today = /* @__PURE__ */ new Date();
        currentMonth = today.getMonth();
        currentYear = today.getFullYear();
        monthSelect.value = currentMonth.toString();
        yearSelect.value = currentYear.toString();
        buildCalendar(currentYear, currentMonth);
        showNotification("Today", "info");
        return;
      }
      if (e.key === "ArrowLeft") {
        const d = new Date(currentYear, currentMonth - 1, 1);
        currentYear = d.getFullYear();
        currentMonth = d.getMonth();
        monthSelect.value = currentMonth.toString();
        yearSelect.value = currentYear.toString();
        buildCalendar(currentYear, currentMonth);
        return;
      }
      if (e.key === "ArrowRight") {
        const d = new Date(currentYear, currentMonth + 1, 1);
        currentYear = d.getFullYear();
        currentMonth = d.getMonth();
        monthSelect.value = currentMonth.toString();
        yearSelect.value = currentYear.toString();
        buildCalendar(currentYear, currentMonth);
        return;
      }
      if (e.key === "/" || e.ctrlKey && e.key.toLowerCase() === "k") {
        employeeFilter.focus();
        e.preventDefault();
        return;
      }
    });
  }
  function setupTouchEvents() {
    console.log("Setting up touch event handlers");
    document.addEventListener("contextmenu", (e) => {
      const allowBrowserContextMenu = false;
      if (!allowBrowserContextMenu) {
        e.preventDefault();
      }
    });
    const LONG_PRESS_DURATION = 700;
    let longPressTimer = null;
    let longPressElement = null;
    let touchMoved = false;
    document.addEventListener("touchstart", (e) => {
      const target = e.target;
      touchMoved = false;
      if (!target.classList.contains("day-cell") && !target.classList.contains("employee-name")) {
        return;
      }
      longPressElement = target;
      longPressTimer = window.setTimeout(() => {
        if (!touchMoved && longPressElement) {
          if (longPressElement.classList.contains("day-cell")) {
            const username = longPressElement.dataset.username || "";
            const isoDate = longPressElement.dataset.date || "";
            if (username && isoDate) {
              console.log("Long press detected on day cell");
              longPressElement.classList.add("long-press-active");
              setTimeout(() => {
                longPressElement == null ? void 0 : longPressElement.classList.remove("long-press-active");
                openModal(username, isoDate, longPressElement);
              }, 150);
            }
          } else if (longPressElement.classList.contains("employee-name")) {
            const username = longPressElement.dataset.username || "";
            if (username) {
              console.log("Long press detected on employee name");
              longPressElement.classList.add("long-press-active");
              setTimeout(() => {
                longPressElement == null ? void 0 : longPressElement.classList.remove("long-press-active");
                const mockEvent = new MouseEvent("contextmenu", {
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
    document.addEventListener("touchmove", () => {
      touchMoved = true;
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (longPressElement) {
        longPressElement.classList.remove("long-press-active");
      }
    }, { passive: true });
    document.addEventListener("touchend", () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (longPressElement) {
        longPressElement.classList.remove("long-press-active");
        longPressElement = null;
      }
    }, { passive: true });
    const DOUBLE_TAP_DELAY = 300;
    let lastTapTime = 0;
    let lastTapElement = null;
    document.addEventListener("touchend", (e) => {
      const target = e.target;
      if (!target.classList.contains("day-cell") || target.classList.contains("weekend") || target.classList.contains("holiday") || target.classList.contains("day-off")) {
        return;
      }
      const currentTime = (/* @__PURE__ */ new Date()).getTime();
      const tapDuration = currentTime - lastTapTime;
      if (lastTapElement === target && tapDuration < DOUBLE_TAP_DELAY && !touchMoved) {
        e.preventDefault();
        const username = target.dataset.username || "";
        const isoDate = target.dataset.date || "";
        if (username && isoDate) {
          console.log("Double tap detected on day cell");
          addQuickDayOff(username, isoDate, target);
        }
        lastTapElement = null;
        lastTapTime = 0;
      } else {
        lastTapTime = currentTime;
        lastTapElement = target;
      }
    }, { passive: false });
    document.addEventListener("touchstart", (e) => {
      const target = e.target;
      if (!target.classList.contains("day-cell") || !target.classList.contains("day-off") || target.getAttribute("draggable") !== "true") {
        return;
      }
      target.classList.add("touch-draggable");
    }, { passive: true });
    document.addEventListener("touchend", (e) => {
      document.querySelectorAll(".touch-draggable").forEach((element) => {
        element.classList.remove("touch-draggable");
      });
    }, { passive: true });
    const actionsMenu = document.getElementById("actionsMenu");
    const backdrop = document.querySelector(".menu-backdrop");
    if (actionsMenu) {
      let touchStartY = 0;
      let touchMoveY = 0;
      actionsMenu.addEventListener("touchstart", (e) => {
        touchStartY = e.touches[0].clientY;
      }, { passive: true });
      actionsMenu.addEventListener("touchmove", (e) => {
        touchMoveY = e.touches[0].clientY;
        const diffY = touchMoveY - touchStartY;
        if (diffY > 0) {
          actionsMenu.style.transform = `translateY(${diffY}px)`;
        }
      }, { passive: true });
      actionsMenu.addEventListener("touchend", () => {
        const diffY = touchMoveY - touchStartY;
        if (diffY > 100) {
          actionsMenu.classList.remove("visible");
          if (backdrop) backdrop.classList.remove("visible");
        }
        actionsMenu.style.transform = "";
        touchStartY = 0;
        touchMoveY = 0;
      }, { passive: true });
    }
  }
  function setupActionHandlers() {
    const actionFab = document.getElementById("actionFab");
    const actionsMenu = document.getElementById("actionsMenu");
    const actionShowToday2 = document.getElementById("actionShowToday");
    const actionToggleTheme2 = document.getElementById("actionToggleTheme");
    const actionExportData2 = document.getElementById("actionExportData");
    if (!actionFab || !actionsMenu) {
      console.error("Action elements not found");
      return;
    }
    const backdrop = document.createElement("div");
    backdrop.className = "menu-backdrop";
    document.body.appendChild(backdrop);
    actionFab.addEventListener("click", () => {
      actionsMenu.classList.add("visible");
      backdrop.classList.add("visible");
    });
    const closeHandle = actionsMenu.querySelector(".action-close-handle");
    if (closeHandle) {
      closeHandle.addEventListener("click", () => {
        actionsMenu.classList.remove("visible");
        backdrop.classList.remove("visible");
      });
    }
    backdrop.addEventListener("click", () => {
      actionsMenu.classList.remove("visible");
      backdrop.classList.remove("visible");
    });
    if (actionShowToday2) {
      actionShowToday2.addEventListener("click", () => {
        const today = /* @__PURE__ */ new Date();
        currentMonth = today.getMonth();
        currentYear = today.getFullYear();
        monthSelect.value = currentMonth.toString();
        yearSelect.value = currentYear.toString();
        buildCalendar(currentYear, currentMonth);
        actionsMenu.classList.remove("visible");
        backdrop.classList.remove("visible");
        showNotification("Calendar set to current month", "info");
      });
    }
    if (actionToggleTheme2) {
      actionToggleTheme2.addEventListener("click", () => {
        if (document.body.classList.contains("dark")) {
          document.body.classList.remove("dark");
          document.body.classList.add("light");
        } else {
          document.body.classList.remove("light");
          document.body.classList.add("dark");
        }
        updateThemeToggleText();
        actionsMenu.classList.remove("visible");
        backdrop.classList.remove("visible");
      });
    }
    if (actionExportData2) {
      actionExportData2.addEventListener("click", () => {
        showOperationsDialog("export");
        actionsMenu.classList.remove("visible");
        backdrop.classList.remove("visible");
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && actionsMenu.classList.contains("visible")) {
        actionsMenu.classList.remove("visible");
        backdrop.classList.remove("visible");
      }
    });
  }
  function initApp() {
    return __async(this, null, function* () {
      console.log("Initializing application...");
      getDOMElements();
      yield loadBackupSettings();
      const dataLoaded = yield loadData();
      if (!dataLoaded) {
        console.error("Failed to load data, cannot initialize application");
        return;
      }
      initControls();
      setupEventListeners();
      setupTouchEvents();
      initTooltipSystem();
      updateThemeToggleText();
      buildCalendar(currentYear, currentMonth);
      console.log("Application initialized successfully");
    });
  }
  function updateThemeToggleText() {
    if (themeToggle) {
      themeToggle.textContent = document.body.classList.contains("dark") ? "light" : "dark";
    }
  }
  function parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function getHoliday(isoDate) {
    const targetDate = parseLocalDate(isoDate);
    for (const holiday of holidaysData.holidays) {
      const holidayDate = parseLocalDate(holiday.date);
      if (holidayDate.getFullYear() === targetDate.getFullYear() && holidayDate.getMonth() === targetDate.getMonth() && holidayDate.getDate() === targetDate.getDate()) {
        return holiday;
      }
    }
    return null;
  }
  function getDOMElements() {
    console.log("Getting DOM elements");
    monthSelect = document.getElementById("monthSelect");
    yearSelect = document.getElementById("yearSelect");
    employeeListDiv = document.getElementById("employeeList");
    modal = document.getElementById("modal");
    dayOffTypeSelect = document.getElementById("dayOffType");
    dayOffNoteInput = document.getElementById("dayOffNote");
    cancelButton = document.getElementById("cancelButton");
    saveButton = document.getElementById("saveButton");
    removeButton = document.getElementById("removeButton");
    holidayInfo = document.getElementById("holidayInfo");
    editableArea = document.getElementById("editableArea");
    themeToggle = document.getElementById("themeToggle");
    employeeFilter = document.getElementById("employeeFilter");
    teamFilter = document.getElementById("teamFilter");
    quickActions = document.getElementById("quickActions");
    actionShowToday = document.getElementById("actionShowToday");
    actionToggleTheme = document.getElementById("actionToggleTheme");
    actionExportData = document.getElementById("actionExportData");
    userStatsModal = document.getElementById("userStatsModal");
    userStatsName = document.getElementById("userStatsName");
    userStatsContent = document.getElementById("userStatsContent");
    userStatsCloseButton = document.getElementById("userStatsCloseButton");
    if (!monthSelect || !yearSelect || !employeeListDiv) {
      console.error("Critical DOM elements not found!", {
        monthSelect,
        yearSelect,
        employeeListDiv
      });
    } else {
      console.log("All critical DOM elements found");
    }
    if (!employeeFilter || !teamFilter) {
      console.error("Filter elements not found!");
    }
    if (!userStatsModal || !userStatsName || !userStatsContent || !userStatsCloseButton) {
      console.error("User stats modal elements not found!");
    }
  }
  function initControls() {
    const today = /* @__PURE__ */ new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    console.log("Init Controls (no localStorage): currentYear =", currentYear, "currentMonth =", currentMonth);
    monthSelect.innerHTML = "";
    yearSelect.innerHTML = "";
    for (let m = 0; m < 12; m++) {
      const option = document.createElement("option");
      option.value = m.toString();
      option.text = new Date(0, m).toLocaleString("default", { month: "long" });
      if (m === currentMonth) {
        option.selected = true;
      }
      monthSelect.appendChild(option);
    }
    for (let y = today.getFullYear() - 5; y <= today.getFullYear() + 5; y++) {
      const option = document.createElement("option");
      option.value = y.toString();
      option.text = y.toString();
      if (y === currentYear) {
        option.selected = true;
      }
      yearSelect.appendChild(option);
    }
    initTeamFilter();
    monthSelect.removeEventListener("change", handleMonthChange);
    yearSelect.removeEventListener("change", handleYearChange);
    employeeFilter.removeEventListener("input", handleFilterChange);
    teamFilter.removeEventListener("change", handleTeamFilterChange);
    monthSelect.addEventListener("change", handleMonthChange);
    yearSelect.addEventListener("change", handleYearChange);
    employeeFilter.addEventListener("input", handleFilterChange);
    teamFilter.addEventListener("change", handleTeamFilterChange);
    console.log("Event listeners attached to dropdowns");
    const actionFabEl = document.getElementById("actionFab");
    const controls = document.getElementById("controls");
    if (actionFabEl && controls && monthSelect) {
      actionFabEl.classList.add("inline-action-fab");
      actionFabEl.style.position = "static";
      actionFabEl.style.bottom = "";
      actionFabEl.style.right = "";
      actionFabEl.style.left = "";
      actionFabEl.style.top = "";
      actionFabEl.style.inset = "";
      controls.insertBefore(actionFabEl, monthSelect);
    }
  }
  function initTeamFilter() {
    teamFilter.innerHTML = '<option value="">All Teams/Depts</option>';
    const teams = /* @__PURE__ */ new Set();
    const departments = /* @__PURE__ */ new Set();
    employeesData.employees.forEach((employee) => {
      if (employee.team) teams.add(employee.team);
      if (employee.department) departments.add(employee.department);
    });
    if (teams.size > 0) {
      const teamsOptgroup = document.createElement("optgroup");
      teamsOptgroup.label = "Teams";
      Array.from(teams).sort().forEach((team) => {
        const option = document.createElement("option");
        option.value = `team:${team}`;
        option.text = team;
        teamsOptgroup.appendChild(option);
      });
      teamFilter.appendChild(teamsOptgroup);
    }
    if (departments.size > 0) {
      const deptsOptgroup = document.createElement("optgroup");
      deptsOptgroup.label = "Departments";
      Array.from(departments).sort().forEach((dept) => {
        const option = document.createElement("option");
        option.value = `dept:${dept}`;
        option.text = dept;
        deptsOptgroup.appendChild(option);
      });
      teamFilter.appendChild(deptsOptgroup);
    }
  }
  function handleMonthChange() {
    console.log("Month dropdown change triggered. New value:", monthSelect.value);
    currentMonth = parseInt(monthSelect.value, 10);
    buildCalendar(currentYear, currentMonth);
  }
  function handleYearChange() {
    console.log("Year dropdown change triggered. New value:", yearSelect.value);
    currentYear = parseInt(yearSelect.value, 10);
    buildCalendar(currentYear, currentMonth);
  }
  function handleFilterChange() {
    console.log("Employee filter changed. New value:", employeeFilter.value);
    currentNameFilter = employeeFilter.value.trim().toLowerCase();
    buildCalendar(currentYear, currentMonth);
  }
  function handleTeamFilterChange() {
    console.log("Team filter changed. New value:", teamFilter.value);
    currentTeamFilter = teamFilter.value;
    buildCalendar(currentYear, currentMonth);
  }
  function employeeMatchesFilters(employee) {
    const nameMatch = currentNameFilter === "" || employee.name.toLowerCase().includes(currentNameFilter) || employee.surname.toLowerCase().includes(currentNameFilter) || employee.username.toLowerCase().includes(currentNameFilter);
    if (!nameMatch) return false;
    if (currentTeamFilter === "") {
      return true;
    }
    if (currentTeamFilter.startsWith("team:")) {
      const team = currentTeamFilter.substring(5);
      return employee.team === team;
    }
    if (currentTeamFilter.startsWith("dept:")) {
      const dept = currentTeamFilter.substring(5);
      return employee.department === dept;
    }
    return true;
  }
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
    const percentByDay = [];
    const visibleUsers = employeesData.employees.filter((e) => e.visible).map((e) => e.username);
    for (let day = 1; day <= daysInMonth; day++) {
      const isoDate = getLocalDateString(new Date(year, month, day));
      const total = visibleUsers.length;
      let off = 0;
      visibleUsers.forEach((u) => {
        const arr = daysOffData[u] || [];
        if (arr.some((e) => e.date === isoDate)) off += 1;
      });
      percentByDay.push(total > 0 ? Math.round(off / total * 100) : 0);
    }
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
      const pct = percentByDay[day - 1] || 0;
      cell.title = `Capacity: ${pct}% off`;
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
      var _a;
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
      const tooltipParts = [];
      if (employee.team) tooltipParts.push(`Team: ${employee.team}`);
      if (employee.department) tooltipParts.push(`Department: ${employee.department}`);
      if (employee.pair) {
        const pairedEmployee = employeesData.employees.find((emp) => emp.username === employee.pair);
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
          cell.setAttribute("data-tooltip", holiday.name);
          cell.classList.add("holiday");
        } else {
          const userDaysOff = daysOffData[employee.username] || [];
          const dayOffEntry = userDaysOff.find((entry) => entry.date === isoDate);
          const pairedUsername = getPairedUsername(employee.username);
          const isPairedDayOff = pairedUsername ? hasUserDayOff(pairedUsername, isoDate) : false;
          if (dayOffEntry) {
            const typeConfig = employeesData.dayOffTypes[dayOffEntry.type] || employeesData.dayOffTypes["Normal"];
            cell.style.backgroundColor = typeConfig.background;
            cell.style.color = typeConfig.foreground;
            if (dayOffEntry.note) {
              cell.setAttribute("data-tooltip", `${dayOffEntry.type}: ${dayOffEntry.note}`);
              cell.title = `${dayOffEntry.type}: ${dayOffEntry.note}`;
            } else {
              cell.setAttribute("data-tooltip", dayOffEntry.type);
              cell.title = dayOffEntry.type;
            }
            cell.classList.add("day-off");
            cell.dataset.type = dayOffEntry.type;
            cell.setAttribute("draggable", "true");
            setupDragEvents(cell, employee.username, dayOffEntry);
            if (isPairedDayOff) {
              cell.classList.add("pair-conflict");
              cell.title = "Warning: Both you and your pair have this day off";
              cell.setAttribute("data-tooltip", "Warning: Both you and your pair have this day off");
            }
          } else if (isPairedDayOff) {
            cell.classList.add("pair-day-off");
            const pairedEmployee = employeesData.employees.find((emp) => emp.username === pairedUsername);
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
            const pairedDayOff = (_a = daysOffData[pairedUsername]) == null ? void 0 : _a.find((entry) => entry.date === isoDate);
            let typeInfo = "";
            if (pairedDayOff) {
              typeInfo = pairedDayOff.type;
              if (pairedDayOff.note) {
                typeInfo += `: ${pairedDayOff.note}`;
              }
            }
            const tooltipMessage = `Unavailable: Your pair (${pairedName}) has time off this day${typeInfo ? ` - ${typeInfo}` : ""}`;
            cell.title = tooltipMessage;
            cell.setAttribute("data-tooltip", tooltipMessage);
          } else {
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
          if (!cell.classList.contains("weekend") && !cell.classList.contains("holiday") && !cell.classList.contains("day-off") && !cell.classList.contains("pair-day-off")) {
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
    const teamInfo = [];
    if (employee.team) teamInfo.push(`Team: ${employee.team}`);
    if (employee.department) teamInfo.push(`Department: ${employee.department}`);
    if (employee.pair) {
      const pairedEmployee = employeesData.employees.find((emp) => emp.username === employee.pair);
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
    const prevYear = currentYear - 1;
    const employeeAllowances = employee.allowances || {};
    const allowancePrev = employeeAllowances[String(prevYear)];
    const allowanceCurrMaybe = employeeAllowances[String(currentYear)];
    const usedPrev = calculateUsedDays(username, prevYear);
    const usedCurr = calculateUsedDays(username, currentYear);
    const effPrevAllowance = Number(allowancePrev) || 0;
    const effCurrAllowance = allowanceCurrMaybe !== void 0 ? Number(allowanceCurrMaybe) || 0 : Number(allowancePrev) || 0;
    const prevUnused = Math.max(0, effPrevAllowance - usedPrev.total - usedCurr.carryover);
    const currRemaining = Math.max(0, effCurrAllowance - usedCurr.base - usedCurr.nextYearCarryFromThisYear);
    const availableNow = Math.max(0, currRemaining + prevUnused);
    statsHtml += `<h4>Allowance & Balance</h4>`;
    statsHtml += '<div class="stats-table">';
    statsHtml += `<div class="form-group">
    <button id="openAllowanceDialogBtn">Set Allowance for ${currentYear}</button>
    <div class="form-help">Prev ${prevYear}: ${effPrevAllowance} (used ${usedPrev.total} + used in ${currentYear} as carry ${usedCurr.carryover} \u2192 remaining ${prevUnused})</div>
    <div class="form-help">Curr ${currentYear}: ${allowanceCurrMaybe != null ? allowanceCurrMaybe : "(fallback to prev)"} | Used current ${usedCurr.base}, scheduled to next year (carry) ${usedCurr.nextYearCarryFromThisYear} \u2192 remaining base ${currRemaining}; Available now ${availableNow}</div>
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
  function closeUserStatsModal() {
    userStatsModal.style.display = "none";
  }
  function calculateYearlyStats(username, year) {
    const userDaysOff = daysOffData[username] || [];
    const stats = {};
    userDaysOff.forEach((dayOff) => {
      const dayOffDate = parseLocalDate(dayOff.date);
      if (dayOffDate.getFullYear() === year) {
        stats[dayOff.type] = (stats[dayOff.type] || 0) + 1;
      }
    });
    return stats;
  }
  function calculateUsedDays(username, year) {
    const userDaysOff = daysOffData[username] || [];
    let total = 0;
    let carryover = 0;
    let base = 0;
    let nextYearCarryFromThisYear = 0;
    userDaysOff.forEach((entry) => {
      if (entry.type !== "Normal") return;
      const d = parseLocalDate(entry.date);
      const y = d.getFullYear();
      if (y === year) {
        total += 1;
        if (entry.useCarryover) carryover += 1;
        else base += 1;
      } else if (y === year + 1 && entry.useCarryover) {
        nextYearCarryFromThisYear += 1;
      }
    });
    return { total, carryover, base, nextYearCarryFromThisYear };
  }
  function calculateMonthlyStats(username, year) {
    const userDaysOff = daysOffData[username] || [];
    const monthlyStats = {};
    for (let i = 0; i < 12; i++) {
      monthlyStats[i] = {};
    }
    userDaysOff.forEach((dayOff) => {
      const dayOffDate = parseLocalDate(dayOff.date);
      if (dayOffDate.getFullYear() === year) {
        const month = dayOffDate.getMonth();
        monthlyStats[month][dayOff.type] = (monthlyStats[month][dayOff.type] || 0) + 1;
      }
    });
    return monthlyStats;
  }
  function setupDragEvents(cell, username, dayOffEntry) {
    cell.addEventListener("dragstart", (e) => {
      if (cell.classList.contains("holiday") || cell.classList.contains("weekend")) {
        e.preventDefault();
        return;
      }
      draggedCell = cell;
      draggedUsername = username;
      draggedDayOffEntry = dayOffEntry;
      const userDaysOff = daysOffData[username] || [];
      draggedIndex = userDaysOff.findIndex((entry) => entry.date === dayOffEntry.date);
      setTimeout(() => {
        cell.classList.add("dragging");
      }, 0);
      console.log("Drag started:", username, dayOffEntry.date);
    });
    cell.addEventListener("dragend", (e) => {
      cell.classList.remove("dragging");
      console.log("Drag ended");
    });
    const carry = dayOffEntry.useCarryover ? " (carryover)" : "";
    if (dayOffEntry.note) {
      cell.title = `${dayOffEntry.type}: ${dayOffEntry.note}${carry}`;
    } else {
      cell.title = `${dayOffEntry.type}${carry}`;
    }
    attachTooltipToDayOffCell(cell);
  }
  function setupDropTarget(cell, username, isoDate) {
    cell.addEventListener("dragover", (e) => {
      if (!draggedUsername || draggedUsername !== username || cell.classList.contains("day-off") || cell.classList.contains("holiday") || cell.classList.contains("weekend") || cell.classList.contains("pair-day-off")) {
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
        const oldDate = draggedDayOffEntry.date;
        userDaysOff.splice(draggedIndex, 1);
        const newEntry = {
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
        const typeConfig = employeesData.dayOffTypes[newEntry.type] || employeesData.dayOffTypes["Normal"];
        cell.style.backgroundColor = typeConfig.background;
        cell.style.color = typeConfig.foreground;
        const carry = newEntry.useCarryover ? " (carryover)" : "";
        if (newEntry.note) {
          cell.title = `${newEntry.type}: ${newEntry.note}${carry}`;
          cell.setAttribute("data-tooltip", `${newEntry.type}: ${newEntry.note}${carry}`);
        } else {
          cell.title = `${newEntry.type}${carry}`;
          cell.setAttribute("data-tooltip", `${newEntry.type}${carry}`);
        }
        cell.classList.add("day-off");
        cell.dataset.type = newEntry.type;
        cell.setAttribute("draggable", "true");
        setupDragEvents(cell, username, newEntry);
        draggedCell.style.backgroundColor = "";
        draggedCell.style.color = "";
        draggedCell.title = "";
        draggedCell.removeAttribute("data-tooltip");
        draggedCell.classList.remove("day-off");
        draggedCell.removeAttribute("draggable");
        delete draggedCell.dataset.type;
        setupDropTarget(draggedCell, username, oldDate);
        saveData(username);
        console.log("Day off moved successfully");
        updatePairedEmployeeCalendar(username, oldDate);
        updatePairedEmployeeCalendar(username, isoDate);
      }
      draggedCell = null;
      draggedUsername = null;
      draggedDayOffEntry = null;
      draggedIndex = -1;
    });
  }
  function addQuickDayOff(username, isoDate, cell) {
    if (cell.classList.contains("weekend") || cell.classList.contains("holiday") || cell.classList.contains("day-off") || cell.classList.contains("pair-day-off")) {
      return;
    }
    const pairedUsername = getPairedUsername(username);
    if (pairedUsername && hasUserDayOff(pairedUsername, isoDate)) {
      const pairedEmployee = employeesData.employees.find((emp) => emp.username === pairedUsername);
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
    cell.title = "Normal";
    cell.setAttribute("data-tooltip", "Normal");
    console.log("Quick day off added for", username, "on", isoDate);
    saveData(username);
    updatePairedEmployeeCalendar(username, isoDate);
  }
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
      const disallowedTypes = /* @__PURE__ */ new Set(["Holiday", "Sunday", "Saturday", "Friday"]);
      Object.keys(employeesData.dayOffTypes).forEach((type) => {
        if (disallowedTypes.has(type)) return;
        const option = document.createElement("option");
        option.value = type;
        option.text = type;
        dayOffTypeSelect.appendChild(option);
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
  function getPairedUsername(username) {
    const employee = employeesData.employees.find((emp) => emp.username === username);
    return employee && employee.pair ? employee.pair : null;
  }
  function hasUserDayOff(username, isoDate) {
    if (!username || !daysOffData[username]) return false;
    return daysOffData[username].some((entry) => entry.date === isoDate);
  }
  function isWeekend(isoDate) {
    const date = parseLocalDate(isoDate);
    return date.getDay() === 0 || date.getDay() === 6;
  }
  function createTooltip() {
    const tooltip = document.createElement("div");
    tooltip.id = "customTooltip";
    tooltip.className = "custom-tooltip";
    document.body.appendChild(tooltip);
    return tooltip;
  }
  function attachTooltipToDayOffCell(cell) {
    let tooltip = document.getElementById("customTooltip");
    if (!tooltip) {
      tooltip = createTooltip();
    }
    cell.addEventListener("mouseenter", () => {
      const content = cell.getAttribute("title");
      if (!content) return;
      const rect = cell.getBoundingClientRect();
      tooltip.textContent = content;
      tooltip.style.left = rect.left + rect.width / 2 + "px";
      tooltip.style.top = rect.top - 5 + "px";
      tooltip.classList.add("visible");
      const tooltipRect = tooltip.getBoundingClientRect();
      if (tooltipRect.left < 0) {
        tooltip.style.left = "5px";
      } else if (tooltipRect.right > window.innerWidth) {
        tooltip.style.left = window.innerWidth - tooltipRect.width - 5 + "px";
      }
    });
    cell.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });
  }
  function initTooltipSystem() {
    createTooltip();
    document.querySelectorAll('.day-off[draggable="true"]').forEach((cell) => {
      attachTooltipToDayOffCell(cell);
    });
  }
  function showAllowanceDialog(username, year) {
    var _a, _b;
    let dlg = document.getElementById("allowanceDialog");
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
      dlg.addEventListener("click", (e) => {
        if (e.target === dlg) {
          dlg.style.display = "none";
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && dlg && dlg.style.display === "flex") {
          dlg.style.display = "none";
        }
      });
    }
    const yearSpan = document.getElementById("allowanceYear");
    const input = document.getElementById("allowanceInput");
    const btnCancel = document.getElementById("allowanceCancel");
    const btnClear = document.getElementById("allowanceClear");
    const btnSet = document.getElementById("allowanceSet");
    if (yearSpan) yearSpan.textContent = String(year);
    const emp = employeesData.employees.find((e) => e.username === username);
    const existingVal = (_b = (_a = emp == null ? void 0 : emp.allowances) == null ? void 0 : _a[String(year)]) != null ? _b : "";
    if (input) input.value = existingVal === "" ? "" : String(existingVal);
    if (btnCancel) btnCancel.onclick = () => {
      if (dlg) dlg.style.display = "none";
    };
    if (btnClear) btnClear.onclick = () => __async(this, null, function* () {
      const e = employeesData.employees.find((x) => x.username === username);
      if (!e) return;
      if (!e.allowances) e.allowances = {};
      delete e.allowances[String(year)];
      yield saveEmployeesData();
      if (dlg) dlg.style.display = "none";
      showUserStatistics(username, new MouseEvent("contextmenu"));
    });
    if (btnSet) btnSet.onclick = () => __async(this, null, function* () {
      const raw = input ? input.value.trim() : "";
      const val = Math.max(0, Math.floor(Number(raw) || 0));
      const e = employeesData.employees.find((x) => x.username === username);
      if (!e) return;
      if (!e.allowances) e.allowances = {};
      e.allowances[String(year)] = val;
      yield saveEmployeesData();
      if (dlg) dlg.style.display = "none";
      showUserStatistics(username, new MouseEvent("contextmenu"));
    });
    if (dlg) dlg.style.display = "flex";
  }
})();

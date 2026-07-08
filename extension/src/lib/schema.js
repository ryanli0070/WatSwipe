/**
 * Canonical JobPosting shape + DOM normalization for real WaterlooWorks.
 *
 * This shape is the cross-layer contract: it mirrors `backend/app/models.py`
 * (the ranking subset) and `frontend/src/lib/db.js`. Attached to
 * `globalThis.WatSwipe` for bundler-free sharing.
 *
 * JobPosting = {
 *   id, title, company, location, term, status,
 *   description, tags[], deadline, applied, scrapedAt,
 *   // extras present in the WaterlooWorks list view:
 *   division, level, openings, applications
 * }
 *
 * WaterlooWorks renders postings through a Vue "data viewer" grid, NOT a plain
 * semantic table. Key consequences the selectors below account for:
 *   - Cells are POSITIONAL <td>s with no per-field attributes; we map columns by
 *     reading the <thead> labels into a header->index map (survives the user
 *     reordering/hiding columns, which WaterlooWorks allows).
 *   - The job ID lives in the row's selection checkbox
 *     (`input[name="dataViewerSelection"]` value / `id="resultRow_<id>"`).
 *   - Description and tags are NOT in the list row — they live only on the
 *     posting detail page, so they are left empty here (detail-page follow-up).
 */
(function (root) {
  const WatSwipe = (root.WatSwipe = root.WatSwipe || {});

  /**
   * WaterlooWorks-specific selectors, centralized so a future DOM change is a
   * single localized edit. Verified against
   * extension/fixtures/real-waterlooworks-sample.html (2026-07).
   */
  const SELECTORS = (WatSwipe.SELECTORS = {
    // The Vue data-grid the postings render into (renders after document_idle).
    table: "#dataViewerPlaceholder table",
    headerRow: "thead tr",
    headerLabel: ".js--data-grid--header--label",
    bodyRows: "tbody tr.table__row--body",
    // Direct-child cells of a row, in visual column order (th = ID col, then tds).
    rowCells: ":scope > th, :scope > td",
    cellValue: ".overflow--ellipsis",
    rowIdInput: "input[name='dataViewerSelection']",
    // Phase 3 per-row action buttons (matched by aria-label; English UI).
    applyButton: "button[aria-label='Apply']",
    saveFolderButton: "button[aria-label='Save to My Jobs Folder']",
    // States where Apply is unavailable (skip, don't attempt):
    appliedButton: "button[aria-label='Cancel Application']", // already applied
    ineligibleButton: "button[aria-label*='do not qualify']", // not eligible

    // --- Apply wizard (opens after clicking Apply) -------------------------
    // A jQuery-style multi-step wizard rendered as a full view (#applyWizard),
    // NOT a modal overlay. The primary advance button's LABEL is the submit
    // guard: "Submit" only appears on the final input step.
    applyWizard: "#applyWizard",
    wizardStepContainer: ".js--ui-wizard-step-container",
    wizardCurrentStep: ".js--ui-wizard-step.current-step",
    wizardStepTitle: ".wizard-form__section-fieldset__title",
    wizardTitle: ".wizard__title",
    wizardNextBtn: ".js--ui-wizard-next-btn", // labeled "Next" or "Submit" per step
    wizardFinishBtn: ".js--ui-wizard-finish-btn", // "Done" (closes after submit)
    wizardCancelBtn: ".js--ui-wizard-cancel-btn",
    prescreenQuestion: "[name^='question_']",
    packageDocItem: "ul.comma-list li", // documents in the selected package
  });

  // Documents that come from the student's standard/default package and are safe
  // to auto-submit. Anything else in the package doc-list (cover letter, "Other -
  // Per Job Posting", etc.) is treated as posting-specific -> skip for manual.
  const SAFE_DOCS = (WatSwipe.SAFE_DOCS = [
    /r[eé]sum[eé]/i,
    /grade report/i,
    /work history/i,
  ]);

  const isVisible = (el) => {
    for (let p = el; p; p = p.parentElement) {
      const c = typeof p.className === "string" ? p.className : "";
      if (/\bhide\b/.test(c) || /display--none/.test(c)) return false;
    }
    return true;
  };

  /**
   * Decide whether an open Apply wizard can be auto-submitted with the standard
   * package, per the rule: skip anything that needs posting-specific input.
   * `root` is the wizard container element. Returns { safe, reason }.
   */
  WatSwipe.evaluateApplyDialog = function (root) {
    if (!root) return { safe: false, reason: "wizard-not-found" };

    // (1) Pre-screening questions -> posting-specific -> skip.
    const stepTitles = Array.from(
      root.querySelectorAll(SELECTORS.wizardStepTitle),
      (el) => text(el)
    );
    if (stepTitles.some((t) => /pre-?screening/i.test(t))) {
      return { safe: false, reason: "pre-screening-questions" };
    }
    if (root.querySelector(SELECTORS.prescreenQuestion)) {
      return { safe: false, reason: "pre-screening-questions" };
    }

    // (2) Any non-standard document in the selected package -> skip.
    const docs = Array.from(root.querySelectorAll(SELECTORS.packageDocItem))
      .filter(isVisible)
      .map((el) => text(el))
      .filter(Boolean);
    const nonStandard = docs.filter(
      (name) => !SAFE_DOCS.some((re) => re.test(name))
    );
    if (nonStandard.length) {
      return { safe: false, reason: "requires-document:" + nonStandard.join(",") };
    }

    return { safe: true, reason: "standard-package" };
  };

  /**
   * Map a WaterlooWorks column header label -> canonical JobPosting field.
   * Headers are matched case-insensitively. Unmapped columns are ignored.
   */
  const FIELD_BY_HEADER = (WatSwipe.FIELD_BY_HEADER = {
    "id": "id",
    "job title": "title",
    "organization": "company",
    "division": "division",
    "openings": "openings",
    "city": "location",
    "level": "level",
    "apps": "applications",
    "app deadline": "deadline",
  });

  const text = (el) => (el ? el.textContent.trim() : "");

  /**
   * Read a data-grid header row into an ordered array of lowercased labels,
   * one per column index. `table` is the element matched by SELECTORS.table.
   */
  WatSwipe.readColumns = function (table) {
    const headerRow = table.querySelector(SELECTORS.headerRow);
    if (!headerRow) return [];
    const cells = headerRow.querySelectorAll(SELECTORS.rowCells);
    return Array.from(cells, (cell) => {
      const label = cell.querySelector(SELECTORS.headerLabel);
      return text(label).toLowerCase();
    });
  };

  /**
   * Map one WaterlooWorks data-grid row (<tr class="table__row--body">) to a
   * JobPosting, using `columns` (from readColumns) to resolve field positions.
   */
  WatSwipe.normalizeRow = function (row, columns) {
    // Job ID comes from the selection checkbox; fall back to the resultRow_<id>.
    const idInput = row.querySelector(SELECTORS.rowIdInput);
    let id = idInput ? idInput.value : "";
    if (!id) {
      const marked = row.querySelector("[id^='resultRow_']");
      if (marked) id = marked.id.replace("resultRow_", "");
    }
    if (!id) return null;

    const cells = row.querySelectorAll(SELECTORS.rowCells);

    // Pull each mapped column's text by its header index.
    const fields = {};
    (columns || []).forEach((label, i) => {
      const field = FIELD_BY_HEADER[label];
      if (!field || field === "id") return;
      const cell = cells[i];
      if (!cell) return;
      const value = cell.querySelector(SELECTORS.cellValue);
      fields[field] = value ? text(value) : text(cell);
    });

    return {
      id: String(id),
      title: fields.title || "",
      company: fields.company || "",
      location: fields.location || "",
      term: "", // not surfaced in the list view
      status: "", // not surfaced in the list view
      description: "", // detail-page only (follow-up)
      tags: [], // detail-page only (follow-up)
      deadline: fields.deadline || "",
      applied: !!row.querySelector(SELECTORS.appliedButton),
      scrapedAt: new Date().toISOString(),
      // extras available in the list view (harmless to consumers that ignore them):
      division: fields.division || "",
      level: fields.level || "",
      openings: fields.openings || "",
      applications: fields.applications || "",
    };
  };
})(typeof globalThis !== "undefined" ? globalThis : self);

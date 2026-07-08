/**
 * Canonical JobPosting shape + DOM normalization for real WaterlooWorks.
 *
 * This shape is the cross-layer contract: it mirrors `backend/app/models.py`
 * (the ranking subset) and `frontend/src/lib/db.js`. Attached to
 * `globalThis.WatSwipe` for bundler-free sharing.
 *
 * JobPosting = {
 *   id, title, company, location, term, status,
 *   description, tags[], deadline, shortlisted, scrapedAt,
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
  });

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
      shortlisted: row.dataset.shortlisted === "true",
      scrapedAt: new Date().toISOString(),
      // extras available in the list view (harmless to consumers that ignore them):
      division: fields.division || "",
      level: fields.level || "",
      openings: fields.openings || "",
      applications: fields.applications || "",
    };
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
